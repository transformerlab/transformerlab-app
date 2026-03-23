import asyncio
import logging
import os
import time
from typing import Any, Dict, List, Optional

from lab import Experiment
from lab.dirs import set_organization_id as lab_set_org_id
from lab.job_status import JobStatus

from transformerlab.services import job_service, team_service

logger = logging.getLogger(__name__)

ACTIVE_GROUP_PARENT_STATUSES = {JobStatus.RUNNING, JobStatus.LAUNCHING}
FAILED_TERMINAL_STATUSES = {
    JobStatus.FAILED,
    JobStatus.STOPPED,
    JobStatus.DELETED,
    JobStatus.CANCELLED,
    JobStatus.UNAUTHORIZED,
}
QUEUED_STATUSES = {JobStatus.QUEUED, JobStatus.WAITING, JobStatus.NOT_STARTED}
RUNNING_STATUSES = {JobStatus.RUNNING, JobStatus.LAUNCHING, JobStatus.INTERACTIVE, JobStatus.STOPPING}

GROUP_STATUS_INTERVAL_SECONDS = int(os.getenv("GROUP_STATUS_INTERVAL_SECONDS", "30"))
_CHILD_FETCH_CONCURRENCY = 10
_child_fetch_semaphore: asyncio.Semaphore | None = None


def _get_child_fetch_semaphore() -> asyncio.Semaphore:
    global _child_fetch_semaphore
    if _child_fetch_semaphore is None:
        _child_fetch_semaphore = asyncio.Semaphore(_CHILD_FETCH_CONCURRENCY)
    return _child_fetch_semaphore


_group_status_worker_task: Optional[asyncio.Task] = None


def _set_org_context(org_id: Optional[str]) -> None:
    if lab_set_org_id is not None:
        lab_set_org_id(org_id)


def _clear_org_context() -> None:
    _set_org_context(None)


def compute_parent_group_counts(parent_job: Dict[str, Any], child_jobs: List[Dict[str, Any]]) -> Dict[str, int]:
    job_data = parent_job.get("job_data", {}) or {}
    group_total = int(job_data.get("group_total", 0) or 0)

    completed = running = failed = queued = 0
    for child in child_jobs:
        status = child.get("status", "")
        if status == JobStatus.COMPLETE:
            completed += 1
        elif status in FAILED_TERMINAL_STATUSES:
            failed += 1
        elif status in RUNNING_STATUSES:
            running += 1
        else:
            queued += 1

    progress = int((completed / group_total) * 100) if group_total > 0 else 0

    return {
        "group_total": group_total,
        "group_completed": completed,
        "group_running": running,
        "group_failed": failed,
        "group_queued": queued,
        "group_progress": progress,
    }


