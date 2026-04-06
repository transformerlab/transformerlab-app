from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import local_setup_service

router = APIRouter(prefix="/setup", tags=["setup"])


@router.post("/")
async def setup_provider(
    provider_id: str,
    refresh: bool = False,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """Start provider-level setup for a compute provider in the background."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await local_setup_service.setup_provider(provider_id, refresh, team_id, user_id_str, session)


@router.post("/refresh")
async def refresh_provider_setup(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """Force-refresh local provider setup for a provider."""
    return await local_setup_service.setup_provider(
        provider_id=provider_id,
        refresh=True,
        team_id=user_and_team["team_id"],
        user_id_str=str(user_and_team["user"].id),
        session=session,
    )


@router.get("/status")
async def get_setup_status(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
) -> Dict[str, Any]:
    """Get the latest status of a provider-level setup run."""
    return await local_setup_service.get_setup_status(provider_id, user_and_team["team_id"])
