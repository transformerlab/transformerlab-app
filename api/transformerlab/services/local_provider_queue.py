import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from pydantic import BaseModel

from transformerlab.compute_providers.models import ClusterConfig, ClusterState
from transformerlab.services import job_service, quota_service
from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance
from transformerlab.db.session import async_session
from lab import dirs as lab_dirs
from lab.job_status import JobStatus, TERMINAL_STATUSES

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

# How often (seconds) to check whether a launched local job's process has exited.
# This gates how quickly the queue advances to the next job once one finishes.
_COMPLETION_POLL_INTERVAL = float(os.environ.get("TFL_LOCAL_JOB_POLL_INTERVAL", "3"))

# Cluster states that mean the local job's process is no longer running.
_FINISHED_CLUSTER_STATES = {ClusterState.DOWN, ClusterState.FAILED, ClusterState.STOPPED}


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
    """Process a single local launch work item.

    For batch (non-interactive) jobs this does NOT return until the launched job's
    process has exited, so the drain loop keeps the local provider strictly serial:
    one job executes at a time. Interactive jobs are long-lived and return as soon as
    the cluster is up so they don't block the queue forever.
    """
    provider_instance = None
    launched_ok = False
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

            # Capture the team_id so the callback can restore the org context
            # on the coroutine it schedules (contextvars don't propagate via
            # run_coroutine_threadsafe).
            team_id = item.team_id

            async def _update_live_status(status: str) -> None:
                lab_dirs.set_organization_id(team_id)
                try:
                    await job_service.job_update_job_data_insert_key_value(
                        item.job_id, "live_status", status, item.experiment_id
                    )
                finally:
                    lab_dirs.set_organization_id(None)

            def _on_status(status: str) -> None:
                """Callback invoked from the executor thread to update live_status."""
                future = asyncio.run_coroutine_threadsafe(_update_live_status(status), loop)
                try:
                    future.result(timeout=5)
                except Exception:
                    pass

            try:
                # Ensure only one local launch runs at a time
                def _launch_with_org_context():
                    lab_dirs.set_organization_id(item.team_id)
                    return provider_instance.launch_cluster(
                        item.cluster_name, item.cluster_config, on_status=_on_status
                    )

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
            launched_ok = True
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

    # Serialize EXECUTION, not just launch: launch_cluster() spawns the job as a
    # detached background process and returns immediately. Block here until that
    # process exits so the drain loop won't start the next local job until this one
    # is done. Interactive jobs are long-lived servers, so they skip the wait.
    if launched_ok and provider_instance is not None and item.initial_status != JobStatus.INTERACTIVE:
        await _wait_for_local_job_completion(provider_instance, item)


async def _wait_for_local_job_completion(provider_instance, item: LocalLaunchWorkItem) -> None:
    """Block until the local job's launched process has exited.

    Detects completion two ways and returns when either fires:
      - the per-job process is gone (get_cluster_status reports a finished state), or
      - the job reached a terminal status out-of-band (e.g. the user stopped it, or the
        background status poller already finalized it).
    """
    # get_cluster_status reads the per-job pid file from extra_config["workspace_dir"],
    # which is per-job and lives in the cluster_config rather than the provider record.
    workspace_dir = (item.cluster_config.provider_config or {}).get("workspace_dir")
    if workspace_dir and hasattr(provider_instance, "extra_config"):
        provider_instance.extra_config["workspace_dir"] = workspace_dir

    def _check_cluster_state() -> ClusterState:
        lab_dirs.set_organization_id(item.team_id)
        try:
            return provider_instance.get_cluster_status(item.cluster_name).state
        finally:
            lab_dirs.set_organization_id(None)

    consecutive_errors = 0
    lab_dirs.set_organization_id(item.team_id)
    try:
        while True:
            await asyncio.sleep(_COMPLETION_POLL_INTERVAL)

            # Out-of-band terminal status (stopped/cancelled/already finalized).
            try:
                job = await job_service.job_get(item.job_id, item.experiment_id)
                if job and job.get("status") in TERMINAL_STATUSES:
                    print(f"[local_provider_queue] Job {item.job_id}: terminal status reached; releasing queue")
                    return
            except Exception as exc:  # noqa: BLE001
                print(f"[local_provider_queue] Job {item.job_id}: status read failed during wait: {exc}")

            # Primary signal: has the launched process exited?
            try:
                state = await asyncio.to_thread(_check_cluster_state)
                consecutive_errors = 0
                if state in _FINISHED_CLUSTER_STATES:
                    print(f"[local_provider_queue] Job {item.job_id}: process exited (state={state}); releasing queue")
                    return
            except Exception as exc:  # noqa: BLE001
                consecutive_errors += 1
                print(
                    f"[local_provider_queue] Job {item.job_id}: status check failed during wait "
                    f"({consecutive_errors}): {exc}"
                )
                # Don't wedge the queue forever if status checks keep failing.
                if consecutive_errors >= 3:
                    print(f"[local_provider_queue] Job {item.job_id}: giving up wait after repeated errors")
                    return
    finally:
        lab_dirs.set_organization_id(None)
