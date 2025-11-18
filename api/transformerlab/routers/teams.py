from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import User, get_async_session
from transformerlab.shared.models.models import Team, UserTeam, TeamRole
from transformerlab.models.users import current_active_user
from transformerlab.routers.auth2 import require_team_owner, get_user_and_team
from pydantic import BaseModel
from sqlalchemy import select, delete, update, func


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str


class TeamResponse(BaseModel):
    id: str
    name: str


class InviteMemberRequest(BaseModel):
    email: str
    role: str = TeamRole.MEMBER.value


class UpdateMemberRoleRequest(BaseModel):
    role: str


class MemberResponse(BaseModel):
    user_id: str
    email: str
    role: str


router = APIRouter(tags=["teams"])


@router.post("/teams", response_model=TeamResponse)
async def create_team(
    team_data: TeamCreate,
    session: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    # Create team
    team = Team(name=team_data.name)
    session.add(team)
    await session.commit()
    await session.refresh(team)

    # Add user to the team as owner
    user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
    session.add(user_team)
    await session.commit()

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
        raise HTTPException(status_code=400, detail="Cannot delete team with multiple users. Remove other members first.")

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
    users = result.scalars().all()
    
    # Create a mapping
    users_dict = {str(user.id): user for user in users}
    
    members = [
        MemberResponse(
            user_id=ut.user_id,
            email=users_dict[ut.user_id].email if ut.user_id in users_dict else "unknown",
            role=ut.role
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
    """Invite a user to the team. Only team owners can invite members."""
    # Verify team_id matches the one in header
    if team_id != owner_info["team_id"]:
        raise HTTPException(status_code=400, detail="Team ID mismatch")

    # Validate role
    if invite_data.role not in [TeamRole.OWNER.value, TeamRole.MEMBER.value]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'owner' or 'member'")

    # Find user by email
    stmt = select(User).where(User.email == invite_data.email)
    result = await session.execute(stmt)
    invited_user = result.scalar_one_or_none()

    if not invited_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if user is already in the team
    stmt = select(UserTeam).where(
        UserTeam.user_id == str(invited_user.id),
        UserTeam.team_id == team_id
    )
    result = await session.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member of this team")

    # Add user to team
    user_team = UserTeam(user_id=str(invited_user.id), team_id=team_id, role=invite_data.role)
    session.add(user_team)
    await session.commit()

    return {
        "message": "User invited successfully",
        "user_id": str(invited_user.id),
        "email": invited_user.email,
        "role": invite_data.role
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
    stmt = select(UserTeam).where(
        UserTeam.user_id == user_id,
        UserTeam.team_id == team_id
    )
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    # If removing an owner, check that there's at least one other owner
    if user_team.role == TeamRole.OWNER.value:
        stmt = select(func.count()).select_from(UserTeam).where(
            UserTeam.team_id == team_id,
            UserTeam.role == TeamRole.OWNER.value
        )
        result = await session.execute(stmt)
        owner_count = result.scalar()

        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last owner from the team")

    # Remove user from team
    stmt = delete(UserTeam).where(
        UserTeam.user_id == user_id,
        UserTeam.team_id == team_id
    )
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
    stmt = select(UserTeam).where(
        UserTeam.user_id == user_id,
        UserTeam.team_id == team_id
    )
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if not user_team:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    # If demoting from owner to member, check that there's at least one other owner
    if user_team.role == TeamRole.OWNER.value and role_data.role == TeamRole.MEMBER.value:
        stmt = select(func.count()).select_from(UserTeam).where(
            UserTeam.team_id == team_id,
            UserTeam.role == TeamRole.OWNER.value
        )
        result = await session.execute(stmt)
        owner_count = result.scalar()

        if owner_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot demote the last owner")

    # Update role
    stmt = update(UserTeam).where(
        UserTeam.user_id == user_id,
        UserTeam.team_id == team_id
    ).values(role=role_data.role)
    await session.execute(stmt)
    await session.commit()

    return {"message": "Role updated successfully", "user_id": user_id, "new_role": role_data.role}