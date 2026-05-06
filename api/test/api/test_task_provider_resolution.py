from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from transformerlab.routers.experiment import task as task_router


@pytest.mark.asyncio
async def test_resolve_provider_rejects_unknown_provider_name(monkeypatch):
    providers = [
        SimpleNamespace(id="prov-default", name="AWS Default", is_default=True),
        SimpleNamespace(id="prov-skypilot", name="SkypilotNew", is_default=False),
    ]
    monkeypatch.setattr(task_router, "list_team_providers", AsyncMock(return_value=providers))

    task_data = {"provider_name": "Skypilot New"}

    with pytest.raises(HTTPException) as exc:
        await task_router._resolve_provider(
            task_data=task_data,
            user_and_team={"team_id": "team-1"},
            session=MagicMock(),
        )

    assert exc.value.status_code == 400
    assert "Unknown compute provider 'Skypilot New'" in str(exc.value.detail)
    assert "SkypilotNew" in str(exc.value.detail)
    assert "AWS Default" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_resolve_provider_uses_default_when_provider_name_missing(monkeypatch):
    providers = [
        SimpleNamespace(id="prov-default", name="AWS Default", is_default=True),
        SimpleNamespace(id="prov-other", name="Other Provider", is_default=False),
    ]
    monkeypatch.setattr(task_router, "list_team_providers", AsyncMock(return_value=providers))

    task_data: dict = {}
    await task_router._resolve_provider(
        task_data=task_data,
        user_and_team={"team_id": "team-1"},
        session=MagicMock(),
    )

    assert task_data["provider_id"] == "prov-default"
    assert task_data["provider_name"] == "AWS Default"
