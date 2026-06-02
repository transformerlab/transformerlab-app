# api/transformerlab/db/team.py
"""Team and UserTeam database access."""

from typing import Optional, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import Team, UserTeam


async def insert_team(session: AsyncSession, name: str) -> Team:
    """Insert a Team row and return it. Pure DB insert — no storage/experiment
    side effects (those live in services/team_service.py)."""
    team = Team(name=name)
    session.add(team)
    await session.commit()
    await session.refresh(team)
    return team


async def get_team_by_id(session: AsyncSession, team_id: str) -> Optional[Team]:
    result = await session.execute(select(Team).where(Team.id == team_id))
    return result.scalar_one_or_none()


async def get_teams_by_ids(session: AsyncSession, ids: Sequence[str]) -> list[Team]:
    if not ids:
        return []
    result = await session.execute(select(Team).where(Team.id.in_(list(ids))))
    return list(result.scalars().all())


async def get_all_teams(session: AsyncSession) -> list[Team]:
    result = await session.execute(select(Team))
    return list(result.scalars().all())


async def get_all_team_ids(session: AsyncSession) -> list[str]:
    result = await session.execute(select(Team.id))
    return [row[0] for row in result.all()]


async def get_user_team_membership(session: AsyncSession, user_id: str, team_id: str) -> Optional[UserTeam]:
    result = await session.execute(select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id))
    return result.scalar_one_or_none()


async def get_user_teams(session: AsyncSession, user_id: str) -> list[UserTeam]:
    result = await session.execute(select(UserTeam).where(UserTeam.user_id == user_id))
    return list(result.scalars().all())


async def get_team_members(session: AsyncSession, team_id: str) -> list[UserTeam]:
    result = await session.execute(select(UserTeam).where(UserTeam.team_id == team_id))
    return list(result.scalars().all())


async def add_user_to_team(session: AsyncSession, user_id: str, team_id: str, role: str) -> UserTeam:
    """Add a UserTeam association and commit. Returns the new row."""
    user_team = UserTeam(user_id=user_id, team_id=team_id, role=role)
    session.add(user_team)
    await session.commit()
    return user_team


async def remove_user_from_team(session: AsyncSession, user_id: str, team_id: str) -> bool:
    """Delete a UserTeam association if present. Returns True if a row was removed."""
    membership = await get_user_team_membership(session, user_id, team_id)
    if membership is None:
        return False
    await session.delete(membership)
    await session.commit()
    return True
