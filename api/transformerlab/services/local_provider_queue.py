import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from pydantic import BaseModel

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
from transformerlab.db.session import async_session
from lab import dirs as lab_dirs
from lab.job_status import JobStatus

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
_processing = False
_dispatch_lock = asyncio.Lock()
_worker_lock = asyncio.Lock()

# Dedicated thread pool for launch_cluster operations so long-running subprocess
# calls (uv pip install can take 15+ min) don't starve the default executor used
# by the rest of the server for DB queries, file I/O, etc.
_LAUNCH_MAX_WORKERS = int(os.environ.get("TFL_LAUNCH_MAX_WORKERS", "2"))
_launch_executor = ThreadPoolExecutor(max_workers=_LAUNCH_MAX_WORKERS, thread_name_prefix="local-launch")


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
    """Enqueue a local provider launch work item, starting immediately if idle."""
    global _processing
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
    print(f"[local_provider_queue] Enqueued job {job_id} (cluster={cluster_name}, status={initial_status})")

    async with _dispatch_lock:
        if _processing:
            # A job is already running; buffer this one for later.
            await _local_launch_queue.put(item)
            return
        # Fast path: no job running, process immediately.
        _processing = True

    asyncio.create_task(_run_and_drain(item))


async def _run_and_drain(item: LocalLaunchWorkItem) -> None:
    """Process an item immediately, then drain any queued items sequentially."""
    global _processing
    while True:
        print(f"[local_provider_queue] Picked up job {item.job_id} (cluster={item.cluster_name})")
        try:
            await _process_launch_item(item)
        except Exception as exc:  # noqa: BLE001
            print(f"[local_provider_queue] Job {item.job_id}: unexpected error: {exc}")

        # Check if more items accumulated while we were processing.
        async with _dispatch_lock:
            if _local_launch_queue.empty():
                _processing = False
                return
            item = _local_launch_queue.get_nowait()


async def _process_launch_item(item: LocalLaunchWorkItem) -> None:
    """Process a single local launch work item."""
    async with async_session() as session:
        lab_dirs.set_organization_id(item.team_id)
        try:
            # Initial progress update – make it clear we're preparing the local environment.
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="starting",
                percent=5,
                message="Preparing local environment (this may take a few minutes)...",
            )
            provider = await get_provider_by_id(session, item.provider_id)
            if not provider:
                print(f"[local_provider_queue] Provider {item.provider_id} not found, job {item.job_id} FAILED")
                await job_service.job_update_status(
                    item.job_id,
                    JobStatus.FAILED,
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
            print(f"[local_provider_queue] Job {item.job_id}: transitioning to {item.initial_status}")
            await job_service.job_update_status(
                item.job_id,
                item.initial_status,
                experiment_id=item.experiment_id,
                session=session,
            )
            await session.commit()

            # Indicate we're about to launch the local cluster
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="launching_cluster",
                percent=50,
                message="Setting up local provider and starting cluster...",
            )

            loop = asyncio.get_running_loop()
            try:
                # Ensure only one local launch runs at a time
                def _launch_with_org_context():
                    lab_dirs.set_organization_id(item.team_id)
                    return provider_instance.launch_cluster(item.cluster_name, item.cluster_config)

                async with _worker_lock:
                    launch_result = await loop.run_in_executor(_launch_executor, _launch_with_org_context)
            except Exception as exc:  # noqa: BLE001
                print(f"[local_provider_queue] Job {item.job_id}: launch_cluster failed: {exc}")
                # Release quota hold and mark job failed
                if item.quota_hold_id:
                    await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                    await session.commit()

                await job_service.job_update_status(
                    item.job_id,
                    JobStatus.FAILED,
                    experiment_id=item.experiment_id,
                    error_msg=str(exc),
                    session=session,
                )
                await session.commit()
                return

            print(f"[local_provider_queue] Job {item.job_id}: cluster started successfully — {launch_result}")
            # On success, we keep the job in LAUNCHING/INTERACTIVE; status checks will
            # complete it when the local process exits. We just bump progress.
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="cluster_running",
                percent=100,
                message="Local cluster started",
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[local_provider_queue] Job {item.job_id}: unexpected error while processing launch item: {exc}")
            if item.quota_hold_id:
                await quota_service.release_quota_hold(session, hold_id=item.quota_hold_id)
                await session.commit()

            await job_service.job_update_status(
                item.job_id,
                JobStatus.FAILED,
                experiment_id=item.experiment_id,
                error_msg=str(exc),
                session=session,
            )
            await session.commit()
        finally:
            lab_dirs.set_organization_id(None)
