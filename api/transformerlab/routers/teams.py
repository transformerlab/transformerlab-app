from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.utils.api_key_utils import mask_key
from transformerlab.db.db import get_async_session
from transformerlab.shared.models.models import User, Team, UserTeam, TeamRole, TeamInvitation, InvitationStatus
from transformerlab.models.users import current_active_user
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.utils.email import send_team_invitation_email
from transformerlab.shared.remote_workspace import create_bucket_for_team

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from sqlalchemy import select, delete, update, func, and_
from datetime import datetime, timedelta
from os import getenv
from PIL import Image
import io
import json
import logging

from lab import Experiment
from lab.dirs import set_organization_id, get_workspace_dir
from lab import storage


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: str
    name: str


class InviteMemberRequest(BaseModel):
    email: EmailStr
    role: str = TeamRole.MEMBER.value


class UpdateMemberRoleRequest(BaseModel):
    role: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    role: str


class InvitationResponse(BaseModel):
    id: str
    email: str
    team_id: str
    team_name: str
    role: str
    status: str
    invited_by_email: str
    expires_at: str
    created_at: str


class AcceptInvitationRequest(BaseModel):
    token: str


class GitHubPATRequest(BaseModel):
    pat: Optional[str] = None


class TeamSecretsRequest(BaseModel):
    secrets: dict[str, str] = Field(..., description="Team secrets as key-value pairs")


router = APIRouter(tags=["teams"])


@router.post("/teams", response_model=TeamResponse)
async def create_team(
    name: str = Form(...),
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
    logo: Optional[UploadFile] = File(None),
):
    # Create team
    team = Team(name=name)
    session.add(team)
    await session.commit()
    await session.refresh(team)

    # Add user to the team as owner
    user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
    session.add(user_team)
    await session.commit()

    # Create S3 bucket if TFL_API_STORAGE_URI is set
    if getenv("TFL_API_STORAGE_URI"):
        try:
            create_bucket_for_team(team.id, profile_name="transformerlab-s3")
        except Exception as e:
            # Log error but don't fail team creation if bucket creation fails
            print(f"Warning: Failed to create S3 bucket for team {team.id}: {e}")

    # Create default experiment "alpha" for the new team
    # Temporarily set the organization context to the new team ID
    # so the experiment is created in the correct workspace
    try:
        # Set organization context to the new team ID
        # The middleware will handle context for the next request
        set_organization_id(team.id)

        # Create the default experiment
        await Experiment.create_or_get("alpha", create_new=True)

        # Save logo if provided
        if logo:
            try:
                workspace_dir = await get_workspace_dir()
                logo_path = storage.join(workspace_dir, "logo.png")

                # Validate content type
                if logo.content_type and not logo.content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid file type. Only image files are allowed. Got: {logo.content_type}",
                    )

                # Validate file extension
                if logo.filename:
                    filename_lower = logo.filename.lower()
                    # Extract extension using string operation (works with any filename, not just paths)
                    if "." in filename_lower:
                        ext = "." + filename_lower.rpartition(".")[2]
                    else:
                        ext = ""
                    allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
                    if ext not in allowed_extensions:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid file extension. Allowed extensions: {', '.join(allowed_extensions)}",
                        )

                # Read and check file size limit (1 MB)
                contents = await logo.read()

                MAX_LOGO_SIZE = 1 * 1024 * 1024  # 1 MB
                file_size = len(contents)
                if file_size > MAX_LOGO_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Logo file size ({file_size / (1024 * 1024):.2f} MB) exceeds maximum allowed size (1 MB)",
                    )

                # Validate and process the image
                try:
                    image = Image.open(io.BytesIO(contents))
                    # Verify it's actually a valid image by attempting to load it
                    image.verify()
                    # Reopen after verify() since verify() closes the image
                    image = Image.open(io.BytesIO(contents))
                except Exception as e:
                    raise HTTPException(
                        status_code=400, detail=f"Invalid image file. Please upload a valid image file. Error: {str(e)}"
                    )

                # Convert to RGB if necessary (handles RGBA, P, etc.)
                if image.mode in ("RGBA", "LA", "P"):
                    # Create a white background
                    rgb_image = Image.new("RGB", image.size, (255, 255, 255))
                    if image.mode == "P":
                        image = image.convert("RGBA")
                    rgb_image.paste(image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None)
                    image = rgb_image
                elif image.mode != "RGB":
                    image = image.convert("RGB")

                # Save as PNG
                async with await storage.open(logo_path, "wb") as f:
                    image.save(f, format="PNG")
            except HTTPException:
                # Re-raise HTTPExceptions (validation errors)
                raise
            except Exception as e:
                # Log error but don't fail team creation if logo save fails
                print(f"Warning: Failed to save logo for team {team.id}: {e}")
    except Exception as e:
        # Log error but don't fail team creation if experiment creation fails
        print(f"Warning: Failed to create default experiment 'alpha' for team {team.id}: {e}")
    finally:
        # Clear the organization context (middleware will set it for next request)
        set_organization_id(None)

    return TeamResponse(id=team.id, name=team.name)


