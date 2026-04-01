"""
Team-level visibility: whether members see all jobs/tasks or only their own.

Stored in Config with key members_job_visibility (team-wide: user_id NULL).
"""

from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import HTTPException

import transformerlab.db.db as db
from transformerlab.shared.models.models import TeamRole, User

MEMBERS_JOB_VISIBILITY_KEY = "members_job_visibility"
VALID_VISIBILITY_MODES = frozenset({"all", "own"})
MembersJobVisibility = Literal["all", "own"]


async def get_members_job_visibility(team_id: str) -> MembersJobVisibility:
    raw = await db.config_get(key=MEMBERS_JOB_VISIBILITY_KEY, user_id=None, team_id=team_id)
    if raw is None or raw == "":
        return "all"
    mode = str(raw).strip().lower()
    if mode in VALID_VISIBILITY_MODES:
        return mode  # type: ignore[return-value]
    return "all"


def viewer_may_see_job(
    *,
    job: dict[str, Any],
    viewer_user: User,
    role: str,
    visibility: MembersJobVisibility,
) -> bool:
    """Whether the viewer may see this job row (list or detail). Owners always see all."""
    if visibility == "all":
        return True
    if role == TeamRole.OWNER.value:
        return True

    job_data = job.get("job_data")
    if isinstance(job_data, str):
        try:
            job_data = json.loads(job_data)
        except Exception:
            job_data = {}
    if not isinstance(job_data, dict):
        job_data = {}

    created_by = job_data.get("created_by_user_id")
    if created_by is not None and str(created_by) == str(viewer_user.id):
        return True

    user_info = job_data.get("user_info") or {}
    if isinstance(user_info, dict):
        email = user_info.get("email")
        if email and viewer_user.email and str(email).lower() == str(viewer_user.email).lower():
            return True

    return False


def viewer_may_see_task(
    *,
    task: dict[str, Any],
    viewer_user: User,
    role: str,
    visibility: MembersJobVisibility,
) -> bool:
    """Whether the viewer may see this task template. Owners always see all."""
    if visibility == "all":
        return True
    if role == TeamRole.OWNER.value:
        return True

    created_by = task.get("created_by_user_id")
    if created_by is None:
        return False
    return str(created_by) == str(viewer_user.id)


async def set_members_job_visibility(team_id: str, mode: MembersJobVisibility) -> None:
    if mode not in VALID_VISIBILITY_MODES:
        raise ValueError(f"Invalid mode: {mode}")
    await db.config_set(key=MEMBERS_JOB_VISIBILITY_KEY, value=mode, user_id=None, team_id=team_id)


async def filter_jobs_for_viewer(jobs: list[dict[str, Any]], user_and_team: dict) -> list[dict[str, Any]]:
    """Filter a jobs list API response for the current viewer."""
    visibility = await get_members_job_visibility(user_and_team["team_id"])
    if visibility == "all":
        return jobs
    if user_and_team["role"] == TeamRole.OWNER.value:
        return jobs
    user = user_and_team["user"]
    role = user_and_team["role"]
    return [j for j in jobs if viewer_may_see_job(job=j, viewer_user=user, role=role, visibility=visibility)]


async def filter_tasks_for_viewer(tasks: list[dict[str, Any]], user_and_team: dict) -> list[dict[str, Any]]:
    """Filter task template list for the current viewer."""
    visibility = await get_members_job_visibility(user_and_team["team_id"])
    if visibility == "all":
        return tasks
    if user_and_team["role"] == TeamRole.OWNER.value:
        return tasks
    user = user_and_team["user"]
    role = user_and_team["role"]
    return [t for t in tasks if viewer_may_see_task(task=t, viewer_user=user, role=role, visibility=visibility)]


async def ensure_job_accessible(*, experiment_id: str, job_id: str, user_and_team: dict) -> dict[str, Any]:
    """Load job and raise 404/403 if missing or not visible to this user."""
    from transformerlab.services import job_service

    visibility = await get_members_job_visibility(user_and_team["team_id"])
    job = await job_service.job_get_cached(job_id, experiment_id=experiment_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    if not viewer_may_see_job(
        job=job,
        viewer_user=user_and_team["user"],
        role=user_and_team["role"],
        visibility=visibility,
    ):
        raise HTTPException(status_code=403, detail="You do not have access to this job")
    return job


async def ensure_task_accessible(*, task: dict[str, Any], user_and_team: dict) -> None:
    visibility = await get_members_job_visibility(user_and_team["team_id"])
    if viewer_may_see_task(
        task=task,
        viewer_user=user_and_team["user"],
        role=user_and_team["role"],
        visibility=visibility,
    ):
        return
    raise HTTPException(status_code=403, detail="You do not have access to this task")


async def ensure_task_accessible_by_id(task_id: str, experiment_id: str, user_and_team: dict) -> dict[str, Any]:
    from transformerlab.services.task_service import task_service

    task = await task_service.task_get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if str(task.get("experiment_id", "")) != str(experiment_id):
        raise HTTPException(status_code=404, detail="Task not found")
    await ensure_task_accessible(task=task, user_and_team=user_and_team)
    return task
