from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.shared.models.models import User, Team, TeamRole
from transformerlab.models.users import current_active_user
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.schemas.secrets import TeamSecretsRequest, SpecialSecretRequest
from transformerlab.schemas.teams import (
    AcceptInvitationRequest,
    GitHubPATRequest,
    InviteMemberRequest,
    TeamResponse,
    TeamUpdate,
    UpdateMemberRoleRequest,
)
from lab.dirs import get_workspace_dir

from typing import Optional
import transformerlab.services.team_service as team_service

router = APIRouter(tags=["teams"])


@router.post("/teams", response_model=TeamResponse)
async def create_team(
    name: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    logo: Optional[UploadFile] = File(None),
):
    logo_contents = await logo.read() if logo else None
    result = await team_service.create_team(
        session,
        name,
        user,
        logo_contents=logo_contents,
        logo_content_type=logo.content_type if logo else None,
        logo_filename=logo.filename if logo else None,
    )
    return TeamResponse(**result)


@router.put("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    result = await team_service.update_team(session, team_id, team_data.name)
    return TeamResponse(**result)


@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.delete_team(session, team_id, owner_info["user"], owner_info["team"])


@router.get("/teams/{team_id}/members")
async def get_team_members(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.get_team_members(session, team_id)


@router.post("/teams/{team_id}/members")
async def invite_member(
    team_id: str,
    invite_data: InviteMemberRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.invite_member(
        session,
        team_id,
        invite_data.email,
        invite_data.role,
        owner_info["user"],
        owner_info["team"],
    )


@router.delete("/teams/{team_id}/members/me")
async def leave_team(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return await team_service.leave_team(session, team_id, user_and_team["user"], team, user_and_team["role"])


@router.delete("/teams/{team_id}/members/{user_id}")
async def remove_member(
    team_id: str,
    user_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.remove_member(session, team_id, user_id)


@router.put("/teams/{team_id}/members/{user_id}/role")
async def update_member_role(
    team_id: str,
    user_id: str,
    role_data: UpdateMemberRoleRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.update_member_role(session, team_id, user_id, role_data.role)


@router.get("/invitations/me")
async def get_my_invitations(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    return await team_service.get_my_invitations(session, user.email)


@router.post("/invitations/accept")
async def accept_invitation(
    accept_data: AcceptInvitationRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    return await team_service.accept_invitation(session, user, token=accept_data.token)


@router.post("/invitations/{invitation_id}/accept")
async def accept_invitation_by_id(
    invitation_id: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    return await team_service.accept_invitation(session, user, invitation_id=invitation_id)


@router.post("/invitations/{invitation_id}/reject")
async def reject_invitation(
    invitation_id: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    return await team_service.reject_invitation(session, invitation_id, user.email)


@router.get("/teams/{team_id}/invitations")
async def get_team_invitations(
    team_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.get_team_invitations(session, team_id)


@router.delete("/teams/{team_id}/invitations/{invitation_id}")
async def cancel_invitation(
    team_id: str,
    invitation_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    return await team_service.cancel_invitation(session, team_id, invitation_id)


@router.get("/teams/{team_id}/github_pat")
async def get_github_pat(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.get_github_pat(workspace_dir)


@router.put("/teams/{team_id}/github_pat")
async def set_github_pat(
    team_id: str,
    pat_data: GitHubPATRequest,
    owner_info=Depends(require_team_owner),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.set_github_pat(workspace_dir, pat_data.pat)


@router.get("/teams/{team_id}/logo")
async def get_team_logo(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.get_team_logo(workspace_dir)


@router.put("/teams/{team_id}/logo")
async def set_team_logo(
    team_id: str,
    logo: UploadFile = File(...),
    owner_info=Depends(require_team_owner),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    contents = await logo.read()
    return await team_service.set_team_logo(workspace_dir, contents, logo.content_type, logo.filename)


@router.delete("/teams/{team_id}/logo")
async def delete_team_logo(
    team_id: str,
    owner_info=Depends(require_team_owner),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.delete_team_logo(workspace_dir)


@router.get("/teams/{team_id}/secrets")
async def get_team_secrets(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    include_values: bool = Query(False, description="Include actual secret values (only for team owners)"),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    is_owner = user_and_team.get("role") == TeamRole.OWNER.value
    return await team_service.get_team_secrets(workspace_dir, is_owner, include_values)


@router.put("/teams/{team_id}/secrets")
async def set_team_secrets(
    team_id: str,
    secrets_data: TeamSecretsRequest,
    owner_info=Depends(require_team_owner),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.set_team_secrets(workspace_dir, secrets_data.secrets)


@router.get("/teams/{team_id}/special_secrets")
async def get_team_special_secrets(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
):
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.get_team_special_secrets(workspace_dir)


@router.put("/teams/{team_id}/special_secrets")
async def set_team_special_secret(
    team_id: str,
    secret_data: SpecialSecretRequest,
    owner_info=Depends(require_team_owner),
):
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")
    workspace_dir = await get_workspace_dir()
    return await team_service.set_team_special_secret(workspace_dir, secret_data.secret_type, secret_data.value)
