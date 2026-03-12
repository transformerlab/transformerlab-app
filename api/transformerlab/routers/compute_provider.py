"""Router for managing team-scoped compute providers."""

import logging
import os
import time
import json
import configparser
from pathlib import Path
import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional, Union, Tuple
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import require_team_owner, get_user_and_team
from transformerlab.services.provider_service import (
    get_team_provider,
    list_team_providers,
    list_enabled_team_providers,
    create_team_provider,
    update_team_provider,
    delete_team_provider,
    get_provider_instance,
    _local_providers_disabled,
)
from transformerlab.schemas.compute_providers import (
    ProviderCreate,
    ProviderUpdate,
    ProviderRead,
    mask_sensitive_config,
    ProviderTemplateLaunchRequest,
    ProviderTemplateFileUploadResponse,
    ResumeFromCheckpointRequest,
)
from transformerlab.shared.models.models import ProviderType, TeamRole
from transformerlab.compute_providers.models import (
    ClusterConfig,
    ClusterStatus,
    ResourceInfo,
    JobConfig,
    JobInfo,
    JobState,
)
from transformerlab.services import job_service
from transformerlab.services import quota_service
from transformerlab.services.local_provider_queue import enqueue_local_launch
from transformerlab.services.cache_service import cache
from lab import storage
from lab.storage import STORAGE_PROVIDER
from lab.dirs import get_workspace_dir, get_local_provider_job_dir, get_job_dir, set_organization_id, get_task_dir
from lab.job_status import JobStatus
from transformerlab.shared.github_utils import (
    read_github_pat_from_workspace,
    generate_github_clone_setup,
)
from transformerlab.shared.secret_utils import (
    extract_secret_names_from_data,
    load_team_secrets,
    replace_secrets_in_dict,
    replace_secret_placeholders,
)
from werkzeug.utils import secure_filename
from transformerlab.shared import galleries
from transformerlab.shared.interactive_gallery_utils import (
    resolve_interactive_command,
    find_interactive_gallery_entry,
)
from transformerlab.schemas.secrets import SPECIAL_SECRET_TYPES
from typing import Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/compute_provider", tags=["compute_provider"])


_TASK_COPY_EXCLUDE = {"index.json"}


async def _copy_task_files_to_dir(task_src: str, dest_dir: str) -> None:
    """Copy task files from task_src into dest_dir, excluding internal metadata."""
    try:
        await storage.makedirs(dest_dir, exist_ok=True)
        entries = await storage.ls(task_src, detail=False)
    except Exception:
        logger.warning("Failed to prepare task file copy from %s to %s, skipping", task_src, dest_dir, exc_info=True)
        return
    for entry in entries:
        name = entry.rstrip("/").rsplit("/", 1)[-1]
        if name in _TASK_COPY_EXCLUDE:
            continue
        dest_path = storage.join(dest_dir, name)
        try:
            if await storage.isdir(entry):
                await storage.copy_dir(entry, dest_path)
            else:
                await storage.copy_file(entry, dest_path)
        except Exception:
            logger.warning("Failed to copy task file %s to %s, skipping", entry, dest_path, exc_info=True)


def _sanitize_cluster_basename(base_name: Optional[str]) -> str:
    """Return a filesystem-safe cluster base name."""
    if not base_name:
        return "remote-template"
    normalized = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in base_name.strip())
    normalized = normalized.strip("-_")
    return normalized or "remote-template"


