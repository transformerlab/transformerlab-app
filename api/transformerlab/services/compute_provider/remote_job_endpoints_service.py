"""REMOTE job quota backfill, status read, and checkpoint resume."""

import asyncio
import json
import os
import time
from typing import Any, Dict, Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.schemas.compute_providers import ResumeFromCheckpointRequest
from transformerlab.services import job_service, quota_service
from transformerlab.services.compute_provider.cluster_naming import sanitize_cluster_basename
from transformerlab.services.compute_provider.trackio_launch import (
    apply_trackio_launch_env,
    build_trackio_run_name,
    resolve_trackio_project_name,
)
from transformerlab.services.provider_service import get_team_provider, get_provider_instance
from transformerlab.shared.disk_space_utils import parse_disk_space_gb
from transformerlab.shared.github_utils import generate_github_clone_setup, read_github_pat_from_workspace
from transformerlab.shared.models.models import ProviderType
from lab import storage
from lab.dirs import get_job_checkpoints_dir, get_workspace_dir, set_organization_id
from lab.job_status import JobStatus
from lab.storage import STORAGE_PROVIDER


async def ensure_quota_recorded_for_completed_jobs(
    session: AsyncSession,
    team_id: str,
    experiment_id: Optional[str],
    job_id: Optional[str],
) -> Dict[str, Any]:
    if job_id:
        quota_recorded = await quota_service.ensure_quota_recorded_for_completed_job(
            session, job_id, experiment_id=experiment_id, team_id=team_id
        )
        return {
            "status": "success",
            "job_id": job_id,
            "quota_recorded": quota_recorded,
            "message": "Quota recorded"
            if quota_recorded
            else "No quota recording needed (already recorded or invalid)",
        }

    if not experiment_id:
        return {
            "status": "error",
            "message": "Either job_id or experiment_id must be provided",
        }

    jobs = await job_service.jobs_get_all(type="REMOTE", experiment_id=experiment_id)

    jobs_processed = 0
    jobs_recorded = 0

    for job in jobs:
        job_status = job.get("status", "")
        if job_status in (JobStatus.COMPLETE, JobStatus.STOPPED, JobStatus.FAILED, JobStatus.DELETED):
            jobs_processed += 1
            job_id_str = str(job.get("id", ""))
            if job_id_str:
                quota_recorded = await quota_service.ensure_quota_recorded_for_completed_job(
                    session, job_id_str, experiment_id=experiment_id, team_id=team_id
                )
                if quota_recorded:
                    jobs_recorded += 1

    await session.commit()

    return {
        "status": "success",
        "experiment_id": experiment_id,
        "jobs_processed": jobs_processed,
        "jobs_with_quota_recorded": jobs_recorded,
        "message": f"Processed {jobs_processed} completed REMOTE jobs, recorded quota for {jobs_recorded}",
    }


