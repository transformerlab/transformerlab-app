"""Background worker that polls remote compute providers for job status updates.

Follows the same pattern as sweep_status_service.py.

Runs every REMOTE_JOB_STATUS_INTERVAL_SECONDS, iterates all REMOTE jobs that are
LAUNCHING, RUNNING, STOPPING, or INTERACTIVE across all orgs, and transitions them
to COMPLETE/FAILED/STOPPED when the provider reports done or the process has died
(e.g. interactive jobs that exit due to setup failure).

This decouples provider polling from the check-status HTTP endpoint, which becomes
a cheap read-only operation unaffected by provider latency or downtime.
"""

import asyncio
import os
import time
from typing import Any, Dict, List, Optional

from lab import Experiment
from lab.dirs import set_organization_id as lab_set_org_id
from lab.job_status import JobStatus

from transformerlab.services import job_service, team_service
from transformerlab.services.background_scheduler import run_periodic_worker
from transformerlab.services.cache_service import cache

REMOTE_JOB_STATUS_INTERVAL_SECONDS = int(os.getenv("REMOTE_JOB_STATUS_INTERVAL_SECONDS", "15"))

# Circuit breaker: after this many consecutive provider failures, back off.
_PROVIDER_FAILURE_THRESHOLD = 3
# How many cycles to skip before retrying a provider that hit the failure threshold.
_PROVIDER_BACKOFF_CYCLES = 3

# Per-provider failure tracking: { provider_id: { "failures": int, "skip_cycles": int } }
_provider_failures: Dict[str, Dict[str, int]] = {}

_remote_job_status_worker_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Org-context helpers (same pattern as sweep_status_service.py)
# ---------------------------------------------------------------------------


def _set_org_context(org_id: Optional[str]) -> None:
    if lab_set_org_id is not None:
        lab_set_org_id(org_id)


def _clear_org_context() -> None:
    _set_org_context(None)


async def _list_all_org_ids() -> List[str]:
    try:
        return await team_service.get_all_team_ids()
    except Exception as exc:
        print(f"Remote job status worker: failed listing orgs from DB: {exc}")
        return []


async def _list_experiment_ids_for_current_org() -> List[str]:
    try:
        experiments_data = await Experiment.get_all()
    except Exception as exc:
        print(f"Remote job status worker: failed getting experiments: {exc}")
        return []
    return [str(exp.get("id")) for exp in experiments_data if exp.get("id")]


# ---------------------------------------------------------------------------
# Circuit breaker helpers
# ---------------------------------------------------------------------------


def _is_provider_backed_off(provider_id: str) -> bool:
    """Return True if this provider is in backoff and decrement the counter."""
    state = _provider_failures.get(provider_id)
    if not state or state["skip_cycles"] <= 0:
        return False
    state["skip_cycles"] -= 1
    return True


def _record_provider_success(provider_id: str) -> None:
    _provider_failures.pop(provider_id, None)


def _record_provider_failure(provider_id: str) -> None:
    state = _provider_failures.setdefault(provider_id, {"failures": 0, "skip_cycles": 0})
    state["failures"] += 1
    if state["failures"] >= _PROVIDER_FAILURE_THRESHOLD:
        state["skip_cycles"] = _PROVIDER_BACKOFF_CYCLES
        state["failures"] = 0
        print(
            f"Remote job status worker: provider {provider_id} reached failure threshold; "
            f"backing off for {_PROVIDER_BACKOFF_CYCLES} cycles (~"
            f"{_PROVIDER_BACKOFF_CYCLES * REMOTE_JOB_STATUS_INTERVAL_SECONDS}s)"
        )


# ---------------------------------------------------------------------------
# Per-job status logic
# ---------------------------------------------------------------------------


