from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services.compute_provider import storage_usage_service as svc


@pytest.mark.asyncio
async def test_enforce_blocks_when_over_limit():
    snap = type("S", (), {"total_bytes": 11 * 1024**3})()
    with (
        patch.object(svc, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=10 * 1024**3)),
        patch.object(svc, "get_latest_snapshot", new=AsyncMock(return_value=snap)),
    ):
        ok, message = await svc.check_storage_within_limit(session=AsyncMock(), team_id="t1")
    assert ok is False
    assert "exceeds" in message.lower()


@pytest.mark.asyncio
async def test_enforce_allows_when_under_limit():
    snap = type("S", (), {"total_bytes": 1 * 1024**3})()
    with (
        patch.object(svc, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=10 * 1024**3)),
        patch.object(svc, "get_latest_snapshot", new=AsyncMock(return_value=snap)),
    ):
        ok, _ = await svc.check_storage_within_limit(session=AsyncMock(), team_id="t1")
    assert ok is True


@pytest.mark.asyncio
async def test_enforce_fails_open_with_no_snapshot():
    with (
        patch.object(svc, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=10 * 1024**3)),
        patch.object(svc, "get_latest_snapshot", new=AsyncMock(return_value=None)),
    ):
        ok, _ = await svc.check_storage_within_limit(session=AsyncMock(), team_id="t1")
    assert ok is True


@pytest.mark.asyncio
async def test_enforce_allows_when_no_limit_set():
    with patch.object(svc, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=None)):
        ok, _ = await svc.check_storage_within_limit(session=AsyncMock(), team_id="t1")
    assert ok is True


@pytest.mark.asyncio
async def test_enforce_blocks_at_exact_limit():
    limit = 10 * 1024**3
    snap = type("S", (), {"total_bytes": limit})()
    with (
        patch.object(svc, "get_global_per_org_limit_bytes", new=AsyncMock(return_value=limit)),
        patch.object(svc, "get_latest_snapshot", new=AsyncMock(return_value=snap)),
    ):
        ok, _ = await svc.check_storage_within_limit(session=AsyncMock(), team_id="t1")
    assert ok is False
