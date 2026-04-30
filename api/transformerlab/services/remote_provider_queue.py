import asyncio
import json as _json
import logging
import os
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select, update

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.db.session import async_session
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import (
    get_provider_by_id,
    get_provider_instance,
    normalize_provider_check_result,
)
from transformerlab.shared.models.models import JobQueue
from lab import dirs as lab_dirs
from lab.job_status import JobStatus

logger = logging.getLogger(__name__)


class RemoteLaunchWorkItem(BaseModel):
    """Work item for launching a non-local provider job in the background."""

    job_id: str
    experiment_id: str
    provider_id: str
    team_id: str
    user_id: str
    cluster_name: str
    cluster_config: ClusterConfig
    quota_hold_id: Optional[str] = None
    subtype: Optional[str] = None  # e.g. "interactive"


# Concurrency: remote launches should start immediately, but we still cap total parallelism
try:
    _MAX_CONCURRENT_REMOTE_LAUNCHES = int(os.getenv("TFL_MAX_CONCURRENT_REMOTE_LAUNCHES", "8"))
except Exception:  # noqa: BLE001
    _MAX_CONCURRENT_REMOTE_LAUNCHES = 8

_remote_launch_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_REMOTE_LAUNCHES)

_REMOTE_QUEUE_POLL_INTERVAL = float(os.environ.get("TFL_REMOTE_QUEUE_POLL_INTERVAL", "2"))

_remote_job_queue_worker_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Public API - called by launch_template.py
# ---------------------------------------------------------------------------


async def enqueue_remote_launch(
    job_id: str,
    experiment_id: str,
    team_id: str,
) -> None:
    """Insert a row into the job_queue table for the background worker to pick up.

    The background worker polls this table and dispatches PENDING entries.
    The job's job_data dict must contain all launch context (provider_id, user_id,
    cluster_name, cluster_config, quota_hold_id, subtype).
    """
    async with async_session() as session:
        entry = JobQueue(
            id=str(uuid.uuid4()),
            job_id=str(job_id),
            experiment_id=str(experiment_id),
            team_id=str(team_id),
            queue_type="REMOTE",
            status="PENDING",
        )
        session.add(entry)
        await session.commit()

    logger.info(f"Enqueued remote job {job_id}")


# ---------------------------------------------------------------------------
# Background worker
# ---------------------------------------------------------------------------


async def _poll_pending_remote_entries() -> list[JobQueue]:
    """Query the job_queue table for PENDING REMOTE entries, ordered by created_at (FIFO)."""
    async with async_session() as session:
        stmt = (
            select(JobQueue)
            .where(JobQueue.status == "PENDING", JobQueue.queue_type == "REMOTE")
            .order_by(JobQueue.created_at.asc())
        )
        result = await session.execute(stmt)
        return list(result.scalars().all())


async def _mark_entry_dispatched(entry_id: str) -> None:
    """Transition a job_queue row from PENDING to DISPATCHED."""
    async with async_session() as session:
        stmt = update(JobQueue).where(JobQueue.id == entry_id).values(status="DISPATCHED", updated_at=datetime.utcnow())
        await session.execute(stmt)
        await session.commit()


async def _mark_entry_failed(entry_id: str) -> None:
    """Transition a job_queue row to FAILED (could not reconstruct work item)."""
    async with async_session() as session:
        stmt = update(JobQueue).where(JobQueue.id == entry_id).values(status="FAILED", updated_at=datetime.utcnow())
        await session.execute(stmt)
        await session.commit()


