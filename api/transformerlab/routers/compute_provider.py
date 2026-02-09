"""Router for managing team-scoped compute providers."""

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
    create_team_provider,
    update_team_provider,
    delete_team_provider,
    get_provider_instance,
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
from transformerlab.shared.models.models import ProviderType
from transformerlab.compute_providers.models import (
    ClusterConfig,
    ClusterStatus,
    ClusterState,
    ResourceInfo,
    JobConfig,
    JobInfo,
    JobState,
)
from transformerlab.services import job_service
from transformerlab.services import quota_service
from transformerlab.services.local_provider_queue import enqueue_local_launch
from lab import storage
from lab.dirs import get_workspace_dir, get_local_provider_job_dir
from transformerlab.shared.github_utils import (
    read_github_pat_from_workspace,
    generate_github_clone_setup,
)
from transformerlab.shared.secret_utils import load_team_secrets, replace_secrets_in_dict, replace_secret_placeholders
from typing import Any

router = APIRouter(prefix="/compute_provider", tags=["compute_provider"])


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
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    List all providers for the current team.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]
    providers = await list_team_providers(session, team_id)

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

    config_key = f"provider:{provider_id}:slurm_user"
    slurm_user = await db.config_get(key=config_key, user_id=user_id, team_id=team_id)

    has_ssh_key = False
    if provider.type == ProviderType.SLURM.value:
        has_ssh_key = await user_slurm_key_exists(team_id, provider_id, user_id)

    return {
        "provider_id": provider_id,
        "slurm_user": slurm_user,
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

    # Only allow SLURM providers to have slurm_user setting
    if provider.type != ProviderType.SLURM.value:
        raise HTTPException(status_code=400, detail="slurm_user setting is only available for SLURM providers")

    # Read slurm_user from request body (frontend sends JSON body)
    slurm_user = (body or {}).get("slurm_user")
    if isinstance(slurm_user, str):
        slurm_user = slurm_user.strip() or None
    elif slurm_user is not None and not isinstance(slurm_user, str):
        slurm_user = str(slurm_user).strip() or None

    # Set user-specific slurm_user setting
    config_key = f"provider:{provider_id}:slurm_user"
    if slurm_user:
        await db.config_set(key=config_key, value=slurm_user, user_id=user_id, team_id=team_id)
    else:
        await db.config_set(key=config_key, value="", user_id=user_id, team_id=team_id)

    has_ssh_key = False
    if provider.type == ProviderType.SLURM.value:
        from transformerlab.services.user_slurm_key_service import user_slurm_key_exists

        has_ssh_key = await user_slurm_key_exists(team_id, provider_id, user_id)

    return {
        "provider_id": provider_id,
        "slurm_user": slurm_user,
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

    # Update provider
    provider = await update_team_provider(session=session, provider=provider, name=update_name, config=update_config)

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
        is_active = provider_instance.check()

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


def _generate_aws_credentials_setup(
    aws_access_key_id: str, aws_secret_access_key: str, aws_profile: Optional[str] = None
) -> str:
    """
    Generate bash script to set up AWS credentials in ~/.aws/credentials.

    Args:
        aws_access_key_id: AWS access key ID
        aws_secret_access_key: AWS secret access key
        aws_profile: AWS profile name (defaults to 'transformerlab-s3' if not provided)

    Returns:
        Bash script to configure AWS credentials
    """
    profile_name = aws_profile or os.getenv("AWS_PROFILE", "transformerlab-s3")

    # Escape for bash: single quotes and special characters
    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_access_key = escape_bash(aws_access_key_id)
    escaped_secret_key = escape_bash(aws_secret_access_key)
    escaped_profile = escape_bash(profile_name).replace("[", "\\[").replace("]", "\\]")

    # Simple approach: create dir, remove old profile section directly, append new profile
    setup_script = (
        f"echo 'Setting up AWS credentials for profile: {profile_name}'; "
        f"mkdir -p ~/.aws; "
        f"chmod 700 ~/.aws; "
        f"if [ -f ~/.aws/credentials ]; then "
        f"  awk 'BEGIN{{in_profile=0}} /^\\[{escaped_profile}\\]/{{in_profile=1; next}} /^\\[/{{in_profile=0}} !in_profile{{print}}' ~/.aws/credentials > ~/.aws/credentials.new && mv ~/.aws/credentials.new ~/.aws/credentials || true; "
        f"fi; "
        f"echo '[{profile_name}]' >> ~/.aws/credentials; "
        f"echo 'aws_access_key_id={escaped_access_key}' >> ~/.aws/credentials; "
        f"echo 'aws_secret_access_key={escaped_secret_key}' >> ~/.aws/credentials; "
        f"chmod 600 ~/.aws/credentials; "
        f"echo 'AWS credentials configured successfully'"
    )
    return setup_script


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
        status="RUNNING",
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
    from transformerlab.shared.request_context import set_current_org_id
    from lab.dirs import set_organization_id as lab_set_org_id

    # Set org context explicitly since background tasks don't inherit request context
    team_id = user_and_team["team_id"]
    set_current_org_id(team_id)
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
                    status="QUEUED",
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
                    if storage_root and storage.is_remote_path(storage_root):
                        tfl_storage_uri = storage_root
                except Exception:
                    pass

                if tfl_storage_uri:
                    env_vars["TFL_STORAGE_URI"] = tfl_storage_uri
                    env_vars["_TFL_REMOTE_SKYPILOT_WORKSPACE"] = "true"

                # Build setup script (add copy_file_mounts when file_mounts is True, after AWS credentials)
                setup_commands = []
                aws_profile = "transformerlab-s3"
                if os.getenv("TFL_API_STORAGE_URI"):
                    aws_access_key_id, aws_secret_access_key = _get_aws_credentials_from_file(aws_profile)
                    if aws_access_key_id and aws_secret_access_key:
                        aws_setup = _generate_aws_credentials_setup(
                            aws_access_key_id, aws_secret_access_key, aws_profile
                        )
                        setup_commands.append(aws_setup)
                        env_vars["AWS_PROFILE"] = aws_profile

                if request.file_mounts is True and request.task_id:
                    setup_commands.append(COPY_FILE_MOUNTS_SETUP)

                if request.github_repo_url:
                    workspace_dir = await get_workspace_dir()
                    github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
                    github_setup = generate_github_clone_setup(
                        repo_url=request.github_repo_url,
                        directory=request.github_directory,
                        github_pat=github_pat,
                        branch=request.github_branch,
                    )
                    setup_commands.append(github_setup)

                # Add user-provided setup if any (replace secrets in setup)
                if request.setup:
                    setup_with_secrets = (
                        replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
                    )
                    setup_commands.append(setup_with_secrets)

                final_setup = ";".join(setup_commands) if setup_commands else None

                # Replace secrets in command
                command_with_secrets = (
                    replace_secret_placeholders(request.command, team_secrets) if team_secrets else request.command
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
                    "command": command_with_secrets,
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
                    command=command_with_secrets,
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
                    launch_result = provider_instance.launch_cluster(formatted_cluster_name, cluster_config)

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
                    await job_service.job_update_status(child_job_id, "LAUNCHING", request.experiment_id)
                    child_job_ids.append(str(child_job_id))
                    print(f"Launched sweep child job {i + 1}/{total_configs}: {child_job_id}")

                except Exception as exc:
                    print(f"Failed to launch cluster for sweep child {i + 1}: {exc}")
                    await job_service.job_update_status(
                        child_job_id,
                        "FAILED",
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
    finally:
        # Clear org context after background task completes
        set_current_org_id(None)
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
    team_id = user_and_team["team_id"]
    user = user_and_team["user"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    # Quota checking and hold creation (only for REMOTE jobs)
    if request.minutes_requested is not None and request.minutes_requested > 0:
        user_id_str = str(user.id)
        has_quota, available, message = await quota_service.check_quota_available(
            session, user_id_str, team_id, request.minutes_requested
        )
        if not has_quota:
            raise HTTPException(status_code=403, detail=message)

    # Get provider instance (resolves user's slurm_user for SLURM when user_id/team_id set)
    user_id_str = str(user.id)
    provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

    # Interactive templates should start directly in INTERACTIVE state instead of LAUNCHING,
    # except for LOCAL providers where we introduce a WAITING status while queued.
    initial_status = "INTERACTIVE" if request.subtype == "interactive" else "LAUNCHING"
    if provider.type == ProviderType.LOCAL.value:
        initial_status = "WAITING"

    job_id = await job_service.job_create(
        type="REMOTE",
        status=initial_status,
        experiment_id=request.experiment_id,
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

    # Load team secrets and user secrets for template replacement (user secrets override team secrets)
    user_id = str(user_and_team["user"].id)
    team_secrets = await load_team_secrets(user_id=user_id)

    # Prepare environment variables - start with a copy of requested env_vars
    env_vars = request.env_vars.copy() if request.env_vars else {}

    # Replace {{secret.<name>}} patterns in env_vars
    if env_vars and team_secrets:
        env_vars = replace_secrets_in_dict(env_vars, team_secrets)

    # Get AWS credentials from stored credentials file (transformerlab-s3 profile)
    aws_profile = "transformerlab-s3"
    if os.getenv("TFL_API_STORAGE_URI"):
        aws_access_key_id, aws_secret_access_key = _get_aws_credentials_from_file(aws_profile)
    else:
        aws_access_key_id, aws_secret_access_key = None, None

    # Build setup script - add copy_file_mounts after AWS credentials when file_mounts is True (task dir -> ~/src)
    setup_commands = []
    if aws_access_key_id and aws_secret_access_key:
        aws_setup = _generate_aws_credentials_setup(aws_access_key_id, aws_secret_access_key, aws_profile)
        setup_commands.append(aws_setup)
    if request.file_mounts is True and request.task_id:
        setup_commands.append(COPY_FILE_MOUNTS_SETUP)

    # Add GitHub clone setup if enabled
    if request.github_repo_url:
        workspace_dir = await get_workspace_dir()
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
        github_setup = generate_github_clone_setup(
            repo_url=request.github_repo_url,
            directory=request.github_directory,
            github_pat=github_pat,
            branch=request.github_branch,
        )
        setup_commands.append(github_setup)

    # Add SSH public key setup for SSH interactive tasks
    if request.subtype == "interactive" and request.interactive_type == "ssh":
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
            # Create SSH setup as a single line command (no trailing semicolon - will be added by join)
            ssh_setup = f"mkdir -p ~/.ssh && chmod 700 ~/.ssh; if [ ! -f ~/.ssh/authorized_keys ]; then touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys; fi; if ! grep -qF '{public_key_escaped}' ~/.ssh/authorized_keys; then echo '{public_key_escaped}' >> ~/.ssh/authorized_keys; fi"
            setup_commands.append(ssh_setup)
        except Exception as e:
            # Log error but don't fail the launch - SSH key setup is optional
            print(f"Warning: Failed to set up SSH key for organization {team_id}: {e}")

    # Add user-provided setup if any (replace secrets in setup)
    if request.setup:
        setup_with_secrets = replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
        setup_commands.append(setup_with_secrets)

    # Join setup commands, stripping trailing semicolons to avoid double semicolons
    if setup_commands:
        # Strip trailing semicolons and whitespace from each command, then join with semicolons
        cleaned_commands = [cmd.rstrip(";").rstrip() for cmd in setup_commands if cmd.strip()]
        final_setup = ";".join(cleaned_commands) if cleaned_commands else None
    else:
        final_setup = None

    # Add default environment variables
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
    env_vars["_TFL_USER_ID"] = user_id

    # Get TFL_STORAGE_URI from storage context
    tfl_storage_uri = None
    try:
        storage_root = await storage.root_uri()
        # Check if it's a remote URI (not a local path)
        if storage_root and storage.is_remote_path(storage_root):
            tfl_storage_uri = storage_root
    except Exception:
        pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri
        env_vars["_TFL_REMOTE_SKYPILOT_WORKSPACE"] = "true"
        env_vars["AWS_PROFILE"] = aws_profile
        # env_vars["AWS_ACCESS_KEY_ID"] = aws_access_key_id
        # env_vars["AWS_SECRET_ACCESS_KEY"] = aws_secret_access_key

    # Replace secrets in command
    command_with_secrets = (
        replace_secret_placeholders(request.command, team_secrets) if team_secrets else request.command
    )

    # Replace secrets in parameters if present
    # Merge parameters (defaults) with config (user's custom values for this run)
    merged_parameters = {}
    if request.parameters:
        merged_parameters = request.parameters.copy()
    if request.config:
        merged_parameters.update(request.config)

    # Replace secrets in merged parameters
    parameters_with_secrets = None
    if merged_parameters and team_secrets:
        parameters_with_secrets = replace_secrets_in_dict(merged_parameters, team_secrets)
    else:
        parameters_with_secrets = merged_parameters if merged_parameters else None

    # Build provider_config for cluster_config (and job_data for local provider)
    provider_config_dict = {"requested_disk_space": request.disk_space}
    if provider.type == ProviderType.LOCAL.value:
        # Use a dedicated local-only job directory for the local provider.
        # This directory is always on the host filesystem and does not depend
        # on TFL_API_STORAGE_URI / remote storage configuration.
        job_dir = get_local_provider_job_dir(job_id, org_id=team_id)
        provider_config_dict["workspace_dir"] = job_dir

    job_data = {
        "task_name": request.task_name,
        "command": command_with_secrets,
        "cluster_name": formatted_cluster_name,
        "subtype": request.subtype,
        "interactive_type": request.interactive_type,
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
    cluster_config = ClusterConfig(
        cluster_name=formatted_cluster_name,
        provider_name=provider_display_name,
        provider_id=provider.id,
        command=command_with_secrets,
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

    # For LOCAL provider, enqueue the launch and return immediately with WAITING status
    if provider.type == ProviderType.LOCAL.value:
        # Commit quota hold (if any) before enqueuing so the worker can see it
        if quota_hold:
            await session.commit()

        await enqueue_local_launch(
            job_id=str(job_id),
            experiment_id=request.experiment_id,
            provider_id=provider.id,
            cluster_name=formatted_cluster_name,
            cluster_config=cluster_config,
            quota_hold_id=str(quota_hold.id) if quota_hold else None,
            initial_status="INTERACTIVE" if request.subtype == "interactive" else "LAUNCHING",
        )

        return {
            "status": "WAITING",
            "job_id": job_id,
            "cluster_name": formatted_cluster_name,
            "request_id": None,
            "message": "Local provider launch waiting in queue",
        }

    try:
        launch_result = provider_instance.launch_cluster(formatted_cluster_name, cluster_config)
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        # Release quota hold if launch failed
        if quota_hold:
            await quota_service.release_quota_hold(session, hold_id=quota_hold.id)
            await session.commit()
        await job_service.job_update_status(
            job_id,
            "FAILED",
            request.experiment_id,
            error_msg=str(exc),
        )
        raise HTTPException(status_code=500, detail="Failed to launch cluster") from exc

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
    session: AsyncSession = Depends(get_async_session),
):
    """
    Check a single REMOTE job launched via providers and update status if cluster finishes.
    Uses provider_id and cluster_name from job_data to check the provider.
    """
    team_id = user_and_team["team_id"]

    # Get the job
    job = await job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Only process REMOTE jobs
    if job.get("type") != "REMOTE":
        return {
            "status": "success",
            "job_id": job_id,
            "current_status": job.get("status"),
            "message": "Job is not a REMOTE job",
        }

    # If job is already in a terminal state, ensure quota is recorded
    job_status = job.get("status", "")
    if job_status in ("COMPLETE", "STOPPED", "FAILED", "DELETED"):
        # Ensure quota is recorded for this completed job
        # Pass team_id from user_and_team context
        await quota_service.ensure_quota_recorded_for_completed_job(session, job_id, team_id=team_id)
        return {
            "status": "success",
            "job_id": job_id,
            "current_status": job_status,
            "message": f"Job is already in {job_status} state",
        }

    # Only check provider status for jobs in LAUNCHING state
    if job_status != "LAUNCHING":
        return {
            "status": "success",
            "job_id": job_id,
            "current_status": job_status,
            "message": f"Job is in {job_status} state, not checking provider status",
        }

    job_data = job.get("job_data", {}) or {}
    provider_id = job_data.get("provider_id")
    cluster_name = job_data.get("cluster_name")
    experiment_id = job.get("experiment_id")

    if not provider_id or not cluster_name:
        return {
            "status": "error",
            "job_id": job_id,
            "message": "Job missing provider_id or cluster_name in job_data",
        }

    # Get the provider
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        return {
            "status": "error",
            "job_id": job_id,
            "message": "Provider not found or not accessible",
        }

    try:
        user_id_str = str(user_and_team["user"].id)
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
    except Exception as exc:
        print(f"Failed to instantiate provider: {exc}")
        return {
            "status": "error",
            "job_id": job_id,
            "message": "Failed to instantiate provider",
        }

    # Local provider needs workspace_dir from job_data for status/logs
    if provider.type == ProviderType.LOCAL.value and job_data.get("workspace_dir"):
        if hasattr(provider_instance, "extra_config"):
            provider_instance.extra_config["workspace_dir"] = job_data["workspace_dir"]

    # Local provider: single process per "cluster"; check process status
    if provider.type == ProviderType.LOCAL.value:
        try:
            cluster_status = provider_instance.get_cluster_status(cluster_name)
            terminal_states_local = {ClusterState.DOWN, ClusterState.FAILED, ClusterState.STOPPED}
            if cluster_status.state in terminal_states_local:
                try:
                    end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
                    await job_service.job_update_job_data_insert_key_value(
                        job_id, "end_time", end_time_str, experiment_id
                    )
                    await job_service.job_update_status(
                        job_id, "COMPLETE", experiment_id=experiment_id, session=session
                    )
                    await session.commit()
                    return {
                        "status": "success",
                        "job_id": job_id,
                        "updated": True,
                        "new_status": "COMPLETE",
                        "message": f"Local job finished (status: {cluster_status.state.value})",
                    }
                except Exception as exc:
                    print(f"Failed to update job status: {exc}")
                    return {
                        "status": "error",
                        "job_id": job_id,
                        "message": "Failed to update job status",
                    }
            return {
                "status": "success",
                "job_id": job_id,
                "updated": False,
                "current_status": "LAUNCHING",
                "message": f"Local job still running (status: {cluster_status.state.value})",
            }
        except Exception as exc:
            print(f"Failed to check local job status: {exc}")
            return {
                "status": "error",
                "job_id": job_id,
                "message": "Failed to check local job status",
            }

    # Runpod doesn't have a job queue - check pod status instead
    if provider.type == ProviderType.RUNPOD.value:
        try:
            cluster_status = provider_instance.get_cluster_status(cluster_name)
            # For Runpod, the pod itself is the "job"
            # Check if pod is in a terminal state
            terminal_pod_states = {ClusterState.DOWN, ClusterState.FAILED, ClusterState.STOPPED}
            pod_finished = cluster_status.state in terminal_pod_states

            if pod_finished:
                # Pod has finished, mark job as complete
                try:
                    end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
                    job_service.job_update_job_data_insert_key_value(job_id, "end_time", end_time_str, experiment_id)
                    await job_service.job_update_status(
                        job_id, "COMPLETE", experiment_id=experiment_id, session=session
                    )
                    await session.commit()

                    return {
                        "status": "success",
                        "job_id": job_id,
                        "updated": True,
                        "new_status": "COMPLETE",
                        "message": f"Pod finished (status: {cluster_status.state.value})",
                    }
                except Exception as exc:
                    print(f"Failed to update job status: {exc}")
                    return {
                        "status": "error",
                        "job_id": job_id,
                        "message": "Failed to update job status",
                    }
            else:
                # Pod is still running
                return {
                    "status": "success",
                    "job_id": job_id,
                    "updated": False,
                    "current_status": "LAUNCHING",
                    "message": f"Pod is still running (status: {cluster_status.state.value})",
                }
        except Exception as exc:
            print(f"Failed to check Runpod pod status: {exc}")
            return {
                "status": "error",
                "job_id": job_id,
                "message": "Failed to check pod status",
            }

    # For other providers (SkyPilot, SLURM), check jobs on the cluster
    try:
        provider_jobs = provider_instance.list_jobs(cluster_name)
    except NotImplementedError:
        # Provider doesn't support list_jobs
        return {
            "status": "success",
            "job_id": job_id,
            "updated": False,
            "current_status": job_status,
            "message": "Provider does not support job status checking",
        }
    except Exception as exc:
        print(f"Failed to list jobs for cluster {cluster_name}: {exc}")
        return {
            "status": "error",
            "job_id": job_id,
            "message": f"Failed to list jobs for cluster {cluster_name}: {exc}",
        }

    terminal_states = {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}
    jobs_finished = bool(provider_jobs) and all(
        getattr(provider_job, "state", JobState.UNKNOWN) in terminal_states for provider_job in provider_jobs
    )

    if jobs_finished:
        try:
            # Set end_time when marking job as complete
            end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
            await job_service.job_update_job_data_insert_key_value(job_id, "end_time", end_time_str, experiment_id)
            # Pass session to job_update_status so quota tracking uses the same session
            await job_service.job_update_status(job_id, "COMPLETE", experiment_id=experiment_id, session=session)
            # Commit the session to ensure quota tracking is persisted
            await session.commit()

            return {
                "status": "success",
                "job_id": job_id,
                "updated": True,
                "new_status": "COMPLETE",
                "message": "All provider jobs completed",
            }
        except Exception as exc:
            print(f"Failed to update job status: {exc}")
            return {
                "status": "error",
                "job_id": job_id,
                "message": "Failed to update job status",
            }
    else:
        return {
            "status": "success",
            "job_id": job_id,
            "updated": False,
            "current_status": "LAUNCHING",
            "message": "Jobs still running on provider",
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
        if job_status in ("COMPLETE", "STOPPED", "FAILED", "DELETED"):
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


async def _update_sweep_job_status(job_id: str, experiment_id: str):
    """
    Helper function to update a single sweep job's status by checking child jobs.
    Returns the updated job data.
    """
    job = await job_service.job_get(job_id)
    if not job:
        return None

    if job.get("type") != "SWEEP":
        return None

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        return None

    sweep_job_ids = job_data.get("sweep_job_ids", [])
    sweep_total = job_data.get("sweep_total", 0)

    # Poll all child jobs to get their status
    completed_count = 0
    running_count = 0
    failed_count = 0
    queued_count = 0

    for child_job_id in sweep_job_ids:
        child_job = await job_service.job_get(child_job_id)
        if not child_job:
            continue

        child_status = child_job.get("status", "")
        if child_status == "COMPLETE":
            completed_count += 1
        elif child_status == "FAILED":
            failed_count += 1
        elif child_status in ("RUNNING", "LAUNCHING"):
            running_count += 1
        elif child_status == "QUEUED":
            queued_count += 1

    # Update parent job with current counts
    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_completed", completed_count, experiment_id)
    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_running", running_count, experiment_id)
    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_failed", failed_count, experiment_id)
    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_queued", queued_count, experiment_id)

    # Calculate progress percentage
    progress = int((completed_count / sweep_total * 100)) if sweep_total > 0 else 0
    await job_service.job_update_sweep_progress(job_id, progress, experiment_id)

    # Check if all jobs are done
    all_complete = completed_count + failed_count == sweep_total
    if all_complete and job.get("status") == "RUNNING":
        # Mark parent as complete if all children are done
        await job_service.job_update_job_data_insert_key_value(
            job_id, "end_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()), experiment_id
        )
        await job_service.job_update_status(job_id, "COMPLETE", experiment_id=experiment_id)

    # Get the updated job data after status updates
    return await job_service.job_get(job_id)


@router.get("/jobs/sweep-status")
async def check_sweep_status_all(
    experiment_id: str = Query(..., description="Experiment ID to fetch all SWEEP jobs for"),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Fetch all SWEEP jobs for an experiment, update their status, and return the list.
    Only updates status for running/launching jobs.
    """
    # Get all SWEEP jobs for this experiment
    all_sweep_jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="SWEEP", status="")

    # Update status for each running/launching sweep job
    updated_jobs = []
    for job in all_sweep_jobs:
        job_id_str = str(job.get("id", ""))
        job_status = job.get("status", "")

        # Only update status for running/launching jobs
        if job_status in ("RUNNING", "LAUNCHING"):
            updated_job = await _update_sweep_job_status(job_id_str, experiment_id)
            if updated_job:
                updated_jobs.append(updated_job)
            else:
                # If update failed, include original job
                updated_jobs.append(job)
        else:
            # Include non-running jobs as-is
            updated_jobs.append(job)

    return {
        "status": "success",
        "experiment_id": experiment_id,
        "jobs": updated_jobs,
        "total": len(updated_jobs),
    }


@router.get("/jobs/{job_id}/sweep-status")
async def check_sweep_status(
    job_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Check status of a specific sweep job by polling all child jobs and updating parent job status.
    Returns current sweep status with counts and the updated job data.
    """
    job = await job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("type") != "SWEEP":
        raise HTTPException(status_code=400, detail="Job is not a SWEEP job")

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        raise HTTPException(status_code=400, detail="Job is not a sweep parent")

    exp_id = job.get("experiment_id")
    updated_job = await _update_sweep_job_status(job_id, exp_id)

    if not updated_job:
        raise HTTPException(status_code=500, detail="Failed to update sweep job status")

    # Extract status info from updated job
    updated_job_data = updated_job.get("job_data", {}) or {}

    return {
        "status": "success",
        "job_id": job_id,
        "sweep_total": updated_job_data.get("sweep_total", 0),
        "sweep_completed": updated_job_data.get("sweep_completed", 0),
        "sweep_running": updated_job_data.get("sweep_running", 0),
        "sweep_failed": updated_job_data.get("sweep_failed", 0),
        "sweep_queued": updated_job_data.get("sweep_queued", 0),
        "sweep_progress": updated_job_data.get("sweep_progress", 0),
        "all_complete": updated_job_data.get("sweep_completed", 0) + updated_job_data.get("sweep_failed", 0)
        == updated_job_data.get("sweep_total", 0),
        "job": updated_job,  # Include the full updated job data
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
        if metric_value is not None and child_status == "COMPLETE":
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
    command = job_data.get("command")
    if not provider_id or not command:
        raise HTTPException(
            status_code=400,
            detail="Original job is missing required fields (provider_id or command) for resume",
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
    initial_status = "INTERACTIVE" if job_data.get("subtype") == "interactive" else "LAUNCHING"
    new_job_id = await job_service.job_create(
        type="REMOTE", status=initial_status, experiment_id=experimentId, job_data={}
    )

    # Set parent_job_id and resumed_from_checkpoint in job_data
    await job_service.job_update_job_data_insert_key_value(new_job_id, "parent_job_id", job_id, experimentId)
    await job_service.job_update_job_data_insert_key_value(
        new_job_id, "resumed_from_checkpoint", request.checkpoint, experimentId
    )

    # Copy all original job launch configuration
    config_fields = [
        "command",
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
        "github_directory",
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
        await job_service.job_update_status(new_job_id, "FAILED", experimentId, error_msg=str(exc))
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
        storage_root = storage.root_uri()
        if storage_root and storage.is_remote_path(storage_root):
            tfl_storage_uri = storage_root
    except Exception:
        pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri
        env_vars["_TFL_REMOTE_SKYPILOT_WORKSPACE"] = "true"

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
        "command": command,
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
        command=command,
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
        provider_instance.launch_cluster(formatted_cluster_name, cluster_config)
        return {
            "job_id": new_job_id,
            "message": "Job relaunched from checkpoint",
            "cluster_name": formatted_cluster_name,
        }
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_status(new_job_id, "FAILED", experimentId, error_msg=str(exc))
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

        # Stop cluster
        result = provider_instance.stop_cluster(cluster_name)

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
        status = provider_instance.get_cluster_status(cluster_name)

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
        resources = provider_instance.get_cluster_resources(cluster_name)

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
        clusters = provider_instance.get_clusters_detailed()

        return clusters
    except Exception as e:
        print(f"Failed to list clusters: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to list clusters")


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
        result = provider_instance.submit_job(cluster_name, job_config)

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
        jobs = provider_instance.list_jobs(cluster_name)

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
            jobs = provider_instance.list_jobs(cluster_name)
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
            job_dir = get_local_provider_job_dir(job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        # Get job logs
        try:
            logs = provider_instance.get_job_logs(cluster_name, job_id, tail_lines=tail_lines, follow=follow)
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
            job_dir = get_local_provider_job_dir(job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        # Cancel job
        result = provider_instance.cancel_job(cluster_name, job_id)

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
