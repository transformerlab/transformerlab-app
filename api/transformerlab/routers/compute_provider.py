"""Router for managing team-scoped compute providers."""

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from werkzeug.utils import secure_filename

from lab import storage
from lab.dirs import get_workspace_dir, set_organization_id
from lab.job_status import JobStatus
from transformerlab.compute_providers.models import (
    ClusterStatus,
    JobConfig,
    JobInfo,
    JobState,
    ResourceInfo,
)
from transformerlab.routers.auth import get_user_and_team, require_team_owner
from transformerlab.routers.dependencies import ProviderContext, get_provider_for_request
from transformerlab.schemas.compute_providers import (
    ProviderCreate,
    ProviderRead,
    ProviderTemplateLaunchRequest,
    ProviderUpdate,
    ProviderTemplateFileUploadResponse,
    ResumeFromCheckpointRequest,
    mask_sensitive_config,
)
from transformerlab.services import compute_provider_service, job_service, quota_service
from transformerlab.services.provider_service import (
    create_team_provider,
    delete_team_provider,
    get_provider_instance,
    get_team_provider,
    list_enabled_team_providers,
    list_team_providers,
    update_team_provider,
    _local_providers_disabled,
)
from transformerlab.shared.models.models import ProviderType, TeamRole
from transformerlab.shared.models.user_model import get_async_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compute_provider", tags=["compute_provider"])


# ==========================================================================
# File upload
# ==========================================================================


@router.post("/{provider_id}/task/{task_id}/file-upload", response_model=ProviderTemplateFileUploadResponse)
async def upload_task_file_for_provider(
    provider_id: str,
    task_id: str,
    request: Request,
    file: UploadFile = File(...),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload a single file for a provider-backed task."""
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        workspace_dir = await get_workspace_dir()
        if not workspace_dir:
            raise RuntimeError("Workspace directory is not configured")

        import uuid

        uploads_root = storage.join(workspace_dir, "uploads", "task")
        await storage.makedirs(uploads_root, exist_ok=True)

        task_dir = storage.join(uploads_root, str(task_id))
        await storage.makedirs(task_dir, exist_ok=True)

        original_name = file.filename or "uploaded_file"
        suffix = uuid.uuid4().hex[:8]
        safe_name = original_name.split("/")[-1].split("\\")[-1]
        stored_filename = f"{safe_name}.{suffix}"
        stored_path = storage.join(task_dir, stored_filename)

        await file.seek(0)
        content = await file.read()
        async with await storage.open(stored_path, "wb") as f:
            await f.write(content)

        return ProviderTemplateFileUploadResponse(
            status="success", stored_path=stored_path, message="File uploaded successfully"
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Template file upload error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to upload template file")


# ==========================================================================
# Provider CRUD
# ==========================================================================


@router.get("/", response_model=List[ProviderRead])
async def list_providers(
    include_disabled: bool = Query(False, description="Include disabled providers (admin view)"),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """List all providers for the current team."""
    team_id = user_and_team["team_id"]
    if include_disabled:
        if user_and_team.get("role") != TeamRole.OWNER.value:
            raise HTTPException(status_code=403, detail="Only team owners can view disabled providers")
        providers = await list_team_providers(session, team_id)
    else:
        providers = await list_enabled_team_providers(session, team_id)

    return [
        ProviderRead(
            id=p.id,
            team_id=p.team_id,
            name=p.name,
            type=p.type,
            config=mask_sensitive_config(p.config or {}, p.type),
            created_by_user_id=p.created_by_user_id,
            created_at=p.created_at,
            updated_at=p.updated_at,
            disabled=p.disabled,
        )
        for p in providers
    ]


@router.post("/", response_model=ProviderRead)
async def create_provider(
    provider_data: ProviderCreate,
    owner_info: dict = Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new provider for the team."""
    team_id = owner_info["team_id"]
    user = owner_info["user"]

    if provider_data.type not in [ProviderType.SLURM, ProviderType.SKYPILOT, ProviderType.RUNPOD, ProviderType.LOCAL]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider type. Must be one of: {ProviderType.SLURM.value}, {ProviderType.SKYPILOT.value}, {ProviderType.RUNPOD.value}, {ProviderType.LOCAL.value}",
        )

    if provider_data.type == ProviderType.LOCAL and _local_providers_disabled():
        raise HTTPException(status_code=400, detail="Local providers are disabled by server configuration.")

    existing = await list_team_providers(session, team_id)
    for ep in existing:
        if ep.name == provider_data.name:
            raise HTTPException(
                status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
            )

    config_dict = provider_data.config.model_dump(exclude_none=True)

    provider = await create_team_provider(
        session=session,
        team_id=team_id,
        name=provider_data.name,
        provider_type=provider_data.type.value
        if isinstance(provider_data.type, ProviderType)
        else str(provider_data.type),
        config=config_dict,
        created_by_user_id=str(user.id),
    )

    # Auto-start local provider setup in the background
    if provider.type == ProviderType.LOCAL.value:
        try:
            user_id_str = str(user.id)
            provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

            set_organization_id(team_id)
            try:
                workspace_dir = await get_workspace_dir()
            finally:
                set_organization_id(None)

            status_path = _get_provider_setup_status_path(workspace_dir, team_id, str(provider.id))
            try:
                status_path.write_text(
                    json.dumps(
                        {
                            "phase": "provider_setup_start",
                            "percent": 0,
                            "message": "Starting local provider setup...",
                            "done": False,
                            "error": None,
                            "timestamp": time.time(),
                        }
                    ),
                    encoding="utf-8",
                )
            except Exception:
                logger.exception(
                    "Failed to seed provider setup status for newly created local provider %s", provider.id
                )

            asyncio.create_task(_run_local_provider_setup_background(provider_instance, status_path))
        except Exception:
            logger.exception("Failed to auto-start setup for newly created local provider %s", provider.id)

    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
        disabled=provider.disabled,
    )