async def apply_parent_group_updates(
    job: Dict[str, Any],
    experiment_id: str,
    counts: Dict[str, int],
    child_jobs: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    job_id = str(job.get("id", ""))
    if not job_id:
        return None

    job_data = job.get("job_data", {}) or {}
    failure_policy = job_data.get("failure_policy", "continue")
    failure_policy_applied = bool(job_data.get("failure_policy_applied", False))

    # Update count fields only when changed (dirty-check pattern)
    count_fields = ["group_completed", "group_running", "group_failed", "group_queued"]
    changed_counts: Dict[str, int] = {}
    for field in count_fields:
        if counts[field] != int(job_data.get(field, 0) or 0):
            changed_counts[field] = counts[field]
    if changed_counts:
        await job_service.job_update_job_data_insert_key_values(job_id, changed_counts, experiment_id)

    if counts["group_progress"] != int(job_data.get("group_progress", 0) or 0):
        await job_service.job_update_group_progress(job_id, counts["group_progress"], experiment_id)

    # Apply failure policy if a child has failed and policy not yet applied
    has_failed_child = counts["group_failed"] > 0
    if has_failed_child and not failure_policy_applied and failure_policy in ("stop_all", "stop_new"):
        # Mark policy as applied first (re-entrancy guard)
        await job_service.job_update_job_data_insert_key_value(job_id, "failure_policy_applied", True, experiment_id)

        non_terminal_statuses = RUNNING_STATUSES | QUEUED_STATUSES
        targets = [c for c in child_jobs if c.get("status") in non_terminal_statuses]

        if failure_policy == "stop_all":
            for child in targets:
                await job_service.job_stop(str(child["id"]), experiment_id)
            await job_service.job_update_job_data_insert_key_value(
                job_id, "end_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()), experiment_id
            )
            await job_service.job_update_status(job_id, JobStatus.FAILED, experiment_id=experiment_id)
            return job

        elif failure_policy == "stop_new":
            queued_children = [c for c in child_jobs if c.get("status") in QUEUED_STATUSES]
            for child in queued_children:
                await job_service.job_stop(str(child["id"]), experiment_id)
            # Parent stays RUNNING — fall through to normal completion check

    # Check for completion (only if parent not already terminal)
    if job.get("status") in ACTIVE_GROUP_PARENT_STATUSES:
        all_done = (
            counts["group_completed"] + counts["group_failed"] == counts["group_total"] and counts["group_total"] > 0
        )
        if all_done:
            await job_service.job_update_job_data_insert_key_value(
                job_id, "end_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()), experiment_id
            )
            await job_service.job_update_status(job_id, JobStatus.COMPLETE, experiment_id=experiment_id)

    return job


async def _fetch_child_job(child_job_id: str) -> Optional[Dict[str, Any]]:
    async with _get_child_fetch_semaphore():
        return await job_service.job_get(child_job_id)


async def refresh_group_parent(job: Dict[str, Any], experiment_id: str) -> Optional[Dict[str, Any]]:
    if job.get("type") != "GROUP":
        return None

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("group_parent"):
        return None

    group_job_ids = job_data.get("group_job_ids", [])
    group_total = int(job_data.get("group_total", 0) or 0)

    # Skip partial registration — wait until all children are written atomically
    if len(group_job_ids) < group_total:
        return None

    results = await asyncio.gather(
        *[_fetch_child_job(str(cid)) for cid in group_job_ids],
        return_exceptions=True,
    )
    child_jobs: List[Dict[str, Any]] = [r for r in results if isinstance(r, dict)]

    counts = compute_parent_group_counts(job, child_jobs)
    return await apply_parent_group_updates(job, experiment_id, counts, child_jobs=child_jobs)


async def refresh_active_groups_once() -> Dict[str, int]:
    cycle_stats = {"orgs": 0, "experiments": 0, "groups_seen": 0, "groups_refreshed": 0, "errors": 0}
    org_ids = await team_service.get_all_team_ids()

    for org_id in org_ids:
        try:
            _set_org_context(org_id)
            cycle_stats["orgs"] += 1
            experiments_data = await Experiment.get_all()
            experiment_ids = [str(e.get("id")) for e in experiments_data if e.get("id")]
            cycle_stats["experiments"] += len(experiment_ids)

            for experiment_id in experiment_ids:
                try:
                    all_group_jobs = await job_service.jobs_get_all(
                        experiment_id=experiment_id, type="GROUP", status=""
                    )
                except Exception as exc:
                    logger.warning("Group status worker: failed listing GROUP jobs for exp %s: %s", experiment_id, exc)
                    cycle_stats["errors"] += 1
                    continue

                for group_job in all_group_jobs:
                    cycle_stats["groups_seen"] += 1
                    if group_job.get("status") not in ACTIVE_GROUP_PARENT_STATUSES:
                        continue
                    try:
                        updated = await refresh_group_parent(group_job, experiment_id)
                        if updated:
                            cycle_stats["groups_refreshed"] += 1
                    except Exception as exc:
                        logger.warning(
                            "Group status worker: failed refreshing group job %s in exp %s: %s",
                            group_job.get("id"),
                            experiment_id,
                            exc,
                        )
                        cycle_stats["errors"] += 1
        finally:
            _clear_org_context()

    return cycle_stats


async def _group_status_worker_loop() -> None:
    logger.info("Group status worker: started")
    try:
        while True:
            try:
                start = time.monotonic()
                stats = await refresh_active_groups_once()
                elapsed = time.monotonic() - start
                logger.debug(
                    "Group status worker: cycle done in %.3fs — "
                    "orgs=%d experiments=%d groups_seen=%d groups_refreshed=%d errors=%d",
                    elapsed,
                    stats["orgs"],
                    stats["experiments"],
                    stats["groups_seen"],
                    stats["groups_refreshed"],
                    stats["errors"],
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Group status worker: unhandled error in cycle, continuing: %s", exc)
            await asyncio.sleep(GROUP_STATUS_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("Group status worker: stopping")
        raise
    finally:
        _clear_org_context()


async def start_group_status_worker() -> None:
    global _group_status_worker_task
    if _group_status_worker_task and not _group_status_worker_task.done():
        return
    _group_status_worker_task = asyncio.create_task(_group_status_worker_loop(), name="group-status-worker")


async def stop_group_status_worker() -> None:
    global _group_status_worker_task
    if not _group_status_worker_task:
        return
    if not _group_status_worker_task.done():
        _group_status_worker_task.cancel()
        try:
            await _group_status_worker_task
        except asyncio.CancelledError:
            pass
    _group_status_worker_task = None
