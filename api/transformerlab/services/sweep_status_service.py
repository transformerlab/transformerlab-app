import asyncio
import os
import time
from typing import Any, Dict, List, Optional

from lab import Experiment
from lab.dirs import set_organization_id as lab_set_org_id

from transformerlab.services import job_service, team_service
from transformerlab.shared.request_context import set_current_org_id

ACTIVE_SWEEP_PARENT_STATUSES = {"RUNNING", "LAUNCHING"}
RUNNING_CHILD_STATUSES = {"RUNNING", "LAUNCHING"}
SWEEP_STATUS_INTERVAL_SECONDS = int(os.getenv("SWEEP_STATUS_INTERVAL_SECONDS", "30"))

# Cap concurrent S3 reads when fetching child jobs within a single sweep refresh.
# Without a bound, a large sweep fires N simultaneous requests, which can spike
# memory and approach S3 per-prefix rate limits (~5,500 GET/s).  Ten concurrent
# reads already gives most of the latency win over purely serial fetches.
_CHILD_FETCH_CONCURRENCY = 10
_child_fetch_semaphore = asyncio.Semaphore(_CHILD_FETCH_CONCURRENCY)

_sweep_status_worker_task: Optional[asyncio.Task] = None


def _set_org_context(org_id: Optional[str]) -> None:
    set_current_org_id(org_id)
    if lab_set_org_id is not None:
        lab_set_org_id(org_id)


def _clear_org_context() -> None:
    _set_org_context(None)


async def _list_all_org_ids() -> List[str]:
    try:
        return await team_service.get_all_team_ids()
    except Exception as exc:
        print(f"Sweep status worker: failed listing orgs from DB: {exc}")
        return []


async def _list_experiment_ids_for_current_org() -> List[str]:
    try:
        experiments_data = await Experiment.get_all()
    except Exception as exc:
        print(f"Sweep status worker: failed getting experiments: {exc}")
        return []

    experiment_ids = [str(exp.get("id")) for exp in experiments_data if exp.get("id")]
    return experiment_ids


def compute_parent_sweep_counts(parent_job: Dict[str, Any], child_jobs: List[Dict[str, Any]]) -> Dict[str, int]:
    job_data = parent_job.get("job_data", {}) or {}
    sweep_total = int(job_data.get("sweep_total", 0) or 0)

    completed_count = 0
    running_count = 0
    failed_count = 0
    queued_count = 0

    for child_job in child_jobs:
        child_status = child_job.get("status", "")
        if child_status == "COMPLETE":
            completed_count += 1
        elif child_status in {"FAILED", "STOPPED", "DELETED"}:
            failed_count += 1
        elif child_status in RUNNING_CHILD_STATUSES:
            running_count += 1
        elif child_status == "QUEUED":
            queued_count += 1

    progress = int((completed_count / sweep_total) * 100) if sweep_total > 0 else 0

    return {
        "sweep_total": sweep_total,
        "sweep_completed": completed_count,
        "sweep_running": running_count,
        "sweep_failed": failed_count,
        "sweep_queued": queued_count,
        "sweep_progress": progress,
    }


async def apply_parent_sweep_updates(
    job: Dict[str, Any], experiment_id: str, counts: Dict[str, int]
) -> Optional[Dict[str, Any]]:
    job_id = str(job.get("id", ""))
    if not job_id:
        return None

    job_data = job.get("job_data", {}) or {}

    # Compare job_data with updated values and only write if there's a change
    count_fields = ["sweep_completed", "sweep_running", "sweep_failed", "sweep_queued"]
    for field in count_fields:
        # "or 0" guards against the stored value being None rather than missing
        if counts[field] != int(job_data.get(field, 0) or 0):
            await job_service.job_update_job_data_insert_key_value(job_id, field, counts[field], experiment_id)

    if counts["sweep_progress"] != int(job_data.get("sweep_progress", 0) or 0):  # same None guard
        await job_service.job_update_sweep_progress(job_id, counts["sweep_progress"], experiment_id)

    all_complete = counts["sweep_completed"] + counts["sweep_failed"] == counts["sweep_total"]
    if all_complete and job.get("status") in ACTIVE_SWEEP_PARENT_STATUSES:
        await job_service.job_update_job_data_insert_key_value(
            job_id,
            "end_time",
            time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            experiment_id,
        )
        await job_service.job_update_status(job_id, "COMPLETE", experiment_id=experiment_id)

    return job  # caller only checks truthiness; avoids a redundant S3 re-fetch


