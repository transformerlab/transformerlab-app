import asyncio
import logging
from typing import List, Optional, Tuple

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
_worker_started = False
_worker_started_lock = asyncio.Lock()
_worker_lock = asyncio.Lock()

# Track waiting job IDs so we can update queue positions when jobs are dequeued.
# Each entry is (job_id, experiment_id).
_waiting_jobs: List[Tuple[str, str]] = []
_waiting_jobs_lock = asyncio.Lock()


async def _update_waiting_job_positions() -> None:
    """Update launch_progress and status_message for all waiting jobs with their queue position."""
    async with _waiting_jobs_lock:
        for idx, (jid, eid) in enumerate(_waiting_jobs):
            position = idx + 1
            total = len(_waiting_jobs)
            if total == 1:
                message = "Queued \u2014 waiting for the current job to finish"
            else:
                ahead = position - 1
                if ahead == 0:
                    message = "Queued \u2014 you're next"
                elif ahead == 1:
                    message = "Queued \u2014 1 job ahead"
                else:
                    message = f"Queued \u2014 {ahead} jobs ahead"
            await job_service.job_update_launch_progress(jid, eid, phase="queued", percent=0, message=message)
            await job_service.job_update_status_message(jid, eid, message)


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

    # Track this job for queue position updates.
    async with _waiting_jobs_lock:
        _waiting_jobs.append((str(job_id), str(experiment_id)))

    # Set initial queue position feedback for all waiting jobs.
    await _update_waiting_job_positions()

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

        # Remove this job from the waiting list and refresh positions for remaining jobs.
        async with _waiting_jobs_lock:
            _waiting_jobs[:] = [(jid, eid) for jid, eid in _waiting_jobs if jid != item.job_id]
        await _update_waiting_job_positions()

        try:
            # Delegate actual processing to helper to keep the worker loop simple.
            await _process_launch_item(item)
        except Exception as exc:  # noqa: BLE001
            print(f"[local_provider_queue] Job {item.job_id}: worker encountered unexpected error: {exc}")


async def _process_launch_item(item: LocalLaunchWorkItem) -> None:
    """Process a single local launch work item."""
    async with async_session() as session:
        lab_dirs.set_organization_id(item.team_id)
        try:
            # Initial progress update – make it clear we're preparing the local environment.
            preparing_msg = "Preparing local environment (this may take a few minutes)..."
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="starting",
                percent=5,
                message=preparing_msg,
            )
            await job_service.job_update_status_message(item.job_id, item.experiment_id, preparing_msg)
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
            launching_msg = "Setting up local provider and starting cluster..."
            await job_service.job_update_launch_progress(
                item.job_id,
                item.experiment_id,
                phase="launching_cluster",
                percent=50,
                message=launching_msg,
            )
            await job_service.job_update_status_message(item.job_id, item.experiment_id, launching_msg)

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
            # Clear status_message once the cluster is running — let the status chip speak for itself.
            await job_service.job_update_status_message(item.job_id, item.experiment_id, "")
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
