"""Unit tests for notification_service background worker.

Uses monkeypatch to avoid any real DB, filesystem, or HTTP calls.
Follows the same style as test_remote_job_status_service.py.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from transformerlab.services import notification_service
from transformerlab.services.notification_service import (
    _build_webhook_payload,
    _process_notification,
    process_pending_notifications_once,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_job(
    job_id: str = "job-1",
    status: str = "COMPLETE",
    job_type: str = "TRAIN",
    experiment_id: str = "exp-1",
    created_by_user_id: str | None = "user-123",
    notification_sent: bool = False,
    start_time: str | None = "2026-03-12 10:00:00",
    end_time: str | None = "2026-03-12 10:30:00",
    error_msg: str | None = None,
) -> dict:
    job_data: dict = {}
    if created_by_user_id:
        job_data["created_by_user_id"] = created_by_user_id
    if notification_sent:
        job_data["notification_sent"] = True
    if start_time:
        job_data["start_time"] = start_time
    if end_time:
        job_data["end_time"] = end_time
    if error_msg:
        job_data["error_msg"] = error_msg
    return {
        "id": job_id,
        "type": job_type,
        "status": status,
        "experiment_id": experiment_id,
        "job_data": job_data,
    }


# ---------------------------------------------------------------------------
# _build_webhook_payload tests
# ---------------------------------------------------------------------------


def test_build_payload_complete_job() -> None:
    job = _make_job(start_time="2026-03-12 10:00:00", end_time="2026-03-12 10:30:00")
    payload = _build_webhook_payload(job, "my-experiment")

    assert payload["job_id"] == "job-1"
    assert payload["status"] == "COMPLETE"
    assert payload["job_type"] == "TRAIN"
    assert payload["experiment_name"] == "my-experiment"
    assert payload["started_at"] == "2026-03-12 10:00:00"
    assert payload["finished_at"] == "2026-03-12 10:30:00"
    assert payload["duration_seconds"] == 1800
    assert payload["error_message"] is None


def test_build_payload_with_error() -> None:
    job = _make_job(status="FAILED", error_msg="OOM error")
    payload = _build_webhook_payload(job, "exp")
    assert payload["error_message"] == "OOM error"


def test_build_payload_missing_timestamps() -> None:
    job = _make_job(start_time=None, end_time=None)
    payload = _build_webhook_payload(job, "exp")
    assert payload["duration_seconds"] is None
    assert payload["started_at"] is None
    assert payload["finished_at"] is None


def test_build_payload_malformed_timestamps() -> None:
    """Malformed timestamps should not crash — duration_seconds should be None."""
    job = _make_job(start_time="not-a-date", end_time="also-not-a-date")
    payload = _build_webhook_payload(job, "exp")
    assert payload["duration_seconds"] is None


# ---------------------------------------------------------------------------
# _process_notification tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_process_notification_sends_webhook(monkeypatch: pytest.MonkeyPatch) -> None:
    """Happy path: notifications enabled, URL set → webhook is POSTed."""
    job = _make_job()

    async def fake_config_get(key: str, user_id: str | None = None, team_id: str | None = None) -> str | None:
        return {"notification_enabled": "true", "notification_webhook_url": "https://example.com/hook"}.get(key)

    async def fake_job_update_kv(job_id: str, key: str, value: object, exp_id: str) -> None:
        return None

    monkeypatch.setattr(notification_service.db, "config_get", fake_config_get)
    monkeypatch.setattr(
        notification_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_job_update_kv,
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("transformerlab.services.notification_service.httpx.AsyncClient", return_value=mock_client):
        with patch.object(notification_service, "_get_experiment_name", AsyncMock(return_value="my-exp")):
            await _process_notification(job, "exp-1", "org-1")

    mock_client.post.assert_called_once()
    call_args, call_kwargs = mock_client.post.call_args
    assert call_args[0] == "https://example.com/hook"
    sent_payload = call_kwargs["json"]
    assert sent_payload["job_id"] == "job-1"
    assert sent_payload["status"] == "COMPLETE"
    assert sent_payload["experiment_name"] == "my-exp"


@pytest.mark.asyncio
async def test_process_notification_skips_missing_user_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """Jobs without created_by_user_id (pre-feature) are silently skipped."""
    job = _make_job(created_by_user_id=None)
    mock_config = AsyncMock()
    monkeypatch.setattr(notification_service.db, "config_get", mock_config)

    await _process_notification(job, "exp-1", "org-1")

    mock_config.assert_not_called()


@pytest.mark.asyncio
async def test_process_notification_skips_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Notifications disabled → webhook never called."""
    job = _make_job()

    async def fake_config_get(key: str, user_id: str | None = None, team_id: str | None = None) -> str | None:
        if key == "notification_enabled":
            return "false"
        return "https://example.com/hook"

    monkeypatch.setattr(notification_service.db, "config_get", fake_config_get)

    with patch("transformerlab.services.notification_service.httpx.AsyncClient") as mock_httpx:
        await _process_notification(job, "exp-1", "org-1")
        mock_httpx.assert_not_called()


