"""Service layer for compute provider operations.

Business logic for launching tasks, managing sweeps, resuming from checkpoints,
and performing cluster operations. The router delegates to these functions.
"""

import asyncio
import json
import logging
import os
import time
from itertools import product
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from werkzeug.utils import secure_filename

from lab import storage
from lab.dirs import (
    get_job_checkpoints_dir,
    get_job_dir,
    get_local_provider_job_dir,
    get_workspace_dir,
    set_organization_id,
)
from lab.job_status import JobStatus
from lab.storage import STORAGE_PROVIDER
from transformerlab.compute_providers.models import ClusterConfig, ClusterStatus, JobInfo, JobState, ResourceInfo
from transformerlab.routers.dependencies import ProviderContext
from transformerlab.schemas.compute_providers import ProviderTemplateLaunchRequest, ResumeFromCheckpointRequest
from transformerlab.schemas.secrets import SPECIAL_SECRET_TYPES
from transformerlab.services import job_service, quota_service
from transformerlab.services.cache_service import cache
from transformerlab.services.local_provider_queue import enqueue_local_launch
from transformerlab.services.provider_service import get_provider_instance, get_team_provider
from transformerlab.shared.cloud_credentials import (
    RUNPOD_AWS_CREDENTIALS_DIR,
    generate_aws_credentials_setup,
    generate_azure_credentials_setup,
    generate_gcp_credentials_setup,
    get_aws_credentials_from_file,
)
from transformerlab.shared.github_utils import generate_github_clone_setup, read_github_pat_from_workspace
from transformerlab.shared.models.models import ProviderType
from transformerlab.shared.secret_utils import (
    extract_secret_names_from_data,
    load_team_secrets,
    replace_secret_placeholders,
    replace_secrets_in_dict,
)

logger = logging.getLogger(__name__)

# lab.init() not required; copy_file_mounts uses _TFL_JOB_ID and job_data only
COPY_FILE_MOUNTS_SETUP = 'pip install -q transformerlab && python -c "from lab import lab; lab.copy_file_mounts()"'

_TASK_COPY_EXCLUDE = {"index.json"}


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------


def sanitize_cluster_basename(base_name: Optional[str]) -> str:
    """Return a filesystem-safe cluster base name."""
    if not base_name:
        return "remote-template"
    normalized = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in base_name.strip())
    normalized = normalized.strip("-_")
    return normalized or "remote-template"


async def copy_task_files_to_dir(task_src: str, dest_dir: str) -> None:
    """Copy task files from *task_src* into *dest_dir*, excluding internal metadata."""
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


def find_missing_secrets_for_template_launch(
    request: ProviderTemplateLaunchRequest,
    secrets: Dict[str, Any],
) -> set[str]:
    """Return secret names referenced in the launch request but absent from *secrets*."""
    referenced: set[str] = set()

    scannable_strings: list[str] = []
    if request.run:
        scannable_strings.append(request.run)
    if request.setup:
        scannable_strings.append(request.setup)

    scannable_dicts: list[dict] = []
    if request.env_vars:
        scannable_dicts.append(request.env_vars)
    if request.parameters:
        scannable_dicts.append(request.parameters)
    if request.config:
        scannable_dicts.append(request.config)

    for s in scannable_strings:
        referenced.update(extract_secret_names_from_data(s))
    for d in scannable_dicts:
        referenced.update(extract_secret_names_from_data(d))

    if not referenced:
        return set()

    available = set(secrets.keys())
    return referenced - available


def _build_user_info(user: Any) -> dict:
    """Extract user_info dict from a User record."""
    user_info: dict = {}
    if getattr(user, "first_name", None) or getattr(user, "last_name", None):
        user_info["name"] = " ".join(
            part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
        ).strip()
    if getattr(user, "email", None):
        user_info["email"] = getattr(user, "email")
    return user_info


async def _get_storage_uri() -> Optional[str]:
    """Resolve the TFL_STORAGE_URI to propagate to remote workers."""
    try:
        storage_root = await storage.root_uri()
        if storage_root:
            if storage.is_remote_path(storage_root):
                return storage_root
            if STORAGE_PROVIDER == "localfs":
                return storage_root
    except Exception:
        pass
    return None


