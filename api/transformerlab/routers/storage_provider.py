import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.routers.auth import get_user_and_team
from transformerlab.schemas.storage_provider import (
    StorageProviderCreate,
    StorageProviderRead,
    StorageProviderTest,
    mask_sensitive_config,
)
from transformerlab.services import storage_provider_service
from transformerlab.shared.models.user_model import get_async_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage_provider", tags=["storage_provider"])


@router.get("/", response_model=Optional[StorageProviderRead])
async def get_storage_provider(
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Return the team's configured storage provider, or null if none."""
    team_id = user_and_team["team_id"]
    provider = await storage_provider_service.get_team_storage_provider(session, team_id)
    if provider is None:
        return None
    return StorageProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=mask_sensitive_config(provider.config or {}),
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.post("/", response_model=StorageProviderRead, status_code=201)
async def create_storage_provider(
    body: StorageProviderCreate,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a storage provider for the team. Returns 409 if one already exists."""
    team_id = user_and_team["team_id"]
    user_id = user_and_team["user_id"]
    provider = await storage_provider_service.create_storage_provider(
        session=session,
        team_id=team_id,
        name=body.name,
        provider_type=body.type.value,
        config=body.config.model_dump(exclude_none=True),
        created_by_user_id=user_id,
    )
    return StorageProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=mask_sensitive_config(provider.config or {}),
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.delete("/{provider_id}", status_code=204)
async def delete_storage_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete the team's storage provider."""
    team_id = user_and_team["team_id"]
    provider = await storage_provider_service.get_team_storage_provider(session, team_id)
    if provider is None or provider.id != provider_id:
        raise HTTPException(status_code=404, detail="Storage provider not found")
    await storage_provider_service.delete_storage_provider(session, provider)


@router.post("/test")
async def test_storage_provider(
    body: StorageProviderTest,
    user_and_team=Depends(get_user_and_team),
):
    """Test connectivity for a storage provider config. Does not save anything."""
    result = await storage_provider_service.test_storage_provider(
        provider_type=body.type.value,
        config=body.config.model_dump(exclude_none=True),
    )
    return result
