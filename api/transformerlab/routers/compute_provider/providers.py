from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.services.compute_provider import team_provider_endpoints
from transformerlab.services.cache_service import cached
from transformerlab.schemas.compute_providers import (
    ProviderCreate,
    ProviderUpdate,
    ProviderRead,
)

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("/detect-accelerators")
async def detect_local_accelerators(user_and_team=Depends(get_user_and_team)) -> Dict[str, Any]:
    """Detect accelerators available on this server for the local compute provider."""
    return await team_provider_endpoints.detect_local_accelerators()


@router.get("/", response_model=List[ProviderRead])
@cached(
    key="providers:list:{include_disabled}",
    ttl="300s",
    tags=["providers", "providers:list"],
)
async def list_providers(
    include_disabled: bool = Query(False, description="Include disabled providers (admin view)"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """List all providers for the current team."""
    return await team_provider_endpoints.list_providers_for_team(
        session,
        user_and_team["team_id"],
        user_and_team.get("role"),
        include_disabled,
    )


@router.post("/", response_model=ProviderRead)
async def create_provider(
    provider_data: ProviderCreate,
    force_refresh: bool = False,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new provider for the team."""
    return await team_provider_endpoints.create_provider_for_team(
        session,
        owner_info["team_id"],
        owner_info["user"],
        provider_data,
        force_refresh,
    )


@router.get("/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get a specific provider by ID."""
    return await team_provider_endpoints.get_provider_read(session, user_and_team["team_id"], provider_id)


@router.patch("/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: str,
    provider_data: ProviderUpdate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Update a provider."""
    return await team_provider_endpoints.update_provider_for_team(
        session, owner_info["team_id"], provider_id, provider_data
    )


@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a provider."""
    return await team_provider_endpoints.delete_provider_for_team(session, owner_info["team_id"], provider_id)


@router.get("/{provider_id}/check")
async def check_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Check if a compute provider is active and accessible."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await team_provider_endpoints.check_provider_accessible(session, team_id, provider_id, user_id_str)
