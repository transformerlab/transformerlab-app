"""Shared FastAPI dependencies for router endpoints."""

from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.compute_providers.base import ComputeProvider
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.provider_service import get_provider_instance, get_team_provider
from transformerlab.shared.models.user_model import get_async_session


@dataclass
class ProviderContext:
    """Resolved provider context available to route handlers."""

    provider: Any  # TeamComputeProvider DB record
    provider_instance: ComputeProvider
    team_id: str
    user_id: str
    user: Any  # User DB record
    session: AsyncSession


async def get_provider_for_request(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> ProviderContext:
    """Resolve a provider + instance from the request, raising 404 if not found."""
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider_instance = await get_provider_instance(provider, user_id=user_id, team_id=team_id)

    return ProviderContext(
        provider=provider,
        provider_instance=provider_instance,
        team_id=team_id,
        user_id=user_id,
        user=user_and_team["user"],
        session=session,
    )
