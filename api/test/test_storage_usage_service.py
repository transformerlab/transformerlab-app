from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest

from transformerlab.services.compute_provider import storage_usage_service as svc


async def fake_du(path):
    return 10 if path.endswith("models") else 5


def _enter_dir_patches(stack: ExitStack) -> None:
    """Enter the common directory + storage.du patches on an ExitStack."""
    stack.enter_context(patch.object(svc.storage, "du", side_effect=fake_du))
    stack.enter_context(patch.object(svc, "set_organization_id"))
    stack.enter_context(patch.object(svc, "get_workspace_dir", return_value="/ws"))
    stack.enter_context(patch.object(svc, "get_models_dir", return_value="/ws/models"))
    stack.enter_context(patch.object(svc, "get_datasets_dir", return_value="/ws/datasets"))
    stack.enter_context(patch.object(svc, "get_experiments_dir", return_value="/ws/experiments"))
    stack.enter_context(patch.object(svc, "get_local_provider_org_dir", return_value="/lp/team1"))


@pytest.mark.asyncio
async def test_compute_org_storage_sums_categories_with_per_user_enabled():
    # Per-user attribution is off by default, so enable it for this path.
    with ExitStack() as stack:
        _enter_dir_patches(stack)
        stack.enter_context(patch.object(svc, "_per_user_enabled", return_value=True))
        stack.enter_context(patch.object(svc, "_compute_per_user_bytes", new=AsyncMock(return_value={"u1": 3})))
        result = await svc.compute_org_storage("team1")

    assert result["total_bytes"] > 0
    assert "workspace_models" in result["breakdown"]
    assert "local_provider_runs" in result["breakdown"]
    assert result["per_user"] == {"u1": 3}


@pytest.mark.asyncio
async def test_compute_org_storage_skips_per_user_when_disabled():
    # Default (flag unset): per-user attribution is skipped and the map is empty,
    # but the totals/breakdown are still computed.
    per_user_mock = AsyncMock(return_value={"u1": 3})
    with ExitStack() as stack:
        _enter_dir_patches(stack)
        stack.enter_context(patch.object(svc, "_per_user_enabled", return_value=False))
        stack.enter_context(patch.object(svc, "_compute_per_user_bytes", new=per_user_mock))
        result = await svc.compute_org_storage("team1")

    assert result["total_bytes"] > 0
    assert result["per_user"] == {}
    per_user_mock.assert_not_called()


def test_gb_helper_formats_bytes():
    assert svc.gb(1_073_741_824) == 1.0
    assert svc.gb(0) == 0.0
