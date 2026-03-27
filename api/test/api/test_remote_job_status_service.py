"""Tests for the remote_job_status_service background worker.

Tests cover:
- live_status (tfl-remote-trap) fast path
- Provider circuit-breaker backoff
- Terminal state detection for SkyPilot/SLURM providers
- Terminal state detection for LOCAL/RUNPOD providers
- refresh_launching_remote_jobs_once cycle statistics
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.services import remote_job_status_service
from transformerlab.services.remote_job_status_service import (
    _handle_live_status,
    _check_job_via_provider,
    _is_provider_backed_off,
    _record_provider_failure,
    _record_provider_success,
    _PROVIDER_FAILURE_THRESHOLD,
    refresh_launching_remote_jobs_once,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_job(
    job_id: str = "job-1",
    status: str = "LAUNCHING",
    job_type: str = "REMOTE",
    provider_id: str = "prov-1",
    cluster_name: str = "cluster-abc",
    live_status: str | None = None,
    workspace_dir: str | None = None,
) -> dict:
    job_data: dict = {"provider_id": provider_id, "cluster_name": cluster_name}
    if live_status:
        job_data["live_status"] = live_status
    if workspace_dir:
        job_data["workspace_dir"] = workspace_dir
    return {
        "id": job_id,
        "type": job_type,
        "status": status,
        "experiment_id": "exp-1",
        "job_data": job_data,
    }


def _make_provider_record(provider_type: str = "skypilot", provider_id: str = "prov-1") -> MagicMock:
    record = MagicMock()
    record.id = provider_id
    record.type = provider_type
    return record


# ---------------------------------------------------------------------------
# Circuit breaker tests
# ---------------------------------------------------------------------------


def test_circuit_breaker_no_backoff_initially():
    remote_job_status_service._provider_failures.pop("prov-x", None)
    assert _is_provider_backed_off("prov-x") is False


def test_circuit_breaker_triggers_after_threshold():
    remote_job_status_service._provider_failures.pop("prov-y", None)
    for _ in range(_PROVIDER_FAILURE_THRESHOLD):
        _record_provider_failure("prov-y")
    # First call should be backed off
    assert _is_provider_backed_off("prov-y") is True


def test_circuit_breaker_decrements_and_clears():
    remote_job_status_service._provider_failures["prov-z"] = {"failures": 0, "skip_cycles": 2}
    assert _is_provider_backed_off("prov-z") is True  # skip_cycles becomes 1
    assert _is_provider_backed_off("prov-z") is True  # skip_cycles becomes 0
    assert _is_provider_backed_off("prov-z") is False  # skip_cycles is 0, no longer backed off


def test_circuit_breaker_success_resets():
    remote_job_status_service._provider_failures["prov-ok"] = {"failures": 2, "skip_cycles": 1}
    _record_provider_success("prov-ok")
    assert "prov-ok" not in remote_job_status_service._provider_failures


# ---------------------------------------------------------------------------
# _handle_live_status tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_handle_live_status_finished(monkeypatch):
    """live_status='Remote command finished' should transition job to COMPLETE and return True."""
    job = _make_job(live_status="Remote command finished")

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", job_id, key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", job_id, status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )

    result = await _handle_live_status(job, "exp-1")

    assert result is True
    assert ("status", "job-1", "COMPLETE") in calls
    assert any(c[0] == "kv" and c[2] == "end_time" for c in calls)


@pytest.mark.asyncio
async def test_handle_live_status_finished_interactive_subtype_does_not_transition(monkeypatch):
    """Interactive subtype jobs should never be auto-marked COMPLETE."""
    job = _make_job(status="INTERACTIVE", live_status="Remote command finished")
    job["job_data"]["subtype"] = "interactive"

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _handle_live_status(job, "exp-1")
    assert result is False


@pytest.mark.asyncio
async def test_handle_live_status_crashed(monkeypatch):
    """live_status='Remote command crashed' should transition job to FAILED and return True."""
    job = _make_job(live_status="Remote command crashed")

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", job_id, key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", job_id, status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )
    monkeypatch.setattr(remote_job_status_service, "_best_effort_stop_cluster_for_job", AsyncMock(return_value=None))

    result = await _handle_live_status(job, "exp-1")

    assert result is True
    assert ("status", "job-1", "FAILED") in calls


@pytest.mark.asyncio
async def test_handle_live_status_crashed_interactive_subtype_transitions_failed(monkeypatch):
    """Interactive subtype jobs may be marked FAILED when live_status='Remote command crashed'."""
    job = _make_job(status="INTERACTIVE", live_status="Remote command crashed")
    job["job_data"]["subtype"] = "interactive"

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", job_id, key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", job_id, status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )
    monkeypatch.setattr(remote_job_status_service, "_best_effort_stop_cluster_for_job", AsyncMock(return_value=None))

    result = await _handle_live_status(job, "exp-1")
    assert result is True
    assert ("status", "job-1", "FAILED") in calls


@pytest.mark.asyncio
async def test_handle_live_status_no_live_status(monkeypatch):
    """No live_status should return False without touching job_service."""
    job = _make_job()

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _handle_live_status(job, "exp-1")
    assert result is False


# ---------------------------------------------------------------------------
# _check_job_via_provider tests — SkyPilot / SLURM path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_job_via_provider_skypilot_all_terminal(monkeypatch):
    """All provider jobs in terminal state → job marked COMPLETE."""
    from transformerlab.compute_providers.models import JobInfo, JobState

    job = _make_job()
    record = _make_provider_record("skypilot")

    finished_job = MagicMock(spec=JobInfo)
    finished_job.state = JobState.COMPLETED

    instance = MagicMock()
    instance.list_jobs = MagicMock(return_value=[finished_job])

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)

    assert result is True
    assert ("status", "COMPLETE") in calls


@pytest.mark.asyncio
async def test_check_job_via_provider_skypilot_still_running(monkeypatch):
    """Provider jobs still running → returns False, no status update."""
    from transformerlab.compute_providers.models import JobInfo, JobState

    job = _make_job()
    record = _make_provider_record("skypilot")

    running_job = MagicMock(spec=JobInfo)
    running_job.state = JobState.RUNNING

    instance = MagicMock()
    instance.list_jobs = MagicMock(return_value=[running_job])

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is False


@pytest.mark.asyncio
async def test_check_job_via_provider_not_implemented(monkeypatch):
    """Provider raises NotImplementedError → returns False gracefully."""
    job = _make_job()
    record = _make_provider_record("skypilot")

    instance = MagicMock()
    instance.list_jobs = MagicMock(side_effect=NotImplementedError)

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is False


# ---------------------------------------------------------------------------
# _check_job_via_provider tests — LOCAL path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_job_via_provider_local_terminal(monkeypatch):
    """LOCAL provider cluster in DOWN state → job marked COMPLETE."""
    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    job = _make_job(workspace_dir="/tmp/ws")
    record = _make_provider_record("local")

    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.DOWN

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)
    instance.extra_config = {}

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)

    assert result is True
    assert ("status", "COMPLETE") in calls
    assert instance.extra_config.get("workspace_dir") == "/tmp/ws"


@pytest.mark.asyncio
async def test_check_job_via_provider_runpod_pod_not_found_stopping(monkeypatch):
    """RUNPOD provider, pod missing, job STOPPING → job marked STOPPED."""
    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    # Simulate a job that the user has requested to stop.
    job = _make_job(status="STOPPING")
    record = _make_provider_record("runpod")

    # Runpod get_cluster_status returns UNKNOWN with "Pod not found" when the pod
    # has already been deleted via stop_cluster.
    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.UNKNOWN
    cluster_status.status_message = "Pod not found"

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)

    assert result is True
    assert ("status", "STOPPED") in calls


@pytest.mark.asyncio
async def test_check_job_via_provider_runpod_pod_not_found_running_debounced(monkeypatch):
    """RUNPOD RUNNING + Pod not found: require N polls (same threshold as empty queue) before COMPLETE."""
    monkeypatch.setattr(remote_job_status_service, "EMPTY_PROVIDER_JOBS_TERMINAL_THRESHOLD", 2)

    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    job = _make_job(status="RUNNING")
    record = _make_provider_record("runpod")

    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.UNKNOWN
    cluster_status.status_message = "Pod not found"

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key, value))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called on first poll")),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is False
    assert ("kv", "provider_empty_jobs_polls", 1) in calls

    job["job_data"]["provider_empty_jobs_polls"] = 1
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is True


@pytest.mark.asyncio
async def test_check_job_via_provider_runpod_pod_not_found_resets_when_pod_reappears(monkeypatch):
    """Consecutive Pod not found polls reset if the API later reports the pod again."""
    monkeypatch.setattr(remote_job_status_service, "EMPTY_PROVIDER_JOBS_TERMINAL_THRESHOLD", 2)

    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    job = _make_job(status="RUNNING")
    job["job_data"]["provider_empty_jobs_polls"] = 1
    record = _make_provider_record("runpod")

    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.UP
    cluster_status.status_message = ""

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key, value))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is False
    assert ("kv", "provider_empty_jobs_polls", 0) in calls


@pytest.mark.asyncio
async def test_check_job_via_provider_runpod_terminating_stopping(monkeypatch):
    """RUNPOD provider, pod in TERMINATING (UNKNOWN), job STOPPING → job marked STOPPED."""
    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    job = _make_job(status="STOPPING")
    record = _make_provider_record("runpod")

    # RunPod can return UNKNOWN with e.g. "TERMINATING" while pod is shutting down.
    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.UNKNOWN
    cluster_status.status_message = "TERMINATING"

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)

    calls = []

    async def fake_update_kv(job_id, key, value, exp_id):
        calls.append(("kv", key))

    async def fake_update_status(job_id, status, experiment_id=None):
        calls.append(("status", status))

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_update_kv,
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        fake_update_status,
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)

    assert result is True
    assert ("status", "STOPPED") in calls


@pytest.mark.asyncio
async def test_check_job_via_provider_local_still_running(monkeypatch):
    """LOCAL provider cluster still UP → returns False."""
    from transformerlab.compute_providers.models import ClusterStatus, ClusterState

    job = _make_job()
    record = _make_provider_record("local")

    cluster_status = MagicMock(spec=ClusterStatus)
    cluster_status.state = ClusterState.UP

    instance = MagicMock()
    instance.get_cluster_status = MagicMock(return_value=cluster_status)
    instance.extra_config = {}

    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "job_update_status",
        AsyncMock(side_effect=AssertionError("should not be called")),
    )

    result = await _check_job_via_provider(job, "exp-1", record, instance)
    assert result is False


# ---------------------------------------------------------------------------
# refresh_launching_remote_jobs_once integration-style tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_once_skips_non_launching_jobs(monkeypatch):
    """LAUNCHING, RUNNING, STOPPING, and INTERACTIVE jobs are checked; COMPLETE/WAITING are skipped."""
    monkeypatch.setattr(
        remote_job_status_service,
        "_list_all_org_ids",
        AsyncMock(return_value=["org-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "jobs_get_all",
        AsyncMock(
            return_value=[
                _make_job("j1", status="COMPLETE"),
                _make_job("j2", status="WAITING"),
                _make_job("j3", status="LAUNCHING"),
            ]
        ),
    )
    # job-3 has live_status=finished so it transitions via fast path
    monkeypatch.setattr(
        remote_job_status_service,
        "_handle_live_status",
        AsyncMock(return_value=True),
    )
    monkeypatch.setattr(remote_job_status_service, "_set_org_context", MagicMock())
    monkeypatch.setattr(remote_job_status_service, "_clear_org_context", MagicMock())

    stats = await refresh_launching_remote_jobs_once()

    assert stats["jobs_seen"] == 1  # only j3
    assert stats["jobs_updated"] == 1


@pytest.mark.asyncio
async def test_refresh_once_circuit_breaker_skips_backed_off_provider(monkeypatch):
    """Jobs belonging to a backed-off provider should be skipped (no provider call)."""
    provider_id = "prov-backed-off"
    # Set the provider into backoff state directly
    remote_job_status_service._provider_failures[provider_id] = {"failures": 0, "skip_cycles": 2}

    monkeypatch.setattr(
        remote_job_status_service,
        "_list_all_org_ids",
        AsyncMock(return_value=["org-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "jobs_get_all",
        AsyncMock(return_value=[_make_job(provider_id=provider_id)]),
    )
    monkeypatch.setattr(
        remote_job_status_service,
        "_handle_live_status",
        AsyncMock(return_value=False),
    )
    # If provider call is attempted, fail the test
    monkeypatch.setattr(
        remote_job_status_service,
        "_check_job_via_provider",
        AsyncMock(side_effect=AssertionError("provider should not be called during backoff")),
    )
    monkeypatch.setattr(remote_job_status_service, "_set_org_context", MagicMock())
    monkeypatch.setattr(remote_job_status_service, "_clear_org_context", MagicMock())

    stats = await refresh_launching_remote_jobs_once()

    assert stats["jobs_seen"] == 1
    assert stats["jobs_updated"] == 0
    # Cleanup
    remote_job_status_service._provider_failures.pop(provider_id, None)


@pytest.mark.asyncio
async def test_refresh_once_connection_error_trips_circuit_breaker(monkeypatch):
    """A ConnectionError from the provider should increment the failure counter."""
    provider_id = "prov-unreachable"
    remote_job_status_service._provider_failures.pop(provider_id, None)

    monkeypatch.setattr(
        remote_job_status_service,
        "_list_all_org_ids",
        AsyncMock(return_value=["org-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        remote_job_status_service.job_service,
        "jobs_get_all",
        AsyncMock(return_value=[_make_job(provider_id=provider_id)]),
    )
    monkeypatch.setattr(
        remote_job_status_service,
        "_handle_live_status",
        AsyncMock(return_value=False),
    )

    # Mock DB session and provider lookups
    fake_record = _make_provider_record("skypilot", provider_id)
    fake_instance = MagicMock()

    async def fake_get_provider_by_id(session, pid):
        return fake_record

    async def fake_get_provider_instance(record):
        return fake_instance

    monkeypatch.setattr(remote_job_status_service, "_set_org_context", MagicMock())
    monkeypatch.setattr(remote_job_status_service, "_clear_org_context", MagicMock())

    # Patch the imports inside refresh_launching_remote_jobs_once
    with (
        patch("transformerlab.db.session.async_session") as mock_session_ctx,
        patch(
            "transformerlab.services.provider_service.get_provider_by_id",
            new=fake_get_provider_by_id,
        ),
        patch(
            "transformerlab.services.provider_service.get_provider_instance",
            new=fake_get_provider_instance,
        ),
        patch.object(
            remote_job_status_service,
            "_check_job_via_provider",
            new=AsyncMock(side_effect=ConnectionError("SkyPilot server unreachable")),
        ),
    ):
        mock_session_ctx.return_value.__aenter__ = AsyncMock(return_value=MagicMock())
        mock_session_ctx.return_value.__aexit__ = AsyncMock(return_value=False)

        stats = await refresh_launching_remote_jobs_once()

    assert stats["errors"] >= 1
    assert remote_job_status_service._provider_failures.get(provider_id, {}).get("failures", 0) >= 1

    # Cleanup
    remote_job_status_service._provider_failures.pop(provider_id, None)
