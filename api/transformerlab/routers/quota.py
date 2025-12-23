"""Router for managing quota tracking and enforcement."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.services import quota_service
from transformerlab.shared.models.models import User

router = APIRouter(prefix="/quota", tags=["quota"])


class TeamQuotaUpdate(BaseModel):
    monthly_quota_minutes: int = Field(..., description="Monthly quota in minutes", ge=0)


class UserQuotaOverrideUpdate(BaseModel):
    monthly_quota_minutes: int = Field(..., description="Additional minutes beyond team quota", ge=0)


@router.get("/me")
async def get_my_quota_status(
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get current user's quota status including team quota, user override, used quota, and available quota.
    """
    user = user_and_team["user"]
    team_id = user_and_team["team_id"]
    user_id_str = str(user.id)

    status = await quota_service.get_user_quota_status(session, user_id_str, team_id)
    return status


@router.get("/me/usage")
async def get_my_quota_usage(
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get detailed quota usage history for current user.
    """
    from sqlalchemy import select
    from transformerlab.shared.models.models import QuotaUsage

    user = user_and_team["user"]
    team_id = user_and_team["team_id"]
    user_id_str = str(user.id)

    stmt = (
        select(QuotaUsage)
        .where(QuotaUsage.user_id == user_id_str, QuotaUsage.team_id == team_id)
        .order_by(QuotaUsage.created_at.desc())
    )
    result = await session.execute(stmt)
    usage_records = result.scalars().all()

    return [
        {
            "id": record.id,
            "job_id": record.job_id,
            "experiment_id": record.experiment_id,
            "minutes_used": record.minutes_used,
            "period_start": record.period_start.isoformat(),
            "created_at": record.created_at.isoformat(),
        }
        for record in usage_records
    ]


@router.get("/team/{team_id}")
async def get_team_quota(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    _team_owner=Depends(require_team_owner),
):
    """
    Get team quota configuration and usage summary.
    Only team owners can access this endpoint.
    """
    team_quota = await quota_service.get_team_quota(session, team_id)
    if team_quota is None:
        return {
            "team_id": team_id,
            "monthly_quota_minutes": 0,
            "current_period_start": quota_service.get_current_period_start().isoformat(),
        }

    return {
        "team_id": team_quota.team_id,
        "monthly_quota_minutes": team_quota.monthly_quota_minutes,
        "current_period_start": team_quota.current_period_start.isoformat(),
        "created_at": team_quota.created_at.isoformat(),
        "updated_at": team_quota.updated_at.isoformat(),
    }


@router.patch("/team/{team_id}")
async def update_team_quota(
    team_id: str,
    update: TeamQuotaUpdate,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    _team_owner=Depends(require_team_owner),
):
    """
    Update team monthly quota.
    Only team owners can update quota.
    """
    team_quota = await quota_service.update_team_quota(session, team_id, update.monthly_quota_minutes)
    await session.commit()

    return {
        "team_id": team_quota.team_id,
        "monthly_quota_minutes": team_quota.monthly_quota_minutes,
        "current_period_start": team_quota.current_period_start.isoformat(),
    }


@router.get("/team/{team_id}/users")
async def get_team_quota_usage_by_users(
    team_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    _team_owner=Depends(require_team_owner),
):
    """
    Get quota usage summary for all users in a team.
    Only team owners can access this endpoint.
    """
    from sqlalchemy import select
    from transformerlab.shared.models.models import UserTeam

    current_period = quota_service.get_current_period_start()

    # Get all team members
    stmt = select(UserTeam).where(UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    team_members = result.scalars().all()

    user_summaries = []
    for member in team_members:
        user_id_str = member.user_id

        # Get user details
        user_stmt = select(User).where(User.id == user_id_str)
        user_result = await session.execute(user_stmt)
        # unique() is required because User has lazy="joined" relationships (oauth_accounts)
        user = user_result.unique().scalar_one_or_none()
        if not user:
            continue

        # Get quota stats
        total_quota, team_quota, user_override = await quota_service.get_user_total_quota(session, user_id_str, team_id)
        used_quota = await quota_service.get_used_quota(session, user_id_str, team_id, current_period)
        held_quota = await quota_service.get_held_quota(session, user_id_str, team_id)
        available_quota = await quota_service.get_available_quota(session, user_id_str, team_id, current_period)

        # Calculate overused quota (negative available_quota)
        overused_quota = max(0.0, -available_quota) if available_quota < 0 else 0.0

        user_summaries.append(
            {
                "user_id": user_id_str,
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "team_quota": team_quota,
                "user_override": user_override,
                "total_quota": total_quota,
                "used_quota": used_quota,
                "held_quota": held_quota,
                "available_quota": max(0.0, available_quota),  # Show as 0 in UI if negative
                "overused_quota": overused_quota,  # Amount overused (positive number)
            }
        )

    return user_summaries


@router.patch("/user/{user_id}/team/{team_id}")
async def update_user_quota_override(
    user_id: str,
    team_id: str,
    update: UserQuotaOverrideUpdate,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    _team_owner=Depends(require_team_owner),
):
    """
    Set or update user quota override (additional minutes beyond team quota).
    Only team owners can update user quota overrides.
    """
    override = await quota_service.update_user_quota_override(session, user_id, team_id, update.monthly_quota_minutes)
    await session.commit()

    return {
        "user_id": override.user_id,
        "team_id": override.team_id,
        "monthly_quota_minutes": override.monthly_quota_minutes,
        "current_period_start": override.current_period_start.isoformat(),
    }
