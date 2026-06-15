"""Persist per-team storage usage snapshots.

Bridges the live CloudWatch read (:mod:`storage_usage_service`) and the
``storage_usage_snapshots`` history table. This is the **single writer** of
snapshots — called by the daily worker and by the manual admin refresh — so the
read paths (dashboard, reports) only ever query the table, never CloudWatch.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.db.storage_usage import upsert_daily_snapshot
from transformerlab.services.storage_usage_service import get_team_storage_usage
from transformerlab.utils.datetime_utils import to_utc_naive, utc_now_naive

logger = logging.getLogger(__name__)


@dataclass
class SnapshotResult:
    """Summary of a snapshot run, for logging and the manual-refresh endpoint."""

    supported: bool
    teams_written: int
    total_bytes: int
    message: Optional[str] = None


async def snapshot_storage_usage(session: AsyncSession) -> SnapshotResult:
    """Read current storage usage from CloudWatch and persist a daily snapshot per team.

    Persists one row per team (faithful daily record, including zero/no-data
    teams). Idempotent per UTC day via :func:`upsert_daily_snapshot`: re-running
    the same day updates that day's rows rather than appending. No-ops on
    non-AWS providers, where there is nothing meaningful to record.
    """
    report = await get_team_storage_usage(session)

    if not report.supported:
        logger.info("Storage usage snapshot skipped: %s", report.message)
        return SnapshotResult(supported=False, teams_written=0, total_bytes=0, message=report.message)

    # One timestamp for the whole run so every team's snapshot shares a captured_at.
    captured_at = utc_now_naive()
    for team in report.teams:
        await upsert_daily_snapshot(
            session,
            team_id=team.team_id,
            total_bytes=team.total_bytes,
            has_data=team.has_data,
            as_of=to_utc_naive(team.as_of) if team.as_of else None,
            captured_at=captured_at,
        )
    # Commit once for the whole batch.
    await session.commit()

    logger.info(
        "Storage usage snapshot written for %d teams (%d bytes total)",
        len(report.teams),
        report.total_bytes,
    )
    return SnapshotResult(
        supported=True,
        teams_written=len(report.teams),
        total_bytes=report.total_bytes,
    )
