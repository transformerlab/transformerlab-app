import io
import json
import logging
import re
import asyncio
from datetime import datetime, timedelta
from os import getenv
from typing import List, Optional
from uuid import UUID

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response
from lab import Experiment, storage
from lab.dirs import get_workspace_dir, set_organization_id
from PIL import Image
from sqlalchemy import and_, delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.db.session import async_session
from transformerlab.shared.models.models import (
    InvitationStatus,
    Team,
    TeamInvitation,
    TeamRole,
    User,
    UserTeam,
)
from transformerlab.shared.remote_workspace import create_bucket_for_team
from transformerlab.schemas.secrets import SPECIAL_SECRET_KEYS, SPECIAL_SECRET_TYPES
from transformerlab.utils.api_key_utils import mask_key
from transformerlab.utils.email import send_team_invitation_email

logger = logging.getLogger(__name__)

_ALLOWED_LOGO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
_MAX_LOGO_SIZE = 1 * 1024 * 1024  # 1 MB


# ==================== Logo Helper ====================


def _normalize_uuid_ids(raw_ids: List[str]) -> List[UUID]:
    """Convert string IDs to UUIDs, skipping malformed values."""
    normalized: List[UUID] = []
    for raw_id in raw_ids:
        try:
            normalized.append(UUID(str(raw_id)))
        except (TypeError, ValueError):
            continue
    return normalized


def _validate_and_process_logo(contents: bytes, content_type: Optional[str], filename: Optional[str]) -> Image.Image:
    """Validate upload bytes and return a processed RGB PIL Image. Raises HTTPException on failure."""
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Only image files are allowed. Got: {content_type}",
        )

    if filename:
        filename_lower = filename.lower()
        ext = ("." + filename_lower.rpartition(".")[2]) if "." in filename_lower else ""
        if ext not in _ALLOWED_LOGO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file extension. Allowed extensions: {', '.join(_ALLOWED_LOGO_EXTENSIONS)}",
            )

    if len(contents) > _MAX_LOGO_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Logo file size ({len(contents) / (1024 * 1024):.2f} MB) exceeds maximum allowed size (1 MB)",
        )

    try:
        image = Image.open(io.BytesIO(contents))
        image.verify()
        image = Image.open(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image file. Please upload a valid image file. Error: {str(e)}",
        )

    if image.mode in ("RGBA", "LA", "P"):
        rgb_image = Image.new("RGB", image.size, (255, 255, 255))
        if image.mode == "P":
            image = image.convert("RGBA")
        rgb_image.paste(image, mask=image.split()[-1] if image.mode in ("RGBA", "LA") else None)
        image = rgb_image
    elif image.mode != "RGB":
        image = image.convert("RGB")

    return image


def _encode_logo_png(image: Image.Image) -> bytes:
    """Encode a PIL image to PNG bytes for async storage backends."""
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


# ==================== Team CRUD ====================


def _is_personal_team(user: User, team: Team) -> bool:
    """Return True if team is the user's personal team (cannot be deleted or left)."""
    expected = f"{user.first_name or user.email.split('@')[0]}'s Team"
    return team.name == expected


async def get_all_team_ids() -> List[str]:
    """Return the IDs of all teams in the database."""

    async with async_session() as session:
        result = await session.execute(select(Team.id))
        return [row[0] for row in result.all()]


