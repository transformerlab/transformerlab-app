import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def make_provider(team_id="team-1", uri="s3://bucket"):
    from transformerlab.shared.models.models import TeamStorageProvider
    p = TeamStorageProvider()
    p.id = "prov-1"
    p.team_id = team_id
    p.name = "my-store"
    p.type = "S3"
    p.config = {"uri": uri, "aws_access_key_id": "key", "aws_secret_access_key": "secret"}
    return p


@pytest.mark.asyncio
async def test_get_team_storage_provider_returns_none_when_missing():
    from transformerlab.services.storage_provider_service import get_team_storage_provider
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    result = await get_team_storage_provider(session, "team-1")
    assert result is None


@pytest.mark.asyncio
async def test_get_team_storage_provider_returns_record():
    from transformerlab.services.storage_provider_service import get_team_storage_provider
    provider = make_provider()
    session = AsyncMock()
    session.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=provider)))
    result = await get_team_storage_provider(session, "team-1")
    assert result is provider


@pytest.mark.asyncio
async def test_resolve_workspace_storage_uri_returns_db_uri(monkeypatch):
    from transformerlab.services import storage_provider_service

    provider = make_provider(uri="s3://team-bucket")

    async def mock_get(session, team_id):
        return provider

    monkeypatch.setattr(storage_provider_service, "get_team_storage_provider", mock_get)

    mock_session = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("transformerlab.services.storage_provider_service.async_session", return_value=mock_cm):
        result = await storage_provider_service.resolve_workspace_storage_uri("team-1")

    assert result == "s3://team-bucket"


@pytest.mark.asyncio
async def test_resolve_workspace_storage_uri_falls_back_to_env(monkeypatch):
    from transformerlab.services import storage_provider_service

    async def mock_get(session, team_id):
        return None

    monkeypatch.setattr(storage_provider_service, "get_team_storage_provider", mock_get)
    monkeypatch.setenv("TFL_STORAGE_URI", "gs://fallback-bucket")

    mock_session = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("transformerlab.services.storage_provider_service.async_session", return_value=mock_cm):
        result = await storage_provider_service.resolve_workspace_storage_uri("team-1")

    assert result == "gs://fallback-bucket"
    monkeypatch.delenv("TFL_STORAGE_URI")


@pytest.mark.asyncio
async def test_resolve_workspace_storage_uri_returns_none_with_no_config(monkeypatch):
    from transformerlab.services import storage_provider_service

    async def mock_get(session, team_id):
        return None

    monkeypatch.setattr(storage_provider_service, "get_team_storage_provider", mock_get)
    monkeypatch.delenv("TFL_STORAGE_URI", raising=False)

    mock_session = AsyncMock()
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)

    with patch("transformerlab.services.storage_provider_service.async_session", return_value=mock_cm):
        result = await storage_provider_service.resolve_workspace_storage_uri("team-no-config")

    assert result is None