@router.put("/teams/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    team_data: TeamUpdate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Update team name. Only team owners can update the team."""
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Update
    stmt = update(Team).where(Team.id == team_id).values(name=team_data.name)
    await session.execute(stmt)
    await session.commit()

    # Fetch updated
    stmt = select(Team).where(Team.id == team_id)
    result = await session.execute(stmt)
    team = result.scalar_one()

    return TeamResponse(id=team.id, name=team.name)


@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a team. Only team owners can delete the team."""
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    user = owner_info["user"]
    team = owner_info["team"]

    # Check if this is a personal team (cannot delete personal teams)
    # Personal teams are named "{username}'s Team" where username is from email or first_name
    expected_personal_name = f"{user.first_name or user.email.split('@')[0]}'s Team"
    if team.name == expected_personal_name:
        raise HTTPException(status_code=400, detail="Cannot delete personal team")

    # Check if user has other teams
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id))
    result = await session.execute(stmt)
    user_teams = result.scalars().all()
    if len(user_teams) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last team")

    # Check if team has only this user
    stmt = select(UserTeam).where(UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    team_users = result.scalars().all()
    if len(team_users) > 1:
        raise HTTPException(
            status_code=400, detail="Cannot delete team with multiple users. Remove other members first."
        )

    # Delete associations and team
    stmt = delete(UserTeam).where(UserTeam.team_id == team_id)
    await session.execute(stmt)
    stmt = delete(Team).where(Team.id == team_id)
    await session.execute(stmt)
    await session.commit()

    return {"message": "Team deleted"}


@router.get("/teams/{team_id}/members")
async def get_team_members(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get all members of a team. Any team member can view this."""
    # Verify team_id matches the one in header
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Get all members of the team
    stmt = select(UserTeam).where(UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    user_teams = result.scalars().all()

    # Get user details
    user_ids = [ut.user_id for ut in user_teams]
    stmt = select(User).where(User.id.in_(user_ids))
    result = await session.execute(stmt)
    users = result.scalars().unique().all()

    # Create a mapping
    users_dict = {str(user.id): user for user in users}

    members = [
        MemberResponse(
            user_id=ut.user_id,
            email=users_dict[ut.user_id].email if ut.user_id in users_dict else "unknown",
            role=ut.role,
        )
        for ut in user_teams
    ]

    return {"team_id": team_id, "members": members}


@router.post("/teams/{team_id}/members")
async def invite_member(
    team_id: str,
    invite_data: InviteMemberRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a team invitation. Only team owners can invite members.

    This creates a pending invitation that the user must accept by clicking
    the verification link sent to their email.

    Returns a shareable invitation URL and email delivery status.
    """
    # TODO:  The verification email is sent using the OS mail system as a temporary solution.
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Validate role
    if invite_data.role not in [TeamRole.OWNER.value, TeamRole.MEMBER.value]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner' or 'member'")

    inviter_user = owner_info["user"]

    # Get team details
    stmt = select(Team).where(Team.id == team_id)
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    # Check if user exists and is already in the team
    stmt = select(User).where(User.email == invite_data.email)
    result = await session.execute(stmt)
    existing_user = result.scalar_one_or_none()

    if existing_user:
        # Check if already a member
        stmt = select(UserTeam).where(UserTeam.user_id == str(existing_user.id), UserTeam.team_id == team_id)
        result = await session.execute(stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User is already a member of this team")

    # Check if there's already a pending invitation for this email and team
    stmt = select(TeamInvitation).where(
        and_(
            TeamInvitation.email == invite_data.email,
            TeamInvitation.team_id == team_id,
            TeamInvitation.status == InvitationStatus.PENDING.value,
        )
    )
    result = await session.execute(stmt)
    existing_invitation = result.scalar_one_or_none()

    app_url = getenv("FRONTEND_URL", "http://localhost:1212")

    if existing_invitation:
        # Check if the existing invitation has expired
        if existing_invitation.expires_at < datetime.utcnow():
            # Expired invitation - extend the expiration and resend
            existing_invitation.expires_at = datetime.utcnow() + timedelta(days=7)
            await session.commit()
            await session.refresh(existing_invitation)

            # Use hash router format for the invitation URL
            invitation_url = f"{app_url}/#/?invitation_token={existing_invitation.token}"

            # Resend verification email with new expiration
            try:
                send_team_invitation_email(
                    to_email=invite_data.email,
                    team_name=team.name,
                    inviter_email=inviter_user.email,
                    invitation_url=invitation_url,
                )
                email_sent = True
                email_error = None
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except (ConnectionError, RuntimeError) as e:
                # Log warning but don't fail the invitation
                logging.warning("Failed to send invitation email", exc_info=e)
                email_sent = False
                email_error = "Failed to send invitation email"

            return {
                "message": "Invitation renewed and resent",
                "invitation_id": existing_invitation.id,
                "email": existing_invitation.email,
                "role": existing_invitation.role,
                "expires_at": existing_invitation.expires_at.isoformat(),
                "invitation_url": invitation_url,
                "email_sent": email_sent,
                "email_error": email_error,
            }
        else:
            # Valid pending invitation - resend without changing expiration
            # Use hash router format for the invitation URL
            invitation_url = f"{app_url}/#/?invitation_token={existing_invitation.token}"

            # Resend verification email
            try:
                send_team_invitation_email(
                    to_email=invite_data.email,
                    team_name=team.name,
                    inviter_email=inviter_user.email,
                    invitation_url=invitation_url,
                )
                email_sent = True
                email_error = None
            except ValueError as e:
                raise HTTPException(status_code=400, detail=str(e))
            except (ConnectionError, RuntimeError) as e:
                logging.warning("Failed to send invitation email", exc_info=e)
                # Log warning but don't fail the invitation
                email_sent = False
                email_error = "Failed to send invitation email"

            return {
                "message": "Invitation already exists and was resent",
                "invitation_id": existing_invitation.id,
                "email": existing_invitation.email,
                "role": existing_invitation.role,
                "expires_at": existing_invitation.expires_at.isoformat(),
                "invitation_url": invitation_url,
                "email_sent": email_sent,
                "email_error": email_error,
            }

    # Create invitation
    invitation = TeamInvitation(
        email=invite_data.email,
        team_id=team_id,
        invited_by_user_id=str(inviter_user.id),
        role=invite_data.role,
        status=InvitationStatus.PENDING.value,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)

    # Use hash router format for the invitation URL
    invitation_url = f"{app_url}/#/?invitation_token={invitation.token}"

    # Send verification email to validate the email address exists
    try:
        send_team_invitation_email(
            to_email=invite_data.email,
            team_name=team.name,
            inviter_email=inviter_user.email,
            invitation_url=invitation_url,
        )
        email_sent = True
        email_error = None
    except ValueError as e:
        # Delete the invitation we just created since the email is invalid
        await session.delete(invitation)
        await session.commit()
        raise HTTPException(status_code=400, detail=str(e))
    except (ConnectionError, RuntimeError) as e:
        # Log warning but don't fail the invitation
        logging.warning("Failed to send invitation email", exc_info=e)
        email_sent = False
        email_error = "Failed to send invitation email"

    return {
        "message": "Invitation created successfully",
        "invitation_id": invitation.id,
        "email": invite_data.email,
        "role": invite_data.role,
        "expires_at": invitation.expires_at.isoformat(),
        "invitation_url": invitation_url,
        "email_sent": email_sent,
        "email_error": email_error,
    }


@router.delete("/teams/{team_id}/members/{user_id}")
async def remove_member(
    team_id: str,
    user_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Remove a member from the team. Only team owners can remove members."""
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Check if the user to be removed exists in the team
    stmt = select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    # If removing an owner, check that there's at least one other owner
    if user_team.role == TeamRole.OWNER.value:
        stmt = (
            select(func.count())
            .select_from(UserTeam)
            .where(UserTeam.team_id == team_id, UserTeam.role == TeamRole.OWNER.value)
        )
        result = await session.execute(stmt)
        owner_count = result.scalar()

        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner from the team")

    # Remove user from team
    stmt = delete(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id)
    await session.execute(stmt)
    await session.commit()

    return {"message": "Member removed successfully"}


@router.put("/teams/{team_id}/members/{user_id}/role")
async def update_member_role(
    team_id: str,
    user_id: str,
    role_data: UpdateMemberRoleRequest,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Update a member's role. Only team owners can change roles."""
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Validate role
    if role_data.role not in [TeamRole.OWNER.value, TeamRole.MEMBER.value]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner' or 'member'")

    # Check if the user exists in the team
    stmt = select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    # If demoting from owner to member, check that there's at least one other owner
    if user_team.role == TeamRole.OWNER.value and role_data.role == TeamRole.MEMBER.value:
        stmt = (
            select(func.count())
            .select_from(UserTeam)
            .where(UserTeam.team_id == team_id, UserTeam.role == TeamRole.OWNER.value)
        )
        result = await session.execute(stmt)
        owner_count = result.scalar()

        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last owner")

    # Update role
    stmt = update(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id).values(role=role_data.role)
    await session.execute(stmt)
    await session.commit()

    return {"message": "Role updated successfully", "user_id": user_id, "new_role": role_data.role}


# ==================== Team Invitation Endpoints ====================


@router.get("/invitations/me")
async def get_my_invitations(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get all pending invitations for the current user.

    Returns a list of pending team invitations created for the user's email address.
    Users can accept these invitations to join teams.
    """
    # Get all pending invitations for this user's email
    stmt = (
        select(TeamInvitation)
        .where(and_(TeamInvitation.email == user.email, TeamInvitation.status == InvitationStatus.PENDING.value))
        .order_by(TeamInvitation.created_at.desc())
    )

    result = await session.execute(stmt)
    invitations = result.scalars().all()

    # Enrich with team and inviter information
    invitation_responses = []
    for invitation in invitations:
        # Check if expired
        if invitation.expires_at < datetime.utcnow():
            invitation.status = InvitationStatus.EXPIRED.value
            await session.commit()
            continue

        # Get team info
        stmt = select(Team).where(Team.id == invitation.team_id)
        result = await session.execute(stmt)
        team = result.scalar_one_or_none()

        # Get inviter info
        stmt = select(User).where(User.id == invitation.invited_by_user_id)
        result = await session.execute(stmt)
        inviter = result.scalar_one_or_none()

        invitation_responses.append(
            InvitationResponse(
                id=invitation.id,
                email=invitation.email,
                team_id=invitation.team_id,
                team_name=team.name if team else "Unknown Team",
                role=invitation.role,
                status=invitation.status,
                invited_by_email=inviter.email if inviter else "Unknown",
                expires_at=invitation.expires_at.isoformat(),
                created_at=invitation.created_at.isoformat(),
            )
        )

    return {"invitations": invitation_responses}


@router.post("/invitations/accept")
async def accept_invitation(
    accept_data: AcceptInvitationRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Accept a team invitation using the invitation token.

    The user must be authenticated and the invitation must match their email address.
    Token is obtained from the invitation URL shared by the team owner.
    """
    # Find the invitation by token
    stmt = select(TeamInvitation).where(TeamInvitation.token == accept_data.token)
    result = await session.execute(stmt)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Verify the invitation is for this user
    if invitation.email != user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for your email address")

    # Check if invitation is still pending
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Invitation is no longer pending (status: {invitation.status})")

    # Check if expired
    if invitation.expires_at < datetime.utcnow():
        invitation.status = InvitationStatus.EXPIRED.value
        await session.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Check if user is already in the team
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id), UserTeam.team_id == invitation.team_id)
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        # Mark invitation as accepted anyway
        invitation.status = InvitationStatus.ACCEPTED.value
        await session.commit()
        raise HTTPException(status_code=400, detail="You are already a member of this team")

    # Add user to team
    user_team = UserTeam(user_id=str(user.id), team_id=invitation.team_id, role=invitation.role)
    session.add(user_team)

    # Update invitation status
    invitation.status = InvitationStatus.ACCEPTED.value

    await session.commit()

    # Get team info
    stmt = select(Team).where(Team.id == invitation.team_id)
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()

    return {
        "message": "Invitation accepted successfully",
        "team_id": invitation.team_id,
        "team_name": team.name if team else None,
        "role": invitation.role,
    }


@router.post("/invitations/{invitation_id}/reject")
async def reject_invitation(
    invitation_id: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Reject a team invitation.

    The user must be authenticated and the invitation must match their email address.
    """
    # Find the invitation
    stmt = select(TeamInvitation).where(TeamInvitation.id == invitation_id)
    result = await session.execute(stmt)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Verify the invitation is for this user
    if invitation.email != user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for your email address")

    # Check if invitation is still pending
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Invitation is no longer pending (status: {invitation.status})")

    # Update invitation status
    invitation.status = InvitationStatus.REJECTED.value
    await session.commit()

    return {"message": "Invitation rejected successfully"}


@router.get("/teams/{team_id}/invitations")
async def get_team_invitations(
    team_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get all invitations for a team (pending, accepted, rejected, expired).

    Only team owners can view this. Useful for tracking who has been invited
    and the status of each invitation.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Get all invitations for this team
    stmt = select(TeamInvitation).where(TeamInvitation.team_id == team_id).order_by(TeamInvitation.created_at.desc())

    result = await session.execute(stmt)
    invitations = result.scalars().all()

    # Get team info
    stmt = select(Team).where(Team.id == team_id)
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()

    invitation_responses = []
    for invitation in invitations:
        # Auto-expire if needed
        if invitation.status == InvitationStatus.PENDING.value and invitation.expires_at < datetime.utcnow():
            invitation.status = InvitationStatus.EXPIRED.value

        # Get inviter info
        stmt = select(User).where(User.id == invitation.invited_by_user_id)
        result = await session.execute(stmt)
        inviter = result.scalar_one_or_none()

        invitation_responses.append(
            InvitationResponse(
                id=invitation.id,
                email=invitation.email,
                team_id=invitation.team_id,
                team_name=team.name if team else "Unknown Team",
                role=invitation.role,
                status=invitation.status,
                invited_by_email=inviter.email if inviter else "Unknown",
                expires_at=invitation.expires_at.isoformat(),
                created_at=invitation.created_at.isoformat(),
            )
        )

    await session.commit()  # Commit any status updates

    return {"team_id": team_id, "invitations": invitation_responses}


@router.delete("/teams/{team_id}/invitations/{invitation_id}")
async def cancel_invitation(
    team_id: str,
    invitation_id: str,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Cancel a pending invitation. Only team owners can cancel invitations.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Find the invitation
    stmt = select(TeamInvitation).where(and_(TeamInvitation.id == invitation_id, TeamInvitation.team_id == team_id))
    result = await session.execute(stmt)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # Check if invitation is still pending
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Cannot cancel invitation with status: {invitation.status}")

    # Update the invitation status to cancelled
    invitation.status = InvitationStatus.CANCELLED.value
    await session.commit()

    return {"message": "Invitation cancelled successfully"}


@router.get("/teams/{team_id}/github_pat")
async def get_github_pat(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
):
    """
    Get GitHub PAT for the team's workspace.
    Only team members can view (but it will be masked for security).
    """
    # Verify team_id matches the one in header
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    pat_path = storage.join(workspace_dir, "github_pat.txt")

    if await storage.exists(pat_path):
        try:
            async with await storage.open(pat_path, "r") as f:
                pat = (await f.read()).strip()
                if pat:
                    # Return masked version for security (only show last 4 chars)
                    masked_pat = mask_key(pat)
                    return {"status": "success", "pat_exists": True, "masked_pat": masked_pat}
        except Exception as e:
            print(f"Error reading GitHub PAT: {e}")
            return {"status": "error", "message": "Failed to read GitHub PAT"}

    return {"status": "error", "message": "GitHub PAT not found"}


@router.put("/teams/{team_id}/github_pat")
async def set_github_pat(
    team_id: str,
    pat_data: GitHubPATRequest,
    owner_info=Depends(require_team_owner),
):
    """
    Set GitHub PAT for the team's workspace.
    Only team owners can set/update the PAT.
    Stored in workspace/github_pat.txt file.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    pat_path = storage.join(workspace_dir, "github_pat.txt")

    try:
        pat = pat_data.pat
        if pat and pat.strip():
            # Store the PAT
            async with await storage.open(pat_path, "w") as f:
                await f.write(pat.strip())
            return {"status": "success", "message": "GitHub PAT saved successfully"}
        else:
            # Remove the PAT if empty string is provided
            if await storage.exists(pat_path):
                await storage.rm(pat_path)
            return {"status": "success", "message": "GitHub PAT removed successfully"}
    except Exception as e:
        print(f"Error saving GitHub PAT: {e}")
        raise HTTPException(status_code=500, detail="Failed to save GitHub PAT")


@router.get("/teams/{team_id}/logo")
async def get_team_logo(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
):
    """
    Get team logo. Returns logo.png from workspace if it exists, otherwise returns 404.
    Any team member can view the logo.
    """
    # Verify team_id matches the one in header
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    logo_path = storage.join(workspace_dir, "logo.png")

    if not await storage.exists(logo_path):
        raise HTTPException(status_code=404, detail="Team logo not found")

    try:
        # For local filesystem, return file directly
        if not workspace_dir.startswith(("s3://", "gs://", "abfs://", "gcs://")):
            return FileResponse(logo_path, media_type="image/png")
        else:
            # For remote storage, read and return as bytes
            async with await storage.open(logo_path, "rb") as f:
                return Response(content=await f.read(), media_type="image/png")
    except Exception as e:
        print(f"Error reading team logo: {e}")
        raise HTTPException(status_code=500, detail="Failed to read team logo")


@router.put("/teams/{team_id}/logo")
async def set_team_logo(
    team_id: str,
    logo: UploadFile = File(...),
    owner_info=Depends(require_team_owner),
):
    """
    Set team logo. Only team owners can set/update the logo.
    Stored in workspace/logo.png file.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    logo_path = storage.join(workspace_dir, "logo.png")

    try:
        # Validate content type
        if logo.content_type and not logo.content_type.startswith("image/"):
            raise HTTPException(
                status_code=400, detail=f"Invalid file type. Only image files are allowed. Got: {logo.content_type}"
            )

        # Validate file extension
        if logo.filename:
            filename_lower = logo.filename.lower()
            # Extract extension using string operation (works with any filename, not just paths)
            if "." in filename_lower:
                ext = "." + filename_lower.rpartition(".")[2]
            else:
                ext = ""
            allowed_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
            if ext not in allowed_extensions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid file extension. Allowed extensions: {', '.join(allowed_extensions)}",
                )

        # Read and check file size limit (1 MB)
        contents = await logo.read()

        MAX_LOGO_SIZE = 1 * 1024 * 1024  # 1 MB
        file_size = len(contents)
        if file_size > MAX_LOGO_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"Logo file size ({file_size / (1024 * 1024):.2f} MB) exceeds maximum allowed size (1 MB)",
            )

        # Validate and process the image
        try:
            image = Image.open(io.BytesIO(contents))
            # Verify it's actually a valid image by attempting to load it
            image.verify()
            # Reopen after verify() since verify() closes the image
            image = Image.open(io.BytesIO(contents))
        except Exception as e:
            raise HTTPException(
                status_code=400, detail=f"Invalid image file. Please upload a valid image file. Error: {str(e)}"
            )

        # Convert to RGB if necessary (handles RGBA, P, etc.)
        if image.mode in ("RGBA", "LA", "P"):
            # Create a white background
            rgb_image = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            rgb_image.paste(image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None)
            image = rgb_image
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Save as PNG
        async with await storage.open(logo_path, "wb") as f:
            image.save(f, format="PNG")

        return {"status": "success", "message": "Team logo saved successfully"}
    except Exception as e:
        print(f"Error saving team logo: {e}")
        raise HTTPException(status_code=500, detail="Failed to save team logo")


@router.delete("/teams/{team_id}/logo")
async def delete_team_logo(
    team_id: str,
    owner_info=Depends(require_team_owner),
):
    """
    Delete team logo. Only team owners can delete the logo.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    logo_path = storage.join(workspace_dir, "logo.png")

    try:
        if await storage.exists(logo_path):
            await storage.rm(logo_path)
        return {"status": "success", "message": "Team logo deleted successfully"}
    except Exception as e:
        print(f"Error deleting team logo: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete team logo")


@router.get("/teams/{team_id}/secrets")
async def get_team_secrets(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    include_values: bool = Query(False, description="Include actual secret values (only for team owners)"),
):
    """
    Get team secrets.
    - Team members can view secret keys only (values are masked).
    - Team owners can view actual values by setting include_values=true.
    """
    # Verify team_id matches the one in header
    if team_id != user_and_team["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    secrets_path = storage.join(workspace_dir, "team_secrets.json")

    try:
        if not await storage.exists(secrets_path):
            return {"status": "success", "secrets": {}}

        async with await storage.open(secrets_path, "r") as f:
            secrets = json.loads(await f.read())

        # Check if user is team owner and requested values
        is_owner = user_and_team.get("role") == TeamRole.OWNER.value
        if include_values and is_owner:
            # Return actual values for team owners
            return {
                "status": "success",
                "secrets": secrets,
                "secret_keys": list(secrets.keys()),
            }
        else:
            # Mask all secret values for security
            masked_secrets = {key: "***" for key in secrets.keys()}
            return {
                "status": "success",
                "secrets": masked_secrets,
                "secret_keys": list(secrets.keys()),
            }
    except Exception as e:
        print(f"Error reading team secrets: {e}")
        raise HTTPException(status_code=500, detail="Failed to read team secrets")


@router.put("/teams/{team_id}/secrets")
async def set_team_secrets(
    team_id: str,
    secrets_data: TeamSecretsRequest,
    owner_info=Depends(require_team_owner),
):
    """
    Set team secrets. Only team owners can set/update secrets.
    Stored in workspace/team_secrets.json file.
    """
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    workspace_dir = await get_workspace_dir()
    secrets_path = storage.join(workspace_dir, "team_secrets.json")

    try:
        # Validate that all keys are valid environment variable names
        # Environment variable names can contain letters, numbers, and underscores
        import re

        valid_key_pattern = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
        for key in secrets_data.secrets.keys():
            if not valid_key_pattern.match(key):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid secret key '{key}'. Secret keys must start with a letter or underscore and contain only letters, numbers, and underscores.",
                )

        # Ensure workspace directory exists
        await storage.makedirs(workspace_dir, exist_ok=True)

        # Write secrets to file
        async with await storage.open(secrets_path, "w") as f:
            await f.write(json.dumps(secrets_data.secrets, indent=2))

        return {
            "status": "success",
            "message": "Team secrets saved successfully",
            "secret_keys": list(secrets_data.secrets.keys()),
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error saving team secrets: {e}")
        raise HTTPException(status_code=500, detail="Failed to save team secrets")
