from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import remote_job_endpoints_service
from transformerlab.schemas.compute_providers import ResumeFromCheckpointRequest

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("/ensure-quota-recorded")
async def ensure_quota_recorded_for_completed_jobs(
    experiment_id: Optional[str] = Query(None, description="Optional experiment ID to check jobs in"),
    job_id: Optional[str] = Query(None, description="Optional specific job ID to check"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Check for completed REMOTE jobs without quota records and record quota usage for them."""
    team_id = user_and_team["team_id"]
    return await remote_job_endpoints_service.ensure_quota_recorded_for_completed_jobs(
        session, team_id, experiment_id, job_id
    )


@router.get("/{job_id}/check-status")
async def check_provider_job_status(
    job_id: str,
    experiment_id: str = Query(..., description="Experiment ID for this job"),
    user_and_team=Depends(get_user_and_team),
):
    """Return the current status of a REMOTE job (read-only)."""
    return await remote_job_endpoints_service.check_provider_job_status(job_id, experiment_id)


@router.post("/{job_id}/resume_from_checkpoint")
async def resume_from_checkpoint(
    job_id: str,
    experimentId: str = Query(..., description="Experiment ID"),
    request: ResumeFromCheckpointRequest = ...,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Resume a REMOTE job from a checkpoint by creating a new job with the same configuration."""
    team_id = user_and_team["team_id"]
    return await remote_job_endpoints_service.resume_remote_job_from_checkpoint(
        session, team_id, user_and_team, job_id, experimentId, request
    )