async def _build_cloud_credentials_setup(
    provider_type: str,
    env_vars: Dict[str, str],
) -> list[str]:
    """Build cloud credential setup commands and mutate *env_vars* in place."""
    setup_commands: list[str] = []

    if os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() != "true":
        return setup_commands

    if STORAGE_PROVIDER == "aws":
        aws_profile = "transformerlab-s3"
        aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(get_aws_credentials_from_file, aws_profile)
        if aws_access_key_id and aws_secret_access_key:
            aws_credentials_dir = RUNPOD_AWS_CREDENTIALS_DIR if provider_type == ProviderType.RUNPOD.value else None
            setup_commands.append(
                generate_aws_credentials_setup(
                    aws_access_key_id,
                    aws_secret_access_key,
                    aws_profile,
                    aws_credentials_dir=aws_credentials_dir,
                )
            )
            if aws_credentials_dir:
                env_vars["AWS_SHARED_CREDENTIALS_FILE"] = f"{aws_credentials_dir}/credentials"
    elif STORAGE_PROVIDER == "gcp":
        gcp_sa_json = os.getenv("TFL_GCP_SERVICE_ACCOUNT_JSON")
        if gcp_sa_json:
            setup_commands.append(generate_gcp_credentials_setup(gcp_sa_json))
    elif STORAGE_PROVIDER == "azure":
        azure_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        azure_account = os.getenv("AZURE_STORAGE_ACCOUNT")
        azure_key = os.getenv("AZURE_STORAGE_KEY")
        azure_sas = os.getenv("AZURE_STORAGE_SAS_TOKEN")
        if azure_connection_string or azure_account:
            setup_commands.append(
                generate_azure_credentials_setup(azure_connection_string, azure_account, azure_key, azure_sas)
            )
            if azure_connection_string:
                env_vars["AZURE_STORAGE_CONNECTION_STRING"] = azure_connection_string
            if azure_account:
                env_vars["AZURE_STORAGE_ACCOUNT"] = azure_account
            if azure_key:
                env_vars["AZURE_STORAGE_KEY"] = azure_key
            if azure_sas:
                env_vars["AZURE_STORAGE_SAS_TOKEN"] = azure_sas

    return setup_commands


async def _build_env_vars(
    provider_type: str,
    request_env_vars: Optional[Dict[str, str]],
    team_secrets: Dict[str, Any],
    job_id: Any,
    experiment_id: str,
    user_id: str,
    team_id: str,
    enable_trackio: bool = False,
) -> Dict[str, str]:
    """Assemble the full environment variable dict for a launch."""
    env_vars = (request_env_vars or {}).copy()

    # Replace secret placeholders
    if env_vars and team_secrets:
        env_vars = replace_secrets_in_dict(env_vars, team_secrets)

    # Default env vars
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = experiment_id
    env_vars["_TFL_USER_ID"] = user_id

    if enable_trackio:
        env_vars["TLAB_TRACKIO_AUTO_INIT"] = "true"

    # Storage URI
    tfl_storage_uri = await _get_storage_uri()
    if tfl_storage_uri:
        env_vars["TFL_STORAGE_URI"] = tfl_storage_uri

    # Local provider workspace
    if provider_type == ProviderType.LOCAL.value and team_id:
        workspace_dir = await get_workspace_dir()
        if workspace_dir and not storage.is_remote_path(workspace_dir):
            env_vars["TFL_WORKSPACE_DIR"] = workspace_dir

    return env_vars


