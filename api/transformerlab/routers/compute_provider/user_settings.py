from typing import Optional

from fastapi import APIRouter, Body, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import user_provider_settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/org-ssh-public-key")
async def get_org_ssh_public_key_endpoint(
    user_and_team=Depends(get_user_and_team),
):
    """Get the organization's SSH public key for users to add to their SLURM account."""
    team_id = user_and_team["team_id"]
    return await user_provider_settings_service.get_org_ssh_public_key_payload(team_id)


@router.get("/{provider_id}")
async def get_user_provider_settings(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get user-specific settings for a provider."""
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)
    return await user_provider_settings_service.get_user_provider_settings(session, team_id, user_id, provider_id)


@router.put("/{provider_id}")
async def set_user_provider_settings(
    provider_id: str,
    body: Optional[dict] = Body(None),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Set user-specific settings for a provider."""
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)
    return await user_provider_settings_service.set_user_provider_settings(session, team_id, user_id, provider_id, body)


@router.post("/{provider_id}/ssh-key")
async def upload_user_slurm_ssh_key(
    provider_id: str,
    body: dict = Body(...),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload a user's SLURM SSH private key for a provider."""
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)
    return await user_provider_settings_service.upload_user_slurm_ssh_key(
        session, team_id, user_id, provider_id, body.get("private_key", "")
    )


@router.delete("/{provider_id}/ssh-key")
async def delete_user_slurm_ssh_key(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a user's SLURM SSH private key for a provider."""
    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)
    return await user_provider_settings_service.delete_user_slurm_ssh_key_service(
        session, team_id, user_id, provider_id
    )
