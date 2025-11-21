"""Router for managing team-scoped compute providers."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth2 import require_team_owner, get_user_and_team
from transformerlab.services.provider_service import (
    get_team_provider,
    list_team_providers,
    create_team_provider,
    update_team_provider,
    delete_team_provider,
    get_provider_instance,
)
from transformerlab.schemas.providers import (
    ProviderCreate,
    ProviderUpdate,
    ProviderRead,
    mask_sensitive_config,
)
from transformerlab.shared.models.models import ProviderType
from transformerlab.providers.models import (
    ClusterConfig,
    ClusterStatus,
    ResourceInfo,
)

router = APIRouter(tags=["providers"])


@router.get("/providers", response_model=List[ProviderRead])
async def list_providers(
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    List all providers for the current team.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]
    providers = await list_team_providers(session, team_id)

    # Convert to response format with masked sensitive fields
    result = []
    for provider in providers:
        masked_config = mask_sensitive_config(provider.config or {}, provider.type)
        result.append(
            ProviderRead(
                id=provider.id,
                team_id=provider.team_id,
                name=provider.name,
                type=provider.type,
                config=masked_config,
                created_by_user_id=provider.created_by_user_id,
                created_at=provider.created_at,
                updated_at=provider.updated_at,
            )
        )

    return result


@router.post("/providers", response_model=ProviderRead)
async def create_provider(
    provider_data: ProviderCreate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a new provider for the team.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]
    user = owner_info["user"]

    # Validate provider type
    if provider_data.type not in [ProviderType.SLURM, ProviderType.SKYPILOT]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider type. Must be one of: {ProviderType.SLURM.value}, {ProviderType.SKYPILOT.value}",
        )

    # Check if provider name already exists for this team
    existing = await list_team_providers(session, team_id)
    for existing_provider in existing:
        if existing_provider.name == provider_data.name:
            raise HTTPException(
                status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
            )

    # Convert Pydantic config to dict
    config_dict = provider_data.config.model_dump(exclude_none=True)

    # Create provider
    provider = await create_team_provider(
        session=session,
        team_id=team_id,
        name=provider_data.name,
        provider_type=provider_data.type.value
        if isinstance(provider_data.type, ProviderType)
        else str(provider_data.type),
        config=config_dict,
        created_by_user_id=str(user.id),
    )

    # Return with masked sensitive fields
    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.get("/providers/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get a specific provider by ID.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Return with masked sensitive fields
    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.patch("/providers/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: str,
    provider_data: ProviderUpdate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Update a provider.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Check if name is being changed and if new name already exists
    if provider_data.name and provider_data.name != provider.name:
        existing = await list_team_providers(session, team_id)
        for existing_provider in existing:
            if existing_provider.id != provider_id and existing_provider.name == provider_data.name:
                raise HTTPException(
                    status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
                )

    # Prepare update data
    update_name = provider_data.name
    update_config = None

    if provider_data.config:
        # Merge existing config with updates
        existing_config = provider.config or {}
        new_config = provider_data.config.model_dump(exclude_none=True)
        # Merge dictionaries, with new_config taking precedence
        update_config = {**existing_config, **new_config}

    # Update provider
    provider = await update_team_provider(session=session, provider=provider, name=update_name, config=update_config)

    # Return with masked sensitive fields
    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


@router.delete("/providers/{provider_id}")
async def delete_provider(
    provider_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Delete a provider.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await delete_team_provider(session, provider)
    return {"message": "Provider deleted successfully"}


@router.post("/providers/{provider_id}/verify")
async def verify_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Verify that a provider is properly configured and accessible.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Try to instantiate the provider
        provider_instance = get_provider_instance(provider)

        # Try to get cluster status (this will test connectivity)
        # Use a dummy cluster name for testing
        test_cluster_name = "__test_connection__"
        try:
            provider_instance.get_cluster_status(test_cluster_name)
            # If we get here, the provider is at least configured correctly
            # (even if the cluster doesn't exist, we got a response)
            return {
                "status": "success",
                "message": "Provider is properly configured and accessible",
                "provider_type": provider.type,
            }
        except Exception as e:
            # Provider instantiated but connection test failed
            return {
                "status": "warning",
                "message": f"Provider is configured but connection test failed: {str(e)}",
                "provider_type": provider.type,
            }
    except Exception as e:
        # Provider failed to instantiate
        return {
            "status": "error",
            "message": f"Provider configuration is invalid: {str(e)}",
            "provider_type": provider.type,
        }


# ============================================================================
# Cluster Management Routes
# ============================================================================


@router.post("/providers/{provider_id}/clusters/{cluster_name}/launch")
async def launch_cluster(
    provider_id: str,
    cluster_name: str,
    config: ClusterConfig,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Launch/provision a new cluster using the specified provider.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Launch cluster
        result = provider_instance.launch_cluster(cluster_name, config)

        return {
            "status": "success",
            "message": f"Cluster '{cluster_name}' launch initiated",
            "cluster_name": cluster_name,
            "result": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to launch cluster: {str(e)}",
        )


@router.post("/providers/{provider_id}/clusters/{cluster_name}/stop")
async def stop_cluster(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Stop a running cluster (but don't tear it down).
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Stop cluster
        result = provider_instance.stop_cluster(cluster_name)

        return {
            "status": "success",
            "message": f"Cluster '{cluster_name}' stop initiated",
            "cluster_name": cluster_name,
            "result": result,
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to stop cluster: {str(e)}",
        )


@router.get("/providers/{provider_id}/clusters/{cluster_name}/status", response_model=ClusterStatus)
async def get_cluster_status(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get the status of a cluster.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Get cluster status
        status = provider_instance.get_cluster_status(cluster_name)

        return status
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get cluster status: {str(e)}",
        )


@router.get("/providers/{provider_id}/clusters/{cluster_name}/resources", response_model=ResourceInfo)
async def get_cluster_resources(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get resource information for a cluster (GPUs, CPUs, memory, etc.).
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Get cluster resources
        resources = provider_instance.get_cluster_resources(cluster_name)

        return resources
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get cluster resources: {str(e)}",
        )