async def _build_setup_commands(
    provider: Any,
    request: ProviderTemplateLaunchRequest,
    env_vars: Dict[str, str],
    team_secrets: Dict[str, Any],
    user_id: str,
    team_id: str,
) -> Tuple[list[str], Optional[str], str]:
    """Build setup commands, resolve interactive command, return (commands, setup_override, base_command).

    Returns:
        (setup_commands, setup_override_from_gallery, base_command)
    """
    from transformerlab.shared import galleries
    from transformerlab.shared.interactive_gallery_utils import (
        find_interactive_gallery_entry,
        resolve_interactive_command,
    )

    setup_commands: list[str] = []

    # Cloud credentials
    cloud_cmds = await _build_cloud_credentials_setup(provider.type, env_vars)
    setup_commands.extend(cloud_cmds)

    # File mounts
    if request.file_mounts is True and request.task_id:
        setup_commands.append(COPY_FILE_MOUNTS_SETUP)

    # Ensure transformerlab SDK on remote
    if provider.type != ProviderType.LOCAL.value:
        setup_commands.append("pip install -q transformerlab")

    # GitHub clone
    if request.github_repo_url:
        workspace_dir = await get_workspace_dir()
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
        directory = request.github_repo_dir or request.github_directory
        branch = request.github_repo_branch or request.github_branch
        setup_commands.append(
            generate_github_clone_setup(
                repo_url=request.github_repo_url,
                directory=directory,
                github_pat=github_pat,
                branch=branch,
            )
        )

    # SSH key setup for interactive SSH tasks and RunPod
    if (
        request.subtype == "interactive" and request.interactive_type == "ssh"
    ) or provider.type == ProviderType.RUNPOD.value:
        from transformerlab.services.ssh_key_service import get_or_create_org_ssh_key_pair, get_org_ssh_public_key

        try:
            await get_or_create_org_ssh_key_pair(team_id)
            public_key = await get_org_ssh_public_key(team_id)
            public_key_clean = public_key.strip().replace("\n", "").replace("\r", "")
            public_key_escaped = public_key_clean.replace("'", "'\"'\"'")

            if provider.type == ProviderType.RUNPOD.value:
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
                ssh_setup = (
                    f"mkdir -p ~/.ssh && chmod 700 ~/.ssh; "
                    f"if [ ! -f ~/.ssh/authorized_keys ]; then touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys; fi; "
                    f"if ! grep -qF '{public_key_escaped}' ~/.ssh/authorized_keys; then echo '{public_key_escaped}' >> ~/.ssh/authorized_keys; fi"
                )
            setup_commands.append(ssh_setup)
        except Exception as e:
            print(f"Warning: Failed to set up SSH key for organization {team_id}: {e}")

    # Interactive gallery resolution
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

    # User-provided setup
    if request.setup and not interactive_setup_added:
        setup_with_secrets = replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
        setup_commands.append(setup_with_secrets)

    return setup_commands, setup_override_from_gallery, base_command


def _assemble_final_setup(setup_commands: list[str], setup_override: Optional[str]) -> Optional[str]:
    """Join setup commands or return the gallery override."""
    if setup_override is not None:
        return setup_override
    if setup_commands:
        cleaned = [cmd.rstrip(";").rstrip() for cmd in setup_commands if cmd.strip()]
        return ";".join(cleaned) if cleaned else None
    return None


def _parse_disk_size(disk_space: Optional[str]) -> Optional[int]:
    """Parse disk_space to int, returning None on failure."""
    if not disk_space:
        return None
    try:
        return int(disk_space)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Launch task
# ---------------------------------------------------------------------------


