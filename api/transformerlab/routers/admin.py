"""Instance super-admin endpoints (not scoped to a single team)."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.db.session import get_async_session
from transformerlab.db.storage_usage import get_latest_snapshots_per_team
from transformerlab.models.users import current_admin_user
from transformerlab.schemas.storage import (
    StorageUsageRefreshResponse,
    StorageUsageResponse,
    TeamStorageUsageResponse,
)
from transformerlab.services.storage_usage_service import human_readable_bytes
from transformerlab.services.storage_usage_snapshot_service import snapshot_storage_usage

# Every route requires an instance super-admin.
router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(current_admin_user)])


@router.get("/storage-usage", response_model=StorageUsageResponse)
async def get_storage_usage(session: AsyncSession = Depends(get_async_session)) -> StorageUsageResponse:
    """Per-team storage usage from the latest stored snapshots (fast, no AWS call)."""
    rows = await get_latest_snapshots_per_team(session)

    teams = []
    total_bytes = 0
    for row in rows:
        team_bytes = row.total_bytes or 0
        total_bytes += team_bytes
        teams.append(
            TeamStorageUsageResponse(
                team_id=row.team_id,
                team_name=row.team_name,
                total_bytes=team_bytes,
                total_bytes_human=human_readable_bytes(team_bytes),
                has_data=bool(row.has_data),
                as_of=row.as_of,
                captured_at=row.captured_at,
            )
        )

    return StorageUsageResponse(
        teams=teams,
        total_bytes=total_bytes,
        total_bytes_human=human_readable_bytes(total_bytes),
    )


@router.post("/storage-usage/refresh", response_model=StorageUsageRefreshResponse)
async def refresh_storage_usage(session: AsyncSession = Depends(get_async_session)) -> StorageUsageRefreshResponse:
    """Read live usage from CloudWatch and persist a fresh snapshot, then return a summary.

    Mostly a convenience for testing / on-demand updates — the daily worker does
    this automatically. CloudWatch only updates ~daily, so calling this
    repeatedly will not change the numbers intra-day.
    """
    result = await snapshot_storage_usage(session)
    return StorageUsageRefreshResponse(
        supported=result.supported,
        teams_written=result.teams_written,
        total_bytes=result.total_bytes,
        message=result.message,
    )
