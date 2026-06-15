"""Storage usage snapshot database access."""

from datetime import datetime, timedelta
from typing import Optional, Sequence

from sqlalchemy import Row, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import StorageUsageSnapshot, Team


async def upsert_daily_snapshot(
    session: AsyncSession,
    *,
    team_id: str,
    total_bytes: int,
    has_data: bool,
    as_of: Optional[datetime],
    captured_at: datetime,
) -> StorageUsageSnapshot:
    """Insert today's snapshot for a team, or update it if one already exists.

    Idempotent at one row per team per UTC day: a second run on the same day
    (worker restart, manual refresh) updates that day's row instead of appending.
    Does **not** commit — the caller commits once per batch.
    """
    day_start = captured_at.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)

    result = await session.execute(
        select(StorageUsageSnapshot)
        .where(
            StorageUsageSnapshot.team_id == team_id,
            StorageUsageSnapshot.captured_at >= day_start,
            StorageUsageSnapshot.captured_at < day_end,
        )
        .order_by(StorageUsageSnapshot.captured_at.desc())
        .limit(1)
    )
    snapshot = result.scalar_one_or_none()

    if snapshot is None:
        snapshot = StorageUsageSnapshot(
            team_id=team_id,
            total_bytes=total_bytes,
            has_data=has_data,
            as_of=as_of,
            captured_at=captured_at,
        )
        session.add(snapshot)
    else:
        snapshot.total_bytes = total_bytes
        snapshot.has_data = has_data
        snapshot.as_of = as_of
        snapshot.captured_at = captured_at

    return snapshot


async def get_latest_snapshots_per_team(session: AsyncSession) -> Sequence[Row]:
    """Return the most recent snapshot for every team, biggest consumers first.

    Includes teams that have no snapshot yet (LEFT JOIN from ``teams``), with
    null usage fields. The latest row per team is selected with a window
    function over the ``(team_id, captured_at)`` index — one query, no per-team
    lookups. Each returned row has: team_id, team_name, total_bytes, has_data,
    as_of, captured_at.
    """
    ranked = select(
        StorageUsageSnapshot.team_id,
        StorageUsageSnapshot.total_bytes,
        StorageUsageSnapshot.has_data,
        StorageUsageSnapshot.as_of,
        StorageUsageSnapshot.captured_at,
        func.row_number()
        .over(
            partition_by=StorageUsageSnapshot.team_id,
            order_by=(StorageUsageSnapshot.captured_at.desc(), StorageUsageSnapshot.id.desc()),
        )
        .label("rn"),
    ).subquery()

    stmt = (
        select(
            Team.id.label("team_id"),
            Team.name.label("team_name"),
            ranked.c.total_bytes,
            ranked.c.has_data,
            ranked.c.as_of,
            ranked.c.captured_at,
        )
        .select_from(Team)
        .outerjoin(ranked, (Team.id == ranked.c.team_id) & (ranked.c.rn == 1))
        # coalesce keeps it portable (avoids NULLS LAST differences across DBs).
        .order_by(func.coalesce(ranked.c.total_bytes, 0).desc())
    )

    result = await session.execute(stmt)
    return result.all()