async def create_team(
    session: AsyncSession,
    name: str,
    user: User,
    logo_contents: Optional[bytes] = None,
    logo_content_type: Optional[str] = None,
    logo_filename: Optional[str] = None,
) -> dict:
    """Create a team, add the creator as owner, provision storage and default experiment."""

    team = Team(name=name)
    session.add(team)
    await session.commit()
    await session.refresh(team)

    user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
    session.add(user_team)
    await session.commit()

    remote_storage_enabled = getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    if remote_storage_enabled or (getenv("TFL_STORAGE_PROVIDER") == "localfs" and getenv("TFL_STORAGE_URI")):
        try:
            from transformerlab.shared.remote_workspace import get_default_aws_profile

            await asyncio.to_thread(create_bucket_for_team, team.id, get_default_aws_profile())
        except Exception as e:
            logger.warning("Failed to create storage for team %s: %s", team.id, e)

    try:
        set_organization_id(team.id)
        await Experiment.create_or_get("alpha", create_new=True)

        if logo_contents:
            try:
                workspace_dir = await get_workspace_dir()
                logo_path = storage.join(workspace_dir, "logo.png")
                image = _validate_and_process_logo(logo_contents, logo_content_type, logo_filename)
                async with await storage.open(logo_path, "wb") as f:
                    await f.write(_encode_logo_png(image))
            except HTTPException:
                raise
            except Exception as e:
                logger.warning("Failed to save logo for team %s: %s", team.id, e)
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("Failed to create default experiment 'alpha' for team %s: %s", team.id, e)
    finally:
        set_organization_id(None)

    return {"id": team.id, "name": team.name}


async def update_team(session: AsyncSession, team_id: str, name: str) -> dict:
    await session.execute(update(Team).where(Team.id == team_id).values(name=name))
    await session.commit()
    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one()
    return {"id": team.id, "name": team.name}


async def delete_team(session: AsyncSession, team_id: str, user: User, team: Team) -> dict:
    if _is_personal_team(user, team):
        raise HTTPException(status_code=400, detail="Cannot delete personal team")

    result = await session.execute(select(UserTeam).where(UserTeam.user_id == str(user.id)))
    user_teams = result.scalars().all()
    if len(user_teams) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last team")

    await session.execute(delete(UserTeam).where(UserTeam.team_id == team_id))
    await session.execute(delete(TeamInvitation).where(TeamInvitation.team_id == team_id))
    await session.commit()
    return {"message": "Team deleted"}


# ==================== Members ====================


async def get_team_members(session: AsyncSession, team_id: str) -> dict:
    result = await session.execute(select(UserTeam).where(UserTeam.team_id == team_id))
    user_teams = result.scalars().all()

    user_ids = [ut.user_id for ut in user_teams]
    normalized_user_ids = _normalize_uuid_ids(user_ids)
    result = await session.execute(select(User).where(User.id.in_(normalized_user_ids)))
    users = {str(u.id): u for u in result.scalars().unique().all()}

    members = [
        {
            "user_id": ut.user_id,
            "email": users[ut.user_id].email if ut.user_id in users else "unknown",
            "role": ut.role,
        }
        for ut in user_teams
    ]
    return {"team_id": team_id, "members": members}


async def leave_team(session: AsyncSession, team_id: str, user: User, team: Team, role: str) -> dict:
    if _is_personal_team(user, team):
        raise HTTPException(status_code=400, detail="Cannot leave personal team")

    if role != TeamRole.OWNER.value:
        await session.execute(delete(UserTeam).where(UserTeam.user_id == str(user.id), UserTeam.team_id == team_id))
        await session.commit()
        return {"message": "Left team"}

    result = await session.execute(
        select(func.count())
        .select_from(UserTeam)
        .where(UserTeam.team_id == team_id, UserTeam.role == TeamRole.OWNER.value)
    )
    owner_count = result.scalar()

    if owner_count > 1:
        await session.execute(delete(UserTeam).where(UserTeam.user_id == str(user.id), UserTeam.team_id == team_id))
        await session.commit()
        return {"message": "Left team"}

    result = await session.execute(
        select(UserTeam).where(UserTeam.team_id == team_id, UserTeam.user_id != str(user.id)).order_by(UserTeam.user_id)
    )
    next_member = result.scalars().first()

    if next_member:
        await session.execute(
            update(UserTeam)
            .where(UserTeam.user_id == next_member.user_id, UserTeam.team_id == team_id)
            .values(role=TeamRole.OWNER.value)
        )

    await session.execute(delete(UserTeam).where(UserTeam.user_id == str(user.id), UserTeam.team_id == team_id))
    await session.commit()
    return {"message": "Left team"}


async def remove_member(session: AsyncSession, team_id: str, user_id: str) -> dict:
    result = await session.execute(select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id))
    user_team = result.scalar_one_or_none()
    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    if user_team.role == TeamRole.OWNER.value:
        result = await session.execute(
            select(func.count())
            .select_from(UserTeam)
            .where(UserTeam.team_id == team_id, UserTeam.role == TeamRole.OWNER.value)
        )
        if result.scalar() <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner from the team")

    await session.execute(delete(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id))
    await session.commit()
    return {"message": "Member removed successfully"}


async def update_member_role(session: AsyncSession, team_id: str, user_id: str, role: str) -> dict:
    if role not in [TeamRole.OWNER.value, TeamRole.MEMBER.value]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner' or 'member'")

    result = await session.execute(select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id))
    user_team = result.scalar_one_or_none()
    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    if user_team.role == TeamRole.OWNER.value and role == TeamRole.MEMBER.value:
        result = await session.execute(
            select(func.count())
            .select_from(UserTeam)
            .where(UserTeam.team_id == team_id, UserTeam.role == TeamRole.OWNER.value)
        )
        if result.scalar() <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last owner")

    await session.execute(
        update(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id).values(role=role)
    )
    await session.commit()
    return {"message": "Role updated successfully", "user_id": user_id, "new_role": role}


# ==================== Invitations ====================


def _send_invite_email(
    to_email: str, team_name: str, inviter_email: str, invitation_url: str
) -> tuple[bool, Optional[str]]:
    """Returns (email_sent, email_error). Raises HTTPException on invalid email."""
    try:
        send_team_invitation_email(
            to_email=to_email,
            team_name=team_name,
            inviter_email=inviter_email,
            invitation_url=invitation_url,
        )
        return True, None
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (ConnectionError, RuntimeError) as e:
        logger.warning("Failed to send invitation email", exc_info=e)
        return False, "Failed to send invitation email"