async def launch_task(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user: Any,
    team_id: str,
    session: AsyncSession,
) -> dict:
    """Launch a single task on a provider. Returns a response dict."""
    user_id = str(user.id)

    # Validate secrets
    team_secrets = await load_team_secrets(user_id=user_id)
    missing_secrets = find_missing_secrets_for_template_launch(request, team_secrets)
    if missing_secrets:
        display_names = [SPECIAL_SECRET_TYPES.get(name, name) for name in sorted(missing_secrets)]
        raise HTTPException(
            status_code=400,
            detail=f"Missing secrets: {', '.join(display_names)}. Please define these secrets at the team or user level before launching.",
        )

    # Validate provider
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if provider.disabled:
        raise HTTPException(status_code=403, detail="Provider is disabled and cannot be used to launch tasks")

    # Quota check
    if request.minutes_requested is not None and request.minutes_requested > 0:
        has_quota, available, message = await quota_service.check_quota_available(
            session, user_id, team_id, request.minutes_requested
        )
        if not has_quota:
            raise HTTPException(status_code=403, detail=message)

    # Provider instance
    provider_instance = await get_provider_instance(provider, user_id=user_id, team_id=team_id)

    # Initial status
    initial_status = JobStatus.INTERACTIVE if request.subtype == "interactive" else JobStatus.LAUNCHING
    if provider.type == ProviderType.LOCAL.value:
        initial_status = JobStatus.WAITING

    job_id = await job_service.job_create(type="REMOTE", status=initial_status, experiment_id=request.experiment_id)
    await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")

    await job_service.job_update_launch_progress(
        job_id, request.experiment_id, phase="checking_quota", percent=10, message="Checking quota"
    )

    # Quota hold
    quota_hold = None
    if request.minutes_requested is not None and request.minutes_requested > 0:
        task_identifier = request.task_name or f"job-{job_id}"
        quota_hold = await quota_service.create_quota_hold(
            session=session,
            user_id=user_id,
            team_id=team_id,
            task_id=task_identifier,
            minutes_requested=request.minutes_requested,
            job_id=str(job_id),
        )

    await job_service.job_update_launch_progress(
        job_id, request.experiment_id, phase="building_config", percent=30, message="Building cluster configuration"
    )

    # Cluster name
    base_name = request.cluster_name or request.task_name or provider.name
    formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-job-{job_id}"

    user_info = _build_user_info(user)
    provider_display_name = request.provider_name or provider.name

    # Environment variables
    env_vars = await _build_env_vars(
        provider_type=provider.type,
        request_env_vars=request.env_vars,
        team_secrets=team_secrets,
        job_id=job_id,
        experiment_id=request.experiment_id,
        user_id=user_id,
        team_id=team_id,
        enable_trackio=request.enable_trackio,
    )

    # Setup commands
    setup_commands, setup_override, base_command = await _build_setup_commands(
        provider=provider,
        request=request,
        env_vars=env_vars,
        team_secrets=team_secrets,
        user_id=user_id,
        team_id=team_id,
    )
    final_setup = _assemble_final_setup(setup_commands, setup_override)

    # Replace secrets in command & parameters
    command_with_secrets = replace_secret_placeholders(base_command, team_secrets) if team_secrets else base_command

    merged_parameters: dict = {}
    if request.parameters:
        merged_parameters = request.parameters.copy()
    if request.config:
        merged_parameters.update(request.config)

    custom_sbatch_flags = None
    if request.config and "custom_sbatch_flags" in request.config:
        raw_flags = request.config.get("custom_sbatch_flags")
        if isinstance(raw_flags, str):
            custom_sbatch_flags = raw_flags.strip() or None
        elif raw_flags is not None:
            custom_sbatch_flags = str(raw_flags).strip() or None

    parameters_with_secrets = None
    if merged_parameters and team_secrets:
        parameters_with_secrets = replace_secrets_in_dict(merged_parameters, team_secrets)
    else:
        parameters_with_secrets = merged_parameters if merged_parameters else None

    # Provider config
    provider_config_dict: dict = {"requested_disk_space": request.disk_space}
    if provider.type == ProviderType.SLURM.value and custom_sbatch_flags:
        provider_config_dict["custom_sbatch_flags"] = custom_sbatch_flags
    if provider.type == ProviderType.LOCAL.value:
        job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
        provider_config_dict["workspace_dir"] = job_dir

    # Copy task files
    if request.task_id:
        from lab.dirs import get_task_dir

        task_dir_root = await get_task_dir()
        task_src = storage.join(task_dir_root, secure_filename(str(request.task_id)))
        if await storage.isdir(task_src):
            workspace_job_dir = await get_job_dir(job_id)
            await copy_task_files_to_dir(task_src, workspace_job_dir)

    # Persist job data
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
        "team_id": team_id,
        "created_by_user_id": str(user.id) if user else None,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }
    if provider.type == ProviderType.LOCAL.value and provider_config_dict.get("workspace_dir"):
        job_data["workspace_dir"] = provider_config_dict["workspace_dir"]
    if request.file_mounts is True and request.task_id:
        job_data["task_id"] = request.task_id

    for key, value in job_data.items():
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(job_id, key, value, request.experiment_id)

    # Build ClusterConfig
    disk_size = _parse_disk_size(request.disk_space)
    file_mounts_for_provider = request.file_mounts if isinstance(request.file_mounts, dict) else {}
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
        job_id, request.experiment_id, phase="launching_cluster", percent=70, message="Launching cluster"
    )

    # Local provider path: enqueue and return immediately
    if provider.type == ProviderType.LOCAL.value:
        if quota_hold:
            await session.commit()

        await job_service.job_update_launch_progress(
            job_id, request.experiment_id, phase="queued", percent=0, message="Queued for launch"
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

    # Remote provider path
    try:
        launch_result = await asyncio.to_thread(
            provider_instance.launch_cluster, formatted_cluster_name, cluster_config
        )
    except Exception as exc:
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_launch_progress(
            job_id, request.experiment_id, phase="failed", percent=100, message=f"Launch failed: {exc!s}"
        )
        if quota_hold:
            await quota_service.release_quota_hold(session, hold_id=quota_hold.id)
            await session.commit()
        await job_service.job_update_status(job_id, JobStatus.FAILED, request.experiment_id, error_msg=str(exc))
        raise HTTPException(status_code=500, detail="Failed to launch cluster") from exc

    await job_service.job_update_launch_progress(
        job_id, request.experiment_id, phase="cluster_started", percent=100, message="Launch initiated"
    )

    if quota_hold:
        await session.commit()

    request_id = None
    if isinstance(launch_result, dict):
        await job_service.job_update_job_data_insert_key_value(
            job_id, "provider_launch_result", launch_result, request.experiment_id
        )
        request_id = launch_result.get("request_id")
        if request_id:
            await job_service.job_update_job_data_insert_key_value(
                job_id, "orchestrator_request_id", request_id, request.experiment_id
            )

    return {
        "status": "success",
        "job_id": job_id,
        "cluster_name": formatted_cluster_name,
        "request_id": request_id,
        "message": "Provider launch initiated",
    }


# ---------------------------------------------------------------------------
# Sweep jobs
# ---------------------------------------------------------------------------


async def create_sweep_parent_job(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user: Any,
    team_id: str,
    session: AsyncSession,
    sweep_config: Dict[str, List[Any]],
    sweep_metric: str,
    lower_is_better: bool,
    total_configs: int,
) -> str:
    """Create the parent SWEEP job and return its ID."""
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    user_info = _build_user_info(user)
    provider_display_name = request.provider_name or provider.name

    # Generate param combinations for metadata
    parent_job_id = await job_service.job_create(
        type="SWEEP", status=JobStatus.RUNNING, experiment_id=request.experiment_id
    )

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

    await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")
    return parent_job_id


async def launch_sweep_jobs(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict,
    base_parameters: Dict[str, Any],
    sweep_config: Dict[str, List[Any]],
    sweep_metric: str,
    lower_is_better: bool,
    parent_job_id: str,
) -> None:
    """Launch child jobs for a sweep in the background.

    Creates its own DB session since it runs as a background task.
    """
    from transformerlab.db.session import async_session
    from lab.dirs import set_organization_id as lab_set_org_id

    team_id = user_and_team["team_id"]
    if lab_set_org_id is not None:
        lab_set_org_id(team_id)

    try:
        async with async_session() as session:
            user = user_and_team["user"]
            provider = await get_team_provider(session, team_id, provider_id)
            if not provider:
                print(f"Provider {provider_id} not found for sweep job {parent_job_id}")
                return

            user_id_str = str(user.id)
            provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

            user_info = _build_user_info(user)
            provider_display_name = request.provider_name or provider.name
            user_id = str(user_and_team["user"].id)
            team_secrets = await load_team_secrets(user_id=user_id)

            # Generate all param combinations
            param_names = list(sweep_config.keys())
            param_values = [sweep_config[name] for name in param_names]
            configs = [dict(zip(param_names, values)) for values in product(*param_values)]
            total_configs = len(configs)

            print(f"Launching {total_configs} child jobs for sweep {parent_job_id}")

            base_name = request.cluster_name or request.task_name or provider.name
            child_job_ids: list[str] = []

            for i, config_params in enumerate(configs):
                merged_params = {**(base_parameters or {}), **config_params}
                run_suffix = f"sweep-{i + 1}"
                formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-{run_suffix}-job-{parent_job_id}"

                child_job_id = await job_service.job_create(
                    type="REMOTE", status=JobStatus.QUEUED, experiment_id=request.experiment_id
                )

                # Build env vars for this child
                env_vars = (request.env_vars or {}).copy()
                if env_vars and team_secrets:
                    env_vars = replace_secrets_in_dict(env_vars, team_secrets)

                env_vars["_TFL_JOB_ID"] = str(child_job_id)
                env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
                env_vars["_TFL_USER_ID"] = user_id

                tfl_storage_uri = await _get_storage_uri()
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

                # Build setup commands for child
                setup_commands: list[str] = []
                cloud_cmds = await _build_cloud_credentials_setup(provider.type, env_vars)
                setup_commands.extend(cloud_cmds)

                if request.file_mounts is True and request.task_id:
                    setup_commands.append(COPY_FILE_MOUNTS_SETUP)

                if request.github_repo_url:
                    workspace_dir = await get_workspace_dir()
                    github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
                    directory = request.github_repo_dir or request.github_directory
                    branch = request.github_repo_branch or request.github_branch
                    setup_commands.append(
                        generate_github_clone_setup(
                            repo_url=request.github_repo_url,
                            directory=directory,
                            github_pat=github_pat,
                            branch=branch,
                        )
                    )

                if request.setup:
                    setup_with_secrets = (
                        replace_secret_placeholders(request.setup, team_secrets) if team_secrets else request.setup
                    )
                    setup_commands.append(setup_with_secrets)

                final_setup = ";".join(setup_commands) if setup_commands else None

                run_with_secrets = (
                    replace_secret_placeholders(request.run, team_secrets) if team_secrets else request.run
                )

                parameters_with_secrets = merged_params
                if merged_params and team_secrets:
                    parameters_with_secrets = replace_secrets_in_dict(merged_params, team_secrets)

                # Store child job data
                child_job_data = {
                    "parent_sweep_job_id": str(parent_job_id),
                    "sweep_run_index": i + 1,
                    "sweep_total": total_configs,
                    "sweep_params": config_params,
                    "task_name": (
                        f"{request.task_name or 'Task'} (Sweep {i + 1}/{total_configs})" if request.task_name else None
                    ),
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

                # Build and launch cluster config
                disk_size = _parse_disk_size(request.disk_space)
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

                try:
                    launch_result = await asyncio.to_thread(
                        provider_instance.launch_cluster, formatted_cluster_name, cluster_config
                    )

                    if isinstance(launch_result, dict):
                        await job_service.job_update_job_data_insert_key_value(
                            child_job_id, "provider_launch_result", launch_result, request.experiment_id
                        )
                        request_id = launch_result.get("request_id")
                        if request_id:
                            await job_service.job_update_job_data_insert_key_value(
                                child_job_id, "orchestrator_request_id", request_id, request.experiment_id
                            )

                    await job_service.job_update_status(child_job_id, JobStatus.LAUNCHING, request.experiment_id)
                    child_job_ids.append(str(child_job_id))
                    print(f"Launched sweep child job {i + 1}/{total_configs}: {child_job_id}")

                except Exception as exc:
                    print(f"Failed to launch cluster for sweep child {i + 1}: {exc}")
                    await job_service.job_update_status(
                        child_job_id, JobStatus.FAILED, request.experiment_id, error_msg=str(exc)
                    )
                    child_job_ids.append(str(child_job_id))

            # Update parent with child job IDs
            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_job_ids", child_job_ids, request.experiment_id
            )
            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_running", len(child_job_ids), request.experiment_id
            )

            print(f"Completed launching {len(child_job_ids)} child jobs for sweep {parent_job_id}")
            await cache.invalidate("jobs", f"jobs:list:{request.experiment_id}")
    finally:
        if lab_set_org_id is not None:
            lab_set_org_id(None)


