from typing import Any, Dict, List
import json

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.services.compute_provider import team_provider_endpoints
from transformerlab.services.compute_provider.launch_credentials import write_aws_credentials_to_profile
from transformerlab.services.provider_service import get_team_provider
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


class AwsCredentialsRequest(BaseModel):
    access_key_id: str
    secret_access_key: str


@router.post("/{provider_id}/aws/credentials")
async def set_aws_credentials(
    provider_id: str,
    body: AwsCredentialsRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Write AWS credentials for an AWS compute provider to ~/.aws/credentials."""
    provider = await get_team_provider(session, owner_info["team_id"], provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != "aws":
        raise HTTPException(status_code=400, detail="Provider is not of type 'aws'")

    config = json.loads(provider.config) if isinstance(provider.config, str) else (provider.config or {})
    profile = config.get("aws_profile")
    if not profile:
        raise HTTPException(status_code=400, detail="Provider has no aws_profile configured")

    write_aws_credentials_to_profile(profile, body.access_key_id, body.secret_access_key)
    return {"status": "ok", "profile": profile}
