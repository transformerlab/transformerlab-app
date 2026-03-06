import asyncio
import logging
from typing import Optional

from pydantic import BaseModel

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
from transformerlab.db.session import async_session
from transformerlab.shared.request_context import set_current_org_id
from lab import dirs as lab_dirs

logger = logging.getLogger(__name__)


class LocalLaunchWorkItem(BaseModel):
    """Work item for launching a local provider job in the background."""

    job_id: str
    experiment_id: str
    provider_id: str
    team_id: str
    cluster_name: str
    cluster_config: ClusterConfig
    quota_hold_id: Optional[str] = None
    initial_status: str  # e.g. "LAUNCHING" or "INTERACTIVE"


_local_launch_queue: "asyncio.Queue[LocalLaunchWorkItem]" = asyncio.Queue()
_worker_started = False
_worker_started_lock = asyncio.Lock()
_worker_lock = asyncio.Lock()


async def enqueue_local_launch(
    job_id: str,
    experiment_id: str,
    provider_id: str,
    team_id: str,
    cluster_name: str,
    cluster_config: ClusterConfig,
    quota_hold_id: Optional[str],
    initial_status: str,
) -> None:
    """Enqueue a local provider launch work item and lazily start the worker."""
    item = LocalLaunchWorkItem(
        job_id=str(job_id),
        experiment_id=str(experiment_id),
        provider_id=str(provider_id),
        team_id=str(team_id),
        cluster_name=cluster_name,
        cluster_config=cluster_config,
        quota_hold_id=quota_hold_id,
        initial_status=initial_status,
    )
    await _local_launch_queue.put(item)
    print(f"[local_provider_queue] Enqueued job {job_id} (cluster={cluster_name}, status={initial_status})")

    global _worker_started
    async with _worker_started_lock:
        if not _worker_started:
            asyncio.create_task(_local_launch_worker())
            _worker_started = True


async def _local_launch_worker() -> None:
    """Background worker that serializes local provider launches."""
    while True:
        item = await _local_launch_queue.get()
        print(f"[local_provider_queue] Picked up job {item.job_id} from queue (cluster={item.cluster_name})")
        try:
            # Use a dedicated DB session inside the worker
            async with async_session() as session:
                # Ensure lab SDK and API request context are scoped to the correct organization
                set_current_org_id(item.team_id)
                lab_dirs.set_organization_id(item.team_id)
                try:
                    await job_service.job_update_launch_progress(
                        item.job_id,
                        item.experiment_id,
                        phase="starting",
                        percent=5,
                        message="Starting launch",
                    )
                    provider = await get_provider_by_id(session, item.provider_id)
                    if not provider:
                        print(f"[local_provider_queue] Provider {item.provider_id} not found, job {item.job_id} FAILED")
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

                    provider_instance = await get_provider_instance(provider)

                    # Transition from WAITING -> initial_status (LAUNCHING / INTERACTIVE)
                    print(f"[local_provider_queue] Job {item.job_id}: transitioning to {item.initial_status}")
                    await job_service.job_update_status(
                        item.job_id,
                        item.initial_status,
                        experiment_id=item.experiment_id,
                        session=session,
                    )
                    await session.commit()


async def _process_launch_item(item: LocalLaunchWorkItem) -> None:
    """Process a single local launch work item."""
    async with async_session() as session:
        set_current_org_id(item.team_id)
        lab_dirs.set_organization_id(item.team_id)
        try:
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="starting",
                percent=5,
                message="Starting launch",
            )
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
                return

            provider_instance = await get_provider_instance(provider)

            # Transition from WAITING -> initial_status (LAUNCHING / INTERACTIVE)
            await job_service.job_update_status(
                item.job_id,
                item.initial_status,
                experiment_id=item.experiment_id,
                session=session,
            )
            await session.commit()

            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="launching_cluster",
                percent=50,
                message="Starting local cluster",
            )

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

                    print(f"[local_provider_queue] Job {item.job_id}: launching cluster {item.cluster_name}")
                    loop = asyncio.get_running_loop()
                    try:
                        # Ensure only one local launch runs at a time
                        async with _worker_lock:
                            launch_result = await loop.run_in_executor(
                                None,
                                lambda: provider_instance.launch_cluster(item.cluster_name, item.cluster_config),
                            )
                    except Exception as exc:  # noqa: BLE001
                        print(f"[local_provider_queue] Job {item.job_id}: launch_cluster failed: {exc}")
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

                    print(f"[local_provider_queue] Job {item.job_id}: cluster started successfully — {launch_result}")
                    # On success, we keep the job in LAUNCHING/INTERACTIVE; status checks will
                    # complete it when the local process exits.
                    await job_service.job_update_launch_progress(
                        item.job_id,
                        "orchestrator_request_id",
                        request_id,
                        item.experiment_id,
                    )
        finally:
            set_current_org_id(None)
            lab_dirs.set_organization_id(None)