# ---------------------------------------------------------------------------
# Resume from checkpoint
# ---------------------------------------------------------------------------


async def resume_from_checkpoint(
    job_id: str,
    experiment_id: str,
    request: ResumeFromCheckpointRequest,
    user: Any,
    team_id: str,
    session: AsyncSession,
) -> dict:
    """Resume a REMOTE job from a checkpoint by creating a new job with the same config."""
    original_job = await job_service.job_get(job_id)
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

    # Verify checkpoint exists
    checkpoints_dir = await get_job_checkpoints_dir(job_id)
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
    await cache.invalidate("jobs", f"jobs:list:{experiment_id}")

    await job_service.job_update_job_data_insert_key_value(new_job_id, "parent_job_id", job_id, experiment_id)
    await job_service.job_update_job_data_insert_key_value(
        new_job_id, "resumed_from_checkpoint", request.checkpoint, experiment_id
    )

    # Copy original config fields
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
        "github_directory",
        "github_branch",
        "user_info",
        "team_id",
    ]
    for field in config_fields:
        value = job_data.get(field)
        if value is not None:
            await job_service.job_update_job_data_insert_key_value(new_job_id, field, value, experiment_id)

    user_id_str = str(user.id)
    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
    except Exception as exc:
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experiment_id, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to initialize provider: {exc}") from exc

    base_name = job_data.get("task_name") or provider.name
    formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-job-{new_job_id}"

    user_info = _build_user_info(user)
    provider_display_name = job_data.get("provider_name") or provider.name

    # Env vars
    env_vars = (job_data.get("env_vars") or {}).copy()
    env_vars["_TFL_JOB_ID"] = str(new_job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = experiment_id
    if user:
        env_vars["_TFL_USER_ID"] = str(user.id)

    tfl_storage_uri = await _get_storage_uri()
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

    # Setup commands
    setup_commands: list[str] = []
    github_repo_url = job_data.get("github_repo_url")
    if github_repo_url:
        workspace_dir = await get_workspace_dir()
        user_id_for_pat = str(user.id) if user else None
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id_for_pat)
        setup_commands.append(
            generate_github_clone_setup(
                repo_url=github_repo_url,
                directory=job_data.get("github_directory"),
                github_pat=github_pat,
                branch=job_data.get("github_branch"),
            )
        )

    original_setup = job_data.get("setup")
    if original_setup:
        setup_commands.append(original_setup)

    final_setup = ";".join(setup_commands) if setup_commands else None

    # Persist job data
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
            await job_service.job_update_job_data_insert_key_value(new_job_id, key, value, experiment_id)

    # ClusterConfig
    disk_size = _parse_disk_size(job_data.get("disk_space"))
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
        print(f"Failed to launch cluster: {exc}")
        await job_service.job_update_status(new_job_id, JobStatus.FAILED, experiment_id, error_msg=str(exc))
        raise HTTPException(status_code=500, detail=f"Failed to relaunch job: {exc}") from exc


