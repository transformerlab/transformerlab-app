"""Router for managing sweep jobs."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import sweep_job_service

router = APIRouter(prefix="/sweep", tags=["sweep"])


@router.get("/")
async def check_sweep_status_all(
    experiment_id: str = Query(..., description="Experiment ID to fetch all SWEEP jobs for"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Fetch all SWEEP jobs for an experiment and return current persisted status."""
    return await sweep_job_service.check_sweep_status_all(experiment_id)


@router.get("/{job_id}/status")
async def check_sweep_status(
    job_id: str,
    experiment_id: str = Query(..., description="Experiment ID for this sweep job"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Check status of a specific sweep job from current persisted values."""
    return await sweep_job_service.check_sweep_status(job_id, experiment_id)


@router.get("/{job_id}/results")
async def get_sweep_results(
    job_id: str,
    experiment_id: str = Query(..., description="Experiment ID for this sweep job"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get aggregated results from all child jobs in a sweep."""
    return await sweep_job_service.get_sweep_results(job_id, experiment_id)
