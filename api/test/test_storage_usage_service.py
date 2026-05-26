from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services.compute_provider import storage_usage_service as svc


@pytest.mark.asyncio
async def test_compute_org_storage_sums_categories():
    async def fake_du(path):
        return 10 if path.endswith("models") else 5

    with (
        patch.object(svc.storage, "du", side_effect=fake_du),
        patch.object(svc, "set_organization_id"),
        patch.object(svc, "get_workspace_dir", return_value="/ws"),
        patch.object(svc, "get_models_dir", return_value="/ws/models"),
        patch.object(svc, "get_datasets_dir", return_value="/ws/datasets"),
        patch.object(svc, "get_experiments_dir", return_value="/ws/experiments"),
        patch.object(svc, "get_local_provider_org_dir", return_value="/lp/team1"),
        patch.object(svc, "_compute_per_user_bytes", new=AsyncMock(return_value={"u1": 3})),
    ):
        result = await svc.compute_org_storage("team1")

    assert result["total_bytes"] > 0
    assert "workspace_models" in result["breakdown"]
    assert "local_provider_runs" in result["breakdown"]
    assert result["per_user"] == {"u1": 3}


def test_gb_helper_formats_bytes():
    assert svc.gb(1_073_741_824) == 1.0
    assert svc.gb(0) == 0.0
