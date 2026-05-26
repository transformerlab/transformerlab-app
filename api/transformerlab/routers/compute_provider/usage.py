"""Usage reporting routes for compute providers."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.routers.auth import require_team_owner
from transformerlab.schemas.storage_usage import (
    StorageAlert,
    StorageAlertsResponse,
    StorageThresholdsUpdate,
    StorageUsageResponse,
)
from transformerlab.services.compute_provider import storage_usage_service, usage_report_service
from transformerlab.shared.models.user_model import get_async_session

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/report")
async def get_usage_report(
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Get usage report for REMOTE jobs in the team (owners only)."""
    team_id = owner_info["team_id"]
    return await usage_report_service.build_usage_report(session, team_id)


@router.get("/storage", response_model=StorageUsageResponse)
async def get_storage_usage(
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Latest cached storage snapshot for the team (owners only)."""
    team_id = owner_info["team_id"]
    snap = await storage_usage_service.get_latest_snapshot(session, team_id)
    breakdown = storage_usage_service._safe_json_loads(snap.breakdown_json) if snap else {}
    per_user = storage_usage_service._safe_json_loads(snap.per_user_json) if snap else {}
    return StorageUsageResponse(
        team_id=team_id,
        total_bytes=snap.total_bytes if snap else 0,
        total_gb=storage_usage_service.gb(snap.total_bytes if snap else 0),
        breakdown=breakdown,
        per_user=per_user,
        scanned_at=snap.scanned_at.isoformat() if snap and snap.scanned_at else None,
        global_limit_bytes=await storage_usage_service.get_global_per_org_limit_bytes(session),
        org_threshold_bytes=await storage_usage_service.get_org_notify_threshold_bytes(session, team_id),
        user_threshold_bytes=await storage_usage_service.get_user_notify_threshold_bytes(session, team_id),
    )


@router.post("/storage/rescan", response_model=StorageUsageResponse)
async def rescan_storage(
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Force a fresh scan for the caller's org and return the new snapshot."""
    team_id = owner_info["team_id"]
    result = await storage_usage_service.compute_org_storage(team_id)
    snap = await storage_usage_service.write_snapshot(session, team_id, result)
    await storage_usage_service.evaluate_thresholds(session, snap)
    return await get_storage_usage(owner_info=owner_info, session=session)


@router.get("/storage/alerts", response_model=StorageAlertsResponse)
async def get_storage_alerts(
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Active storage alerts for the current org (over global cap / org / user thresholds)."""
    team_id = owner_info["team_id"]
    alerts = await storage_usage_service.get_active_alerts(session, team_id)
    return StorageAlertsResponse(alerts=[StorageAlert(**a) for a in alerts])


@router.patch("/storage/thresholds")
async def update_storage_thresholds(
    payload: StorageThresholdsUpdate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Set the org/user notify thresholds (owners only)."""
    team_id = owner_info["team_id"]
    await storage_usage_service.set_thresholds(team_id, payload.org_threshold_bytes, payload.user_threshold_bytes)
    return {"status": "ok"}
