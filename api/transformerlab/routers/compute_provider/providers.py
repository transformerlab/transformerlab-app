from typing import Any, Dict, List
import json

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.db.session import get_async_session
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.services.compute_provider import team_provider_endpoints
from transformerlab.services.nebius_credentials_service import write_nebius_service_account_credentials
from transformerlab.services.compute_provider.launch_credentials import (
    parse_gcp_service_account_json,
    write_aws_credentials_to_profile,
)
from transformerlab.services.provider_service import get_team_provider, update_team_provider
from transformerlab.services.cache_service import cache, cached
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


class NebiusCredentialsRequest(BaseModel):
    service_account_id: str
    public_key_id: str
    private_key: str


class GcpCredentialsRequest(BaseModel):
    service_account_json: str


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
    await cache.invalidate("providers")
    return {"status": "ok", "profile": profile}


@router.post("/{provider_id}/nebius/credentials")
async def set_nebius_credentials(
    provider_id: str,
    body: NebiusCredentialsRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Write service-account credentials for a Nebius provider to a provider-scoped CLI config."""
    provider = await get_team_provider(session, owner_info["team_id"], provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != "nebius":
        raise HTTPException(status_code=400, detail="Provider is not of type 'nebius'")

    config = json.loads(provider.config) if isinstance(provider.config, str) else (provider.config or {})
    profile = config.get("nebius_profile")
    config_path = config.get("nebius_config_path")
    parent_id = config.get("parent_id")
    if not profile:
        from transformerlab.services.nebius_credentials_service import build_nebius_profile_name

        profile = build_nebius_profile_name(owner_info["team_id"], provider_id)
        config["nebius_profile"] = profile
    if not config_path:
        from transformerlab.services.nebius_credentials_service import get_nebius_cli_config_path

        config_path = get_nebius_cli_config_path(owner_info["team_id"], provider_id)
        config["nebius_config_path"] = config_path

    actual_config_path = write_nebius_service_account_credentials(
        team_id=owner_info["team_id"],
        provider_id=provider_id,
        profile_name=profile,
        parent_id=parent_id,
        service_account_id=body.service_account_id,
        public_key_id=body.public_key_id,
        private_key=body.private_key,
    )
    config["nebius_config_path"] = actual_config_path
    config["team_id"] = owner_info["team_id"]
    await update_team_provider(
        session=session,
        provider=provider,
        name=None,
        config=config,
        disabled=None,
        is_default=None,
    )
    await cache.invalidate("providers")
    return {"status": "ok", "profile": profile, "config_path": actual_config_path}


@router.post("/{provider_id}/gcp/credentials")
async def set_gcp_credentials(
    provider_id: str,
    body: GcpCredentialsRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Store GCP service account credentials for a GCP compute provider."""
    provider = await get_team_provider(session, owner_info["team_id"], provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != "gcp":
        raise HTTPException(status_code=400, detail="Provider is not of type 'gcp'")

    try:
        parsed = parse_gcp_service_account_json(body.service_account_json)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    config = json.loads(provider.config) if isinstance(provider.config, str) else dict(provider.config or {})
    config["service_account_json"] = parsed
    # Keep path-based field for backward compatibility with legacy configs.
    config.pop("credentials_path", None)
    config["project_id"] = config.get("project_id") or parsed.get("project_id")
    config["service_account_email"] = parsed.get("client_email")
    config["team_id"] = owner_info["team_id"]
    await update_team_provider(session=session, provider=provider, config=config)
    await cache.invalidate("providers")
    return {
        "status": "ok",
        "project_id": config.get("project_id"),
        "service_account_email": config.get("service_account_email"),
    }
