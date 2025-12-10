"""Router for managing team-scoped compute providers."""

import os
import uuid
import configparser
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional, Union, Tuple
from pydantic import BaseModel, Field
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
)
from transformerlab.shared.models.models import ProviderType, TeamComputeProvider
from transformerlab.compute_providers.base import ComputeProvider
from transformerlab.compute_providers.models import (
    ClusterConfig,
    ClusterStatus,
    ResourceInfo,
    JobConfig,
    JobInfo,
    JobState,
)
from transformerlab.services import job_service
from lab import storage
from lab.dirs import get_workspace_dir

router = APIRouter(prefix="/compute_provider", tags=["compute_provider"])


class ProviderTaskLaunchRequest(BaseModel):
    """Payload for launching a remote task via providers."""

    experiment_id: str = Field(..., description="Experiment that owns the job")
    task_name: Optional[str] = Field(None, description="Friendly task name")
    cluster_name: Optional[str] = Field(None, description="Base cluster name, suffix is appended automatically")
    command: str = Field(..., description="Command to execute on the cluster")
    subtype: Optional[str] = Field(None, description="Optional subtype for filtering")
    cpus: Optional[str] = None
    memory: Optional[str] = None
    disk_space: Optional[str] = None
    accelerators: Optional[str] = None
    num_nodes: Optional[int] = None
    setup: Optional[str] = None
    env_vars: Dict[str, str] = Field(default_factory=dict, description="Environment variables as key-value pairs")
    # File mounts: mapping of remote path -> local path
    file_mounts: Optional[Dict[str, str]] = Field(
        default=None,
        description="File mounts in the form {<remote_path>: <local_path>}",
    )
    provider_name: Optional[str] = None
    github_enabled: Optional[bool] = None
    github_repo_url: Optional[str] = None
    github_directory: Optional[str] = None


class ProviderTaskFileUploadResponse(BaseModel):
    """Response for a single task file upload."""

    status: str
    stored_path: str
    message: Optional[str] = None


def _sanitize_cluster_basename(base_name: Optional[str]) -> str:
    """Return a filesystem-safe cluster base name."""
    if not base_name:
        return "remote-task"
    normalized = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in base_name.strip())
    normalized = normalized.strip("-_")
    return normalized or "remote-task"


def _get_provider_instances(providers: list[TeamComputeProvider]) -> Dict[str, ComputeProvider]:
    """Instantiate providers safely."""
    instances: Dict[str, ComputeProvider] = {}
    for provider in providers:
        try:
            instances[provider.id] = get_provider_instance(provider)
        except Exception as exc:
            print(f"Failed to instantiate provider {provider.id}: {exc}")
    return instances


