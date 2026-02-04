import asyncio
from typing import Optional

from pydantic import BaseModel

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
from transformerlab.db.session import async_session


class LocalLaunchWorkItem(BaseModel):
    """Work item for launching a local provider job in the background."""

    job_id: str
    experiment_id: str
    provider_id: str
    cluster_name: str
    cluster_config: ClusterConfig
    quota_hold_id: Optional[str] = None
    initial_status: str  # e.g. "LAUNCHING" or "INTERACTIVE"


_local_launch_queue: "asyncio.Queue[LocalLaunchWorkItem]" = asyncio.Queue()
_worker_started = False
_worker_lock = asyncio.Lock()


async def enqueue_local_launch(
    job_id: str,
    experiment_id: str,
    provider_id: str,
    cluster_name: str,
    cluster_config: ClusterConfig,
    quota_hold_id: Optional[str],
    initial_status: str,
) -> None:
    """Enqueue a local provider launch work item and lazily start the worker."""
    global _worker_started

    item = LocalLaunchWorkItem(
        job_id=str(job_id),
        experiment_id=str(experiment_id),
        provider_id=str(provider_id),
        cluster_name=cluster_name,
        cluster_config=cluster_config,
        quota_hold_id=quota_hold_id,
        initial_status=initial_status,
    )
    await _local_launch_queue.put(item)

    if not _worker_started:
        # Lazily start a single background worker
        asyncio.create_task(_local_launch_worker())
        _worker_started = True


async def _local_launch_worker() -> None:
    """Background worker that serializes local provider launches."""
    while True:
        item = await _local_launch_queue.get()
        try:
            # Use a dedicated DB session inside the worker
            async with async_session() as session:
                provider = await get_provider_by_id(session, item.provider_id)
                if not provider:
                    await job_service.job_update_status(
                        item.job_id,
                        "FAILED",
                        experiment_id=item.experiment_id,
                        error_msg="Provider not found for local launch",
                        session=session,
                    )
                    if item.quota_hold_id:
                        await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                        await session.commit()
                    continue

                provider_instance = get_provider_instance(provider)

                # Transition from WAITING -> initial_status (LAUNCHING / INTERACTIVE)
                await job_service.job_update_status(
                    item.job_id,
                    item.initial_status,
                    experiment_id=item.experiment_id,
                    session=session,
                )
                await session.commit()

                loop = asyncio.get_running_loop()
                try:
                    # Ensure only one local launch runs at a time
                    async with _worker_lock:
                        launch_result = await loop.run_in_executor(
                            None,
                            lambda: provider_instance.launch_cluster(item.cluster_name, item.cluster_config),
                        )
                except Exception as exc:  # noqa: BLE001
                    # Release quota hold and mark job failed
                    if item.quota_hold_id:
                        await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                        await session.commit()

                    await job_service.job_update_status(
                        item.job_id,
                        "FAILED",
                        experiment_id=item.experiment_id,
                        error_msg=str(exc),
                        session=session,
                    )
                    await session.commit()
                    continue

                # On success, we keep the job in LAUNCHING/INTERACTIVE; status checks will
                # complete it when the local process exits.
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
        finally:
            _local_launch_queue.task_done()