# ---------------------------------------------------------------------------
# Cluster operations  (thin wrappers around provider_instance methods)
# ---------------------------------------------------------------------------


async def _inject_local_workspace(ctx: ProviderContext, job_id: Any) -> None:
    """For local providers, set workspace_dir on the provider instance."""
    if ctx.provider.type == ProviderType.LOCAL.value and hasattr(ctx.provider_instance, "extra_config"):
        job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=ctx.team_id)
        ctx.provider_instance.extra_config["workspace_dir"] = job_dir


async def stop_cluster(ctx: ProviderContext, cluster_name: str) -> dict:
    """Stop a running cluster."""
    # Derive job_id from cluster name for local provider
    if ctx.provider.type == ProviderType.LOCAL.value and hasattr(ctx.provider_instance, "extra_config"):
        job_id_segment = None
        if "-job-" in cluster_name:
            job_id_segment = cluster_name.rsplit("-job-", 1)[-1] or None
        if job_id_segment is not None:
            await _inject_local_workspace(ctx, job_id_segment)

    result = await asyncio.to_thread(ctx.provider_instance.stop_cluster, cluster_name)
    return result


async def get_cluster_status(ctx: ProviderContext, cluster_name: str) -> ClusterStatus:
    """Get the status of a cluster."""
    return await asyncio.to_thread(ctx.provider_instance.get_cluster_status, cluster_name)


