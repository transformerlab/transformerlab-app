"""
Quota service for managing team and user quotas, quota holds, and quota usage tracking.
"""

from datetime import date, datetime
from typing import Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from transformerlab.shared.models.models import (
    TeamQuota,
    UserQuotaOverride,
    QuotaUsage,
    QuotaHold,
)


def get_current_period_start() -> date:
    """Get the start date of the current quota period (1st of current month)."""
    today = date.today()
    return date(today.year, today.month, 1)


async def get_team_quota(session: AsyncSession, team_id: str) -> Optional[TeamQuota]:
    """Get team quota configuration for a team."""
    stmt = select(TeamQuota).where(TeamQuota.team_id == team_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_or_create_team_quota(
    session: AsyncSession, team_id: str, monthly_quota_minutes: int = 0
) -> TeamQuota:
    """Get existing team quota or create a new one with default values."""
    team_quota = await get_team_quota(session, team_id)
    if team_quota is None:
        current_period = get_current_period_start()
        team_quota = TeamQuota(
            team_id=team_id,
            monthly_quota_minutes=monthly_quota_minutes,
            current_period_start=current_period,
        )
        session.add(team_quota)
        await session.flush()
    return team_quota


async def update_team_quota(
    session: AsyncSession, team_id: str, monthly_quota_minutes: int
) -> TeamQuota:
    """Update team quota. Creates if it doesn't exist."""
    team_quota = await get_or_create_team_quota(session, team_id, monthly_quota_minutes)
    team_quota.monthly_quota_minutes = monthly_quota_minutes
    # Update period start if we're in a new month
    current_period = get_current_period_start()
    if team_quota.current_period_start != current_period:
        team_quota.current_period_start = current_period
    await session.flush()
    return team_quota


async def get_user_quota_override(
    session: AsyncSession, user_id: str, team_id: str
) -> Optional[UserQuotaOverride]:
    """Get user quota override for a user in a team."""
    stmt = select(UserQuotaOverride).where(
        and_(UserQuotaOverride.user_id == user_id, UserQuotaOverride.team_id == team_id)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def update_user_quota_override(
    session: AsyncSession, user_id: str, team_id: str, monthly_quota_minutes: int
) -> UserQuotaOverride:
    """Update user quota override. Creates if it doesn't exist."""
    override = await get_user_quota_override(session, user_id, team_id)
    current_period = get_current_period_start()

    if override is None:
        override = UserQuotaOverride(
            user_id=user_id,
            team_id=team_id,
            monthly_quota_minutes=monthly_quota_minutes,
            current_period_start=current_period,
        )
        session.add(override)
    else:
        override.monthly_quota_minutes = monthly_quota_minutes
        # Update period start if we're in a new month
        if override.current_period_start != current_period:
            override.current_period_start = current_period

    await session.flush()
    return override


async def get_user_total_quota(
    session: AsyncSession, user_id: str, team_id: str
) -> Tuple[int, int, int]:
    """
    Get total quota for a user (team quota + user override).
    Returns (total_quota_minutes, team_quota_minutes, user_override_minutes).
    """
    team_quota = await get_team_quota(session, team_id)
    team_quota_minutes = team_quota.monthly_quota_minutes if team_quota else 0

    user_override = await get_user_quota_override(session, user_id, team_id)
    user_override_minutes = user_override.monthly_quota_minutes if user_override else 0

    total_quota = team_quota_minutes + user_override_minutes
    return (total_quota, team_quota_minutes, user_override_minutes)


async def get_used_quota(
    session: AsyncSession, user_id: str, team_id: str, period_start: Optional[date] = None
) -> float:
    """Get total quota used by a user in a team for the current period."""
    if period_start is None:
        period_start = get_current_period_start()

    stmt = (
        select(func.sum(QuotaUsage.minutes_used))
        .where(
            and_(
                QuotaUsage.user_id == user_id,
                QuotaUsage.team_id == team_id,
                QuotaUsage.period_start == period_start,
            )
        )
        .scalar_subquery()
    )
    result = await session.execute(select(stmt))
    used = result.scalar()
    return float(used) if used is not None else 0.0


async def get_held_quota(session: AsyncSession, user_id: str, team_id: str) -> int:
    """Get total quota currently held (HELD status) for a user in a team."""
    stmt = (
        select(func.sum(QuotaHold.minutes_requested))
        .where(
            and_(
                QuotaHold.user_id == user_id,
                QuotaHold.team_id == team_id,
                QuotaHold.status == "HELD",
            )
        )
        .scalar_subquery()
    )
    result = await session.execute(select(stmt))
    held = result.scalar()
    return int(held) if held is not None else 0


async def get_available_quota(
    session: AsyncSession, user_id: str, team_id: str, period_start: Optional[date] = None
) -> float:
    """Get available quota for a user (total quota - used quota - held quota)."""
    total_quota, _, _ = await get_user_total_quota(session, user_id, team_id)
    used_quota = await get_used_quota(session, user_id, team_id, period_start)
    held_quota = await get_held_quota(session, user_id, team_id)

    available = float(total_quota) - used_quota - float(held_quota)
    return max(0.0, available)


async def check_quota_available(
    session: AsyncSession, user_id: str, team_id: str, minutes_requested: int
) -> Tuple[bool, float, str]:
    """
    Check if user has enough quota available for requested minutes.
    Returns (has_quota, available_quota, message).
    """
    available = await get_available_quota(session, user_id, team_id)

    if available >= minutes_requested:
        return (True, available, "Quota available")
    else:
        return (
            False,
            available,
            f"Insufficient quota. Available: {available:.2f} minutes, Requested: {minutes_requested} minutes",
        )


async def create_quota_hold(
    session: AsyncSession,
    user_id: str,
    team_id: str,
    task_id: str,
    minutes_requested: int,
    job_id: Optional[str] = None,
) -> QuotaHold:
    """Create a quota hold for a task."""
    quota_hold = QuotaHold(
        user_id=user_id,
        team_id=team_id,
        task_id=task_id,
        job_id=job_id,
        minutes_requested=minutes_requested,
        status="HELD",
    )
    session.add(quota_hold)
    await session.flush()
    return quota_hold


async def release_quota_hold(
    session: AsyncSession, hold_id: Optional[str] = None, task_id: Optional[str] = None, job_id: Optional[str] = None
) -> Optional[QuotaHold]:
    """Release a quota hold (set status to RELEASED)."""
    if hold_id:
        stmt = select(QuotaHold).where(QuotaHold.id == hold_id)
    elif task_id:
        stmt = select(QuotaHold).where(QuotaHold.task_id == task_id, QuotaHold.status == "HELD")
    elif job_id:
        stmt = select(QuotaHold).where(QuotaHold.job_id == job_id, QuotaHold.status == "HELD")
    else:
        return None

    result = await session.execute(stmt)
    quota_hold = result.scalar_one_or_none()

    if quota_hold:
        quota_hold.status = "RELEASED"
        quota_hold.released_at = datetime.utcnow()
        await session.flush()

    return quota_hold


async def convert_quota_hold(
    session: AsyncSession, job_id: str
) -> Optional[QuotaHold]:
    """Convert a quota hold to CONVERTED status (quota usage has been recorded)."""
    stmt = select(QuotaHold).where(QuotaHold.job_id == job_id, QuotaHold.status == "HELD")
    result = await session.execute(stmt)
    quota_hold = result.scalar_one_or_none()

    if quota_hold:
        quota_hold.status = "CONVERTED"
        await session.flush()

    return quota_hold


async def record_quota_usage(
    session: AsyncSession,
    user_id: str,
    team_id: str,
    job_id: str,
    experiment_id: str,
    minutes_used: float,
    period_start: Optional[date] = None,
) -> QuotaUsage:
    """Record quota usage from a completed job."""
    if period_start is None:
        period_start = get_current_period_start()

    quota_usage = QuotaUsage(
        user_id=user_id,
        team_id=team_id,
        job_id=job_id,
        experiment_id=experiment_id,
        minutes_used=minutes_used,
        period_start=period_start,
    )
    session.add(quota_usage)
    await session.flush()
    return quota_usage


async def ensure_quota_recorded_for_completed_job(
    session: AsyncSession, job_id: str
) -> bool:
    """
    Check if a completed REMOTE job has quota usage recorded.
    If not, and the job is COMPLETE/STOPPED/FAILED, record the quota usage.
    
    Returns True if quota was recorded, False otherwise.
    """
    from transformerlab.services import job_service
    from transformerlab.shared.models.models import QuotaUsage, User
    from sqlalchemy import select

    # Get the job
    job = job_service.job_get(job_id)
    if not job:
        return False

    # Only track REMOTE jobs
    if job.get("type") != "REMOTE":
        return False

    # Only process jobs in terminal states
    status = job.get("status", "")
    if status not in ("COMPLETE", "STOPPED", "FAILED", "DELETED"):
        return False

    # Check if quota usage already recorded for this job
    stmt = select(QuotaUsage).where(QuotaUsage.job_id == job_id)
    result = await session.execute(stmt)
    existing_usage = result.scalar_one_or_none()
    if existing_usage:
        return False  # Already recorded

    # Get job data
    job_data = job.get("job_data") or {}
    user_info = job_data.get("user_info") or {}
    user_email = user_info.get("email")
    if not user_email:
        return False

    # Get team_id from job_data
    team_id = job_data.get("team_id")
    if not team_id:
        return False

    # Check if job had start_time (entered LAUNCHING state)
    start_time_str = job_data.get("start_time")
    if not start_time_str:
        # Job never entered LAUNCHING state, release quota hold if exists
        await release_quota_hold(session, job_id=job_id)
        await session.commit()
        return False

    # Get end time
    end_time_str = job_data.get("end_time")
    if not end_time_str:
        # Try to calculate from current time if job is complete
        if status == "COMPLETE":
            from datetime import datetime
            end_time_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        else:
            return False  # Can't calculate without end_time

    # Calculate minutes used
    try:
        from datetime import datetime

        if isinstance(start_time_str, str):
            start_dt = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        else:
            start_dt = start_time_str

        if isinstance(end_time_str, str):
            end_dt = datetime.strptime(end_time_str, "%Y-%m-%d %H:%M:%S")
        else:
            end_dt = end_time_str

        duration_seconds = (end_dt - start_dt).total_seconds()
        minutes_used = duration_seconds / 60.0

        if minutes_used < 0:
            return False

        # Get user_id from email
        stmt = select(User).where(User.email == user_email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return False

        user_id_str = str(user.id)
        experiment_id = job.get("experiment_id", "")

        # Record quota usage
        await record_quota_usage(
            session=session,
            user_id=user_id_str,
            team_id=team_id,
            job_id=job_id,
            experiment_id=experiment_id,
            minutes_used=minutes_used,
        )

        # Convert quota hold to CONVERTED status
        await convert_quota_hold(session, job_id)

        await session.commit()
        print(f"Recorded quota usage for completed job {job_id}: {minutes_used:.2f} minutes")
        return True

    except Exception as e:
        print(f"Error ensuring quota recorded for job {job_id}: {e}")
        await session.rollback()
        return False


async def get_user_quota_status(
    session: AsyncSession, user_id: str, team_id: str
) -> dict:
    """Get comprehensive quota status for a user."""
    total_quota, team_quota, user_override = await get_user_total_quota(session, user_id, team_id)
    period_start = get_current_period_start()
    used_quota = await get_used_quota(session, user_id, team_id, period_start)
    held_quota = await get_held_quota(session, user_id, team_id)
    available_quota = await get_available_quota(session, user_id, team_id, period_start)

    # Calculate period end (last day of current month)
    today = date.today()
    if today.month == 12:
        period_end = date(today.year + 1, 1, 1)
    else:
        period_end = date(today.year, today.month + 1, 1)

    return {
        "team_quota": team_quota,
        "user_override": user_override,
        "total_quota": total_quota,
        "used_quota": used_quota,
        "held_quota": held_quota,
        "available_quota": available_quota,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }

