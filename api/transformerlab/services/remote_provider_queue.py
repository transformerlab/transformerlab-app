import asyncio
import logging
import os
from typing import Optional

from pydantic import BaseModel

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.db.session import async_session
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
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


_remote_launch_queue: "asyncio.Queue[RemoteLaunchWorkItem]" = asyncio.Queue()
_dispatcher_task: Optional[asyncio.Task] = None
_dispatcher_lock = asyncio.Lock()

# Concurrency: remote launches should start immediately, but we still cap total parallelism
try:
    _MAX_CONCURRENT_REMOTE_LAUNCHES = int(os.getenv("TFL_MAX_CONCURRENT_REMOTE_LAUNCHES", "8"))
except Exception:  # noqa: BLE001
    _MAX_CONCURRENT_REMOTE_LAUNCHES = 8

_remote_launch_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_REMOTE_LAUNCHES)


async def enqueue_remote_launch(
    job_id: str,
    experiment_id: str,
    provider_id: str,
    team_id: str,
    user_id: str,
    cluster_name: str,
    cluster_config: ClusterConfig,
    quota_hold_id: Optional[str],
    subtype: Optional[str],
) -> None:
    """Enqueue a remote provider launch work item and ensure the dispatcher is running."""
    global _dispatcher_task
    item = RemoteLaunchWorkItem(
        job_id=str(job_id),
        experiment_id=str(experiment_id),
        provider_id=str(provider_id),
        team_id=str(team_id),
        user_id=str(user_id),
        cluster_name=cluster_name,
        cluster_config=cluster_config,
        quota_hold_id=quota_hold_id,
        subtype=subtype,
    )
    await _remote_launch_queue.put(item)

    async with _dispatcher_lock:
        if _dispatcher_task is None or _dispatcher_task.done():
            _dispatcher_task = asyncio.create_task(_dispatcher_loop())


async def _dispatcher_loop() -> None:
    """Continuously dispatch queued launches into concurrent worker tasks."""
    while True:
        item = await _remote_launch_queue.get()
        task = asyncio.create_task(_process_launch_item(item))
        task.add_done_callback(_log_task_exception)


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
                    launch_result = await loop.run_in_executor(None, _launch_with_org_context)
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
                    percent=100,
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
