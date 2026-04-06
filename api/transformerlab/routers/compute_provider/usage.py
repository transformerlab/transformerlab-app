"""Usage reporting routes for compute providers."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import require_team_owner
from transformerlab.services.compute_provider import usage_report_service

router = APIRouter(prefix="/usage", tags=["usage"])


@router.get("/report")
async def get_usage_report(
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Get usage report for REMOTE jobs in the team (owners only)."""
    team_id = owner_info["team_id"]
    return await usage_report_service.build_usage_report(session, team_id)
