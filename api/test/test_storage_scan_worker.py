from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services import storage_scan_worker as worker


@pytest.mark.asyncio
async def test_scan_once_writes_snapshot_and_evaluates_per_org():
    with (
        patch.object(worker, "get_all_team_ids", new=AsyncMock(return_value=["t1", "t2"])),
        patch.object(
            worker.storage_usage_service,
            "compute_org_storage",
            new=AsyncMock(return_value={"total_bytes": 1, "breakdown": {}, "per_user": {}}),
        ),
        patch.object(worker.storage_usage_service, "write_snapshot", new=AsyncMock(return_value="snap")),
        patch.object(worker.storage_usage_service, "evaluate_thresholds", new=AsyncMock()) as eval_mock,
        patch.object(worker, "_session_scope") as session_scope,
    ):
        session_scope.return_value.__aenter__.return_value = AsyncMock()
        stats = await worker.scan_all_orgs_once()

    assert stats["orgs"] == 2
    assert eval_mock.await_count == 2


@pytest.mark.asyncio
async def test_scan_once_continues_after_one_org_fails():
    async def boom(team_id):
        if team_id == "t1":
            raise RuntimeError("disk error")
        return {"total_bytes": 1, "breakdown": {}, "per_user": {}}

    with (
        patch.object(worker, "get_all_team_ids", new=AsyncMock(return_value=["t1", "t2"])),
        patch.object(worker.storage_usage_service, "compute_org_storage", side_effect=boom),
        patch.object(worker.storage_usage_service, "write_snapshot", new=AsyncMock(return_value="snap")),
        patch.object(worker.storage_usage_service, "evaluate_thresholds", new=AsyncMock()),
        patch.object(worker, "_session_scope") as session_scope,
    ):
        session_scope.return_value.__aenter__.return_value = AsyncMock()
        stats = await worker.scan_all_orgs_once()

    assert stats["orgs"] == 1
    assert stats["errors"] == 1
