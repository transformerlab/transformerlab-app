"""Team-scoped compute provider CRUD and health checks (router delegates here)."""

import asyncio
import json
import logging
import os
import time
from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.schemas.compute_providers import ProviderCreate, ProviderRead, ProviderUpdate, mask_sensitive_config
from transformerlab.services.cache_service import cache
from transformerlab.services.compute_provider.local_setup_service import (
    get_provider_setup_status_path,
    run_local_provider_setup_background,
)
from transformerlab.services.provider_service import (
    _local_providers_disabled,
    create_team_provider,
    delete_team_provider,
    detect_local_supported_accelerators,
    get_provider_instance,
    get_team_provider,
    list_enabled_team_providers,
    list_team_providers,
    update_team_provider,
)
from transformerlab.shared.models.models import ProviderType, TeamRole

logger = logging.getLogger(__name__)


async def detect_local_accelerators() -> Dict[str, Any]:
    supported_accelerators = await asyncio.to_thread(detect_local_supported_accelerators)
    return {"supported_accelerators": supported_accelerators}


async def list_providers_for_team(
    session: AsyncSession,
    team_id: str,
    role: str | None,
    include_disabled: bool,
) -> List[ProviderRead]:
    if include_disabled:
        if role != TeamRole.OWNER.value:
            raise HTTPException(status_code=403, detail="Only team owners can view disabled providers")
        providers = await list_team_providers(session, team_id)
    else:
        providers = await list_enabled_team_providers(session, team_id)

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
                disabled=provider.disabled,
            )
        )

    return result


async def create_provider_for_team(
    session: AsyncSession,
    team_id: str,
    user: Any,
    provider_data: ProviderCreate,
    force_refresh: bool,
) -> ProviderRead:
    allowed_provider_types = [
        ProviderType.SLURM,
        ProviderType.SKYPILOT,
        ProviderType.RUNPOD,
        ProviderType.LOCAL,
        ProviderType.DSTACK,
    ]
    if provider_data.type not in allowed_provider_types:
        allowed_values = ", ".join(provider_type.value for provider_type in allowed_provider_types)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider type. Must be one of: {allowed_values}",
        )

    if provider_data.type == ProviderType.LOCAL and _local_providers_disabled():
        raise HTTPException(status_code=400, detail="Local providers are disabled by server configuration.")

    existing = await list_team_providers(session, team_id)
    for existing_provider in existing:
        if existing_provider.name == provider_data.name:
            raise HTTPException(
                status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
            )

    config_dict = provider_data.config.model_dump(exclude_none=True)

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

    await cache.invalidate("providers")

    if provider.type == ProviderType.LOCAL.value:
        try:
            user_id_str = str(user.id)
            provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

            status_path = get_provider_setup_status_path(team_id, str(provider.id))
            try:
                os.makedirs(os.path.dirname(status_path), exist_ok=True)
            except Exception:
                logger.exception("Failed to ensure parent directory for provider setup status %s", status_path)
            try:
                with open(status_path, "w", encoding="utf-8") as f:
                    f.write(
                        json.dumps(
                            {
                                "phase": "provider_setup_start",
                                "percent": 0,
                                "message": "Starting fresh local provider setup...",
                                "done": False,
                                "error": None,
                                "timestamp": time.time(),
                            }
                        )
                    )
            except Exception:
                logger.exception(
                    "Failed to seed provider setup status for newly created local provider %s", provider.id
                )

            asyncio.create_task(
                run_local_provider_setup_background(provider_instance, status_path, force_refresh=force_refresh)
            )
        except Exception:
            logger.exception("Failed to auto-start setup for newly created local provider %s", provider.id)

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
        disabled=provider.disabled,
    )


async def get_provider_read(session: AsyncSession, team_id: str, provider_id: str) -> ProviderRead:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

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
        disabled=provider.disabled,
    )


async def update_provider_for_team(
    session: AsyncSession,
    team_id: str,
    provider_id: str,
    provider_data: ProviderUpdate,
) -> ProviderRead:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider_data.name and provider_data.name != provider.name:
        existing = await list_team_providers(session, team_id)
        for existing_provider in existing:
            if existing_provider.id != provider_id and existing_provider.name == provider_data.name:
                raise HTTPException(
                    status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
                )

    update_name = provider_data.name
    update_config = None

    if provider_data.config:
        existing_config = provider.config or {}
        new_config = provider_data.config.model_dump(exclude_none=True)
        # Defensive guard: never persist masked placeholders sent by a client.
        if new_config.get("api_token") == "***":
            new_config.pop("api_token", None)
        update_config = {**existing_config, **new_config}

    update_disabled = provider_data.disabled if provider_data.disabled is not None else None

    provider = await update_team_provider(
        session=session, provider=provider, name=update_name, config=update_config, disabled=update_disabled
    )

    await cache.invalidate("providers")

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
        disabled=provider.disabled,
    )


async def delete_provider_for_team(session: AsyncSession, team_id: str, provider_id: str) -> Dict[str, str]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await delete_team_provider(session, provider)
    await cache.invalidate("providers")
    return {"message": "Provider deleted successfully"}


async def check_provider_accessible(
    session: AsyncSession, team_id: str, provider_id: str, user_id_str: str
) -> Dict[str, bool]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        is_active = await asyncio.to_thread(provider_instance.check)
        return {"status": is_active}
    except Exception as e:
        error_msg = str(e)
        print(f"Failed to check provider: {error_msg}")
        return {"status": False}