def _reconstruct_work_item(job: dict) -> Optional[RemoteLaunchWorkItem]:
    """Reconstruct a RemoteLaunchWorkItem from stored job data."""
    job_data = job.get("job_data") or {}
    if isinstance(job_data, str):
        try:
            job_data = _json.loads(job_data)
        except Exception:
            job_data = {}

    job_id = str(job.get("id", ""))
    experiment_id = str(job.get("experiment_id", ""))
    provider_id = job_data.get("provider_id")
    team_id = job_data.get("team_id")
    user_id = job_data.get("created_by_user_id", "")
    cluster_name = job_data.get("cluster_name")
    subtype = job_data.get("subtype")

    if not provider_id or not team_id or not cluster_name:
        logger.error(
            "Remote job queue worker: job %s missing required fields (provider_id=%s, team_id=%s, cluster_name=%s)",
            job_id,
            provider_id,
            team_id,
            cluster_name,
        )
        return None

    # Reconstruct ClusterConfig from stored cluster_config_dict.
    cluster_config_raw = job_data.get("cluster_config")
    if not cluster_config_raw or not isinstance(cluster_config_raw, dict):
        logger.error("Remote job queue worker: job %s missing cluster_config in job_data", job_id)
        return None

    try:
        cluster_config = ClusterConfig.model_validate(cluster_config_raw)
    except Exception as exc:
        logger.error("Remote job queue worker: job %s failed to parse cluster_config: %s", job_id, exc)
        return None

    quota_hold_id = job_data.get("quota_hold_id")

    return RemoteLaunchWorkItem(
        job_id=job_id,
        experiment_id=experiment_id,
        provider_id=str(provider_id),
        team_id=str(team_id),
        user_id=str(user_id),
        cluster_name=cluster_name,
        cluster_config=cluster_config,
        quota_hold_id=quota_hold_id,
        subtype=subtype,
    )


def _log_task_exception(task: asyncio.Task) -> None:
    try:
        exc = task.exception()
    except asyncio.CancelledError:
        return
    except Exception:  # noqa: BLE001
        logger.exception("Remote launch task failed while retrieving exception")
        return

    if exc is not None:
        logger.exception("Remote launch task crashed", exc_info=exc)


async def _remote_job_queue_worker_loop() -> None:
    """Long-running worker that polls the job_queue SQL table for PENDING remote jobs."""
    logger.info("Remote job queue worker: started")
    try:
        while True:
            try:
                pending_entries = await _poll_pending_remote_entries()
                if not pending_entries:
                    await asyncio.sleep(_REMOTE_QUEUE_POLL_INTERVAL)
                    continue

                for entry in pending_entries:
                    # Mark dispatched immediately so the next poll cycle doesn't pick it up again.
                    # NOTE: There is only a single worker running, so we don't have to worry about
                    # a race condition where the pending list changes between _poll_pending_remote_entries
                    # and _mark_entry_dispatched.
                    await _mark_entry_dispatched(entry.id)

                    # Set org context so the job_service can find the job on disk.
                    lab_dirs.set_organization_id(entry.team_id)
                    try:
                        job = await job_service.job_get(entry.job_id, experiment_id=entry.experiment_id)
                    finally:
                        lab_dirs.set_organization_id(None)

                    if not job:
                        logger.error(
                            "Remote job queue worker: job %s not found (experiment=%s)",
                            entry.job_id,
                            entry.experiment_id,
                        )
                        await _mark_entry_failed(entry.id)
                        continue

                    item = _reconstruct_work_item(job)
                    if item is None:
                        await _mark_entry_failed(entry.id)
                        await job_service.job_update_status(
                            entry.job_id,
                            JobStatus.FAILED,
                            experiment_id=entry.experiment_id,
                            error_msg="Failed to reconstruct launch work item from job data - "
                            "required fields (provider_id, team_id, cluster_name, cluster_config) may be missing.",
                        )
                        continue

                    # Fire concurrently, bounded by semaphore.
                    task = asyncio.create_task(_process_launch_item(item))
                    task.add_done_callback(_log_task_exception)

                # After dispatching all found entries, loop immediately to check for more.
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning(f"Remote job queue worker: unhandled error in cycle, continuing: {exc}")
                await asyncio.sleep(_REMOTE_QUEUE_POLL_INTERVAL)
    except asyncio.CancelledError:
        logger.info("Remote job queue worker: stopping")
        raise


async def start_remote_job_queue_worker() -> None:
    """Start the background remote job queue worker (idempotent)."""
    global _remote_job_queue_worker_task

    if _remote_job_queue_worker_task and not _remote_job_queue_worker_task.done():
        return

    _remote_job_queue_worker_task = asyncio.create_task(_remote_job_queue_worker_loop(), name="remote-job-queue-worker")