@pytest.mark.asyncio
async def test_process_notification_skips_no_url(monkeypatch: pytest.MonkeyPatch) -> None:
    """No webhook URL configured → webhook never called."""
    job = _make_job()

    async def fake_config_get(key: str, user_id: str | None = None, team_id: str | None = None) -> str | None:
        if key == "notification_enabled":
            return "true"
        return None  # no URL

    monkeypatch.setattr(notification_service.db, "config_get", fake_config_get)

    with patch("transformerlab.services.notification_service.httpx.AsyncClient") as mock_httpx:
        await _process_notification(job, "exp-1", "org-1")
        mock_httpx.assert_not_called()


@pytest.mark.asyncio
async def test_process_notification_marks_sent_even_on_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    """Even if webhook POST fails, notification_sent is still written to prevent retry spam."""
    job = _make_job()
    kv_calls: list[tuple[str, object]] = []

    async def fake_config_get(key: str, user_id: str | None = None, team_id: str | None = None) -> str | None:
        return {"notification_enabled": "true", "notification_webhook_url": "https://example.com/hook"}.get(key)

    async def fake_job_update_kv(job_id: str, key: str, value: object, exp_id: str) -> None:
        kv_calls.append((key, value))

    monkeypatch.setattr(notification_service.db, "config_get", fake_config_get)
    monkeypatch.setattr(
        notification_service.job_service,
        "job_update_job_data_insert_key_value",
        fake_job_update_kv,
    )

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=Exception("connection refused"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("transformerlab.services.notification_service.httpx.AsyncClient", return_value=mock_client):
        with patch.object(notification_service, "_get_experiment_name", AsyncMock(return_value="exp")):
            await _process_notification(job, "exp-1", "org-1")

    # notification_sent must be written even though POST failed
    assert ("notification_sent", True) in kv_calls


# ---------------------------------------------------------------------------
# process_pending_notifications_once tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cycle_skips_already_notified_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Jobs with notification_sent=True in their individual file are skipped."""
    job_summary = {"id": "job-1", "status": "COMPLETE"}
    job_full = _make_job(notification_sent=True)

    monkeypatch.setattr(
        notification_service.team_service,
        "get_all_team_ids",
        AsyncMock(return_value=["org-1"]),
    )
    monkeypatch.setattr(
        notification_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "jobs_get_all",
        AsyncMock(return_value=[job_summary]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "job_get",
        AsyncMock(return_value=job_full),
    )

    process_mock = AsyncMock()
    monkeypatch.setattr(notification_service, "_process_notification", process_mock)

    stats = await process_pending_notifications_once()

    process_mock.assert_not_called()
    assert stats["jobs_seen"] == 0


@pytest.mark.asyncio
async def test_cycle_processes_unnotified_jobs(monkeypatch: pytest.MonkeyPatch) -> None:
    """Jobs without notification_sent flag are passed to _process_notification."""
    job_summary = {"id": "job-1", "status": "COMPLETE"}
    job_full = _make_job(notification_sent=False)

    monkeypatch.setattr(
        notification_service.team_service,
        "get_all_team_ids",
        AsyncMock(return_value=["org-1"]),
    )
    monkeypatch.setattr(
        notification_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "jobs_get_all",
        AsyncMock(return_value=[job_summary]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "job_get",
        AsyncMock(return_value=job_full),
    )

    process_mock = AsyncMock()
    monkeypatch.setattr(notification_service, "_process_notification", process_mock)

    stats = await process_pending_notifications_once()

    process_mock.assert_called_once()
    assert stats["jobs_seen"] == 1
    assert stats["jobs_notified"] == 1


@pytest.mark.asyncio
async def test_cycle_uses_org_id_as_team_id(monkeypatch: pytest.MonkeyPatch) -> None:
    """The worker passes org_id as team_id to _process_notification."""
    job_summary = {"id": "job-1", "status": "COMPLETE"}
    job_full = _make_job(notification_sent=False)

    monkeypatch.setattr(
        notification_service.team_service,
        "get_all_team_ids",
        AsyncMock(return_value=["my-org"]),
    )
    monkeypatch.setattr(
        notification_service,
        "_list_experiment_ids_for_current_org",
        AsyncMock(return_value=["exp-1"]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "jobs_get_all",
        AsyncMock(return_value=[job_summary]),
    )
    monkeypatch.setattr(
        notification_service.job_service,
        "job_get",
        AsyncMock(return_value=job_full),
    )

    captured_org_ids: list[str] = []

    async def capture_process(job: dict, experiment_id: str, org_id: str) -> None:  # noqa: ARG001
        captured_org_ids.append(org_id)

    monkeypatch.setattr(notification_service, "_process_notification", capture_process)

    await process_pending_notifications_once()

    assert captured_org_ids == ["my-org"]
