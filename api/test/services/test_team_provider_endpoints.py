from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from transformerlab.services.compute_provider import team_provider_endpoints


@pytest.mark.asyncio
async def test_check_provider_accessible_returns_printed_reason_when_unhealthy(monkeypatch):
    provider_record = SimpleNamespace(id="prov-1")

    class FakeProvider:
        def check(self):
            return False, "Runpod provider check failed: Bad API key"

    monkeypatch.setattr(team_provider_endpoints, "get_team_provider", AsyncMock(return_value=provider_record))
    monkeypatch.setattr(team_provider_endpoints, "get_provider_instance", AsyncMock(return_value=FakeProvider()))

    result = await team_provider_endpoints.check_provider_accessible(
        session=MagicMock(),
        team_id="team-1",
        provider_id="prov-1",
        user_id_str="user-1",
    )

    assert result["status"] is False
    assert result["reason"] == "Runpod provider check failed: Bad API key"


@pytest.mark.asyncio
async def test_check_provider_accessible_returns_exception_reason_when_check_raises(monkeypatch):
    provider_record = SimpleNamespace(id="prov-1")

    class FakeProvider:
        def check(self):
            raise RuntimeError("Connection timeout")

    monkeypatch.setattr(team_provider_endpoints, "get_team_provider", AsyncMock(return_value=provider_record))
    monkeypatch.setattr(team_provider_endpoints, "get_provider_instance", AsyncMock(return_value=FakeProvider()))

    result = await team_provider_endpoints.check_provider_accessible(
        session=MagicMock(),
        team_id="team-1",
        provider_id="prov-1",
        user_id_str="user-1",
    )

    assert result["status"] is False
    assert result["reason"] == "Connection timeout"