async def check_provider_job_status(job_id: str, experiment_id: str) -> Dict[str, Any]:
    job = await job_service.job_get(job_id, experiment_id=experiment_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_data = job.get("job_data") or {}
    return {
        "status": "success",
        "job_id": job_id,
        "current_status": job.get("status"),
        "launch_progress": job_data.get("launch_progress"),
    }


async def resume_remote_job_from_checkpoint(
    session: AsyncSession,
    team_id: str,
    user_and_team: dict,
    job_id: str,
    experiment_id: str,
    request: ResumeFromCheckpointRequest,
) -> Dict[str, Any]:
    original_job = await job_service.job_get(job_id, experiment_id=experiment_id)
    if not original_job or str(original_job.get("experiment_id")) != str(experiment_id):
        raise HTTPException(status_code=404, detail="Job not found")

    if original_job.get("type") != "REMOTE":
        raise HTTPException(status_code=400, detail="Resume from checkpoint is only supported for REMOTE jobs")

    job_data = original_job.get("job_data") or {}
    if not isinstance(job_data, dict):
        try:
            job_data = json.loads(job_data)
        except json.JSONDecodeError:
            job_data = {}

    provider_id = job_data.get("provider_id")
    run = job_data.get("run")
    if not provider_id or not run:
        raise HTTPException(
            status_code=400,
            detail="Original job is missing required fields (provider_id or run) for resume",
        )

    checkpoints_dir = await get_job_checkpoints_dir(job_id, experiment_id)
    checkpoint_path = storage.join(checkpoints_dir, request.checkpoint)
    if not await storage.exists(checkpoint_path):
        raise HTTPException(status_code=404, detail=f"Checkpoint '{request.checkpoint}' not found")

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    initial_status = JobStatus.INTERACTIVE if job_data.get("subtype") == "interactive" else JobStatus.LAUNCHING
    new_job_id = await job_service.job_create(
        type="REMOTE", status=initial_status, experiment_id=experiment_id, job_data={}
    )

    await job_service.job_update_job_data_insert_key_value(new_job_id, "parent_job_id", job_id, experiment_id)
    await job_service.job_update_job_data_insert_key_value(
        new_job_id, "resumed_from_checkpoint", request.checkpoint, experiment_id
    )

    config_fields = [
        "run",
        "task_name",
        "subtype",
        "interactive_type",
        "cpus",
        "memory",
        "disk_space",
        "accelerators",
        "num_nodes",
        "setup",
        "env_vars",
        "file_mounts",
        "parameters",
        "provider_id",
        "provider_type",
        "provider_name",
        "github_repo_url",
        "github_repo_dir",
        "github_repo_branch",
        "user_info",
        "team_id",
    ]

    await job_service.job_update_job_data_insert_key_values(
        new_job_id, {f: job_data[f] for f in config_fields if job_data.get(f) is not None}, experiment_id
    )

    user_id_str = str(user_and_team["user"].id)
    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
    except Exception as exc:
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experiment_id, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to initialize provider: {exc}") from exc

    base_name = job_data.get("task_name") or provider.name
    new_job_short_id = job_service.get_short_job_id(new_job_id)
    formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-{new_job_short_id}"

    user = user_and_team.get("user")
    user_info: Dict[str, Any] = {}
    if user:
        if getattr(user, "first_name", None) or getattr(user, "last_name", None):
            user_info["name"] = " ".join(
                part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
            ).strip()
        if getattr(user, "email", None):
            user_info["email"] = getattr(user, "email")

    provider_display_name = job_data.get("provider_name") or provider.name

    env_vars = (job_data.get("env_vars") or {}).copy()
    # Explicitly pass storage provider to launched jobs so runtime behavior
    # does not depend on inherited parent env.
    env_vars["TFL_STORAGE_PROVIDER"] = STORAGE_PROVIDER
    env_vars["_TFL_JOB_ID"] = str(new_job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = experiment_id
    env_vars["TFL_EXPERIMENT_ID"] = experiment_id
    if user:
        env_vars["_TFL_USER_ID"] = str(user.id)

    # Preserve Trackio behavior on checkpoint resumes, but remap job-specific paths
    # to the new job id so resumed runs do not write into the old job's local dir.
    trackio_project_name_for_job: str | None = None
    trackio_run_name_for_job: str | None = None
    old_trackio_project_name = (job_data.get("trackio_project_name") or "").strip()
    old_trackio_auto = str(env_vars.get("TLAB_TRACKIO_AUTO_INIT", "")).lower() == "true"
    if old_trackio_auto or old_trackio_project_name:
        project_name = resolve_trackio_project_name(
            experiment_id,
            old_trackio_project_name or str(env_vars.get("TLAB_TRACKIO_PROJECT_NAME", "")).strip(),
        )
        trackio_run_name = build_trackio_run_name(job_data.get("task_name"), new_job_short_id)
        trackio_project_name_for_job = project_name
        trackio_run_name_for_job = trackio_run_name
        await apply_trackio_launch_env(
            env_vars,
            job_id=new_job_id,
            experiment_id=experiment_id,
            project_name=project_name,
            run_name=trackio_run_name,
        )

    tfl_storage_uri = None
    if STORAGE_PROVIDER == "localfs" and os.getenv("TFL_STORAGE_URI") and team_id:
        tfl_storage_uri = storage.join(os.getenv("TFL_STORAGE_URI", ""), "orgs", str(team_id), "workspace")
    else:
        try:
            storage_root = await storage.root_uri()
            if storage_root:
                if storage.is_remote_path(storage_root):
                    tfl_storage_uri = storage_root
                elif STORAGE_PROVIDER == "localfs":
                    tfl_storage_uri = storage_root
        except Exception:
            pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri

    if provider.type == ProviderType.LOCAL.value and team_id:
        set_organization_id(team_id)
        try:
            workspace_dir = await get_workspace_dir()
            if workspace_dir and not storage.is_remote_path(workspace_dir):
                env_vars["TFL_WORKSPACE_DIR"] = workspace_dir
        finally:
            set_organization_id(None)

    setup_commands: list[str] = []
    github_repo_url = job_data.get("github_repo_url")
    if github_repo_url:
        workspace_dir = await get_workspace_dir()
        user_id_for_pat = str(user.id) if user else None
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id_for_pat)
        github_setup = generate_github_clone_setup(
            repo_url=github_repo_url,
            directory=job_data.get("github_repo_dir"),
            github_pat=github_pat,
            branch=job_data.get("github_repo_branch"),
        )
        setup_commands.append(github_setup)

    if provider.type == ProviderType.RUNPOD.value:
        env_vars["UV_SYSTEM_PYTHON"] = "1"
    if provider.type == ProviderType.RUNPOD.value:
        setup_commands.append("curl -LsSf https://astral.sh/uv/install.sh | sh")

    original_setup = job_data.get("setup")
    if original_setup:
        setup_commands.append(original_setup)

    final_setup = ";".join(setup_commands) if setup_commands else None

    launch_job_data = {
        "task_name": job_data.get("task_name"),
        "run": run,
        "cluster_name": formatted_cluster_name,
        "subtype": job_data.get("subtype"),
        "interactive_type": job_data.get("interactive_type"),
        "cpus": job_data.get("cpus"),
        "memory": job_data.get("memory"),
        "disk_space": job_data.get("disk_space"),
        "accelerators": job_data.get("accelerators"),
        "num_nodes": job_data.get("num_nodes"),
        "setup": final_setup,
        "env_vars": env_vars if env_vars else None,
        "file_mounts": job_data.get("file_mounts") or None,
        "parameters": job_data.get("parameters") or None,
        "provider_id": provider.id,
        "provider_type": provider.type,
        "provider_name": provider_display_name,
        "user_info": user_info or None,
        "team_id": team_id,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }
    if trackio_project_name_for_job is not None:
        launch_job_data["trackio_project_name"] = trackio_project_name_for_job
    if trackio_run_name_for_job is not None:
        launch_job_data["trackio_run_name"] = trackio_run_name_for_job

    await job_service.job_update_job_data_insert_key_values(
        new_job_id, {k: v for k, v in launch_job_data.items() if v is not None}, experiment_id
    )

    disk_size = parse_disk_space_gb(job_data.get("disk_space"))

    cluster_config = ClusterConfig(
        cluster_name=formatted_cluster_name,
        provider_name=provider_display_name,
        provider_id=provider.id,
        run=run,
        setup=final_setup,
        env_vars=env_vars,
        cpus=job_data.get("cpus"),
        memory=job_data.get("memory"),
        accelerators=job_data.get("accelerators"),
        num_nodes=job_data.get("num_nodes"),
        disk_size=disk_size,
        file_mounts=job_data.get("file_mounts") or {},
        provider_config={"requested_disk_space": job_data.get("disk_space")},
    )

    try:
        await asyncio.to_thread(provider_instance.launch_cluster, formatted_cluster_name, cluster_config)
        return {
            "job_id": new_job_id,
            "message": "Job relaunched from checkpoint",
            "cluster_name": formatted_cluster_name,
        }
    except Exception as exc:
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experiment_id, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to relaunch job: {exc}") from exc