async def _handle_live_status(job: Dict[str, Any], experiment_id: str) -> bool:
    """Check job_data.live_status written by tfl-remote-trap (pure filesystem read).

    Returns True if the job was transitioned; caller should skip the provider check.
    """
    job_data = job.get("job_data") or {}
    live_status = job_data.get("live_status")

    if live_status not in ("finished", "crashed"):
        return False

    job_id = str(job.get("id", ""))
    new_status = JobStatus.COMPLETE.value if live_status == "finished" else JobStatus.FAILED.value
    try:
        end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
        await job_service.job_update_job_data_insert_key_value(job_id, "end_time", end_time_str, experiment_id)
        await job_service.job_update_status(job_id, new_status, experiment_id=experiment_id)
        await cache.invalidate("jobs", f"jobs:list:{experiment_id}")
    except Exception as exc:
        print(f"Remote job status worker: failed updating job {job_id} from live_status={live_status}: {exc}")
    return True


async def _check_job_via_provider(
    job: Dict[str, Any],
    experiment_id: str,
    provider_record: Any,
    provider_instance: Any,
) -> bool:
    """Query the provider and update the job status if it has reached a terminal state.

    Returns True if the job was transitioned to a terminal status.
    Raises ConnectionError or Exception on provider failure (caller handles circuit breaker).
    """
    from transformerlab.compute_providers.models import ClusterState, JobState
    from transformerlab.shared.models.models import ProviderType

    job_id = str(job.get("id", ""))
    job_data = job.get("job_data") or {}
    cluster_name = job_data.get("cluster_name", "")
    provider_type = provider_record.type
    job_status = job.get("status", "")

    if provider_type in (ProviderType.LOCAL.value, ProviderType.RUNPOD.value):
        # LOCAL and RUNPOD: the pod/process itself is the job — check cluster state.
        if provider_type == ProviderType.LOCAL.value and job_data.get("workspace_dir"):
            if hasattr(provider_instance, "extra_config"):
                provider_instance.extra_config["workspace_dir"] = job_data["workspace_dir"]

        cluster_status = await asyncio.to_thread(provider_instance.get_cluster_status, cluster_name)
        cluster_state = cluster_status.state

        # For RUNPOD, when the user requested stop (job in STOPPING), treat any non-UP
        # state as terminal STOPPED so the job does not stay stuck in STOPPING. This
        # covers: "Pod not found" (pod already deleted), "TERMINATING", or any other
        # UNKNOWN returned while the pod is going away.
        if (
            provider_type == ProviderType.RUNPOD.value
            and job_status == JobStatus.STOPPING.value
            and (
                cluster_state == ClusterState.UNKNOWN
                or getattr(cluster_status, "status_message", "") == "Pod not found"
            )
        ):
            cluster_state = ClusterState.STOPPED

        terminal_cluster_states = {ClusterState.DOWN, ClusterState.FAILED, ClusterState.STOPPED}
        if cluster_state in terminal_cluster_states:
            end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
            await job_service.job_update_job_data_insert_key_value(job_id, "end_time", end_time_str, experiment_id)
            # Map cluster terminal state to the appropriate job status, mirroring the old check-status logic.
            if provider_type == ProviderType.LOCAL.value:
                if job_status == JobStatus.STOPPING.value:
                    final_status = JobStatus.STOPPED.value
                elif cluster_state == ClusterState.FAILED:
                    final_status = JobStatus.FAILED.value
                elif job_status == JobStatus.INTERACTIVE.value and cluster_state == ClusterState.DOWN:
                    # Interactive session died (e.g. setup failure); treat as failed so the job is not stuck.
                    final_status = JobStatus.FAILED.value
                else:
                    final_status = JobStatus.COMPLETE.value
            else:
                # RUNPOD: treat explicit user stop as STOPPED, otherwise mirror failure/success.
                if job_status == JobStatus.STOPPING.value:
                    final_status = JobStatus.STOPPED.value
                elif cluster_state == ClusterState.FAILED:
                    final_status = JobStatus.FAILED.value
                else:
                    final_status = JobStatus.COMPLETE.value

            await job_service.job_update_status(job_id, final_status, experiment_id=experiment_id)
            await cache.invalidate("jobs", f"jobs:list:{experiment_id}")
            return True

    else:
        # SkyPilot, SLURM, etc.: check the job queue on the cluster.
        try:
            provider_jobs = await asyncio.to_thread(provider_instance.list_jobs, cluster_name)
        except NotImplementedError:
            # Provider does not support job queue listing — nothing we can do here.
            return False

        terminal_job_states = {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}
        # Treat an empty list of provider jobs as "finished" – once the provider
        # reports no jobs, there's nothing left running for this cluster.
        jobs_finished = not provider_jobs or all(
            getattr(pj, "state", JobState.UNKNOWN) in terminal_job_states for pj in provider_jobs
        )
        if jobs_finished:
            end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
            await job_service.job_update_job_data_insert_key_value(job_id, "end_time", end_time_str, experiment_id)
            provider_states = [getattr(pj, "state", JobState.UNKNOWN) for pj in provider_jobs]

            # If the user requested a stop or the provider reports cancelled jobs,
            # prefer STOPPED as the final status. Otherwise propagate FAILED when
            # any provider job failed, else consider the job COMPLETE.
            if job_status == JobStatus.STOPPING.value or any(state == JobState.CANCELLED for state in provider_states):
                final_status = JobStatus.STOPPED.value
            elif any(state == JobState.FAILED for state in provider_states):
                final_status = JobStatus.FAILED.value
            else:
                final_status = JobStatus.COMPLETE.value

            await job_service.job_update_status(job_id, final_status, experiment_id=experiment_id)
            await cache.invalidate("jobs", f"jobs:list:{experiment_id}")
            return True

    return False


