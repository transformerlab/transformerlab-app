import json
from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.routers.compute_provider import usage as usage_router
from transformerlab.schemas.storage_usage import StorageAlert, StorageThresholdsUpdate


@pytest.mark.asyncio
async def test_get_storage_usage_returns_latest_snapshot():
    snap = type(
        "S",
        (),
        {
            "team_id": "t1",
            "total_bytes": 5,
            "breakdown_json": json.dumps({"workspace_models": 5}),
            "per_user_json": json.dumps({"u1": 2}),
            "scanned_at": None,
        },
    )()
    with (
        patch.object(usage_router.storage_usage_service, "get_latest_snapshot", new=AsyncMock(return_value=snap)),
        patch.object(
            usage_router.storage_usage_service, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=100)
        ),
        patch.object(
            usage_router.storage_usage_service, "get_org_notify_threshold_bytes", new=AsyncMock(return_value=None)
        ),
        patch.object(
            usage_router.storage_usage_service, "get_user_notify_threshold_bytes", new=AsyncMock(return_value=None)
        ),
    ):
        result = await usage_router.get_storage_usage(
            owner_info={"team_id": "t1"},
            session=AsyncMock(),
        )
    assert result.team_id == "t1"
    assert result.total_bytes == 5
    assert result.breakdown == {"workspace_models": 5}


@pytest.mark.asyncio
async def test_update_thresholds_calls_service():
    with patch.object(usage_router.storage_usage_service, "set_thresholds", new=AsyncMock()) as set_mock:
        await usage_router.update_storage_thresholds(
            payload=StorageThresholdsUpdate(org_threshold_bytes=10, user_threshold_bytes=5),
            owner_info={"team_id": "t1"},
            session=AsyncMock(),
        )
        set_mock.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_storage_alerts_builds_user_and_org_alerts():
    snap = type(
        "S",
        (),
        {
            "team_id": "t1",
            "total_bytes": 200,
            "breakdown_json": None,
            "per_user_json": json.dumps({"u1": 50, "u2": 5}),
            "scanned_at": None,
        },
    )()
    with (
        patch.object(usage_router.storage_usage_service, "get_latest_snapshot", new=AsyncMock(return_value=snap)),
        patch.object(
            usage_router.storage_usage_service, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=100)
        ),
        patch.object(
            usage_router.storage_usage_service, "get_org_notify_threshold_bytes", new=AsyncMock(return_value=150)
        ),
        patch.object(
            usage_router.storage_usage_service, "get_user_notify_threshold_bytes", new=AsyncMock(return_value=10)
        ),
    ):
        result = await usage_router.get_storage_alerts(owner_info={"team_id": "t1"}, session=AsyncMock())
    scopes = sorted(a.scope for a in result.alerts)
    # global (200>=100), org (200>=150), user u1 (50>=10) -> u2 (5<10) excluded
    assert scopes == ["global", "org", "user"]
    assert all(isinstance(a, StorageAlert) for a in result.alerts)