async def get_cluster_resources(ctx: ProviderContext, cluster_name: str) -> ResourceInfo:
    """Get resource information for a cluster."""
    return await asyncio.to_thread(ctx.provider_instance.get_cluster_resources, cluster_name)


async def list_clusters_detailed(ctx: ProviderContext) -> list:
    """Get detailed list of clusters for a provider."""
    return await asyncio.to_thread(ctx.provider_instance.get_clusters_detailed)


async def submit_job(ctx: ProviderContext, cluster_name: str, job_config: Any) -> dict:
    """Submit a job to an existing cluster."""
    result = await asyncio.to_thread(ctx.provider_instance.submit_job, cluster_name, job_config)
    job_id = result.get("job_id") or result.get("request_id")
    return {
        "status": "success",
        "message": "Job submitted successfully",
        "job_id": job_id,
        "cluster_name": cluster_name,
        "result": result,
    }


async def list_jobs(ctx: ProviderContext, cluster_name: str, state: Optional[JobState] = None) -> List[JobInfo]:
    """List all jobs for a cluster, optionally filtered by state."""
    jobs = await asyncio.to_thread(ctx.provider_instance.list_jobs, cluster_name)
    if state:
        jobs = [job for job in jobs if job.state == state]
    return jobs


async def get_job_info(ctx: ProviderContext, cluster_name: str, job_id: Union[str, int]) -> JobInfo:
    """Get information about a specific job."""
    try:
        jobs = await asyncio.to_thread(ctx.provider_instance.list_jobs, cluster_name)
    except NotImplementedError:
        raise HTTPException(
            status_code=400,
            detail="This provider does not support job listing. Runpod uses pod-based execution, not a job queue.",
        )

    job_id_str = str(job_id)
    job_id_int = int(job_id) if isinstance(job_id, str) and job_id.isdigit() else job_id

    for j in jobs:
        if str(j.job_id) == job_id_str or j.job_id == job_id_int:
            return j

    raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")


