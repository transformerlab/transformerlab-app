"""Shared Trackio launch helpers for provider-backed jobs."""

from typing import Any

from lab import storage
from lab.dirs import get_trackio_dir, get_workspace_dir
from werkzeug.utils import secure_filename


def resolve_trackio_project_name(experiment_id: str | int, requested_project_name: str | None) -> str:
    return (requested_project_name or "").strip() or str(experiment_id)


def build_trackio_run_name(task_name: str | None, job_short_id: str) -> str:
    return f"{task_name or 'task'}-job-{job_short_id}"


async def apply_trackio_launch_env(
    env_vars: dict[str, Any],
    *,
    job_id: str | int,
    experiment_id: str | int,
    project_name: str,
    run_name: str,
) -> None:
    env_vars["TLAB_TRACKIO_AUTO_INIT"] = "true"
    env_vars["TLAB_TRACKIO_PROJECT_NAME"] = project_name
    env_vars["TLAB_TRACKIO_RUN_NAME"] = run_name
    env_vars["TRACKIO_DIR"] = get_trackio_dir(job_id)

    workspace_dir = await get_workspace_dir()
    shared_path = storage.join(
        workspace_dir,
        "trackio_runs",
        secure_filename(str(experiment_id)),
        secure_filename(project_name),
    )
    await storage.makedirs(shared_path, exist_ok=True)