@router.post("/{provider_id}/tasks/{task_id}/file-upload", response_model=ProviderTaskFileUploadResponse)
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

    The file is stored under workspace_dir/uploads/tasks/{task_id}/ and the
    stored_path returned from this endpoint can be used as the local side of a
    file mount mapping: {<remote_path>: <stored_path>}.
    """

    # Ensure team can access provider (also validates team context)
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        workspace_dir = get_workspace_dir()
        if not workspace_dir:
            raise RuntimeError("Workspace directory is not configured")

        # uploads/tasks/{task_id}/
        uploads_root = storage.join(workspace_dir, "uploads", "tasks")
        storage.makedirs(uploads_root, exist_ok=True)

        import uuid

        task_dir = storage.join(uploads_root, str(task_id))
        storage.makedirs(task_dir, exist_ok=True)

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
        with storage.open(stored_path, "wb") as f:
            f.write(content)

        return ProviderTaskFileUploadResponse(
            status="success",
            stored_path=stored_path,
            message="File uploaded successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Task file upload error: {exc}")
        raise HTTPException(status_code=500, detail="Failed to upload task file")


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


@router.get("/clusters")
async def get_clusters(
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Get all running clusters across all providers.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    providers = await list_team_providers(session, team_id)
    clusters = []
    for provider in providers:
        try:
            provider_instance = get_provider_instance(provider)
            # Use the provider's list_clusters method (all providers inherit this from base class)
            provider_clusters = provider_instance.list_clusters()
            for cluster_status in provider_clusters:
                clusters.append(
                    {
                        "cluster_name": cluster_status.cluster_name,
                        "state": cluster_status.state.value,
                        "resources_str": cluster_status.resources_str,
                        "provider_id": provider.id,
                    }
                )
        except Exception as e:
            # Skip providers that fail
            print(f"Error getting clusters for provider {provider.id}: {e}")
            pass

    return {"clusters": clusters}


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
    if provider_data.type not in [ProviderType.SLURM, ProviderType.SKYPILOT]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid provider type. Must be one of: {ProviderType.SLURM.value}, {ProviderType.SKYPILOT.value}",
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

    Returns:
        {"status": True} if the provider is active, {"status": False} otherwise
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Try to instantiate the provider
        provider_instance = get_provider_instance(provider)

        # Call the check method
        is_active = provider_instance.check()

        return {"status": is_active}
    except Exception as e:
        print(f"Failed to check provider: {e}")
        # If instantiation or check fails, provider is not active
        return {"status": False}


# ============================================================================
# Cluster Management Routes
# ============================================================================


@router.post("/{provider_id}/clusters/{cluster_name}/launch")
async def launch_cluster(
    provider_id: str,
    cluster_name: str,
    config: ClusterConfig,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Launch/provision a new cluster using the specified provider.
    Requires X-Team-Id header and team membership.
    """
    team_id = user_and_team["team_id"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        if not config.cluster_name:
            config.cluster_name = cluster_name
        config.provider_name = provider.name
        config.provider_id = provider.id

        # Launch cluster
        result = provider_instance.launch_cluster(cluster_name, config)

        return {
            "status": "success",
            "message": f"Cluster '{cluster_name}' launch initiated",
            "cluster_name": cluster_name,
            "result": result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to launch cluster")


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


def _read_github_pat_from_workspace(workspace_dir: str) -> Optional[str]:
    """Read GitHub PAT from workspace/github_pat.txt file."""
    try:
        pat_path = storage.join(workspace_dir, "github_pat.txt")
        if storage.exists(pat_path):
            with storage.open(pat_path, "r") as f:
                pat = f.read().strip()
                if pat:
                    return pat
    except Exception as e:
        print(f"Error reading GitHub PAT from workspace: {e}")
    return None


def _generate_github_clone_setup(
    repo_url: str,
    directory: Optional[str] = None,
    github_pat: Optional[str] = None,
) -> str:
    """
    Generate bash script to clone a GitHub repository.
    Supports both public and private repos (with PAT).
    Supports cloning entire repo or specific directory (sparse checkout).
    """
    clone_dir = f"~/tmp/git-clone-{uuid.uuid4().hex[:8]}"

    if github_pat:
        if repo_url.startswith("https://github.com/"):
            repo_url_with_auth = repo_url.replace("https://github.com/", f"https://{github_pat}@github.com/")
        elif repo_url.startswith("https://"):
            repo_url_with_auth = repo_url.replace("https://", f"https://{github_pat}@")
        else:
            repo_url_with_auth = repo_url
    else:
        repo_url_with_auth = repo_url

    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_directory = escape_bash(directory) if directory else None

    if directory:
        setup_script = (
            f"TEMP_CLONE_DIR={clone_dir}; "
            f"CURRENT_DIR=$HOME; "
            f"mkdir -p $TEMP_CLONE_DIR; "
            f"cd $TEMP_CLONE_DIR; "
            f"git init; "
            f"git remote add origin {repo_url_with_auth}; "
            f"git config core.sparseCheckout true; "
            f"echo '{escaped_directory}/' > .git/info/sparse-checkout; "
            f"git pull origin main || git pull origin master || git pull origin HEAD; "
            f"if [ -d '{escaped_directory}' ]; then cp -r {escaped_directory} $CURRENT_DIR/; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; else echo 'Warning: Directory {escaped_directory} not found in repository'; cd $CURRENT_DIR; rm -rf $TEMP_CLONE_DIR; fi"
        )
    else:
        setup_script = f"git clone {repo_url_with_auth} {clone_dir}; cp -r {clone_dir}/* .; rm -rf {clone_dir}"

    return setup_script


@router.post("/{provider_id}/tasks/launch")
async def launch_task_on_provider(
    provider_id: str,
    request: ProviderTaskLaunchRequest,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a REMOTE job and launch a provider-backed cluster.
    Mirrors the legacy /remote/launch flow but routes through providers.
    """

    team_id = user_and_team["team_id"]
    user = user_and_team["user"]

    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    provider_instance = get_provider_instance(provider)

    job_id = job_service.job_create(
        type="REMOTE",
        status="LAUNCHING",
        experiment_id=request.experiment_id,
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

    # Get AWS credentials from stored credentials file (transformerlab-s3 profile)
    aws_profile = "transformerlab-s3"
    if os.getenv("TFL_API_STORAGE_URI"):
        aws_access_key_id, aws_secret_access_key = _get_aws_credentials_from_file(aws_profile)
    else:
        aws_access_key_id, aws_secret_access_key = None, None

    # Build setup script - prepend AWS credentials setup if credentials are provided
    setup_commands = []
    if aws_access_key_id and aws_secret_access_key:
        aws_setup = _generate_aws_credentials_setup(aws_access_key_id, aws_secret_access_key, aws_profile)
        setup_commands.append(aws_setup)

    # Add GitHub clone setup if enabled
    if request.github_enabled and request.github_repo_url:
        workspace_dir = get_workspace_dir()
        github_pat = _read_github_pat_from_workspace(workspace_dir)
        github_setup = _generate_github_clone_setup(
            repo_url=request.github_repo_url,
            directory=request.github_directory,
            github_pat=github_pat,
        )
        setup_commands.append(github_setup)

    # Add user-provided setup if any
    if request.setup:
        setup_commands.append(request.setup)

    final_setup = ";".join(setup_commands) if setup_commands else None

    # Add default environment variables
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id

    # Get TFL_STORAGE_URI from storage context
    tfl_storage_uri = None
    try:
        storage_root = storage.root_uri()
        # Check if it's a remote URI (not a local path)
        if storage_root and any(storage_root.startswith(prefix) for prefix in ("s3://", "gs://", "gcs://", "abfs://")):
            tfl_storage_uri = storage_root
    except Exception:
        pass

    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri
        env_vars["_TFL_REMOTE_SKYPILOT_WORKSPACE"] = "true"
        env_vars["AWS_PROFILE"] = aws_profile
        # env_vars["AWS_ACCESS_KEY_ID"] = aws_access_key_id
        # env_vars["AWS_SECRET_ACCESS_KEY"] = aws_secret_access_key

    job_data = {
        "task_name": request.task_name,
        "command": request.command,
        "cluster_name": formatted_cluster_name,
        "subtype": request.subtype,
        "cpus": request.cpus,
        "memory": request.memory,
        "disk_space": request.disk_space,
        "accelerators": request.accelerators,
        "num_nodes": request.num_nodes,
        "setup": final_setup,
        "env_vars": env_vars if env_vars else None,
        "file_mounts": request.file_mounts or None,
        "provider_id": provider.id,
        "provider_type": provider.type,
        "provider_name": provider_display_name,
        "user_info": user_info or None,
    }

    for key, value in job_data.items():
        if value is not None:
            job_service.job_update_job_data_insert_key_value(job_id, key, value, request.experiment_id)

    disk_size = None
    if request.disk_space:
        try:
            disk_size = int(request.disk_space)
        except (TypeError, ValueError):
            disk_size = None

    cluster_config = ClusterConfig(
        cluster_name=formatted_cluster_name,
        provider_name=provider_display_name,
        provider_id=provider.id,
        command=request.command,
        setup=final_setup,
        env_vars=env_vars,
        cpus=request.cpus,
        memory=request.memory,
        accelerators=request.accelerators,
        num_nodes=request.num_nodes,
        disk_size=disk_size,
        file_mounts=request.file_mounts or {},
        provider_config={"requested_disk_space": request.disk_space},
    )

    try:
        launch_result = provider_instance.launch_cluster(formatted_cluster_name, cluster_config)
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_status(
            job_id,
            "FAILED",
            request.experiment_id,
            error_msg=str(exc),
        )
        raise HTTPException(status_code=500, detail="Failed to launch cluster") from exc

    request_id = None
    if isinstance(launch_result, dict):
        job_service.job_update_job_data_insert_key_value(
            job_id,
            "provider_launch_result",
            launch_result,
            request.experiment_id,
        )
        request_id = launch_result.get("request_id")
        if request_id:
            job_service.job_update_job_data_insert_key_value(
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
    job = job_service.job_get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Only check REMOTE jobs in LAUNCHING state
    if job.get("type") != "REMOTE" or job.get("status") != "LAUNCHING":
        return {
            "status": "success",
            "job_id": job_id,
            "current_status": job.get("status"),
            "message": "Job is not a REMOTE job in LAUNCHING state",
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
        provider_instance = get_provider_instance(provider)
    except Exception as exc:
        print(f"Failed to instantiate provider: {exc}")
        return {
            "status": "error",
            "job_id": job_id,
            "message": "Failed to instantiate provider",
        }

    # Check jobs on the cluster
    try:
        provider_jobs = provider_instance.list_jobs(cluster_name)
    except Exception as exc:
        print(f"Failed to list jobs for cluster {cluster_name}: {exc}")
        return {
            "status": "error",
            "job_id": job_id,
            "message": "Failed to list jobs for cluster {cluster_name}",
        }

    terminal_states = {JobState.COMPLETED, JobState.FAILED, JobState.CANCELLED}
    jobs_finished = bool(provider_jobs) and all(
        getattr(provider_job, "state", JobState.UNKNOWN) in terminal_states for provider_job in provider_jobs
    )

    if jobs_finished:
        try:
            await job_service.job_update_status(job_id, "COMPLETE", experiment_id=experiment_id)
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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Stop cluster
        result = provider_instance.stop_cluster(cluster_name)

        # Return the result directly from the provider
        return result
    except Exception as e:
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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Get cluster resources
        resources = provider_instance.get_cluster_resources(cluster_name)

        return resources
    except Exception as e:
        print(f"Failed to get cluster resources: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get cluster resources")


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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # List jobs
        jobs = provider_instance.list_jobs(cluster_name)

        # Filter by state if provided
        if state:
            jobs = [job for job in jobs if job.state == state]

        return jobs
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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # List jobs and find the specific one
        jobs = provider_instance.list_jobs(cluster_name)

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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Get job logs
        logs = provider_instance.get_job_logs(cluster_name, job_id, tail_lines=tail_lines, follow=follow)

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
        # Get provider instance
        provider_instance = get_provider_instance(provider)

        # Cancel job
        result = provider_instance.cancel_job(cluster_name, job_id)

        return {
            "status": "success",
            "message": "Job cancelled successfully",
            "job_id": job_id,
            "cluster_name": cluster_name,
            "result": result,
        }
    except Exception as e:
        print(f"Failed to cancel job: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel job")