async def _fetch_child_job(child_job_id: str) -> Optional[Dict[str, Any]]:
    async with _child_fetch_semaphore:
        return await job_service.job_get(child_job_id)


async def refresh_sweep_parent(job: Dict[str, Any], experiment_id: str) -> Optional[Dict[str, Any]]:
    if job.get("type") != "SWEEP":
        return None

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        return None

    sweep_job_ids = job_data.get("sweep_job_ids", [])

    # Fetch all child jobs concurrently instead of serially.  return_exceptions=True
    # means one failed fetch doesn't abort the rest; non-dict results are filtered out.
    results = await asyncio.gather(
        *[_fetch_child_job(str(cid)) for cid in sweep_job_ids],
        return_exceptions=True,
    )
    child_jobs: List[Dict[str, Any]] = [r for r in results if isinstance(r, dict)]

    counts = compute_parent_sweep_counts(job, child_jobs)
    return await apply_parent_sweep_updates(job, experiment_id, counts)


async def refresh_active_sweeps_once() -> Dict[str, int]:
    cycle_stats = {
        "orgs": 0,
        "experiments": 0,
        "sweeps_seen": 0,
        "sweeps_refreshed": 0,
        "errors": 0,
    }

    org_ids = await _list_all_org_ids()

    for org_id in org_ids:
        try:
            _set_org_context(org_id)
            cycle_stats["orgs"] += 1
            experiment_ids = await _list_experiment_ids_for_current_org()
            cycle_stats["experiments"] += len(experiment_ids)

            for experiment_id in experiment_ids:
                try:
                    all_sweep_jobs = await job_service.jobs_get_all(
                        experiment_id=experiment_id, type="SWEEP", status=""
                    )
                except Exception as exc:
                    print(f"Sweep status worker: failed listing sweep jobs for experiment {experiment_id}: {exc}")
                    cycle_stats["errors"] += 1
                    continue

                for sweep_job in all_sweep_jobs:
                    cycle_stats["sweeps_seen"] += 1
                    if sweep_job.get("status") not in ACTIVE_SWEEP_PARENT_STATUSES:
                        continue

                    try:
                        updated = await refresh_sweep_parent(sweep_job, experiment_id)
                        if updated:
                            cycle_stats["sweeps_refreshed"] += 1
                    except Exception as exc:
                        print(
                            f"Sweep status worker: failed refreshing sweep job {sweep_job.get('id')} in experiment {experiment_id}: {exc}"
                        )
                        cycle_stats["errors"] += 1
        finally:
            _clear_org_context()

    return cycle_stats


async def _sweep_status_worker_loop() -> None:
    print("Sweep status worker: started")
    try:
        while True:
            try:
                _cycle_start = time.monotonic()
                cycle_stats = await refresh_active_sweeps_once()
                _cycle_elapsed = time.monotonic() - _cycle_start
                print(
                    f"Sweep status worker: cycle done in {_cycle_elapsed:.3f}s — "
                    f"orgs={cycle_stats['orgs']} experiments={cycle_stats['experiments']} "
                    f"sweeps_seen={cycle_stats['sweeps_seen']} sweeps_refreshed={cycle_stats['sweeps_refreshed']} "
                    f"errors={cycle_stats['errors']}"
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                print(f"Sweep status worker: unhandled error in cycle, continuing: {exc}")
            await asyncio.sleep(SWEEP_STATUS_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        print("Sweep status worker: stopping")
        raise
    finally:
        _clear_org_context()


async def start_sweep_status_worker() -> None:
    global _sweep_status_worker_task

    if _sweep_status_worker_task and not _sweep_status_worker_task.done():
        return

    _sweep_status_worker_task = asyncio.create_task(_sweep_status_worker_loop(), name="sweep-status-worker")


async def stop_sweep_status_worker() -> None:
    global _sweep_status_worker_task

    if not _sweep_status_worker_task:
        return

    if not _sweep_status_worker_task.done():
        _sweep_status_worker_task.cancel()
        try:
            await _sweep_status_worker_task
        except asyncio.CancelledError:
            pass

    _sweep_status_worker_task = None