# ---------------------------------------------------------------------------
# Main refresh cycle
# ---------------------------------------------------------------------------


async def refresh_launching_remote_jobs_once() -> Dict[str, int]:
    """Single refresh cycle: check all LAUNCHING REMOTE jobs and update status.

    Returns cycle statistics for logging.
    """
    from transformerlab.db.session import async_session
    from transformerlab.services.provider_service import get_provider_by_id, get_provider_instance

    cycle_stats: Dict[str, int] = {
        "orgs": 0,
        "experiments": 0,
        "jobs_seen": 0,
        "jobs_updated": 0,
        "errors": 0,
    }

    org_ids = await _list_all_org_ids()

    # Cache provider records and instances within a cycle to avoid redundant DB lookups
    # and repeated instantiation for the same provider.
    provider_record_cache: Dict[str, Any] = {}
    provider_instance_cache: Dict[str, Any] = {}

    for org_id in org_ids:
        try:
            _set_org_context(org_id)
            cycle_stats["orgs"] += 1
            experiment_ids = await _list_experiment_ids_for_current_org()
            cycle_stats["experiments"] += len(experiment_ids)

            for experiment_id in experiment_ids:
                try:
                    all_remote_jobs = await job_service.jobs_get_all(
                        experiment_id=experiment_id, type="REMOTE", status=""
                    )
                except Exception as exc:
                    print(f"Remote job status worker: failed listing jobs for experiment {experiment_id}: {exc}")
                    cycle_stats["errors"] += 1
                    continue

                for job in all_remote_jobs:
                    job_status = job.get("status", "")
                    # Only check provider status for jobs that are still launching, running,
                    # stopping, or interactive (so we can detect when an interactive job has died).
                    if job_status not in (
                        JobStatus.LAUNCHING.value,
                        JobStatus.RUNNING.value,
                        JobStatus.STOPPING.value,
                        JobStatus.INTERACTIVE.value,
                    ):
                        continue

                    cycle_stats["jobs_seen"] += 1
                    job_id = str(job.get("id", ""))
                    job_data = job.get("job_data") or {}
                    provider_id = job_data.get("provider_id")
                    cluster_name = job_data.get("cluster_name")

                    if not provider_id or not cluster_name:
                        continue

                    # --- Fast path: live_status written by tfl-remote-trap ---
                    try:
                        transitioned = await _handle_live_status(job, experiment_id)
                        if transitioned:
                            cycle_stats["jobs_updated"] += 1
                            continue
                    except Exception as exc:
                        print(f"Remote job status worker: live_status check failed for job {job_id}: {exc}")
                        cycle_stats["errors"] += 1
                        continue

                    # --- Circuit breaker check ---
                    if _is_provider_backed_off(provider_id):
                        continue

                    # --- Get provider record (cached per cycle) ---
                    if provider_id not in provider_record_cache:
                        try:
                            async with async_session() as session:
                                record = await get_provider_by_id(session, provider_id)
                            provider_record_cache[provider_id] = record
                        except Exception as exc:
                            print(f"Remote job status worker: failed to fetch provider record {provider_id}: {exc}")
                            cycle_stats["errors"] += 1
                            continue

                    provider_record = provider_record_cache.get(provider_id)
                    if not provider_record:
                        continue

                    # --- Get provider instance (cached per cycle) ---
                    if provider_id not in provider_instance_cache:
                        try:
                            provider_instance_cache[provider_id] = await get_provider_instance(provider_record)
                        except Exception as exc:
                            print(f"Remote job status worker: failed to instantiate provider {provider_id}: {exc}")
                            cycle_stats["errors"] += 1
                            continue

                    provider_instance = provider_instance_cache.get(provider_id)
                    if not provider_instance:
                        continue

                    # --- Query provider and update status ---
                    try:
                        updated = await _check_job_via_provider(job, experiment_id, provider_record, provider_instance)
                        _record_provider_success(provider_id)
                        if updated:
                            cycle_stats["jobs_updated"] += 1
                    except ConnectionError as exc:
                        print(f"Remote job status worker: provider {provider_id} unreachable for job {job_id}: {exc}")
                        _record_provider_failure(provider_id)
                        cycle_stats["errors"] += 1
                    except Exception as exc:
                        print(f"Remote job status worker: error checking job {job_id} on provider {provider_id}: {exc}")
                        _record_provider_failure(provider_id)
                        cycle_stats["errors"] += 1

        finally:
            _clear_org_context()

    return cycle_stats


