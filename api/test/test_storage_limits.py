import os
from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services.compute_provider import storage_usage_service as svc


@pytest.mark.asyncio
async def test_global_limit_env_overrides_config():
    with patch.dict(os.environ, {"TFL_STORAGE_GLOBAL_PER_ORG_LIMIT_GB": "2"}):
        assert await svc.get_global_per_org_limit_bytes(session=AsyncMock()) == 2 * 1024**3


@pytest.mark.asyncio
async def test_global_limit_falls_back_to_config():
    with (
        patch.dict(os.environ, {}, clear=True),
        patch(
            "transformerlab.services.compute_provider.storage_usage_service.config_get",
            new=AsyncMock(return_value=str(5 * 1024**3)),
        ),
    ):
        assert await svc.get_global_per_org_limit_bytes(session=AsyncMock()) == 5 * 1024**3


@pytest.mark.asyncio
async def test_global_limit_none_when_unset():
    with (
        patch.dict(os.environ, {}, clear=True),
        patch(
            "transformerlab.services.compute_provider.storage_usage_service.config_get",
            new=AsyncMock(return_value=None),
        ),
    ):
        assert await svc.get_global_per_org_limit_bytes(session=AsyncMock()) is None


@pytest.mark.asyncio
async def test_set_thresholds_clears_with_none():
    calls = []
    with patch.object(svc, "config_set", new=AsyncMock(side_effect=lambda *a, **k: calls.append((a, k)))):
        await svc.set_thresholds("t1", org_threshold_bytes=10, user_threshold_bytes=None)
    # Both keys are written; a None value is stored as an empty string so the getter treats it as unset.
    written = {a[0]: a[1] for a, _ in calls}
    assert written["storage_org_notify_threshold_bytes"] == "10"
    assert written["storage_user_notify_threshold_bytes"] == ""


@pytest.mark.asyncio
async def test_evaluate_thresholds_fires_org_alert_once():
    svc._armed_alerts.clear()
    snap = type("S", (), {"team_id": "t1", "total_bytes": 100, "per_user_json": "{}"})()
    sent = []
    with (
        patch.object(svc, "get_org_notify_threshold_bytes", new=AsyncMock(return_value=50)),
        patch.object(svc, "get_user_notify_threshold_bytes", new=AsyncMock(return_value=None)),
        patch.object(svc, "_send_storage_alert", new=AsyncMock(side_effect=lambda **k: sent.append(k))),
    ):
        await svc.evaluate_thresholds(session=AsyncMock(), snapshot=snap)
        await svc.evaluate_thresholds(session=AsyncMock(), snapshot=snap)
    assert len(sent) == 1