async def invite_member(
    session: AsyncSession,
    team_id: str,
    email: str,
    role: str,
    inviter_user: User,
    team: Team,
) -> dict:
    if role not in [TeamRole.OWNER.value, TeamRole.MEMBER.value]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner' or 'member'")

    result = await session.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        result = await session.execute(
            select(UserTeam).where(UserTeam.user_id == str(existing_user.id), UserTeam.team_id == team_id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="User is already a member of this team")

    result = await session.execute(
        select(TeamInvitation).where(
            and_(
                TeamInvitation.email == email,
                TeamInvitation.team_id == team_id,
                TeamInvitation.status == InvitationStatus.PENDING.value,
            )
        )
    )
    existing = result.scalar_one_or_none()
    app_url = getenv("FRONTEND_URL", "http://localhost:1212")

    if existing:
        if existing.expires_at < datetime.utcnow():
            existing.expires_at = datetime.utcnow() + timedelta(days=7)
            await session.commit()
            await session.refresh(existing)
            message = "Invitation renewed and resent"
        else:
            message = "Invitation already exists and was resent"

        invitation_url = f"{app_url}/#/?invitation_token={existing.token}"
        email_sent, email_error = _send_invite_email(email, team.name, inviter_user.email, invitation_url)
        return {
            "message": message,
            "invitation_id": existing.id,
            "email": existing.email,
            "role": existing.role,
            "expires_at": existing.expires_at.isoformat(),
            "invitation_url": invitation_url,
            "email_sent": email_sent,
            "email_error": email_error,
        }

    invitation = TeamInvitation(
        email=email,
        team_id=team_id,
        invited_by_user_id=str(inviter_user.id),
        role=role,
        status=InvitationStatus.PENDING.value,
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    session.add(invitation)
    await session.commit()
    await session.refresh(invitation)

    invitation_url = f"{app_url}/#/?invitation_token={invitation.token}"
    try:
        email_sent, email_error = _send_invite_email(email, team.name, inviter_user.email, invitation_url)
    except HTTPException:
        await session.delete(invitation)
        await session.commit()
        raise

    return {
        "message": "Invitation created successfully",
        "invitation_id": invitation.id,
        "email": email,
        "role": role,
        "expires_at": invitation.expires_at.isoformat(),
        "invitation_url": invitation_url,
        "email_sent": email_sent,
        "email_error": email_error,
    }


async def get_my_invitations(session: AsyncSession, user_email: str) -> dict:
    """Fetch pending invitations for a user. Uses batched queries to avoid N+1."""
    stmt = (
        select(TeamInvitation)
        .where(and_(TeamInvitation.email == user_email, TeamInvitation.status == InvitationStatus.PENDING.value))
        .order_by(TeamInvitation.created_at.desc())
    )
    result = await session.execute(stmt)
    invitations = result.scalars().all()

    valid = []
    for inv in invitations:
        if inv.expires_at < datetime.utcnow():
            inv.status = InvitationStatus.EXPIRED.value
        else:
            valid.append(inv)
    if len(valid) < len(invitations):
        await session.commit()

    if not valid:
        return {"invitations": []}

    team_ids = list({inv.team_id for inv in valid})
    inviter_ids = list({inv.invited_by_user_id for inv in valid})

    teams = {t.id: t for t in (await session.execute(select(Team).where(Team.id.in_(team_ids)))).scalars().all()}
    normalized_inviter_ids = _normalize_uuid_ids(inviter_ids)
    inviters = {
        str(u.id): u
        for u in (await session.execute(select(User).where(User.id.in_(normalized_inviter_ids)))).scalars().all()
    }

    responses = [
        {
            "id": inv.id,
            "email": inv.email,
            "team_id": inv.team_id,
            "team_name": teams[inv.team_id].name if inv.team_id in teams else "Unknown Team",
            "role": inv.role,
            "status": inv.status,
            "invited_by_email": inviters[inv.invited_by_user_id].email
            if inv.invited_by_user_id in inviters
            else "Unknown",
            "expires_at": inv.expires_at.isoformat(),
            "created_at": inv.created_at.isoformat(),
        }
        for inv in valid
    ]
    return {"invitations": responses}


async def get_team_invitations(session: AsyncSession, team_id: str) -> dict:
    """Fetch all invitations for a team. Uses batched queries to avoid N+1."""
    stmt = select(TeamInvitation).where(TeamInvitation.team_id == team_id).order_by(TeamInvitation.created_at.desc())
    result = await session.execute(stmt)
    invitations = result.scalars().all()

    result = await session.execute(select(Team).where(Team.id == team_id))
    team = result.scalar_one_or_none()

    for inv in invitations:
        if inv.status == InvitationStatus.PENDING.value and inv.expires_at < datetime.utcnow():
            inv.status = InvitationStatus.EXPIRED.value
    await session.commit()

    inviter_ids = list({inv.invited_by_user_id for inv in invitations})
    normalized_inviter_ids = _normalize_uuid_ids(inviter_ids)
    inviters = {
        str(u.id): u
        for u in (await session.execute(select(User).where(User.id.in_(normalized_inviter_ids)))).scalars().all()
    }

    responses = [
        {
            "id": inv.id,
            "email": inv.email,
            "team_id": inv.team_id,
            "team_name": team.name if team else "Unknown Team",
            "role": inv.role,
            "status": inv.status,
            "invited_by_email": inviters[inv.invited_by_user_id].email
            if inv.invited_by_user_id in inviters
            else "Unknown",
            "expires_at": inv.expires_at.isoformat(),
            "created_at": inv.created_at.isoformat(),
        }
        for inv in invitations
    ]
    return {"team_id": team_id, "invitations": responses}


async def accept_invitation(
    session: AsyncSession,
    user: User,
    *,
    token: Optional[str] = None,
    invitation_id: Optional[str] = None,
) -> dict:
    """Accept an invitation by token OR by invitation_id. Exactly one must be provided."""
    if token is not None:
        stmt = select(TeamInvitation).where(TeamInvitation.token == token)
    elif invitation_id is not None:
        stmt = select(TeamInvitation).where(TeamInvitation.id == invitation_id)
    else:
        raise ValueError("Must provide token or invitation_id")

    result = await session.execute(stmt)
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.email != user.email:
        raise HTTPException(status_code=403, detail="This invitation is not for your email address")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Invitation is no longer pending (status: {invitation.status})")
    if invitation.expires_at < datetime.utcnow():
        invitation.status = InvitationStatus.EXPIRED.value
        await session.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")

    result = await session.execute(
        select(UserTeam).where(UserTeam.user_id == str(user.id), UserTeam.team_id == invitation.team_id)
    )
    if result.scalar_one_or_none():
        invitation.status = InvitationStatus.ACCEPTED.value
        await session.commit()
        raise HTTPException(status_code=400, detail="You are already a member of this team")

    session.add(UserTeam(user_id=str(user.id), team_id=invitation.team_id, role=invitation.role))
    invitation.status = InvitationStatus.ACCEPTED.value
    await session.commit()

    result = await session.execute(select(Team).where(Team.id == invitation.team_id))
    team = result.scalar_one_or_none()

    return {
        "message": "Invitation accepted successfully",
        "team_id": invitation.team_id,
        "team_name": team.name if team else None,
        "role": invitation.role,
    }


async def reject_invitation(session: AsyncSession, invitation_id: str, user_email: str) -> dict:
    result = await session.execute(select(TeamInvitation).where(TeamInvitation.id == invitation_id))
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.email != user_email:
        raise HTTPException(status_code=403, detail="This invitation is not for your email address")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Invitation is no longer pending (status: {invitation.status})")
    invitation.status = InvitationStatus.REJECTED.value
    await session.commit()
    return {"message": "Invitation rejected successfully"}


async def cancel_invitation(session: AsyncSession, team_id: str, invitation_id: str) -> dict:
    result = await session.execute(
        select(TeamInvitation).where(and_(TeamInvitation.id == invitation_id, TeamInvitation.team_id == team_id))
    )
    invitation = result.scalar_one_or_none()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.status != InvitationStatus.PENDING.value:
        raise HTTPException(status_code=400, detail=f"Cannot cancel invitation with status: {invitation.status}")
    invitation.status = InvitationStatus.CANCELLED.value
    await session.commit()
    return {"message": "Invitation cancelled successfully"}


# ==================== Logo ====================


async def get_team_logo(workspace_dir: str):
    logo_path = storage.join(workspace_dir, "logo.png")
    if not await storage.exists(logo_path):
        raise HTTPException(status_code=404, detail="Team logo not found")

    try:
        if not storage.is_remote_path(workspace_dir):
            return FileResponse(logo_path, media_type="image/png")
        else:
            async with await storage.open(logo_path, "rb") as f:
                return Response(content=await f.read(), media_type="image/png")
    except Exception as e:
        logger.error("Error reading team logo: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read team logo")


async def set_team_logo(
    workspace_dir: str, contents: bytes, content_type: Optional[str], filename: Optional[str]
) -> dict:
    logo_path = storage.join(workspace_dir, "logo.png")
    try:
        image = _validate_and_process_logo(contents, content_type, filename)
        async with await storage.open(logo_path, "wb") as f:
            await f.write(_encode_logo_png(image))
        return {"status": "success", "message": "Team logo saved successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving team logo: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save team logo")


async def delete_team_logo(workspace_dir: str) -> dict:
    logo_path = storage.join(workspace_dir, "logo.png")
    try:
        if await storage.exists(logo_path):
            await storage.rm(logo_path)
        return {"status": "success", "message": "Team logo deleted successfully"}
    except Exception as e:
        logger.error("Error deleting team logo: %s", e)
        raise HTTPException(status_code=500, detail="Failed to delete team logo")


# ==================== Secrets ====================


async def get_github_pat(workspace_dir: str) -> dict:
    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    if await storage.exists(secrets_path):
        try:
            async with await storage.open(secrets_path, "r") as f:
                secrets = json.loads(await f.read())
                pat = secrets.get("_GITHUB_PAT_TOKEN", "").strip()
                if pat:
                    return {"status": "success", "pat_exists": True, "masked_pat": mask_key(pat)}
        except Exception as e:
            logger.error("Error reading GitHub PAT: %s", e)
            return {"status": "error", "message": "Failed to read GitHub PAT"}
    return {"status": "error", "message": "GitHub PAT not found"}


async def set_github_pat(workspace_dir: str, pat: Optional[str]) -> dict:
    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    try:
        existing: dict = {}
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                existing = json.loads(await f.read())

        if pat and pat.strip():
            existing["_GITHUB_PAT_TOKEN"] = pat.strip()
            message = "GitHub PAT saved successfully"
        else:
            existing.pop("_GITHUB_PAT_TOKEN", None)
            message = "GitHub PAT removed successfully"

        await storage.makedirs(workspace_dir, exist_ok=True)
        async with await storage.open(secrets_path, "w") as f:
            await f.write(json.dumps(existing, indent=2))
        return {"status": "success", "message": message}
    except Exception as e:
        logger.error("Error saving GitHub PAT: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save GitHub PAT")


async def get_team_secrets(workspace_dir: str, is_owner: bool, include_values: bool) -> dict:
    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    try:
        if not await storage.exists(secrets_path):
            return {"status": "success", "secrets": {}}

        async with await storage.open(secrets_path, "r") as f:
            secrets = json.loads(await f.read())

        if include_values and is_owner:
            return {"status": "success", "secrets": secrets, "secret_keys": list(secrets.keys())}
        return {"status": "success", "secrets": {k: "***" for k in secrets}, "secret_keys": list(secrets.keys())}
    except Exception as e:
        logger.error("Error reading team secrets: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read team secrets")


async def set_team_secrets(workspace_dir: str, secrets: dict) -> dict:
    valid_key_pattern = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
    for key in secrets:
        if not valid_key_pattern.match(key):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid secret key '{key}'. Must start with a letter or underscore and contain only letters, numbers, and underscores.",
            )
        if key in SPECIAL_SECRET_KEYS:
            raise HTTPException(
                status_code=400,
                detail=f"Secret key '{key}' is a special secret and can only be set via the Special Secrets section.",
            )

    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    try:
        await storage.makedirs(workspace_dir, exist_ok=True)
        async with await storage.open(secrets_path, "w") as f:
            await f.write(json.dumps(secrets, indent=2))
        return {"status": "success", "message": "Team secrets saved successfully", "secret_keys": list(secrets.keys())}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving team secrets: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save team secrets")


async def get_team_special_secrets(workspace_dir: str) -> dict:
    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    result = {}
    try:
        all_secrets: dict = {}
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                all_secrets = json.loads(await f.read())

        for key, name in SPECIAL_SECRET_TYPES.items():
            result[key] = {
                "name": name,
                "exists": key in all_secrets,
                "masked_value": mask_key(all_secrets[key]) if key in all_secrets and all_secrets[key] else None,
            }
    except Exception as e:
        logger.error("Error reading team special secrets: %s", e)
        raise HTTPException(status_code=500, detail="Failed to read team special secrets")
    return {"status": "success", "special_secrets": result}


async def set_team_special_secret(workspace_dir: str, secret_type: str, value: Optional[str]) -> dict:
    if secret_type not in SPECIAL_SECRET_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid secret type '{secret_type}'. Must be one of: {', '.join(SPECIAL_SECRET_TYPES.keys())}",
        )

    secrets_path = storage.join(workspace_dir, "team_secrets.json")
    try:
        existing: dict = {}
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                existing = json.loads(await f.read())

        if value and value.strip():
            existing[secret_type] = value.strip()
        else:
            existing.pop(secret_type, None)

        await storage.makedirs(workspace_dir, exist_ok=True)
        async with await storage.open(secrets_path, "w") as f:
            await f.write(json.dumps(existing, indent=2))
        return {
            "status": "success",
            "message": f"{SPECIAL_SECRET_TYPES[secret_type]} saved successfully",
            "secret_type": secret_type,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error saving team special secret: %s", e)
        raise HTTPException(status_code=500, detail="Failed to save team special secret")