@router.get("/usage-report")
async def get_usage_report(
    owner_info: dict = Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Get usage report for REMOTE jobs in the team."""
    from datetime import datetime
    from lab import Experiment

    team_id = owner_info["team_id"]

    existing_provider_ids: set[str] = set()
    existing_provider_names: set[str] = set()
    try:
        current_providers = await list_team_providers(session, team_id)
        if current_providers:
            existing_provider_ids = {str(p.id) for p in current_providers if p.id}
            existing_provider_names = {p.name for p in current_providers if p.name}
    except Exception as e:
        print(f"Error getting current providers for team {team_id}: {e}")
        import traceback

        traceback.print_exc()

    try:
        experiments_data = await Experiment.get_all()
        experiments = [exp.get("id") for exp in experiments_data if exp.get("id")]
    except Exception as e:
        print(f"Error getting experiments: {e}")
        experiments = []

    remote_jobs: list[dict] = []
    for experiment_id in experiments:
        try:
            jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="REMOTE")
            for job in jobs:
                job_data = job.get("job_data", {}) or {}
                if isinstance(job_data, str):
                    try:
                        job_data = json.loads(job_data)
                    except (json.JSONDecodeError, TypeError):
                        job_data = {}

                if not (job_data.get("provider_id") or job_data.get("provider_name")):
                    continue

                duration_seconds = None
                start_time = job_data.get("start_time")
                end_time = job_data.get("end_time")

                if start_time and end_time:
                    try:
                        start = (
                            datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                            if isinstance(start_time, str)
                            else start_time
                        )
                        end = (
                            datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                            if isinstance(end_time, str)
                            else end_time
                        )
                        duration_seconds = (end - start).total_seconds()
                    except Exception as e:
                        print(f"Error calculating duration for job {job.get('id')}: {e}")

                if not (start_time and end_time and duration_seconds is not None and duration_seconds > 0):
                    continue

                user_info = job_data.get("user_info", {}) or {}
                user_email = user_info.get("email") or "Unknown"
                user_name = user_info.get("name") or user_email

                provider_id = job_data.get("provider_id")
                provider_name = job_data.get("provider_name") or "Unknown"
                provider_exists = False

                provider_id_str = str(provider_id) if provider_id else None
                if existing_provider_ids or existing_provider_names:
                    if provider_id_str and provider_id_str in existing_provider_ids:
                        provider_exists = True
                    elif provider_name and provider_name in existing_provider_names:
                        provider_exists = True

                if not provider_exists and (existing_provider_ids or existing_provider_names):
                    if provider_id_str or (provider_name and provider_name != "Unknown"):
                        if provider_name and not provider_name.endswith("(Deleted)"):
                            provider_name = f"{provider_name} (Deleted)"

                remote_jobs.append(
                    {
                        "job_id": job.get("id"),
                        "experiment_id": job.get("experiment_id"),
                        "status": job.get("status"),
                        "provider_id": provider_id,
                        "provider_name": provider_name,
                        "provider_type": job_data.get("provider_type"),
                        "provider_exists": provider_exists,
                        "user_email": user_email,
                        "user_name": user_name,
                        "start_time": start_time,
                        "end_time": end_time,
                        "duration_seconds": duration_seconds,
                        "resources": {
                            "cpus": job_data.get("cpus"),
                            "memory": job_data.get("memory"),
                            "disk_space": job_data.get("disk_space"),
                            "accelerators": job_data.get("accelerators"),
                            "num_nodes": job_data.get("num_nodes", 1),
                        },
                        "cluster_name": job_data.get("cluster_name"),
                        "task_name": job_data.get("task_name"),
                    }
                )
        except Exception as e:
            print(f"Error processing jobs for experiment {experiment_id}: {e}")
            continue

    # Aggregate by user
    usage_by_user: dict = {}
    for job in remote_jobs:
        ue = job["user_email"]
        if ue not in usage_by_user:
            usage_by_user[ue] = {
                "user_email": ue,
                "user_name": job["user_name"],
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }
        usage_by_user[ue]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_user[ue]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_user[ue]["jobs"].append(job)

    # Aggregate by provider
    usage_by_provider: dict = {}
    for job in remote_jobs:
        pkey = job.get("provider_id") or job["provider_name"]
        if pkey not in usage_by_provider:
            usage_by_provider[pkey] = {
                "provider_name": job["provider_name"],
                "provider_type": job["provider_type"],
                "provider_exists": job.get("provider_exists", True),
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }
        usage_by_provider[pkey]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_provider[pkey]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_provider[pkey]["jobs"].append(job)

    return {
        "summary": {
            "total_jobs": len(remote_jobs),
            "total_users": len(usage_by_user),
            "total_providers": len(usage_by_provider),
        },
        "by_user": sorted(usage_by_user.values(), key=lambda x: x["total_duration_seconds"], reverse=True),
        "by_provider": sorted(usage_by_provider.values(), key=lambda x: x["total_duration_seconds"], reverse=True),
        "all_jobs": remote_jobs,
    }


@router.get("/org-ssh-public-key")
async def get_org_ssh_public_key_endpoint(user_and_team: dict = Depends(get_user_and_team)):
    """Get the organization's SSH public key."""
    from transformerlab.services.ssh_key_service import get_org_ssh_public_key

    team_id = user_and_team["team_id"]
    try:
        public_key = await get_org_ssh_public_key(team_id)
        return {
            "public_key": public_key,
            "instructions": "Add this public key to ~/.ssh/authorized_keys on your SLURM login node for the user account you specify in Provider Settings.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get SSH public key: {str(e)}")


# ==========================================================================
# User settings
# ==========================================================================


@router.get("/user-settings/{provider_id}")
async def get_user_provider_settings(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get user-specific settings for a provider."""
    import transformerlab.db.db as db
    from transformerlab.services.user_slurm_key_service import user_slurm_key_exists

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    slurm_user = await db.config_get(key=f"provider:{provider_id}:slurm_user", user_id=user_id, team_id=team_id)
    custom_sbatch_flags = await db.config_get(
        key=f"provider:{provider_id}:slurm_custom_sbatch_flags", user_id=user_id, team_id=team_id
    )

    has_ssh_key = False
    if provider.type == ProviderType.SLURM.value:
        has_ssh_key = await user_slurm_key_exists(team_id, provider_id, user_id)

    return {
        "provider_id": provider_id,
        "slurm_user": slurm_user,
        "custom_sbatch_flags": custom_sbatch_flags,
        "has_ssh_key": has_ssh_key,
    }


@router.put("/user-settings/{provider_id}")
async def set_user_provider_settings(
    provider_id: str,
    body: Optional[dict] = Body(None),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Set user-specific settings for a provider."""
    import transformerlab.db.db as db

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(
            status_code=400, detail="User-specific SLURM settings are only available for SLURM providers"
        )

    slurm_user = (body or {}).get("slurm_user")
    if isinstance(slurm_user, str):
        slurm_user = slurm_user.strip() or None
    elif slurm_user is not None and not isinstance(slurm_user, str):
        slurm_user = str(slurm_user).strip() or None

    raw_flags = (body or {}).get("custom_sbatch_flags")
    if isinstance(raw_flags, str):
        custom_sbatch_flags = raw_flags.strip() or None
    elif raw_flags is None:
        custom_sbatch_flags = None
    else:
        custom_sbatch_flags = str(raw_flags).strip() or None

    await db.config_set(
        key=f"provider:{provider_id}:slurm_user", value=slurm_user or "", user_id=user_id, team_id=team_id
    )
    await db.config_set(
        key=f"provider:{provider_id}:slurm_custom_sbatch_flags",
        value=custom_sbatch_flags or "",
        user_id=user_id,
        team_id=team_id,
    )

    has_ssh_key = False
    if provider.type == ProviderType.SLURM.value:
        from transformerlab.services.user_slurm_key_service import user_slurm_key_exists

        has_ssh_key = await user_slurm_key_exists(team_id, provider_id, user_id)

    return {
        "provider_id": provider_id,
        "slurm_user": slurm_user,
        "custom_sbatch_flags": custom_sbatch_flags,
        "has_ssh_key": has_ssh_key,
    }


@router.post("/user-settings/{provider_id}/ssh-key")
async def upload_user_slurm_ssh_key(
    provider_id: str,
    body: dict = Body(...),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload a user's SLURM SSH private key for a provider."""
    from transformerlab.services.user_slurm_key_service import save_user_slurm_key

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(status_code=400, detail="SSH key upload is only available for SLURM providers")

    private_key = body.get("private_key")
    if not private_key or not isinstance(private_key, str):
        raise HTTPException(status_code=400, detail="private_key is required and must be a string")
    private_key = private_key.strip()
    if not private_key:
        raise HTTPException(status_code=400, detail="private_key cannot be empty")
    if not (private_key.startswith("-----BEGIN") or "PRIVATE KEY" in private_key or "BEGIN RSA" in private_key):
        raise HTTPException(
            status_code=400,
            detail="Invalid private key format. Expected PEM or OpenSSH format starting with '-----BEGIN'",
        )

    try:
        await save_user_slurm_key(team_id, provider_id, user_id, private_key)
        return {"status": "success", "provider_id": provider_id, "message": "SSH private key uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save SSH key: {str(e)}")


@router.delete("/user-settings/{provider_id}/ssh-key")
async def delete_user_slurm_ssh_key(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a user's SLURM SSH private key for a provider."""
    from transformerlab.services.user_slurm_key_service import delete_user_slurm_key

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(status_code=400, detail="SSH key deletion is only available for SLURM providers")

    try:
        await delete_user_slurm_key(team_id, provider_id, user_id)
        return {"status": "success", "provider_id": provider_id, "message": "SSH private key deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete SSH key: {str(e)}")


@router.get("/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get a specific provider by ID."""
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
        disabled=provider.disabled,
    )


@router.patch("/{provider_id}", response_model=ProviderRead)
async def update_provider(
    provider_id: str,
    provider_data: ProviderUpdate,
    owner_info: dict = Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Update a provider."""
    team_id = owner_info["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider_data.name and provider_data.name != provider.name:
        existing = await list_team_providers(session, team_id)
        for ep in existing:
            if ep.id != provider_id and ep.name == provider_data.name:
                raise HTTPException(
                    status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
                )

    update_config = None
    if provider_data.config:
        existing_config = provider.config or {}
        new_config = provider_data.config.model_dump(exclude_none=True)
        update_config = {**existing_config, **new_config}

    update_disabled = provider_data.disabled if provider_data.disabled is not None else None

    provider = await update_team_provider(
        session=session, provider=provider, name=provider_data.name, config=update_config, disabled=update_disabled
    )

    masked_config = mask_sensitive_config(provider.config or {}, provider.type)
    return ProviderRead(
        id=provider.id,
        team_id=provider.team_id,
        name=provider.name,
        type=provider.type,
        config=masked_config,
        created_by_user_id=provider.created_by_user_id,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
        disabled=provider.disabled,
    )


@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: str,
    owner_info: dict = Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete a provider."""
    team_id = owner_info["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    await delete_team_provider(session, provider)
    return {"message": "Provider deleted successfully"}


@router.get("/{provider_id}/check")
async def check_provider(ctx: ProviderContext = Depends(get_provider_for_request)):
    """Check if a compute provider is active and accessible."""
    try:
        is_active = await asyncio.to_thread(ctx.provider_instance.check)
        return {"status": is_active}
    except Exception as e:
        print(f"Failed to check provider: {str(e)}")
        return {"status": False}


# ==========================================================================
# Task launch / sweep / resume
# ==========================================================================


@router.post("/{provider_id}/task/launch")
async def launch_template_on_provider(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Launch a task on a provider. Handles both single and sweep launches."""
    team_id = user_and_team["team_id"]
    user = user_and_team["user"]

    # Sweep path
    if request.run_sweeps and request.sweep_config:
        from itertools import product

        param_names = list(request.sweep_config.keys())
        param_values = [request.sweep_config[name] for name in param_names]
        configs = list(product(*param_values))
        total_configs = len(configs)

        parent_job_id = await compute_provider_service.create_sweep_parent_job(
            provider_id=provider_id,
            request=request,
            user=user,
            team_id=team_id,
            session=session,
            sweep_config=request.sweep_config,
            sweep_metric=request.sweep_metric or "eval/loss",
            lower_is_better=request.lower_is_better if request.lower_is_better is not None else True,
            total_configs=total_configs,
        )

        base_params_for_sweep: dict = {}
        if request.parameters:
            base_params_for_sweep = request.parameters.copy()
        if request.config:
            base_params_for_sweep.update(request.config)

        asyncio.create_task(
            compute_provider_service.launch_sweep_jobs(
                provider_id=provider_id,
                request=request,
                user_and_team=user_and_team,
                base_parameters=base_params_for_sweep,
                sweep_config=request.sweep_config,
                sweep_metric=request.sweep_metric or "eval/loss",
                lower_is_better=request.lower_is_better if request.lower_is_better is not None else True,
                parent_job_id=parent_job_id,
            )
        )

        return {
            "status": "success",
            "job_id": parent_job_id,
            "job_type": "SWEEP",
            "total_configs": total_configs,
            "message": f"Sweep created with {total_configs} configurations. Child jobs are being launched in the background.",
        }

    # Normal single-job launch
    return await compute_provider_service.launch_task(
        provider_id=provider_id,
        request=request,
        user=user,
        team_id=team_id,
        session=session,
    )


@router.post("/jobs/{job_id}/resume_from_checkpoint")
async def resume_from_checkpoint_endpoint(
    job_id: str,
    experimentId: str = Query(..., description="Experiment ID"),
    request: ResumeFromCheckpointRequest = ...,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Resume a REMOTE job from a checkpoint."""
    return await compute_provider_service.resume_from_checkpoint(
        job_id=job_id,
        experiment_id=experimentId,
        request=request,
        user=user_and_team["user"],
        team_id=user_and_team["team_id"],
        session=session,
    )


# ==========================================================================
# Job status / sweep status / quota
# ==========================================================================


@router.get("/jobs/{job_id}/check-status")
async def check_provider_job_status(
    job_id: str,
    user_and_team: dict = Depends(get_user_and_team),
):
    """Return the current status of a REMOTE job (read-only)."""
    job = await job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_data = job.get("job_data") or {}
    return {
        "status": "success",
        "job_id": job_id,
        "current_status": job.get("status"),
        "launch_progress": job_data.get("launch_progress"),
    }


@router.get("/jobs/ensure-quota-recorded")
async def ensure_quota_recorded_for_completed_jobs(
    experiment_id: Optional[str] = Query(None, description="Optional experiment ID to check jobs in"),
    job_id: Optional[str] = Query(None, description="Optional specific job ID to check"),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Check for completed REMOTE jobs without quota records and record usage."""
    team_id = user_and_team["team_id"]

    if job_id:
        quota_recorded = await quota_service.ensure_quota_recorded_for_completed_job(session, job_id, team_id=team_id)
        return {
            "status": "success",
            "job_id": job_id,
            "quota_recorded": quota_recorded,
            "message": "Quota recorded"
            if quota_recorded
            else "No quota recording needed (already recorded or invalid)",
        }

    if not experiment_id:
        return {"status": "error", "message": "Either job_id or experiment_id must be provided"}

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
                    session, job_id_str, team_id=team_id
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


@router.get("/jobs/sweep-status")
async def check_sweep_status_all(
    experiment_id: str = Query(..., description="Experiment ID to fetch all SWEEP jobs for"),
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Fetch all SWEEP jobs for an experiment."""
    all_sweep_jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="SWEEP", status="")
    return {"status": "success", "experiment_id": experiment_id, "jobs": all_sweep_jobs, "total": len(all_sweep_jobs)}


@router.get("/jobs/{job_id}/sweep-status")
async def check_sweep_status(
    job_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Check status of a specific sweep job."""
    job = await job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("type") != "SWEEP":
        raise HTTPException(status_code=400, detail="Job is not a SWEEP job")

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        raise HTTPException(status_code=400, detail="Job is not a sweep parent")

    return {
        "status": "success",
        "job_id": job_id,
        "sweep_total": job_data.get("sweep_total", 0),
        "sweep_completed": job_data.get("sweep_completed", 0),
        "sweep_running": job_data.get("sweep_running", 0),
        "sweep_failed": job_data.get("sweep_failed", 0),
        "sweep_queued": job_data.get("sweep_queued", 0),
        "sweep_progress": job_data.get("sweep_progress", 0),
        "all_complete": job_data.get("sweep_completed", 0) + job_data.get("sweep_failed", 0)
        == job_data.get("sweep_total", 0),
        "job": job,
    }


@router.get("/jobs/{job_id}/sweep-results")
async def get_sweep_results(
    job_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Get aggregated results from all child jobs in a sweep."""
    job = await job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("type") != "SWEEP":
        raise HTTPException(status_code=400, detail="Job is not a SWEEP job")

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        raise HTTPException(status_code=400, detail="Job is not a sweep parent")

    experiment_id = job.get("experiment_id")
    sweep_job_ids = job_data.get("sweep_job_ids", [])
    sweep_metric = job_data.get("sweep_metric", "eval/loss")
    lower_is_better = job_data.get("lower_is_better", True)
    sweep_config = job_data.get("sweep_config", {})

    results: list[dict] = []
    best_metric_value = float("inf") if lower_is_better else float("-inf")
    best_config = None
    best_job_id = None

    for child_job_id in sweep_job_ids:
        child_job = await job_service.job_get(child_job_id)
        if not child_job:
            continue

        child_job_data = child_job.get("job_data", {}) or {}
        sweep_params = child_job_data.get("sweep_params", {})
        sweep_run_index = child_job_data.get("sweep_run_index", 0)
        child_status = child_job.get("status", "")

        metric_value = None
        metrics: dict = {}

        if "score" in child_job_data:
            score = child_job_data["score"]
            if isinstance(score, dict):
                metrics = score
                metric_value = score.get(sweep_metric)
            elif isinstance(score, (int, float)):
                metric_value = score
                metrics = {sweep_metric: score}

        if metric_value is None and "completion_details" in child_job_data:
            completion_details = child_job_data["completion_details"]
            if isinstance(completion_details, dict) and sweep_metric in completion_details:
                metric_value = completion_details[sweep_metric]
                metrics = {sweep_metric: metric_value}

        results.append(
            {
                "job_id": child_job_id,
                "run_index": sweep_run_index,
                "config": sweep_params,
                "status": child_status,
                "metrics": metrics,
                "metric_value": metric_value,
            }
        )

        if metric_value is not None and child_status == JobStatus.COMPLETE:
            is_better = (lower_is_better and metric_value < best_metric_value) or (
                not lower_is_better and metric_value > best_metric_value
            )
            if is_better:
                best_metric_value = metric_value
                best_config = sweep_params.copy()
                best_job_id = child_job_id

    results.sort(key=lambda x: x["run_index"])

    aggregated_results = {
        "sweep_config": sweep_config,
        "sweep_metric": sweep_metric,
        "lower_is_better": lower_is_better,
        "results": results,
        "best_config": best_config,
        "best_metric": {sweep_metric: best_metric_value}
        if best_metric_value != float("inf") and best_metric_value != float("-inf")
        else None,
        "best_job_id": best_job_id,
    }

    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_results", aggregated_results, experiment_id)
    return {"status": "success", "data": aggregated_results}


# ==========================================================================
# Provider setup (local providers)
# ==========================================================================


def _get_provider_setup_status_path(workspace_dir: str, team_id: str, provider_id: str) -> Path:
    """Return path to the transient local-provider-setup status file."""
    safe_team = secure_filename(str(team_id).replace("/", "_")) or "team"
    safe_provider = secure_filename(str(provider_id).replace("/", "_")) or "provider"
    return Path(workspace_dir) / f".local_provider_setup_status_{safe_team}_{safe_provider}.json"


async def _run_local_provider_setup_background(
    provider_instance: Any,
    status_path: Path,
) -> None:
    """Run LocalProvider.setup in the background, writing progress to a status file."""

    def write_status(phase: str, percent: int, message: str, done: bool = False, error: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {
            "phase": phase,
            "percent": percent,
            "message": message,
            "done": done,
            "error": error,
            "timestamp": time.time(),
        }
        try:
            status_path.write_text(json.dumps(payload), encoding="utf-8")
        except Exception:
            logger.exception("Failed to write provider setup status to %s", status_path)

    def progress_callback(phase: str, percent: int, message: str) -> None:
        write_status(phase, percent, message, done=False, error=None)

    try:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, lambda: provider_instance.setup(progress_callback=progress_callback))
        write_status("provider_setup_done", 100, "Local provider setup completed successfully.", done=True, error=None)
    except Exception as exc:
        logger.exception("Failed to run provider setup in background")
        write_status("provider_setup_failed", 100, f"Local provider setup failed: {exc}", done=True, error=str(exc))
    finally:
        try:
            if status_path.exists():
                status_path.unlink()
        except Exception:
            logger.exception("Failed to delete provider setup status file %s", status_path)


@router.post("/{provider_id}/setup")
async def setup_provider(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """Start provider-level setup in the background."""
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    if provider.type != ProviderType.LOCAL.value:
        return {
            "status": "skipped",
            "provider_type": provider.type,
            "message": "Provider setup is only required for local providers.",
        }

    user_id_str = str(user_and_team["user"].id)
    provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

    set_organization_id(team_id)
    try:
        workspace_dir = await get_workspace_dir()
    finally:
        set_organization_id(None)

    status_path = _get_provider_setup_status_path(workspace_dir, team_id, provider_id)
    try:
        status_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        logger.exception("Failed to ensure parent directory for provider setup status %s", status_path)

    try:
        status_path.write_text(
            json.dumps(
                {
                    "phase": "provider_setup_start",
                    "percent": 0,
                    "message": "Starting local provider setup...",
                    "done": False,
                    "error": None,
                    "timestamp": time.time(),
                }
            ),
            encoding="utf-8",
        )
    except Exception:
        logger.exception("Failed to write initial provider setup status to %s", status_path)

    asyncio.create_task(_run_local_provider_setup_background(provider_instance, status_path))

    return {
        "status": "started",
        "provider_id": provider_id,
        "provider_type": provider.type,
        "message": "Local provider setup started.",
    }


@router.get("/{provider_id}/setup/status")
async def get_setup_status(
    provider_id: str,
    user_and_team: dict = Depends(get_user_and_team),
) -> Dict[str, Any]:
    """Get the latest status of a provider-level setup run."""
    team_id = user_and_team["team_id"]

    set_organization_id(team_id)
    try:
        workspace_dir = await get_workspace_dir()
    finally:
        set_organization_id(None)

    status_path = _get_provider_setup_status_path(workspace_dir, team_id, provider_id)
    if not status_path.exists():
        return {"status": "idle", "provider_id": provider_id, "done": True, "message": "No active provider setup."}

    try:
        raw = status_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception:
        logger.exception("Failed to read provider setup status from %s", status_path)
        raise HTTPException(status_code=500, detail="Failed to read provider setup status")

    data.setdefault("status", "running" if not data.get("done") else "completed")
    data.setdefault("provider_id", provider_id)
    return data


# ==========================================================================
# Cluster operations (delegated to service)
# ==========================================================================


@router.post("/{provider_id}/clusters/{cluster_name}/stop")
async def stop_cluster(
    cluster_name: str,
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Stop a running cluster."""
    try:
        return await compute_provider_service.stop_cluster(ctx, cluster_name)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to stop cluster")


@router.get("/{provider_id}/clusters/{cluster_name}/status", response_model=ClusterStatus)
async def get_cluster_status(
    cluster_name: str,
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Get the status of a cluster."""
    try:
        return await compute_provider_service.get_cluster_status(ctx, cluster_name)
    except Exception as e:
        print(f"Failed to get cluster status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cluster status")


@router.get("/{provider_id}/clusters/{cluster_name}/resources", response_model=ResourceInfo)
async def get_cluster_resources(
    cluster_name: str,
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Get resource information for a cluster."""
    try:
        return await compute_provider_service.get_cluster_resources(ctx, cluster_name)
    except Exception as e:
        print(f"Failed to get cluster resources: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cluster resources")


@router.get("/{provider_id}/clusters")
async def list_clusters_detailed(ctx: ProviderContext = Depends(get_provider_for_request)):
    """Get detailed list of clusters for a provider."""
    try:
        return await compute_provider_service.list_clusters_detailed(ctx)
    except Exception as e:
        print(f"Failed to list clusters: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list clusters")


@router.post("/{provider_id}/clusters/{cluster_name}/jobs")
async def submit_job(
    cluster_name: str,
    job_config: JobConfig,
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Submit a job to an existing cluster."""
    try:
        return await compute_provider_service.submit_job(ctx, cluster_name, job_config)
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Failed to submit job: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to submit job")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs", response_model=List[JobInfo])
async def list_jobs(
    cluster_name: str,
    state: Optional[JobState] = Query(None, description="Filter jobs by state"),
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """List all jobs for a cluster."""
    try:
        return await compute_provider_service.list_jobs(ctx, cluster_name, state)
    except NotImplementedError:
        return []
    except Exception as e:
        print(f"Failed to list jobs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list jobs")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}", response_model=JobInfo)
async def get_job_info(
    cluster_name: str,
    job_id: Union[str, int],
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Get information about a specific job."""
    try:
        return await compute_provider_service.get_job_info(ctx, cluster_name, job_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"Failed to get job info: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get job info")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}/logs")
async def get_job_logs(
    cluster_name: str,
    job_id: Union[str, int],
    tail_lines: Optional[int] = Query(None, description="Number of lines to retrieve from the end"),
    follow: bool = Query(False, description="Whether to stream/follow logs"),
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Get logs for a job."""
    try:
        return await compute_provider_service.get_job_logs(ctx, cluster_name, job_id, tail_lines, follow)
    except Exception as e:
        print(f"Failed to get job logs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get job logs")


@router.delete("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}")
async def cancel_job(
    cluster_name: str,
    job_id: Union[str, int],
    ctx: ProviderContext = Depends(get_provider_for_request),
):
    """Cancel a running or queued job."""
    try:
        return await compute_provider_service.cancel_job(ctx, cluster_name, job_id)
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Failed to cancel job: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel job")
