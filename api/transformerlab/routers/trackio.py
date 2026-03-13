from fastapi import APIRouter, Depends

from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.trackio_service import (
    list_trackio_projects,
    start_trackio_for_job,
    stop_trackio_for_job,
)


router = APIRouter(tags=["train"])


@router.get("/trackio/start")
async def trackio_start(job_id: str, user_and_team=Depends(get_user_and_team)) -> dict:
    """
    Start a Trackio dashboard for the given job and return its local URL.

    We pass through org/team and experiment context so the Trackio cache directory can
    be scoped to the correct workspace and kept isolated per job.
    """
    org_id = str(user_and_team.get("team_id") or "")
    experiment_id = user_and_team.get("experiment_id")
    return await start_trackio_for_job(job_id, org_id=org_id, experiment_id=experiment_id)


@router.get("/trackio/projects")
async def trackio_projects(experiment_id: str, user_and_team=Depends(get_user_and_team)) -> dict:
    """
    List existing TrackIO project names for an experiment (for shared-project dropdown).
    """
    _ = user_and_team
    projects = await list_trackio_projects(experiment_id)
    return {"projects": projects}


@router.get("/trackio/stop")
async def trackio_stop(job_id: str, user_and_team=Depends(get_user_and_team)) -> dict:
    """
    Stop the Trackio dashboard subprocess for the given job, if one is running.
    """
    _ = user_and_team  # enforce auth/team context, even if unused
    await stop_trackio_for_job(job_id)
    return {"status": "stopped"}