# ---------------------------------------------------------------------------
# Worker lifecycle
# ---------------------------------------------------------------------------


async def _remote_job_status_worker_cycle() -> None:
    """Single scheduled cycle for the remote job status worker.

    Wrapped by the generic periodic worker loop to provide shared scheduling
    and error handling while keeping logging and stats local to this module.
    """
    _cycle_start = time.monotonic()
    cycle_stats = await refresh_launching_remote_jobs_once()
    _cycle_elapsed = time.monotonic() - _cycle_start

    # Only log if there was actual work or errors (avoid noise during quiet periods).
    if cycle_stats["jobs_seen"] > 0 or cycle_stats["errors"] > 0:
        print(
            f"Remote job status worker: cycle done in {_cycle_elapsed:.3f}s — "
            f"orgs={cycle_stats['orgs']} experiments={cycle_stats['experiments']} "
            f"jobs_seen={cycle_stats['jobs_seen']} "
            f"jobs_updated={cycle_stats['jobs_updated']} "
            f"errors={cycle_stats['errors']}"
        )


async def _remote_job_status_worker_loop() -> None:
    try:
        await run_periodic_worker(
            name="Remote job status worker",
            interval_seconds=REMOTE_JOB_STATUS_INTERVAL_SECONDS,
            cycle_fn=_remote_job_status_worker_cycle,
        )
    finally:
        _clear_org_context()


async def start_remote_job_status_worker() -> None:
    global _remote_job_status_worker_task

    if _remote_job_status_worker_task and not _remote_job_status_worker_task.done():
        return

    _remote_job_status_worker_task = asyncio.create_task(
        _remote_job_status_worker_loop(), name="remote-job-status-worker"
    )


async def stop_remote_job_status_worker() -> None:
    global _remote_job_status_worker_task

    if _remote_job_status_worker_task and not _remote_job_status_worker_task.done():
        _remote_job_status_worker_task.cancel()
        try:
            await _remote_job_status_worker_task
        except asyncio.CancelledError:
            pass
    _remote_job_status_worker_task = None