@router.post("/{provider_id}/task/{task_id}/file-upload", response_model=ProviderTemplateFileUploadResponse)
async def upload_task_file_for_provider(
    provider_id: str,
    task_id: str,
    request: Request,
    file: UploadFile = File(...),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Upload a single file for a provider-backed task.

    The file is stored under workspace_dir/uploads/task/{task_id}/ and the
    stored_path returned from this endpoint can be used as the local side of a
    file mount mapping: {<remote_path>: <stored_path>}.
    """

    # Ensure team can access provider (also validates team context)
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        workspace_dir = await get_workspace_dir()
        if not workspace_dir:
            raise RuntimeError("Workspace directory is not configured")

        # uploads/task/{task_id}/
        uploads_root = storage.join(workspace_dir, "uploads", "task")
        await storage.makedirs(uploads_root, exist_ok=True)

        import uuid

        task_dir = storage.join(uploads_root, str(task_id))
        await storage.makedirs(task_dir, exist_ok=True)

        # Use original filename with a random suffix to avoid collisions
        original_name = file.filename or "uploaded_file"
        suffix = uuid.uuid4().hex[:8]
        # Avoid path separators from filename
        safe_name = original_name.split("/")[-1].split("\\")[-1]
        stored_filename = f"{safe_name}.{suffix}"
        stored_path = storage.join(task_dir, stored_filename)

        # Persist file contents
        await file.seek(0)
        content = await file.read()
        async with await storage.open(stored_path, "wb") as f:
            await f.write(content)

        return ProviderTemplateFileUploadResponse(
            status="success",
            stored_path=stored_path,
            message="File uploaded successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Template file upload error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to upload template file")


@router.get("/", response_model=List[ProviderRead])
async def list_providers(
    include_disabled: bool = Query(False, description="Include disabled providers (admin view)"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    List all providers for the current team.
    Requires X-Team-Id header and team membership.
    By default, disabled providers are excluded. Pass include_disabled=true to see all.
    """
    team_id = user_and_team["team_id"]
    if include_disabled:
        if user_and_team.get("role") != TeamRole.OWNER.value:
            raise HTTPException(status_code=403, detail="Only team owners can view disabled providers")
        providers = await list_team_providers(session, team_id)
    else:
        providers = await list_enabled_team_providers(session, team_id)

    # Convert to response format with masked sensitive fields
    result = []
    for provider in providers:
        masked_config = mask_sensitive_config(provider.config or {}, provider.type)
        result.append(
            ProviderRead(
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
        )

    return result


@router.post("/", response_model=ProviderRead)
async def create_provider(
    provider_data: ProviderCreate,
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a new provider for the team.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]
    user = owner_info["user"]

    # Validate provider type
    if provider_data.type not in [ProviderType.SLURM, ProviderType.SKYPILOT, ProviderType.RUNPOD, ProviderType.LOCAL]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider type. Must be one of: {ProviderType.SLURM.value}, {ProviderType.SKYPILOT.value}, {ProviderType.RUNPOD.value}, {ProviderType.LOCAL.value}",
        )

    # Respect global disable flag for local providers
    if provider_data.type == ProviderType.LOCAL and _local_providers_disabled():
        raise HTTPException(status_code=400, detail="Local providers are disabled by server configuration.")

    # Check if provider name already exists for this team
    existing = await list_team_providers(session, team_id)
    for existing_provider in existing:
        if existing_provider.name == provider_data.name:
            raise HTTPException(
                status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
            )

    # Convert Pydantic config to dict
    config_dict = provider_data.config.model_dump(exclude_none=True)

    # Create provider
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

    # For LOCAL providers, kick off background setup immediately so users see progress
    # (via /compute_provider/{id}/setup/status) without blocking provider creation.
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
            # Non-fatal: provider was created successfully; setup can still be started manually.
            logger.exception("Failed to auto-start setup for newly created local provider %s", provider.id)

    # Return with masked sensitive fields
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
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get usage report for REMOTE jobs in the team.
    Aggregates usage data by user, provider, and resources.
    Only accessible to team owners.
    """
    from datetime import datetime
    from lab import Experiment

    team_id = owner_info["team_id"]

    # Get all current team providers to check which ones still exist
    existing_provider_ids = set()
    existing_provider_names = set()
    try:
        current_providers = await list_team_providers(session, team_id)
        if current_providers:
            existing_provider_ids = {str(provider.id) for provider in current_providers if provider.id}
            existing_provider_names = {provider.name for provider in current_providers if provider.name}
    except Exception as e:
        print(f"Error getting current providers for team {team_id}: {e}")
        import traceback

        traceback.print_exc()
        # Continue with empty sets - we'll just mark all providers as deleted
        pass

    # Get all experiments in the current workspace
    try:
        experiments_data = await Experiment.get_all()
        experiments = [exp.get("id") for exp in experiments_data if exp.get("id")]
    except Exception as e:
        print(f"Error getting experiments: {e}")
        experiments = []

    # Collect all REMOTE jobs
    remote_jobs = []

    for experiment_id in experiments:
        try:
            jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="REMOTE")
            for job in jobs:
                job_data = job.get("job_data", {}) or {}

                # Parse job_data if it's a string
                if isinstance(job_data, str):
                    try:
                        job_data = json.loads(job_data)
                    except (json.JSONDecodeError, TypeError):
                        job_data = {}

                # Only include jobs with provider info (actual remote jobs)
                if job_data.get("provider_id") or job_data.get("provider_name"):
                    # Calculate duration if we have start and end times
                    duration_seconds = None
                    start_time = job_data.get("start_time")
                    end_time = job_data.get("end_time")

                    if start_time and end_time:
                        try:
                            # Handle both string and datetime formats
                            if isinstance(start_time, str):
                                start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                            else:
                                start = start_time
                            if isinstance(end_time, str):
                                end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                            else:
                                end = end_time
                            duration_seconds = (end - start).total_seconds()
                        except Exception as e:
                            print(f"Error calculating duration for job {job.get('id')}: {e}")
                            pass

                    # Only include jobs that have both start_time and end_time AND duration > 0
                    if not (start_time and end_time and duration_seconds is not None and duration_seconds > 0):
                        continue

                    # Get user info
                    user_info = job_data.get("user_info", {}) or {}
                    user_email = user_info.get("email") or "Unknown"
                    user_name = user_info.get("name") or user_email

                    # Check if provider still exists
                    provider_id = job_data.get("provider_id")
                    provider_name = job_data.get("provider_name") or "Unknown"
                    provider_exists = False

                    # Only check existence if we have provider_id or provider_name and the sets aren't empty
                    # Convert provider_id to string for comparison
                    provider_id_str = str(provider_id) if provider_id else None
                    if existing_provider_ids or existing_provider_names:
                        if provider_id_str and provider_id_str in existing_provider_ids:
                            provider_exists = True
                        elif provider_name and provider_name in existing_provider_names:
                            provider_exists = True

                    # Mark provider as deleted if it no longer exists
                    # Only mark as deleted if we had a provider_id to check against and we have existing providers
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

    # Aggregate usage by user
    usage_by_user = {}
    for job in remote_jobs:
        user_email = job["user_email"]
        if user_email not in usage_by_user:
            usage_by_user[user_email] = {
                "user_email": user_email,
                "user_name": job["user_name"],
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }

        usage_by_user[user_email]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_user[user_email]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_user[user_email]["jobs"].append(job)

    # Aggregate usage by provider
    usage_by_provider = {}
    for job in remote_jobs:
        provider_name = job["provider_name"]
        # Use provider_id as key if available to properly group deleted providers
        # But display name will show "(Deleted)" marker
        provider_key = job.get("provider_id") or provider_name

        if provider_key not in usage_by_provider:
            usage_by_provider[provider_key] = {
                "provider_name": provider_name,
                "provider_type": job["provider_type"],
                "provider_exists": job.get("provider_exists", True),
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }

        usage_by_provider[provider_key]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_provider[provider_key]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_provider[provider_key]["jobs"].append(job)

    # Sort users by total duration (descending)
    sorted_users = sorted(usage_by_user.values(), key=lambda x: x["total_duration_seconds"], reverse=True)

    # Sort providers by total duration (descending)
    sorted_providers = sorted(usage_by_provider.values(), key=lambda x: x["total_duration_seconds"], reverse=True)

    return {
        "summary": {
            "total_jobs": len(remote_jobs),
            "total_users": len(usage_by_user),
            "total_providers": len(usage_by_provider),
        },
        "by_user": sorted_users,
        "by_provider": sorted_providers,
        "all_jobs": remote_jobs,
    }


@router.get("/org-ssh-public-key")
async def get_org_ssh_public_key_endpoint(
    user_and_team=Depends(get_user_and_team),
):
    """
    Get the organization's SSH public key for users to add to their SLURM account.
    Requires X-Team-Id header and team membership.
    """
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


@router.get("/user-settings/{provider_id}")
async def get_user_provider_settings(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get user-specific settings for a provider (e.g., SLURM username, SSH key status).
    Requires X-Team-Id header and team membership.
    """
    import transformerlab.db.db as db
    from transformerlab.services.user_slurm_key_service import user_slurm_key_exists

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    slurm_user_key = f"provider:{provider_id}:slurm_user"
    slurm_user = await db.config_get(key=slurm_user_key, user_id=user_id, team_id=team_id)

    custom_flags_key = f"provider:{provider_id}:slurm_custom_sbatch_flags"
    custom_sbatch_flags = await db.config_get(key=custom_flags_key, user_id=user_id, team_id=team_id)

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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Set user-specific settings for a provider (e.g., SLURM username).
    Requires X-Team-Id header and team membership.
    """
    import transformerlab.db.db as db

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    # Verify provider exists and user has access
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Only allow SLURM providers to have user-specific SLURM settings
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(
            status_code=400,
            detail="User-specific SLURM settings are only available for SLURM providers",
        )

    # Read slurm_user from request body (frontend sends JSON body)
    slurm_user = (body or {}).get("slurm_user")
    if isinstance(slurm_user, str):
        slurm_user = slurm_user.strip() or None
    elif slurm_user is not None and not isinstance(slurm_user, str):
        slurm_user = str(slurm_user).strip() or None

    # Read custom SBATCH flags from request body (optional, free-form string)
    raw_flags = (body or {}).get("custom_sbatch_flags")
    if isinstance(raw_flags, str):
        custom_sbatch_flags = raw_flags.strip() or None
    elif raw_flags is None:
        custom_sbatch_flags = None
    else:
        # Coerce non-string values to string for robustness
        custom_sbatch_flags = str(raw_flags).strip() or None

    # Set user-specific slurm_user setting
    slurm_user_key = f"provider:{provider_id}:slurm_user"
    if slurm_user:
        await db.config_set(key=slurm_user_key, value=slurm_user, user_id=user_id, team_id=team_id)
    else:
        await db.config_set(key=slurm_user_key, value="", user_id=user_id, team_id=team_id)

    # Set user-specific custom SBATCH flags
    custom_flags_key = f"provider:{provider_id}:slurm_custom_sbatch_flags"
    if custom_sbatch_flags:
        await db.config_set(
            key=custom_flags_key,
            value=custom_sbatch_flags,
            user_id=user_id,
            team_id=team_id,
        )
    else:
        # Store as empty string when cleared
        await db.config_set(
            key=custom_flags_key,
            value="",
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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Upload a user's SLURM SSH private key for a provider.
    Requires X-Team-Id header and team membership.
    """
    from transformerlab.services.user_slurm_key_service import save_user_slurm_key

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(
            status_code=400,
            detail="SSH key upload is only available for SLURM providers",
        )

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
        return {
            "status": "success",
            "provider_id": provider_id,
            "message": "SSH private key uploaded successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save SSH key: {str(e)}")


@router.delete("/user-settings/{provider_id}/ssh-key")
async def delete_user_slurm_ssh_key(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Delete a user's SLURM SSH private key for a provider.
    Requires X-Team-Id header and team membership.
    """
    from transformerlab.services.user_slurm_key_service import delete_user_slurm_key

    team_id = user_and_team["team_id"]
    user_id = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(
            status_code=400,
            detail="SSH key deletion is only available for SLURM providers",
        )

    try:
        await delete_user_slurm_key(team_id, provider_id, user_id)
        return {
            "status": "success",
            "provider_id": provider_id,
            "message": "SSH private key deleted successfully",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete SSH key: {str(e)}")


@router.get("/{provider_id}", response_model=ProviderRead)
async def get_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get a specific provider by ID.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Return with masked sensitive fields
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
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Update a provider.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Check if name is being changed and if new name already exists
    if provider_data.name and provider_data.name != provider.name:
        existing = await list_team_providers(session, team_id)
        for existing_provider in existing:
            if existing_provider.id != provider_id and existing_provider.name == provider_data.name:
                raise HTTPException(
                    status_code=400, detail=f"Provider with name '{provider_data.name}' already exists for this team"
                )

    # Prepare update data
    update_name = provider_data.name
    update_config = None

    if provider_data.config:
        # Merge existing config with updates
        existing_config = provider.config or {}
        new_config = provider_data.config.model_dump(exclude_none=True)
        # Merge dictionaries, with new_config taking precedence
        update_config = {**existing_config, **new_config}

    # Resolve disabled flag: only update if explicitly set (not the default False)
    update_disabled = provider_data.disabled if provider_data.disabled is not None else None

    # Update provider
    provider = await update_team_provider(
        session=session, provider=provider, name=update_name, config=update_config, disabled=update_disabled
    )

    # Return with masked sensitive fields
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
    owner_info=Depends(require_team_owner),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Delete a provider.
    Requires X-Team-Id header and team owner role.
    """
    team_id = owner_info["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    await delete_team_provider(session, provider)
    return {"message": "Provider deleted successfully"}


@router.get("/{provider_id}/check")
async def check_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Check if a compute provider is active and accessible.
    Requires X-Team-Id header and team membership.
    For SLURM providers, uses the current user's SLURM username if set in Provider Settings.

    Returns:
        {"status": True} if the provider is active, {"status": False} otherwise
    """
    team_id = user_and_team["team_id"]
    user_id_str = str(user_and_team["user"].id)

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Call the check method
        is_active = await asyncio.to_thread(provider_instance.check)

        return {"status": is_active}
    except Exception as e:
        error_msg = str(e)
        print(f"Failed to check provider: {error_msg}")
        # If instantiation or check fails, provider is not active
        return {"status": False}


# ============================================================================
# Cluster Management Routes
# ============================================================================


def _get_aws_credentials_from_file(profile_name: str = "transformerlab-s3") -> Tuple[Optional[str], Optional[str]]:
    """
    Read AWS credentials from ~/.aws/credentials file for the specified profile.

    Args:
        profile_name: AWS profile name (default: "transformerlab-s3")

    Returns:
        Tuple of (aws_access_key_id, aws_secret_access_key) or (None, None) if not found
    """
    credentials_path = Path.home() / ".aws" / "credentials"

    if not credentials_path.exists():
        return None, None

    try:
        config = configparser.ConfigParser()
        config.read(credentials_path)

        if profile_name in config:
            access_key = config[profile_name].get("aws_access_key_id")
            secret_key = config[profile_name].get("aws_secret_access_key")
            return access_key, secret_key
    except Exception:
        pass

    return None, None


# lab.init() not required; copy_file_mounts uses _TFL_JOB_ID and job_data only
COPY_FILE_MOUNTS_SETUP = 'pip install -q transformerlab && python -c "from lab import lab; lab.copy_file_mounts()"'


# RunPod (and similar) use /workspace as a writable persistent path; ~/.aws may be wrong user or not visible over SSH
RUNPOD_AWS_CREDENTIALS_DIR = "/workspace/.aws"


def _generate_aws_credentials_setup(
    aws_access_key_id: str,
    aws_secret_access_key: str,
    aws_profile: Optional[str] = None,
    aws_credentials_dir: Optional[str] = None,
) -> str:
    """
    Generate bash script to set up AWS credentials.

    Args:
        aws_access_key_id: AWS access key ID
        aws_secret_access_key: AWS secret access key
        aws_profile: AWS profile name (defaults to 'transformerlab-s3' if not provided)
        aws_credentials_dir: If set (e.g. /workspace/.aws), write credentials here instead of ~/.aws.
            Caller should set AWS_SHARED_CREDENTIALS_FILE to <dir>/credentials so processes use this file.

    Returns:
        Bash script to configure AWS credentials
    """
    profile_name = aws_profile or os.getenv("AWS_PROFILE", "transformerlab-s3")
    cred_dir = aws_credentials_dir if aws_credentials_dir else "~/.aws"
    cred_file = f"{cred_dir}/credentials" if aws_credentials_dir else "~/.aws/credentials"

    # Escape for bash: single quotes and special characters
    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_access_key = escape_bash(aws_access_key_id)
    escaped_secret_key = escape_bash(aws_secret_access_key)
    escaped_profile = escape_bash(profile_name).replace("[", "\\[").replace("]", "\\]")

    # Simple approach: create dir, remove old profile section directly, append new profile
    setup_script = (
        f"echo 'Setting up AWS credentials for profile: {profile_name}'; "
        f"mkdir -p {cred_dir}; "
        f"chmod 700 {cred_dir}; "
        f"if [ -f {cred_file} ]; then "
        f"  awk 'BEGIN{{in_profile=0}} /^\\[{escaped_profile}\\]/{{in_profile=1; next}} /^\\[/{{in_profile=0}} !in_profile{{print}}' {cred_file} > {cred_file}.new && mv {cred_file}.new {cred_file} || true; "
        f"fi; "
        f"echo '[{profile_name}]' >> {cred_file}; "
        f"echo 'aws_access_key_id={escaped_access_key}' >> {cred_file}; "
        f"echo 'aws_secret_access_key={escaped_secret_key}' >> {cred_file}; "
        f"chmod 600 {cred_file}; "
        f"echo 'AWS credentials configured successfully at {cred_file}';"
    )
    return setup_script


def _generate_gcp_credentials_setup(service_account_json: str, credentials_path: Optional[str] = None) -> str:
    """
    Generate bash script to set up GCP service account credentials on the remote host.

    This writes the provided service account JSON to a file and points
    GOOGLE_APPLICATION_CREDENTIALS at it so that google-cloud libraries and
    ADC can pick it up.

    Args:
        service_account_json: The service account JSON contents.
        credentials_path: Optional path on the remote host where the JSON
            should be written. Defaults to ~/.config/gcloud/tfl-service-account.json

    Returns:
        Bash script to configure GCP credentials.
    """
    target_path = credentials_path or "$HOME/.config/gcloud/tfl-service-account.json"

    def escape_bash_single_quoted(s: str) -> str:
        # Safely embed arbitrary JSON into a single-quoted string in bash:
        # close quote, escape single quote, reopen.
        return s.replace("'", "'\"'\"'")

    escaped_json = escape_bash_single_quoted(service_account_json)

    setup_script = (
        "echo 'Setting up GCP service account credentials...'; "
        'mkdir -p "$HOME/.config/gcloud"; '
        f"echo '{escaped_json}' > {target_path}; "
        f"chmod 600 {target_path}; "
        f"export GOOGLE_APPLICATION_CREDENTIALS={target_path}; "
        "echo 'GCP credentials configured successfully'"
    )
    return setup_script


def _generate_azure_credentials_setup(
    connection_string: Optional[str],
    account_name: Optional[str],
    account_key: Optional[str],
    sas_token: Optional[str],
) -> str:
    """
    Generate bash script to export Azure storage credentials on the remote host.

    This mirrors the pattern used for AWS/GCP: we materialise the minimal
    environment required for fsspec/adlfs to authenticate against Azure
    Blob Storage.
    """

    def escape_bash_single_quoted(s: str) -> str:
        # Safely embed arbitrary values into a single-quoted string in bash.
        return s.replace("'", "'\"'\"'")

    exports: list[str] = ["echo 'Setting up Azure storage credentials...'"]
    if connection_string:
        escaped = escape_bash_single_quoted(connection_string)
        exports.append(f"export AZURE_STORAGE_CONNECTION_STRING='{escaped}'")
    if account_name:
        escaped = escape_bash_single_quoted(account_name)
        exports.append(f"export AZURE_STORAGE_ACCOUNT='{escaped}'")
    if account_key:
        escaped = escape_bash_single_quoted(account_key)
        exports.append(f"export AZURE_STORAGE_KEY='{escaped}'")
    if sas_token:
        escaped = escape_bash_single_quoted(sas_token)
        exports.append(f"export AZURE_STORAGE_SAS_TOKEN='{escaped}'")

    exports.append("echo 'Azure storage credentials configured successfully'")
    return "; ".join(exports)


def _find_missing_secrets_for_template_launch(
    request: ProviderTemplateLaunchRequest, secrets: Dict[str, Any]
) -> set[str]:
    """
    Inspect the launch request for any {{secret.NAME}} / {{secrets.NAME}} placeholders
    and return the subset of referenced secret names that are not present in `secrets`.
    """
    referenced: set[str] = set()

    # Core task fields that may contain secrets
    referenced.update(extract_secret_names_from_data(request.run))
    if request.setup:
        referenced.update(extract_secret_names_from_data(request.setup))
    if request.env_vars:
        referenced.update(extract_secret_names_from_data(request.env_vars))
    if request.parameters:
        referenced.update(extract_secret_names_from_data(request.parameters))
    if request.config:
        referenced.update(extract_secret_names_from_data(request.config))
    if request.sweep_config:
        referenced.update(extract_secret_names_from_data(request.sweep_config))

    if not referenced:
        return set()

    return {name for name in referenced if name not in secrets}


async def _create_sweep_parent_job(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict,
    session: AsyncSession,
    sweep_config: Dict[str, List[Any]],
    sweep_metric: str,
    lower_is_better: bool,
    total_configs: int,
) -> str:
    """
    Create the parent sweep job immediately and return its ID.
    This is fast and allows us to return a response quickly.
    """
    from itertools import product

    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Generate all parameter combinations
    param_names = list(sweep_config.keys())
    param_values = [sweep_config[name] for name in param_names]
    configs = []
    for values in product(*param_values):
        config = dict(zip(param_names, values))
        configs.append(config)

    user_info = {}
    if getattr(user_and_team["user"], "first_name", None) or getattr(user_and_team["user"], "last_name", None):
        user_info["name"] = " ".join(
            part
            for part in [
                getattr(user_and_team["user"], "first_name", ""),
                getattr(user_and_team["user"], "last_name", ""),
            ]
            if part
        ).strip()
    if getattr(user_and_team["user"], "email", None):
        user_info["email"] = getattr(user_and_team["user"], "email")

    provider = await get_team_provider(session, user_and_team["team_id"], provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider_display_name = request.provider_name or provider.name

    parent_job_id = await job_service.job_create(
        type="SWEEP",
        status=JobStatus.RUNNING,
        experiment_id=request.experiment_id,
    )

    # Store parent job metadata
    parent_job_data = {
        "sweep_parent": True,
        "sweep_total": total_configs,
        "sweep_completed": 0,
        "sweep_running": 0,
        "sweep_failed": 0,
        "sweep_job_ids": [],
        "sweep_config": sweep_config,
        "sweep_metric": sweep_metric,
        "lower_is_better": lower_is_better,
        "task_name": request.task_name,
        "subtype": request.subtype,
        "provider_id": provider.id,
        "provider_type": provider.type,
        "provider_name": provider_display_name,
        "user_info": user_info or None,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }

    for key, value in parent_job_data.items():
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(parent_job_id, key, value, request.experiment_id)

    # Ensure experiment job lists reflect the new parent sweep job.
    await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")

    return parent_job_id


async def _launch_sweep_jobs(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict,
    base_parameters: Dict[str, Any],
    sweep_config: Dict[str, List[Any]],
    sweep_metric: str,
    lower_is_better: bool,
    parent_job_id: str,
):
    """
    Launch child jobs for a sweep in the background.
    This is called asynchronously after the parent job is created.
    Creates its own database session and sets org context since it runs in a background task.
    """
    from itertools import product
    from transformerlab.db.session import async_session
    from lab.dirs import set_organization_id as lab_set_org_id

    # Set org context explicitly since background tasks don't inherit request context
    team_id = user_and_team["team_id"]
    if lab_set_org_id is not None:
        lab_set_org_id(team_id)

    try:
        # Create a new session for the background task
        async with async_session() as session:
            team_id = user_and_team["team_id"]
            user = user_and_team["user"]
            provider = await get_team_provider(session, team_id, provider_id)
            if not provider:
                print(f"Provider {provider_id} not found for sweep job {parent_job_id}")
                return

            # Get provider instance (resolves user's slurm_user for SLURM when user_id/team_id set)
            user_id_str = str(user.id)
            provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

            # Generate user_info
            user_info = {}
            if getattr(user, "first_name", None) or getattr(user, "last_name", None):
                user_info["name"] = " ".join(
                    part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
                ).strip()
            if getattr(user, "email", None):
                user_info["email"] = getattr(user, "email")

            provider_display_name = request.provider_name or provider.name

            # Load team secrets and user secrets for template replacement (user secrets override team secrets)
            user_id = str(user_and_team["user"].id)
            team_secrets = await load_team_secrets(user_id=user_id)

            # Generate all parameter combinations
            param_names = list(sweep_config.keys())
            param_values = [sweep_config[name] for name in param_names]
            configs = []
            for values in product(*param_values):
                config = dict(zip(param_names, values))
                configs.append(config)

            total_configs = len(configs)
            print(f"Launching {total_configs} child jobs for sweep {parent_job_id}")

            base_name = request.cluster_name or request.task_name or provider.name
            child_job_ids = []
            for i, config_params in enumerate(configs):
                # Merge base parameters with sweep parameters
                merged_params = {**(base_parameters or {}), **config_params}

                # Create unique cluster name for this run
                run_suffix = f"sweep-{i + 1}"
                formatted_cluster_name = f"{_sanitize_cluster_basename(base_name)}-{run_suffix}-job-{parent_job_id}"

                # Create child job
                child_job_id = await job_service.job_create(
                    type="REMOTE",
                    status=JobStatus.QUEUED,
                    experiment_id=request.experiment_id,
                )

                # Prepare environment variables
                env_vars = request.env_vars.copy() if request.env_vars else {}

                # Replace {{secret.<name>}} patterns in env_vars
                if env_vars and team_secrets:
                    env_vars = replace_secrets_in_dict(env_vars, team_secrets)

                env_vars["_TFL_JOB_ID"] = str(child_job_id)
                env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
                env_vars["_TFL_USER_ID"] = user_id

                # Get TFL_STORAGE_URI
                tfl_storage_uri = None
                try:
                    storage_root = await storage.root_uri()
                    if storage_root:
                        if storage.is_remote_path(storage_root):
                            # Remote cloud storage (S3/GCS/etc.)
                            tfl_storage_uri = storage_root
                        elif STORAGE_PROVIDER == "localfs":
                            # localfs: expose the local mount path to the remote worker
                            tfl_storage_uri = storage_root
                except Exception:
                    pass

                if tfl_storage_uri:
                    env_vars["TFL_STORAGE_URI"] = tfl_storage_uri

                # For local provider, set TFL_WORKSPACE_DIR so the lab SDK in the subprocess finds the job dir
                if provider.type == ProviderType.LOCAL.value and team_id:
                    set_organization_id(team_id)
                    try:
                        workspace_dir = await get_workspace_dir()
                        if workspace_dir and not storage.is_remote_path(workspace_dir):
                            env_vars["TFL_WORKSPACE_DIR"] = workspace_dir
                    finally:
                        set_organization_id(None)

                # Build setup script (add copy_file_mounts when file_mounts is True, after cloud credentials)
                setup_commands = []

                # Cloud credentials setup:
                # - For AWS (TFL_STORAGE_PROVIDER=aws), inject ~/.aws/credentials profile if available.
                # - For GCP (TFL_STORAGE_PROVIDER=gcp), optionally inject a service account JSON if provided.
                # - For Azure (TFL_STORAGE_PROVIDER=azure), export Azure storage env vars if configured.
                if os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true":
                    if STORAGE_PROVIDER == "aws":
                        aws_profile = "transformerlab-s3"
                        aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(
                            _get_aws_credentials_from_file, aws_profile
                        )
                        if aws_access_key_id and aws_secret_access_key:
                            aws_credentials_dir = (
                                RUNPOD_AWS_CREDENTIALS_DIR if provider.type == ProviderType.RUNPOD.value else None
                            )
                            aws_setup = _generate_aws_credentials_setup(
                                aws_access_key_id,
                                aws_secret_access_key,
                                aws_profile,
                                aws_credentials_dir=aws_credentials_dir,
                            )
                            setup_commands.append(aws_setup)
                            env_vars["AWS_PROFILE"] = aws_profile
                            if aws_credentials_dir:
                                env_vars["AWS_SHARED_CREDENTIALS_FILE"] = f"{aws_credentials_dir}/credentials"
                    elif STORAGE_PROVIDER == "gcp":
                        # If a GCP service account JSON is provided via env, write it on the remote host
                        # and set GOOGLE_APPLICATION_CREDENTIALS so ADC can find it.
                        gcp_sa_json = os.getenv("TFL_GCP_SERVICE_ACCOUNT_JSON")
                        if gcp_sa_json:
                            gcp_setup = _generate_gcp_credentials_setup(gcp_sa_json)
                            setup_commands.append(gcp_setup)
                    elif STORAGE_PROVIDER == "azure":
                        azure_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
                        azure_account = os.getenv("AZURE_STORAGE_ACCOUNT")
                        azure_key = os.getenv("AZURE_STORAGE_KEY")
                        azure_sas = os.getenv("AZURE_STORAGE_SAS_TOKEN")
                        if azure_connection_string or azure_account:
                            azure_setup = _generate_azure_credentials_setup(
                                azure_connection_string, azure_account, azure_key, azure_sas
                            )
                            setup_commands.append(azure_setup)
                            if azure_connection_string:
                                env_vars["AZURE_STORAGE_CONNECTION_STRING"] = azure_connection_string
                            if azure_account:
                                env_vars["AZURE_STORAGE_ACCOUNT"] = azure_account
                            if azure_key:
                                env_vars["AZURE_STORAGE_KEY"] = azure_key
                            if azure_sas:
                                env_vars["AZURE_STORAGE_SAS_TOKEN"] = azure_sas

                if request.file_mounts is True and request.task_id:
                    setup_commands.append(COPY_FILE_MOUNTS_SETUP)

                if request.github_repo_url:
                    workspace_dir = await get_workspace_dir()
                    github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
                    directory = request.github_repo_dir or request.github_directory
                    branch = request.github_repo_branch or request.github_branch
                    github_setup = generate_github_clone_setup(
                        repo_url=request.github_repo_url,
                        directory=directory,
                        github_pat=github_pat,
                        branch=branch,
                    )
                    setup_commands.append(github_setup)

                # Add user-provided setup if any (replace secrets in setup)
                if request.setup:
                    setup_with_secrets = (
                        replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
                    )
                    setup_commands.append(setup_with_secrets)

                final_setup = ";".join(setup_commands) if setup_commands else None

                # Replace secrets in run command
                run_with_secrets = (
                    replace_secret_placeholders(request.run, team_secrets) if team_secrets else request.run
                )

                # Replace secrets in parameters if present
                parameters_with_secrets = merged_params
                if merged_params and team_secrets:
                    parameters_with_secrets = replace_secrets_in_dict(merged_params, team_secrets)

                # Store child job data
                child_job_data = {
                    "parent_sweep_job_id": str(parent_job_id),
                    "sweep_run_index": i + 1,
                    "sweep_total": total_configs,
                    "sweep_params": config_params,
                    "task_name": f"{request.task_name or 'Task'} (Sweep {i + 1}/{total_configs})"
                    if request.task_name
                    else None,
                    "run": run_with_secrets,
                    "cluster_name": formatted_cluster_name,
                    "subtype": request.subtype,
                    "cpus": request.cpus,
                    "memory": request.memory,
                    "disk_space": request.disk_space,
                    "accelerators": request.accelerators,
                    "num_nodes": request.num_nodes,
                    "setup": final_setup,
                    "env_vars": env_vars if env_vars else None,
                    "file_mounts": request.file_mounts if request.file_mounts is not True else True,
                    "parameters": parameters_with_secrets or None,
                    "provider_id": provider.id,
                    "provider_type": provider.type,
                    "provider_name": provider_display_name,
                    "user_info": user_info or None,
                    "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
                }
                if request.file_mounts is True and request.task_id:
                    child_job_data["task_id"] = request.task_id

                for key, value in child_job_data.items():
                    if value is not None:
                        await job_service.job_update_job_data_insert_key_value(
                            child_job_id, key, value, request.experiment_id
                        )

                # Prepare cluster config
                disk_size = None
                if request.disk_space:
                    try:
                        disk_size = int(request.disk_space)
                    except (TypeError, ValueError):
                        disk_size = None

                # When file_mounts is True we use lab.copy_file_mounts() in setup; do not send to provider
                file_mounts_for_provider = request.file_mounts if isinstance(request.file_mounts, dict) else {}
                cluster_config = ClusterConfig(
                    cluster_name=formatted_cluster_name,
                    provider_name=provider_display_name,
                    provider_id=provider.id,
                    run=run_with_secrets,
                    setup=final_setup,
                    env_vars=env_vars,
                    cpus=request.cpus,
                    memory=request.memory,
                    accelerators=request.accelerators,
                    num_nodes=request.num_nodes,
                    disk_size=disk_size,
                    file_mounts=file_mounts_for_provider,
                    provider_config={"requested_disk_space": request.disk_space},
                )

                # Launch cluster for child job
                try:
                    launch_result = await asyncio.to_thread(
                        provider_instance.launch_cluster, formatted_cluster_name, cluster_config
                    )

                    if isinstance(launch_result, dict):
                        await job_service.job_update_job_data_insert_key_value(
                            child_job_id,
                            "provider_launch_result",
                            launch_result,
                            request.experiment_id,
                        )
                        request_id = launch_result.get("request_id")
                        if request_id:
                            await job_service.job_update_job_data_insert_key_value(
                                child_job_id,
                                "orchestrator_request_id",
                                request_id,
                                request.experiment_id,
                            )

                    # Update child job status to LAUNCHING
                    await job_service.job_update_status(child_job_id, JobStatus.LAUNCHING, request.experiment_id)
                    child_job_ids.append(str(child_job_id))
                    print(f"Launched sweep child job {i + 1}/{total_configs}: {child_job_id}")

                except Exception as exc:
                    print(f"Failed to launch cluster for sweep child {i + 1}: {exc}")
                    await job_service.job_update_status(
                        child_job_id,
                        JobStatus.FAILED,
                        request.experiment_id,
                        error_msg=str(exc),
                    )
                    child_job_ids.append(str(child_job_id))

            # Update parent job with child job IDs and running count
            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_job_ids", child_job_ids, request.experiment_id
            )
            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_running", len(child_job_ids), request.experiment_id
            )

            print(f"Completed launching {len(child_job_ids)} child jobs for sweep {parent_job_id}")
            # Invalidate cached job lists now that all child jobs have been created.
            await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")
    finally:
        # Clear org context after background task completes
        if lab_set_org_id is not None:
            lab_set_org_id(None)


@router.post("/{provider_id}/task/launch")
async def launch_template_on_provider(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a REMOTE job and launch a provider-backed cluster.
    Mirrors the legacy /remote/launch flow but routes through providers.

    If run_sweeps=True and sweep_config is provided, creates a parent SWEEP job
    and launches multiple child REMOTE jobs with different parameter combinations.
    """

    team_id = user_and_team["team_id"]
    user = user_and_team["user"]
    user_id = str(user.id)

    # Load team + user secrets once and validate that any referenced secrets exist
    team_secrets = await load_team_secrets(user_id=user_id)
    missing_secrets = _find_missing_secrets_for_template_launch(request, team_secrets)

    if missing_secrets:
        display_names = [SPECIAL_SECRET_TYPES.get(name, name) for name in sorted(missing_secrets)]
        missing_list = ", ".join(display_names)
        raise HTTPException(
            status_code=400,
            detail=(
                "Missing secrets: "
                f"{missing_list}. Please define these secrets at the team or user level before launching."
            ),
        )

    # Check if the provider is disabled before any launch path
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.disabled:
        raise HTTPException(status_code=403, detail="Provider is disabled and cannot be used to launch tasks")

    # Check if sweeps are enabled
    if request.run_sweeps and request.sweep_config:
        from itertools import product

        # Generate all parameter combinations to calculate total
        param_names = list(request.sweep_config.keys())
        param_values = [request.sweep_config[name] for name in param_names]
        configs = list(product(*param_values))
        total_configs = len(configs)

        # Create parent job immediately (fast operation)
        parent_job_id = await _create_sweep_parent_job(
            provider_id=provider_id,
            request=request,
            user_and_team=user_and_team,
            session=session,
            sweep_config=request.sweep_config,
            sweep_metric=request.sweep_metric or "eval/loss",
            lower_is_better=request.lower_is_better if request.lower_is_better is not None else True,
            total_configs=total_configs,
        )

        # Launch child jobs in the background using asyncio.create_task
        # This runs concurrently but still within the request context
        # Merge parameters (defaults) with config for sweep
        base_params_for_sweep = {}
        if request.parameters:
            base_params_for_sweep = request.parameters.copy()
        if request.config:
            base_params_for_sweep.update(request.config)

        asyncio.create_task(
            _launch_sweep_jobs(
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

    # Normal single job launch (existing logic)
    # (provider already fetched and validated above)

    # Quota checking and hold creation (only for REMOTE jobs)
    if request.minutes_requested is not None and request.minutes_requested > 0:
        has_quota, available, message = await quota_service.check_quota_available(
            session, user_id, team_id, request.minutes_requested
        )
        if not has_quota:
            raise HTTPException(status_code=403, detail=message)

    # Get provider instance (resolves user's slurm_user for SLURM when user_id/team_id set)
    provider_instance = await get_provider_instance(provider, user_id=user_id, team_id=team_id)

    # Interactive templates should start directly in INTERACTIVE state instead of LAUNCHING,
    # except for LOCAL providers where we introduce a WAITING status while queued.
    initial_status = JobStatus.INTERACTIVE if request.subtype == "interactive" else JobStatus.LAUNCHING
    if provider.type == ProviderType.LOCAL.value:
        initial_status = JobStatus.WAITING

    job_id = await job_service.job_create(
        type="REMOTE",
        status=initial_status,
        experiment_id=request.experiment_id,
    )

    # Ensure experiment job lists include the newly created REMOTE job.
    await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")

    await job_service.job_update_launch_progress(
        job_id,
        request.experiment_id,
        phase="checking_quota",
        percent=10,
        message="Checking quota",
    )

    # Create quota hold if minutes_requested is provided
    quota_hold = None
    if request.minutes_requested is not None and request.minutes_requested > 0:
        user_id_str = str(user.id)
        # For task_id, use task_name as identifier (task might not have a persistent ID yet)
        # We'll use a format that allows us to look it up later: f"{experiment_id}:{task_name}"
        task_identifier = request.task_name or f"job-{job_id}"
        quota_hold = await quota_service.create_quota_hold(
            session=session,
            user_id=user_id_str,
            team_id=team_id,
            task_id=task_identifier,
            minutes_requested=request.minutes_requested,
            job_id=str(job_id),
        )

    await job_service.job_update_launch_progress(
        job_id,
        request.experiment_id,
        phase="building_config",
        percent=30,
        message="Building cluster configuration",
    )

    base_name = request.cluster_name or request.task_name or provider.name
    formatted_cluster_name = f"{_sanitize_cluster_basename(base_name)}-job-{job_id}"

    user_info = {}
    if getattr(user, "first_name", None) or getattr(user, "last_name", None):
        user_info["name"] = " ".join(
            part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
        ).strip()
    if getattr(user, "email", None):
        user_info["email"] = getattr(user, "email")

    provider_display_name = request.provider_name or provider.name

    # Prepare environment variables - start with a copy of requested env_vars
    env_vars = request.env_vars.copy() if request.env_vars else {}
    print(f"[DEBUG launch_template] request.env_vars = {request.env_vars}")
    print(f"[DEBUG launch_template] env_vars after copy = {env_vars}")

    # Replace {{secret.<name>}} patterns in env_vars
    if env_vars and team_secrets:
        env_vars = replace_secrets_in_dict(env_vars, team_secrets)

    # Build setup script - add cloud credential helpers first, then file_mounts and other setup.
    setup_commands: list[str] = []

    if os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true":
        if STORAGE_PROVIDER == "aws":
            # Get AWS credentials from stored credentials file (transformerlab-s3 profile)
            aws_profile = "transformerlab-s3"
            aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(
                _get_aws_credentials_from_file, aws_profile
            )
            if aws_access_key_id and aws_secret_access_key:
                aws_credentials_dir = RUNPOD_AWS_CREDENTIALS_DIR if provider.type == ProviderType.RUNPOD.value else None
                aws_setup = _generate_aws_credentials_setup(
                    aws_access_key_id, aws_secret_access_key, aws_profile, aws_credentials_dir=aws_credentials_dir
                )
                setup_commands.append(aws_setup)
                if aws_credentials_dir:
                    env_vars["AWS_SHARED_CREDENTIALS_FILE"] = f"{aws_credentials_dir}/credentials"
        elif STORAGE_PROVIDER == "azure":
            azure_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
            azure_account = os.getenv("AZURE_STORAGE_ACCOUNT")
            azure_key = os.getenv("AZURE_STORAGE_KEY")
            azure_sas = os.getenv("AZURE_STORAGE_SAS_TOKEN")
            if azure_connection_string or azure_account:
                azure_setup = _generate_azure_credentials_setup(
                    azure_connection_string, azure_account, azure_key, azure_sas
                )
                setup_commands.append(azure_setup)
                if azure_connection_string:
                    env_vars["AZURE_STORAGE_CONNECTION_STRING"] = azure_connection_string
                if azure_account:
                    env_vars["AZURE_STORAGE_ACCOUNT"] = azure_account
                if azure_key:
                    env_vars["AZURE_STORAGE_KEY"] = azure_key
                if azure_sas:
                    env_vars["AZURE_STORAGE_SAS_TOKEN"] = azure_sas

    if request.file_mounts is True and request.task_id:
        setup_commands.append(COPY_FILE_MOUNTS_SETUP)
    # Ensure transformerlab SDK is available on remote machines for live_status tracking and other helpers.
    # This runs after AWS credentials are configured so we have access to any remote storage if needed.
    if provider.type != ProviderType.LOCAL.value:
        setup_commands.append("pip install -q transformerlab")

    # Add GitHub clone setup if enabled
    if request.github_repo_url:
        workspace_dir = await get_workspace_dir()
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
        directory = request.github_repo_dir or request.github_directory
        branch = request.github_repo_branch or request.github_branch
        github_setup = generate_github_clone_setup(
            repo_url=request.github_repo_url,
            directory=directory,
            github_pat=github_pat,
            branch=branch,
        )
        setup_commands.append(github_setup)

    # Add SSH public key setup for SSH interactive tasks and for RunPod (so we can read provider logs via SSH)
    if (
        request.subtype == "interactive" and request.interactive_type == "ssh"
    ) or provider.type == ProviderType.RUNPOD.value:
        from transformerlab.services.ssh_key_service import get_or_create_org_ssh_key_pair, get_org_ssh_public_key

        try:
            # Get or create SSH key pair for this organization
            await get_or_create_org_ssh_key_pair(team_id)
            public_key = await get_org_ssh_public_key(team_id)

            # Generate setup script to add public key to authorized_keys
            # Escape the public key for use in shell script - use single quotes to avoid shell expansion
            # Remove newlines from public key (should be single line anyway)
            public_key_clean = public_key.strip().replace("\n", "").replace("\r", "")
            # Escape single quotes in public key for use within single-quoted string
            public_key_escaped = public_key_clean.replace("'", "'\"'\"'")

            if provider.type == ProviderType.RUNPOD.value:
                # For RunPod: use RunPod's recommended SSH setup from their docs
                # Set SSH_PUBLIC_KEY environment variable (RunPod's override env var for SSH keys)
                # Reference: https://docs.runpod.io/pods/configuration/use-ssh
                env_vars["SSH_PUBLIC_KEY"] = public_key_clean
                ssh_setup = (
                    "apt-get update -qq && "
                    "DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server >/dev/null 2>&1 && "
                    "mkdir -p ~/.ssh && "
                    "cd ~/.ssh && "
                    "chmod 700 ~/.ssh && "
                    'echo "$SSH_PUBLIC_KEY" >> authorized_keys && '
                    "chmod 600 authorized_keys && "
                    "service ssh start"
                )
            else:
                # For other providers (interactive SSH tasks): standard setup
                ssh_setup = f"mkdir -p ~/.ssh && chmod 700 ~/.ssh; if [ ! -f ~/.ssh/authorized_keys ]; then touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys; fi; if ! grep -qF '{public_key_escaped}' ~/.ssh/authorized_keys; then echo '{public_key_escaped}' >> ~/.ssh/authorized_keys; fi"

            setup_commands.append(ssh_setup)
        except Exception as e:
            # Log error but don't fail the launch - SSH key setup is optional
            print(f"Warning: Failed to set up SSH key for organization {team_id}: {e}")

    # Note: final_setup is assembled later, after we optionally inject
    # interactive remote setup based on the gallery entry.

    # Add default environment variables
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
    env_vars["_TFL_USER_ID"] = user_id

    # Enable Trackio auto-init for this job if requested. When set, the lab SDK
    # running inside the remote script can automatically initialize Trackio
    # and capture metrics for visualization in the Tasks UI.
    if request.enable_trackio:
        env_vars["TLAB_TRACKIO_AUTO_INIT"] = "true"

    # Get TFL_STORAGE_URI from storage context
    tfl_storage_uri = None
    try:
        storage_root = await storage.root_uri()
        if storage_root:
            if storage.is_remote_path(storage_root):
                # Remote cloud storage (S3/GCS/etc.)
                tfl_storage_uri = storage_root
            elif STORAGE_PROVIDER == "localfs":
                # localfs: expose the local mount path to the remote worker
                tfl_storage_uri = storage_root
    except Exception:
        pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri

    # For local provider, set TFL_WORKSPACE_DIR so the lab SDK in the subprocess can find
    # the job directory (workspace/jobs/<job_id>). The organization context for the API
    # request is already set by authentication middleware, so we can rely on
    # get_workspace_dir() without mutating the global org context here.
    if provider.type == ProviderType.LOCAL.value and team_id:
        workspace_dir = await get_workspace_dir()
        if workspace_dir and not storage.is_remote_path(workspace_dir):
            env_vars["TFL_WORKSPACE_DIR"] = workspace_dir

    # Resolve run command (and optional setup override) for interactive sessions from gallery
    base_command = request.run
    setup_override_from_gallery = None
    interactive_setup_added = False
    if request.subtype == "interactive" and request.interactive_gallery_id:
        gallery_list = await galleries.get_interactive_gallery()
        gallery_entry = find_interactive_gallery_entry(
            gallery_list,
            interactive_gallery_id=request.interactive_gallery_id,
        )
        if gallery_entry:
            environment = "local" if (provider.type == ProviderType.LOCAL.value or request.local) else "remote"
            # Run gallery/task setup for both local and remote interactive (SUDO prefix so $SUDO is defined).
            # Ngrok is installed only when tunnel logic runs (remote); setup has no ngrok.
            from transformerlab.shared.interactive_gallery_utils import INTERACTIVE_SUDO_PREFIX

            raw_setup = (gallery_entry.get("setup") or "").strip() or (request.setup or "").strip()
            if raw_setup:
                setup_commands.append(INTERACTIVE_SUDO_PREFIX + " " + raw_setup)
                interactive_setup_added = True

            resolved_cmd, setup_override_from_gallery = resolve_interactive_command(gallery_entry, environment)
            if resolved_cmd:
                base_command = INTERACTIVE_SUDO_PREFIX + " " + resolved_cmd
            if setup_override_from_gallery and team_secrets:
                setup_override_from_gallery = replace_secret_placeholders(setup_override_from_gallery, team_secrets)

    # Add user-provided setup if any (replace secrets in setup).
    # For interactive tasks we already added gallery/task setup above (local and remote).
    if request.setup and not interactive_setup_added:
        setup_with_secrets = replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
        setup_commands.append(setup_with_secrets)

    # Join setup commands, stripping trailing semicolons to avoid double semicolons
    if setup_commands:
        cleaned_commands = [cmd.rstrip(";").rstrip() for cmd in setup_commands if cmd.strip()]
        final_setup = ";".join(cleaned_commands) if cleaned_commands else None
    else:
        final_setup = None

    if setup_override_from_gallery is not None:
        final_setup = setup_override_from_gallery

    # Replace secrets in command
    command_with_secrets = replace_secret_placeholders(base_command, team_secrets) if team_secrets else base_command

    # Replace secrets in parameters if present
    # Merge parameters (defaults) with config (user's custom values for this run)
    merged_parameters = {}
    if request.parameters:
        merged_parameters = request.parameters.copy()
    if request.config:
        merged_parameters.update(request.config)

    # Extract any per-run custom SBATCH flags from config (used by SLURM provider)
    custom_sbatch_flags = None
    if request.config and "custom_sbatch_flags" in request.config:
        raw_flags = request.config.get("custom_sbatch_flags")
        if isinstance(raw_flags, str):
            custom_sbatch_flags = raw_flags.strip() or None
        elif raw_flags is not None:
            custom_sbatch_flags = str(raw_flags).strip() or None

    # Replace secrets in merged parameters
    parameters_with_secrets = None
    if merged_parameters and team_secrets:
        parameters_with_secrets = replace_secrets_in_dict(merged_parameters, team_secrets)
    else:
        parameters_with_secrets = merged_parameters if merged_parameters else None

    # Build provider_config for cluster_config (and job_data for local provider)
    provider_config_dict = {"requested_disk_space": request.disk_space}
    # For SLURM, pass through any per-run custom SBATCH flags so the provider
    # can inject them into the generated SLURM script.
    if provider.type == ProviderType.SLURM.value and custom_sbatch_flags:
        provider_config_dict["custom_sbatch_flags"] = custom_sbatch_flags
    if provider.type == ProviderType.LOCAL.value:
        # Use a dedicated local-only job directory for the local provider.
        # This directory is always on the host filesystem and does not depend
        # on TFL_REMOTE_STORAGE_ENABLED / remote storage configuration.
        job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
        provider_config_dict["workspace_dir"] = job_dir

    # Copy task files (task.yaml and any attachments) into the job directory
    # so they are available to the running command on any provider.
    # index.json is excluded because the job system uses its own index.json
    # for metadata and overwriting it with the task's index.json would break
    # job status tracking.
    if request.task_id:
        task_dir_root = await get_task_dir()
        task_src = storage.join(task_dir_root, secure_filename(str(request.task_id)))
        if await storage.isdir(task_src):
            workspace_job_dir = await get_job_dir(job_id)
            await _copy_task_files_to_dir(task_src, workspace_job_dir)

    job_data = {
        "task_name": request.task_name,
        "run": command_with_secrets,
        "cluster_name": formatted_cluster_name,
        "subtype": request.subtype,
        "interactive_type": request.interactive_type,
        "interactive_gallery_id": request.interactive_gallery_id,
        "local": request.local,
        "cpus": request.cpus,
        "memory": request.memory,
        "disk_space": request.disk_space,
        "accelerators": request.accelerators,
        "num_nodes": request.num_nodes,
        "setup": final_setup,
        "env_vars": env_vars if env_vars else None,
        "file_mounts": request.file_mounts if request.file_mounts is not True else True,
        "parameters": parameters_with_secrets or None,
        "provider_id": provider.id,
        "provider_type": provider.type,
        "provider_name": provider_display_name,
        "user_info": user_info or None,
        "team_id": team_id,  # Store team_id for quota tracking
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }
    if provider.type == ProviderType.LOCAL.value and provider_config_dict.get("workspace_dir"):
        job_data["workspace_dir"] = provider_config_dict["workspace_dir"]
    if request.file_mounts is True and request.task_id:
        job_data["task_id"] = request.task_id

    for key, value in job_data.items():
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(job_id, key, value, request.experiment_id)

    disk_size = None
    if request.disk_space:
        try:
            disk_size = int(request.disk_space)
        except (TypeError, ValueError):
            disk_size = None

    # When file_mounts is True we use lab.copy_file_mounts() in setup; do not send to provider
    file_mounts_for_provider = request.file_mounts if isinstance(request.file_mounts, dict) else {}

    # Wrap the user command with tfl-remote-trap so we can track live_status in job_data.
    # This uses the tfl-remote-trap helper from the transformerlab SDK, which:
    #   - sets job_data.live_status="started" when execution begins
    #   - sets job_data.live_status="finished" on success
    #   - sets job_data.live_status="crashed" on failure
    wrapped_run = f"tfl-remote-trap -- {command_with_secrets}"

    cluster_config = ClusterConfig(
        cluster_name=formatted_cluster_name,
        provider_name=provider_display_name,
        provider_id=provider.id,
        run=wrapped_run,
        setup=final_setup,
        env_vars=env_vars,
        cpus=request.cpus,
        memory=request.memory,
        accelerators=request.accelerators,
        num_nodes=request.num_nodes,
        disk_size=disk_size,
        file_mounts=file_mounts_for_provider,
        provider_config=provider_config_dict,
    )

    await job_service.job_update_launch_progress(
        job_id,
        request.experiment_id,
        phase="launching_cluster",
        percent=70,
        message="Launching cluster",
    )

    # For LOCAL provider, enqueue the launch and return immediately with WAITING status
    if provider.type == ProviderType.LOCAL.value:
        # Commit quota hold (if any) before enqueuing so the worker can see it
        if quota_hold:
            await session.commit()

        await job_service.job_update_launch_progress(
            job_id,
            request.experiment_id,
            phase="queued",
            percent=0,
            message="Queued for launch",
        )
        await enqueue_local_launch(
            job_id=str(job_id),
            experiment_id=request.experiment_id,
            provider_id=provider.id,
            team_id=team_id,
            cluster_name=formatted_cluster_name,
            cluster_config=cluster_config,
            quota_hold_id=str(quota_hold.id) if quota_hold else None,
            initial_status=JobStatus.INTERACTIVE if request.subtype == "interactive" else JobStatus.LAUNCHING,
        )

        return {
            "status": JobStatus.WAITING,
            "job_id": job_id,
            "cluster_name": formatted_cluster_name,
            "request_id": None,
            "message": "Local provider launch waiting in queue",
        }

    try:
        launch_result = await asyncio.to_thread(
            provider_instance.launch_cluster, formatted_cluster_name, cluster_config
        )
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_launch_progress(
            job_id,
            request.experiment_id,
            phase="failed",
            percent=100,
            message=f"Launch failed: {exc!s}",
        )
        # Release quota hold if launch failed
        if quota_hold:
            await quota_service.release_quota_hold(session, hold_id=quota_hold.id)
            await session.commit()
        await job_service.job_update_status(
            job_id,
            JobStatus.FAILED,
            request.experiment_id,
            error_msg=str(exc),
        )
        raise HTTPException(status_code=500, detail="Failed to launch cluster") from exc

    await job_service.job_update_launch_progress(
        job_id,
        request.experiment_id,
        phase="cluster_started",
        percent=100,
        message="Launch initiated",
    )

    # Commit quota hold creation after successful launch
    if quota_hold:
        await session.commit()

    request_id = None
    if isinstance(launch_result, dict):
        await job_service.job_update_job_data_insert_key_value(
            job_id,
            "provider_launch_result",
            launch_result,
            request.experiment_id,
        )
        request_id = launch_result.get("request_id")
        if request_id:
            await job_service.job_update_job_data_insert_key_value(
                job_id,
                "orchestrator_request_id",
                request_id,
                request.experiment_id,
            )

    return {
        "status": "success",
        "job_id": job_id,
        "cluster_name": formatted_cluster_name,
        "request_id": request_id,
        "message": "Provider launch initiated",
    }


@router.get("/jobs/{job_id}/check-status")
async def check_provider_job_status(
    job_id: str,
    user_and_team=Depends(get_user_and_team),
):
    """
    Return the current status of a REMOTE job (read-only).

    Provider polling and status transitions are handled by the
    remote_job_status_service background worker, which runs every
    REMOTE_JOB_STATUS_INTERVAL_SECONDS seconds. This endpoint is
    intentionally side-effect-free so that frequent frontend polling
    never blocks on provider latency or downtime.
    """
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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Check for completed REMOTE jobs without quota records and record quota usage for them.
    Can be called periodically to ensure all completed jobs have quota tracked.

    If job_id is provided, checks only that job.
    If experiment_id is provided, checks all REMOTE jobs in that experiment.
    Otherwise, returns instructions.
    """
    team_id = user_and_team["team_id"]

    if job_id:
        # Check specific job
        # Pass team_id from user_and_team context
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
        return {
            "status": "error",
            "message": "Either job_id or experiment_id must be provided",
        }

    # Get all REMOTE jobs for the experiment
    jobs = await job_service.jobs_get_all(type="REMOTE", experiment_id=experiment_id)

    jobs_processed = 0
    jobs_recorded = 0

    for job in jobs:
        job_status = job.get("status", "")
        if job_status in (JobStatus.COMPLETE, JobStatus.STOPPED, JobStatus.FAILED, JobStatus.DELETED):
            jobs_processed += 1
            job_id_str = str(job.get("id", ""))
            if job_id_str:
                # Pass team_id from user_and_team context
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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Fetch all SWEEP jobs for an experiment and return current persisted status.
    Status updates are handled by a background worker.
    """
    all_sweep_jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="SWEEP", status="")

    return {
        "status": "success",
        "experiment_id": experiment_id,
        "jobs": all_sweep_jobs,
        "total": len(all_sweep_jobs),
    }


@router.get("/jobs/{job_id}/sweep-status")
async def check_sweep_status(
    job_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Check status of a specific sweep job from current persisted values.
    Returns current sweep status with counts and job data.
    """
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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get aggregated results from all child jobs in a sweep.
    Extracts metrics from each child job and determines the best configuration.
    """

    # Get the parent sweep job
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

    # Collect results from all child jobs
    results = []
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

        # Try to extract metric from job_data
        # Check for score field (from lab.finish(score={...}))
        metric_value = None
        metrics = {}

        if "score" in child_job_data:
            score = child_job_data["score"]
            if isinstance(score, dict):
                metrics = score
                metric_value = score.get(sweep_metric)
            elif isinstance(score, (int, float)):
                metric_value = score
                metrics = {sweep_metric: score}

        # Fallback: check completion_details for metrics
        if metric_value is None and "completion_details" in child_job_data:
            completion_details = child_job_data["completion_details"]
            if isinstance(completion_details, dict) and sweep_metric in completion_details:
                metric_value = completion_details[sweep_metric]
                metrics = {sweep_metric: metric_value}

        result_entry = {
            "job_id": child_job_id,
            "run_index": sweep_run_index,
            "config": sweep_params,
            "status": child_status,
            "metrics": metrics,
            "metric_value": metric_value,
        }
        results.append(result_entry)

        # Track best configuration
        if metric_value is not None and child_status == JobStatus.COMPLETE:
            is_better = (lower_is_better and metric_value < best_metric_value) or (
                not lower_is_better and metric_value > best_metric_value
            )
            if is_better:
                best_metric_value = metric_value
                best_config = sweep_params.copy()
                best_job_id = child_job_id

    # Sort results by run_index
    results.sort(key=lambda x: x["run_index"])

    # Build aggregated results
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

    # Store results in parent job
    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_results", aggregated_results, experiment_id)

    return {
        "status": "success",
        "data": aggregated_results,
    }


@router.post("/jobs/{job_id}/resume_from_checkpoint")
async def resume_from_checkpoint(
    job_id: str,
    experimentId: str = Query(..., description="Experiment ID"),
    request: ResumeFromCheckpointRequest = ...,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Resume a REMOTE job from a checkpoint by creating a new job with the same configuration
    and setting parent_job_id and resumed_from_checkpoint in job_data.
    """
    import json
    from transformerlab.services import job_service
    from lab.dirs import get_job_checkpoints_dir
    from lab import storage
    import time

    # Get the original job
    original_job = await job_service.job_get(job_id)
    if not original_job or str(original_job.get("experiment_id")) != str(experimentId):
        raise HTTPException(status_code=404, detail="Job not found")

    # Validate it's a REMOTE job
    if original_job.get("type") != "REMOTE":
        raise HTTPException(status_code=400, detail="Resume from checkpoint is only supported for REMOTE jobs")

    # Get job_data
    job_data = original_job.get("job_data") or {}
    if not isinstance(job_data, dict):
        try:
            job_data = json.loads(job_data)
        except json.JSONDecodeError:
            job_data = {}

    # Validate required fields for REMOTE job relaunch
    provider_id = job_data.get("provider_id")
    run = job_data.get("run")
    if not provider_id or not run:
        raise HTTPException(
            status_code=400,
            detail="Original job is missing required fields (provider_id or run) for resume",
        )

    # Verify checkpoint exists using workspace-aware path resolution
    checkpoints_dir = await get_job_checkpoints_dir(job_id)
    checkpoint_path = storage.join(checkpoints_dir, request.checkpoint)
    if not await storage.exists(checkpoint_path):
        raise HTTPException(status_code=404, detail=f"Checkpoint '{request.checkpoint}' not found")

    # Get provider
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Create new REMOTE job
    initial_status = JobStatus.INTERACTIVE if job_data.get("subtype") == "interactive" else JobStatus.LAUNCHING
    new_job_id = await job_service.job_create(
        type="REMOTE", status=initial_status, experiment_id=experimentId, job_data={}
    )

    # Ensure experiment job lists include the resumed REMOTE job.
    await cache.invalidate("jobs", f"jobs:list:{experimentId}")

    # Set parent_job_id and resumed_from_checkpoint in job_data
    await job_service.job_update_job_data_insert_key_value(new_job_id, "parent_job_id", job_id, experimentId)
    await job_service.job_update_job_data_insert_key_value(
        new_job_id, "resumed_from_checkpoint", request.checkpoint, experimentId
    )

    # Copy all original job launch configuration
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
        # Canonical GitHub fields
        "github_repo_url",
        "github_repo_dir",
        "github_repo_branch",
        # Legacy GitHub fields retained for backward compatibility
        "github_directory",
        "github_branch",
        "user_info",
        "team_id",
    ]

    for field in config_fields:
        value = job_data.get(field)
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(new_job_id, field, value, experimentId)

    # Relaunch via provider (uses current user's slurm_user for SLURM)
    user_id_str = str(user_and_team["user"].id)
    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
    except Exception as exc:
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experimentId, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to initialize provider: {exc}") from exc

    # Build cluster name
    base_name = job_data.get("task_name") or provider.name
    formatted_cluster_name = f"{_sanitize_cluster_basename(base_name)}-job-{new_job_id}"

    # Get user info
    user = user_and_team.get("user")
    user_info = {}
    if user:
        if getattr(user, "first_name", None) or getattr(user, "last_name", None):
            user_info["name"] = " ".join(
                part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
            ).strip()
        if getattr(user, "email", None):
            user_info["email"] = getattr(user, "email")

    provider_display_name = job_data.get("provider_name") or provider.name

    # Prepare environment variables
    env_vars = (job_data.get("env_vars") or {}).copy()
    env_vars["_TFL_JOB_ID"] = str(new_job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = experimentId
    if user:
        env_vars["_TFL_USER_ID"] = str(user.id)

    # Get TFL_STORAGE_URI from storage context
    tfl_storage_uri = None
    try:
        storage_root = await storage.root_uri()
        if storage_root:
            if storage.is_remote_path(storage_root):
                # Remote cloud storage (S3/GCS/etc.)
                tfl_storage_uri = storage_root
            elif STORAGE_PROVIDER == "localfs":
                # localfs: expose the local mount path to the remote worker
                tfl_storage_uri = storage_root
    except Exception:
        pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri

    # For local provider, set TFL_WORKSPACE_DIR so the lab SDK in the subprocess finds the job dir
    if provider.type == ProviderType.LOCAL.value and team_id:
        set_organization_id(team_id)
        try:
            workspace_dir = await get_workspace_dir()
            if workspace_dir and not storage.is_remote_path(workspace_dir):
                env_vars["TFL_WORKSPACE_DIR"] = workspace_dir
        finally:
            set_organization_id(None)

    # Build setup script
    setup_commands = []
    # Add GitHub clone setup if enabled
    github_repo_url = job_data.get("github_repo_url")
    if github_repo_url:
        workspace_dir = await get_workspace_dir()
        user_id_for_pat = str(user.id) if user else None
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id_for_pat)
        github_setup = generate_github_clone_setup(
            repo_url=github_repo_url,
            directory=job_data.get("github_directory"),
            github_pat=github_pat,
            branch=job_data.get("github_branch"),
        )
        setup_commands.append(github_setup)

    # Add user-provided setup if any
    original_setup = job_data.get("setup")
    if original_setup:
        setup_commands.append(original_setup)

    final_setup = ";".join(setup_commands) if setup_commands else None

    # Update job_data with launch configuration
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

    for key, value in launch_job_data.items():
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(new_job_id, key, value, experimentId)

    # Build ClusterConfig
    disk_size = None
    if job_data.get("disk_space"):
        try:
            disk_size = int(job_data.get("disk_space"))
        except (TypeError, ValueError):
            disk_size = None

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

    # Launch cluster
    try:
        await asyncio.to_thread(provider_instance.launch_cluster, formatted_cluster_name, cluster_config)
        return {
            "job_id": new_job_id,
            "message": "Job relaunched from checkpoint",
            "cluster_name": formatted_cluster_name,
        }
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experimentId, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to relaunch job: {exc}") from exc


@router.post("/{provider_id}/clusters/{cluster_name}/stop")
async def stop_cluster(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Stop a running cluster (but don't tear it down).
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Local provider needs workspace_dir (job dir) to stop the correct process tree.
        # Derive job_id from the standard "-job-<job_id>" suffix in the cluster name.
        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_id_segment = None
            if "-job-" in cluster_name:
                job_id_segment = cluster_name.rsplit("-job-", 1)[-1] or None
            if job_id_segment is not None:
                job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id_segment, org_id=team_id)
                provider_instance.extra_config["workspace_dir"] = job_dir

        # Stop cluster
        result = await asyncio.to_thread(provider_instance.stop_cluster, cluster_name)

        # Return the result directly from the provider
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to stop cluster")


@router.get("/{provider_id}/clusters/{cluster_name}/status", response_model=ClusterStatus)
async def get_cluster_status(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get the status of a cluster.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Get cluster status
        status = await asyncio.to_thread(provider_instance.get_cluster_status, cluster_name)

        return status
    except Exception as e:
        print(f"Failed to get cluster status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cluster status")


@router.get("/{provider_id}/clusters/{cluster_name}/resources", response_model=ResourceInfo)
async def get_cluster_resources(
    provider_id: str,
    cluster_name: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get resource information for a cluster (GPUs, CPUs, memory, etc.).
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Get cluster resources
        resources = await asyncio.to_thread(provider_instance.get_cluster_resources, cluster_name)

        return resources
    except Exception as e:
        print(f"Failed to get cluster resources: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cluster resources")


@router.get("/{provider_id}/clusters")
async def list_clusters_detailed(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get detailed list of clusters for a provider, including nodes and resources.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Get detailed clusters
        clusters = await asyncio.to_thread(provider_instance.get_clusters_detailed)

        return clusters
    except Exception as e:
        print(f"Failed to list clusters: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list clusters")


def _get_provider_setup_status_path(workspace_dir: str, team_id: str, provider_id: str) -> Path:
    """Return path to the transient local-provider-setup status file for this team/provider."""
    safe_team = str(team_id).replace("/", "_")
    safe_provider = str(provider_id).replace("/", "_")
    return Path(workspace_dir) / f".local_provider_setup_status_{safe_team}_{safe_provider}.json"


async def _run_local_provider_setup_background(
    provider_instance: Any,
    status_path: Path,
) -> None:
    """
    Run LocalProvider.setup in the background and write progress snapshots to a status file.

    The status file is deleted when setup completes (success or failure).
    """

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
            # Best-effort only – avoid crashing on I/O errors.
            logger.exception("Failed to write provider setup status to %s", status_path)

    def progress_callback(phase: str, percent: int, message: str) -> None:
        write_status(phase, percent, message, done=False, error=None)

    try:
        loop = asyncio.get_running_loop()
        # Run the blocking setup() in a thread executor.
        await loop.run_in_executor(None, lambda: provider_instance.setup(progress_callback=progress_callback))
        write_status("provider_setup_done", 100, "Local provider setup completed successfully.", done=True, error=None)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to run provider setup in background")
        write_status("provider_setup_failed", 100, f"Local provider setup failed: {exc}", done=True, error=str(exc))
    finally:
        # Delete the status file after completion so subsequent status checks see an idle state.
        try:
            if status_path.exists():
                status_path.unlink()
        except Exception:
            logger.exception("Failed to delete provider setup status file %s", status_path)


@router.post("/{provider_id}/setup")
async def setup_provider(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    Start provider-level setup for a compute provider in the background.

    Currently this is only meaningful for LOCAL providers, where we create
    and populate the shared base uv virtual environment and generate a
    local machine metrics snapshot. For remote providers this endpoint is a
    fast no-op and simply returns {"status": "skipped"}.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # For non-local providers, there is no provider-level setup today.
    if provider.type != ProviderType.LOCAL.value:
        return {
            "status": "skipped",
            "provider_type": provider.type,
            "message": "Provider setup is only required for local providers.",
        }

    # Resolve provider instance for this user/team.
    user_id_str = str(user_and_team["user"].id)
    provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

    # Determine workspace directory for this organization/team and compute status path.
    set_organization_id(team_id)
    try:
        workspace_dir = await get_workspace_dir()
    finally:
        set_organization_id(None)

    status_path = _get_provider_setup_status_path(workspace_dir, team_id, provider_id)
    try:
        status_path.parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        # Parent should already exist, but log and continue if it doesn't.
        logger.exception("Failed to ensure parent directory for provider setup status %s", status_path)

    # Seed initial status so the status endpoint can report that setup has started.
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

    # Kick off background setup and return immediately.
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
    user_and_team=Depends(get_user_and_team),
) -> Dict[str, Any]:
    """
    Get the latest status of a provider-level setup run.

    Returns an "idle" state when no setup is currently running (status file
    does not exist).
    """
    team_id = user_and_team["team_id"]

    set_organization_id(team_id)
    try:
        workspace_dir = await get_workspace_dir()
    finally:
        set_organization_id(None)

    status_path = _get_provider_setup_status_path(workspace_dir, team_id, provider_id)
    if not status_path.exists():
        return {
            "status": "idle",
            "provider_id": provider_id,
            "done": True,
            "message": "No active provider setup.",
        }

    try:
        raw = status_path.read_text(encoding="utf-8")
        data = json.loads(raw)
    except Exception:
        logger.exception("Failed to read provider setup status from %s", status_path)
        raise HTTPException(status_code=500, detail="Failed to read provider setup status")

    data.setdefault("status", "running" if not data.get("done") else "completed")
    data.setdefault("provider_id", provider_id)
    return data


# ============================================================================
# Job Management Routes
# ============================================================================


@router.post("/{provider_id}/clusters/{cluster_name}/jobs")
async def submit_job(
    provider_id: str,
    cluster_name: str,
    job_config: JobConfig,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Submit a job to an existing cluster.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Submit job
        result = await asyncio.to_thread(provider_instance.submit_job, cluster_name, job_config)

        # Extract job_id from result
        job_id = result.get("job_id") or result.get("request_id")

        return {
            "status": "success",
            "message": "Job submitted successfully",
            "job_id": job_id,
            "cluster_name": cluster_name,
            "result": result,
        }
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Failed to submit job: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to submit job")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs", response_model=List[JobInfo])
async def list_jobs(
    provider_id: str,
    cluster_name: str,
    state: Optional[JobState] = Query(None, description="Filter jobs by state"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    List all jobs for a cluster.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # List jobs
        jobs = await asyncio.to_thread(provider_instance.list_jobs, cluster_name)

        # Filter by state if provided
        if state:
            jobs = [job for job in jobs if job.state == state]

        return jobs
    except NotImplementedError:
        # Provider doesn't support listing jobs (e.g., Runpod)
        return []
    except Exception as e:
        print(f"Failed to list jobs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list jobs")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}", response_model=JobInfo)
async def get_job_info(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get information about a specific job.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # List jobs and find the specific one
        try:
            jobs = await asyncio.to_thread(provider_instance.list_jobs, cluster_name)
        except NotImplementedError:
            # Provider doesn't support listing jobs (e.g., Runpod)
            raise HTTPException(
                status_code=400,
                detail="This provider does not support job listing. Runpod uses pod-based execution, not a job queue.",
            )

        # Convert job_id to appropriate type for comparison
        job_id_str = str(job_id)
        job_id_int = int(job_id) if isinstance(job_id, str) and job_id.isdigit() else job_id

        # Find job by ID (try both string and int comparison)
        job = None
        for j in jobs:
            if str(j.job_id) == job_id_str or j.job_id == job_id_int:
                job = j
                break

        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

        return job
    except HTTPException:
        raise
    except Exception as e:
        print(f"Failed to get job info: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get job info")


@router.get("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}/logs")
async def get_job_logs(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    tail_lines: Optional[int] = Query(None, description="Number of lines to retrieve from the end"),
    follow: bool = Query(False, description="Whether to stream/follow logs"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get logs for a job.
    Requires X-Team-Id header and team membership.

    If follow=true, returns a streaming response (Server-Sent Events).
    Otherwise, returns the full log content as text.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Local provider needs workspace_dir (job dir) to read logs
        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        # Get job logs
        try:
            logs = await asyncio.to_thread(
                provider_instance.get_job_logs,
                cluster_name,
                job_id,
                tail_lines=tail_lines,
                follow=follow,
            )
        except NotImplementedError:
            # Provider doesn't support job logs (though Runpod returns a string message, not NotImplementedError)
            logs = "Logs not available for this provider type."

        if follow:
            # Return streaming response
            # If logs is already an iterator/stream, use it directly
            if hasattr(logs, "__iter__") and not isinstance(logs, (str, bytes)):

                async def generate():
                    try:
                        for line in logs:
                            if isinstance(line, bytes):
                                text = line.decode("utf-8", errors="replace")
                            else:
                                text = str(line) + "\n"

                            if text.startswith("Error reading logs:"):
                                yield "Failed to retrieve logs.\n"
                                break
                            elif text and not text.startswith("Error reading logs:"):
                                yield text
                    except Exception as e:
                        print(f"Error streaming logs: {str(e)}")
                        yield "\n[Error streaming logs]\n"

                return StreamingResponse(
                    generate(),
                    media_type="text/plain",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
            else:
                # Fallback: convert to string and stream line by line
                log_str = str(logs) if logs else ""

                async def generate():
                    for line in log_str.split("\n"):
                        if line.startswith("Error reading logs:"):
                            yield "Failed to retrieve logs.\n"
                            break
                        elif line:
                            yield line + "\n"

                return StreamingResponse(
                    generate(),
                    media_type="text/plain",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
        else:
            # Return full log content as text
            log_content = str(logs) if logs else ""
            # Suppress internal error details from provider
            if log_content.startswith("Error reading logs:"):
                # Optionally log or record the internal error here server-side.
                return "Failed to retrieve logs."

            return log_content
    except Exception as e:
        print(f"Failed to get job logs: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get job logs")


@router.delete("/{provider_id}/clusters/{cluster_name}/jobs/{job_id}")
async def cancel_job(
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Cancel a running or queued job.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        # Local provider needs workspace_dir (job dir) to cancel the correct process
        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        # Cancel job
        result = await asyncio.to_thread(provider_instance.cancel_job, cluster_name, job_id)

        return {
            "status": "success",
            "message": "Job cancelled successfully",
            "job_id": job_id,
            "cluster_name": cluster_name,
            "result": result,
        }
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"Failed to cancel job: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel job")
