"""Router for cluster management endpoints."""

from typing import List, Optional, Union

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import cluster_management_service
from transformerlab.compute_providers.models import (
    ClusterStatus,
    ResourceInfo,
    JobConfig,
    JobInfo,
    JobState,
)

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("/")
async def list_clusters_detailed(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get detailed list of clusters for a provider."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.list_clusters_detailed(session, team_id, user_id_str, provider_id)


@router.get("/{cluster_name}/status", response_model=ClusterStatus)
async def get_cluster_status(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get the status of a cluster."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.get_cluster_status(session, team_id, user_id_str, provider_id, cluster_name)


@router.get("/{cluster_name}/resources", response_model=ResourceInfo)
async def get_cluster_resources(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get resource information for a cluster."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.get_cluster_resources(
        session, team_id, user_id_str, provider_id, cluster_name
    )


@router.post("/{cluster_name}/stop")
async def stop_cluster(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Stop a running cluster."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.stop_cluster(session, team_id, user_id_str, provider_id, cluster_name)


@router.post("/{cluster_name}/jobs")
async def submit_job(
    provider_id: str,
    cluster_name: str,
    job_config: JobConfig,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Submit a job to an existing cluster."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.submit_job_to_cluster(
        session, team_id, user_id_str, provider_id, cluster_name, job_config
    )


@router.get("/{cluster_name}/jobs", response_model=List[JobInfo])
async def list_jobs(
    provider_id: str,
    cluster_name: str,
    state: Optional[JobState] = Query(None, description="Filter jobs by state"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """List all jobs for a cluster."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.list_jobs_for_cluster(
        session, team_id, user_id_str, provider_id, cluster_name, state
    )


@router.get("/{cluster_name}/jobs/{job_id}", response_model=JobInfo)
async def get_job_info(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get information about a specific job."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.get_cluster_job_info(
        session, team_id, user_id_str, provider_id, cluster_name, job_id
    )


@router.get("/{cluster_name}/jobs/{job_id}/logs")
async def get_job_logs(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    tail_lines: Optional[int] = Query(None, description="Number of lines to retrieve from the end"),
    follow: bool = Query(False, description="Whether to stream/follow logs"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get logs for a job."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.get_cluster_job_logs(
        session, team_id, user_id_str, provider_id, cluster_name, job_id, tail_lines, follow
    )


@router.delete("/{cluster_name}/jobs/{job_id}")
async def cancel_job(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Cancel a running or queued job."""
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)
    return await cluster_management_service.cancel_cluster_job(
        session, team_id, user_id_str, provider_id, cluster_name, job_id
    )