async def get_job_logs(
    ctx: ProviderContext,
    cluster_name: str,
    job_id: Union[str, int],
    tail_lines: Optional[int] = None,
    follow: bool = False,
) -> Any:
    """Get logs for a job. Returns a string, StreamingResponse, or raw log content."""
    # Local provider needs workspace_dir
    if ctx.provider.type == ProviderType.LOCAL.value and hasattr(ctx.provider_instance, "extra_config"):
        job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=ctx.team_id)
        ctx.provider_instance.extra_config["workspace_dir"] = job_dir

    try:
        logs = await asyncio.to_thread(
            ctx.provider_instance.get_job_logs, cluster_name, job_id, tail_lines=tail_lines, follow=follow
        )
    except NotImplementedError:
        logs = "Logs not available for this provider type."

    if follow:
        if hasattr(logs, "__iter__") and not isinstance(logs, (str, bytes)):

            async def generate():  # type: ignore[return]
                try:
                    for line in logs:
                        text = line.decode("utf-8", errors="replace") if isinstance(line, bytes) else str(line) + "\n"
                        if text.startswith("Error reading logs:"):
                            yield "Failed to retrieve logs.\n"
                            break
                        elif text and not text.startswith("Error reading logs:"):
                            yield text
                except Exception as e:
                    print(f"Error streaming logs: {str(e)}")
                    yield "\n[Error streaming logs]\n"

            return StreamingResponse(
                generate(), media_type="text/plain", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            )
        else:
            log_str = str(logs) if logs else ""

            async def generate():  # type: ignore[return]
                for line in log_str.split("\n"):
                    if line.startswith("Error reading logs:"):
                        yield "Failed to retrieve logs.\n"
                        break
                    elif line:
                        yield line + "\n"

            return StreamingResponse(
                generate(), media_type="text/plain", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            )
    else:
        log_content = str(logs) if logs else ""
        if log_content.startswith("Error reading logs:"):
            return "Failed to retrieve logs."
        return log_content


async def cancel_job(ctx: ProviderContext, cluster_name: str, job_id: Union[str, int]) -> dict:
    """Cancel a running or queued job."""
    # Local provider needs workspace_dir
    if ctx.provider.type == ProviderType.LOCAL.value and hasattr(ctx.provider_instance, "extra_config"):
        job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=ctx.team_id)
        ctx.provider_instance.extra_config["workspace_dir"] = job_dir

    result = await asyncio.to_thread(ctx.provider_instance.cancel_job, cluster_name, job_id)
    return {
        "status": "success",
        "message": "Job cancelled successfully",
        "job_id": job_id,
        "cluster_name": cluster_name,
        "result": result,
    }
