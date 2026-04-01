import asyncio
import logging
import os
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.db.session import async_session
from transformerlab.shared.models.models import TeamStorageProvider

logger = logging.getLogger(__name__)


async def get_team_storage_provider(session: AsyncSession, team_id: str) -> Optional[TeamStorageProvider]:
    """Return the team's storage provider record, or None if not configured."""
    result = await session.execute(select(TeamStorageProvider).where(TeamStorageProvider.team_id == team_id))
    return result.scalar_one_or_none()


async def create_storage_provider(
    session: AsyncSession,
    team_id: str,
    name: str,
    provider_type: str,
    config: dict,
    created_by_user_id: str,
) -> TeamStorageProvider:
    """Create a storage provider for a team. Raises 409 if one already exists."""
    existing = await get_team_storage_provider(session, team_id)
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Team already has a storage provider configured. Delete it before creating a new one.",
        )
    provider = TeamStorageProvider(
        team_id=team_id,
        name=name,
        type=provider_type,
        config=config,
        created_by_user_id=created_by_user_id,
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return provider


async def delete_storage_provider(session: AsyncSession, provider: TeamStorageProvider) -> None:
    """Delete a team's storage provider."""
    await session.delete(provider)
    await session.commit()


async def test_storage_provider(provider_type: str, config: dict) -> dict:
    """Test connectivity to a storage provider. Returns {"success": True} or {"success": False, "error": "..."}."""
    import fsspec

    uri = config.get("uri", "")
    if not uri:
        return {"success": False, "error": "URI is required"}

    try:
        kwargs: dict = {}
        if provider_type == "S3":
            if config.get("aws_access_key_id"):
                kwargs["key"] = config["aws_access_key_id"]
                kwargs["secret"] = config.get("aws_secret_access_key", "")
            elif config.get("aws_profile"):
                kwargs["profile"] = config["aws_profile"]
        elif provider_type == "GCS":
            if config.get("google_application_credentials"):
                kwargs["token"] = config["google_application_credentials"]
        elif provider_type == "AZURE":
            if config.get("connection_string"):
                kwargs["connection_string"] = config["connection_string"]
            elif config.get("azure_storage_account"):
                kwargs["account_name"] = config["azure_storage_account"]
                if config.get("azure_storage_key"):
                    kwargs["account_key"] = config["azure_storage_key"]
                elif config.get("azure_storage_sas_token"):
                    kwargs["sas_token"] = config["azure_storage_sas_token"]

        def _check() -> None:
            fs, path = fsspec.core.url_to_fs(uri, **kwargs)
            fs.ls(path)

        await asyncio.to_thread(_check)
        return {"success": True}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


async def resolve_workspace_storage_uri(team_id: str) -> Optional[str]:
    """
    Return the storage URI for this team's workspace.

    Fallback chain:
      1. TeamStorageProvider DB record for this team
      2. TFL_STORAGE_URI env var (backward compat)
      3. None → lab SDK uses its local default
    """
    try:
        async with async_session() as session:
            provider = await get_team_storage_provider(session, team_id)
            if provider is not None:
                uri = provider.config.get("uri") if provider.config else None
                if uri:
                    return uri
    except Exception:
        logger.exception("Failed to resolve storage provider for team %s", team_id)

    return os.getenv("TFL_STORAGE_URI") or None


async def set_org_context_with_storage(org_id: str | None) -> None:
    """Set org ID context and override storage URI with team's configured provider.

    Use this everywhere instead of calling set_organization_id + set_tfl_storage_uri separately.
    Falls back through: DB storage provider -> TFL_STORAGE_URI env var -> local default.
    """
    from lab.dirs import set_organization_id, set_tfl_storage_uri

    set_organization_id(org_id)
    if org_id is None:
        set_tfl_storage_uri(None)
        return
    try:
        uri = await resolve_workspace_storage_uri(org_id)
        set_tfl_storage_uri(uri)
    except Exception:
        pass