async def stop_remote_job_queue_worker() -> None:
    """Cancel the background remote job queue worker."""
    global _remote_job_queue_worker_task

    if _remote_job_queue_worker_task and not _remote_job_queue_worker_task.done():
        _remote_job_queue_worker_task.cancel()
        try:
            await _remote_job_queue_worker_task
        except asyncio.CancelledError:
            pass
    _remote_job_queue_worker_task = None


# ---------------------------------------------------------------------------
# Launch logic
# ---------------------------------------------------------------------------


async def _process_launch_item(item: RemoteLaunchWorkItem) -> None:
    """Process a single remote launch work item."""
    async with _remote_launch_semaphore:
        async with async_session() as session:
            lab_dirs.set_organization_id(item.team_id)
            try:
                await job_service.job_update_launch_progress(
                    item.job_id,
                    item.experiment_id,
                    phase="launching_cluster",
                    percent=70,
                    message="Launching cluster",
                )

                provider = await get_provider_by_id(session, item.provider_id)
                if not provider:
                    await job_service.job_update_status(
                        item.job_id,
                        JobStatus.FAILED,
                        experiment_id=item.experiment_id,
                        error_msg="Provider not found for remote launch",
                        session=session,
                    )
                    if item.quota_hold_id:
                        await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                        await session.commit()
                    return

                provider_instance = await get_provider_instance(provider, user_id=item.user_id, team_id=item.team_id)

                loop = asyncio.get_running_loop()

                def _launch_with_org_context():
                    lab_dirs.set_organization_id(item.team_id)
                    return provider_instance.launch_cluster(item.cluster_name, item.cluster_config)

                try:
                    # Fail fast if the provider is unreachable before attempting launch.
                    if hasattr(provider_instance, "check"):
                        check_result = await loop.run_in_executor(None, provider_instance.check)
                        is_healthy, reason = normalize_provider_check_result(check_result)
                        if not is_healthy:
                            raise RuntimeError(
                                f"Provider '{provider.name}' is not reachable: "
                                f"{reason or 'verify that the provider is running and accessible.'}"
                            )

                    launch_result = await loop.run_in_executor(None, _launch_with_org_context)

                    # Defensive: treat error dicts from providers as failures.
                    if isinstance(launch_result, dict) and launch_result.get("status") == "error":
                        raise RuntimeError(launch_result.get("message", "Provider returned an error"))

                except Exception as exc:  # noqa: BLE001
                    await job_service.job_update_launch_progress(
                        item.job_id,
                        item.experiment_id,
                        phase="failed",
                        percent=100,
                        message=f"Launch failed: {exc!s}",
                    )
                    if item.quota_hold_id:
                        await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                    await job_service.job_update_status(
                        item.job_id,
                        JobStatus.FAILED,
                        experiment_id=item.experiment_id,
                        error_msg=str(exc),
                        session=session,
                    )
                    await session.commit()
                    return

                await job_service.job_update_launch_progress(
                    item.job_id,
                    item.experiment_id,
                    phase="cluster_started",
                    percent=99,
                    message="Launch initiated",
                )

                if isinstance(launch_result, dict):
                    await job_service.job_update_job_data_insert_key_value(
                        item.job_id,
                        "provider_launch_result",
                        launch_result,
                        item.experiment_id,
                    )
                    request_id = launch_result.get("request_id")
                    if request_id:
                        await job_service.job_update_job_data_insert_key_value(
                            item.job_id,
                            "orchestrator_request_id",
                            request_id,
                            item.experiment_id,
                        )

                # Keep the job in LAUNCHING/INTERACTIVE; status polling will advance it later.
                next_status = JobStatus.INTERACTIVE if item.subtype == "interactive" else JobStatus.LAUNCHING
                await job_service.job_update_status(
                    item.job_id,
                    next_status,
                    experiment_id=item.experiment_id,
                    session=session,
                )
                await session.commit()
            finally:
                lab_dirs.set_organization_id(None)
