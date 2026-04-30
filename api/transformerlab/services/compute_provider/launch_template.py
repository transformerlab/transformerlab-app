"""Create a REMOTE job and enqueue provider-backed cluster launch (single job or sweep)."""

import asyncio
import json
import os
import shlex
import time
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.schemas.compute_providers import ProviderTemplateLaunchRequest
from transformerlab.schemas.secrets import SPECIAL_SECRET_TYPES
from transformerlab.services import job_service, quota_service
from transformerlab.services.compute_provider.launch_credentials import (
    COPY_FILE_MOUNTS_SETUP,
    RUNPOD_AWS_CREDENTIALS_DIR,
    generate_aws_credentials_setup,
    generate_azure_credentials_setup,
    generate_gcp_credentials_setup,
    get_aws_credentials_from_file,
)
from transformerlab.services.compute_provider.launch_secrets import find_missing_secrets_for_template_launch
from transformerlab.services.compute_provider.launch_sweep import create_sweep_parent_job, launch_sweep_jobs
from transformerlab.services.compute_provider.launch_task_files import copy_task_files_to_dir
from transformerlab.services.compute_provider.trackio_launch import (
    apply_trackio_launch_env,
    build_trackio_run_name,
    resolve_trackio_project_name,
)
from transformerlab.services.compute_provider.cluster_naming import sanitize_cluster_basename
from transformerlab.services.local_provider_queue import enqueue_local_launch
from transformerlab.services.provider_harness_hook_service import build_hooked_command
from transformerlab.services.provider_service import get_team_provider
from transformerlab.services.remote_provider_queue import enqueue_remote_launch
from transformerlab.services.task_service import task_service
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import generate_github_clone_setup, read_github_pat_from_workspace
from transformerlab.shared.interactive_gallery_utils import find_interactive_gallery_entry, resolve_interactive_command
from transformerlab.shared.disk_space_utils import parse_disk_space_gb
from transformerlab.shared.models.models import ProviderType
from transformerlab.shared.secret_utils import load_team_secrets, replace_secrets_in_dict, replace_secret_placeholders
from lab import storage
from lab.dirs import (
    get_experiment_task_dir,
    get_job_dir,
    get_local_provider_job_dir,
    get_task_dir,
    get_workspace_dir,
)
from lab.job_status import JobStatus
from lab.storage import STORAGE_PROVIDER
from werkzeug.utils import secure_filename


async def launch_template_on_provider(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict,
    session: AsyncSession,
) -> dict[str, Any]:
    team_id = user_and_team["team_id"]
    user = user_and_team["user"]
    user_id = str(user.id)

    # Load team + user secrets once and validate that any referenced secrets exist
    team_secrets = await load_team_secrets(user_id=user_id)
    missing_secrets = find_missing_secrets_for_template_launch(request, team_secrets)

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
        parent_job_id = await create_sweep_parent_job(
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
            launch_sweep_jobs(
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

    # NOTE: We no longer launch inline; provider instance is resolved in the remote launch worker.

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
        # We return immediately after enqueuing remote launches, so persist the hold now.
        await session.commit()

    await job_service.job_update_launch_progress(
        job_id,
        request.experiment_id,
        phase="building_config",
        percent=30,
        message="Building cluster configuration",
    )

    base_name = request.cluster_name or request.task_name or provider.name
    job_short_id = job_service.get_short_job_id(job_id)
    formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-{job_short_id}"

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

    # Replace {{secret.<name>}} patterns in env_vars
    if env_vars and team_secrets:
        env_vars = replace_secrets_in_dict(env_vars, team_secrets)

    # Build setup script - add cloud credential helpers first, then file_mounts and other setup.
    setup_commands: list[str] = []

    if os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true":
        if STORAGE_PROVIDER == "aws":
            # Get AWS credentials from stored credentials file
            from transformerlab.shared.remote_workspace import get_default_aws_profile

            aws_profile = get_default_aws_profile()
            aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(
                get_aws_credentials_from_file, aws_profile
            )
            if aws_access_key_id and aws_secret_access_key:
                aws_credentials_dir = RUNPOD_AWS_CREDENTIALS_DIR if provider.type == ProviderType.RUNPOD.value else None
                aws_setup = generate_aws_credentials_setup(
                    aws_access_key_id, aws_secret_access_key, aws_profile, aws_credentials_dir=aws_credentials_dir
                )
                setup_commands.append(aws_setup)
                if aws_credentials_dir:
                    env_vars["AWS_SHARED_CREDENTIALS_FILE"] = f"{aws_credentials_dir}/credentials"
        elif STORAGE_PROVIDER == "gcp":
            gcp_sa_json_path = os.getenv("TFL_GCP_SERVICE_ACCOUNT_JSON_PATH")
            if gcp_sa_json_path:
                gcp_setup = generate_gcp_credentials_setup(gcp_sa_json_path)
                setup_commands.append(gcp_setup)
        elif STORAGE_PROVIDER == "azure":
            azure_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
            azure_account = os.getenv("AZURE_STORAGE_ACCOUNT")
            azure_key = os.getenv("AZURE_STORAGE_KEY")
            azure_sas = os.getenv("AZURE_STORAGE_SAS_TOKEN")
            if azure_connection_string or azure_account:
                azure_setup = generate_azure_credentials_setup(
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

    # Ensure transformerlab SDK is available on remote machines for live_status tracking and other helpers.
    # This runs after AWS credentials are configured so we have access to any remote storage if needed.
    if provider.type != ProviderType.LOCAL.value:
        setup_commands.append("pip install -q transformerlab")

        # Install torch as well if torch profiler is enabled
        if request.enable_profiling_torch:
            setup_commands.append("pip install -q torch")
    if request.file_mounts is True and request.task_id:
        setup_commands.append(COPY_FILE_MOUNTS_SETUP)
    # For RunPod providers, tell uv to use system Python and also install uv.
    if provider.type == ProviderType.RUNPOD.value:
        env_vars["UV_SYSTEM_PYTHON"] = "1"
        setup_commands.append("curl -LsSf https://astral.sh/uv/install.sh | sh")

    # If GitHub repo fields are missing, fall back to the stored task's fields.
    # This handles GitHub-sourced interactive tasks where the CLI/TUI doesn't
    # send these fields and relies on the backend to resolve them from the task.
    if not request.github_repo_url and request.task_id:
        task_data = await task_service.task_get_by_id(request.task_id, experiment_id=request.experiment_id)
        if task_data:
            request.github_repo_url = task_data.get("github_repo_url", "") or ""
            request.github_repo_dir = task_data.get("github_repo_dir", "") or ""
            request.github_repo_branch = task_data.get("github_repo_branch", "") or ""

    # Add GitHub clone setup if enabled
    if request.github_repo_url:
        workspace_dir = await get_workspace_dir()
        github_pat = await read_github_pat_from_workspace(workspace_dir, user_id=user_id)
        directory = request.github_repo_dir
        branch = request.github_repo_branch
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
                    "chmod 700 ~/.ssh && "
                    'echo "$SSH_PUBLIC_KEY" >> ~/.ssh/authorized_keys && '
                    "chmod 600 ~/.ssh/authorized_keys && "
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
    # Explicitly pass storage provider to launched jobs so task runtimes don't
    # depend on inheriting parent process env.
    env_vars["TFL_STORAGE_PROVIDER"] = STORAGE_PROVIDER
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
    env_vars["TFL_EXPERIMENT_ID"] = request.experiment_id
    env_vars["_TFL_USER_ID"] = user_id

    # Enable Trackio auto-init for this job if requested. When set, the lab SDK
    # running inside the remote script can automatically initialize Trackio
    # and capture metrics for visualization in the Tasks UI. For shared projects,
    # pass project name and run name so the SDK can build trackio_runs/{experiment_id}/{project_name}/.
    trackio_project_name_for_job: Optional[str] = None
    trackio_run_name_for_job: Optional[str] = None
    if request.enable_trackio:
        project_name = resolve_trackio_project_name(request.experiment_id, request.trackio_project_name)
        trackio_run_name = build_trackio_run_name(request.task_name, job_short_id)
        trackio_project_name_for_job = project_name
        trackio_run_name_for_job = trackio_run_name
        await apply_trackio_launch_env(
            env_vars,
            job_id=job_id,
            experiment_id=request.experiment_id,
            project_name=project_name,
            run_name=trackio_run_name,
        )

    if request.enable_profiling:
        env_vars["_TFL_PROFILING"] = "1"
        if request.enable_profiling_torch:
            env_vars["_TFL_PROFILING_TORCH"] = "1"

    # Get TFL_STORAGE_URI for the launched runtime.
    # For localfs, explicitly provide an org-scoped URI so subprocess code can
    # resolve storage without relying on contextvar propagation.
    tfl_storage_uri = None
    if STORAGE_PROVIDER == "localfs" and os.getenv("TFL_STORAGE_URI") and team_id:
        tfl_storage_uri = storage.join(os.getenv("TFL_STORAGE_URI", ""), "orgs", str(team_id), "workspace")
    else:
        try:
            storage_root = await storage.root_uri()
            if storage_root:
                if storage.is_remote_path(storage_root):
                    # Remote cloud storage (S3/GCS/etc.)
                    tfl_storage_uri = storage_root
                elif STORAGE_PROVIDER == "localfs":
                    # localfs: expose the local mount path to the launched worker
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

    # Resolve run command for interactive sessions: run/setup from task or request only;
    # gallery supplies ports / interactive_type for ngrok and local URL hints.
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
            # Task/request setup for interactive (SUDO prefix so $SUDO is defined). Not from gallery JSON.
            from transformerlab.shared.interactive_gallery_utils import INTERACTIVE_SUDO_PREFIX

            raw_setup = (request.setup or "").strip()
            if raw_setup:
                setup_commands.append(INTERACTIVE_SUDO_PREFIX + " " + raw_setup)
                interactive_setup_added = True

            resolved_cmd, setup_override_from_gallery = resolve_interactive_command(
                gallery_entry, environment, base_command=base_command
            )
            if resolved_cmd:
                base_command = INTERACTIVE_SUDO_PREFIX + " " + resolved_cmd
            if setup_override_from_gallery and team_secrets:
                setup_override_from_gallery = replace_secret_placeholders(setup_override_from_gallery, team_secrets)

    # If run command is still empty, fall back to the stored task's fields.
    # This handles GitHub-sourced interactive tasks where the command/setup
    # are in task.yaml and were stored in the task at import time.
    if not base_command.strip() and request.task_id:
        fallback_task = await task_service.task_get_by_id(request.task_id, experiment_id=request.experiment_id)
        if fallback_task:
            base_command = fallback_task.get("run", "") or fallback_task.get("command", "")
            # Also pick up setup from the task if not already added
            if not interactive_setup_added:
                fallback_setup = (fallback_task.get("setup", "") or "").strip()
                if fallback_setup:
                    from transformerlab.shared.interactive_gallery_utils import INTERACTIVE_SUDO_PREFIX

                    setup_commands.append(INTERACTIVE_SUDO_PREFIX + " " + fallback_setup)
                    interactive_setup_added = True

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

    # For SkyPilot providers, resolve docker_image / region / use_spot.
    # Per-job overrides (from request.config) take precedence over provider-level defaults.
    skypilot_image_id: str | None = None
    skypilot_region: str | None = None
    skypilot_zone: str | None = None
    skypilot_use_spot: bool = False
    if provider.type == ProviderType.SKYPILOT.value:
        prov_cfg = provider.config or {}
        # Provider-level defaults
        skypilot_image_id = prov_cfg.get("docker_image") or None
        skypilot_region = prov_cfg.get("default_region") or None
        skypilot_zone = prov_cfg.get("default_zone") or None
        skypilot_use_spot = prov_cfg.get("use_spot", False) is True
        # Per-job overrides from the frontend config dict
        if request.config:
            if request.config.get("docker_image"):
                skypilot_image_id = str(request.config["docker_image"]).strip()
            if request.config.get("region"):
                skypilot_region = str(request.config["region"]).strip()
            if request.config.get("use_spot"):
                skypilot_use_spot = True

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
        provider_config_dict["org_id"] = team_id
        provider_config_dict["experiment_id"] = request.experiment_id
        provider_config_dict["job_id"] = str(job_id)
    if provider.type == ProviderType.DSTACK.value:
        # dstack scheduling can target a named fleet. Support both:
        # - request.config.fleet_name
        # - request.config.resources.fleet_name
        # If absent in the request, fall back to provider-level config.
        per_run_fleet_name = None
        if request.config:
            if request.config.get("fleet_name"):
                per_run_fleet_name = str(request.config.get("fleet_name")).strip()
            elif isinstance(request.config.get("resources"), dict):
                nested_fleet_name = request.config.get("resources", {}).get("fleet_name")
                if nested_fleet_name:
                    per_run_fleet_name = str(nested_fleet_name).strip()

        provider_level_fleet_name = None
        provider_cfg_dict = provider.config if isinstance(provider.config, dict) else {}
        if provider_cfg_dict.get("fleet_name"):
            provider_level_fleet_name = str(provider_cfg_dict.get("fleet_name")).strip()

        fleet_name = per_run_fleet_name or provider_level_fleet_name
        if fleet_name:
            provider_config_dict["fleet_name"] = fleet_name

    # Copy task files (task.yaml and any attachments) into the job directory
    # so they are available to the running command on any provider.
    # index.json is excluded because the job system uses its own index.json
    # for metadata and overwriting it with the task's index.json would break
    # job status tracking.
    if request.task_id:
        task_src = await get_experiment_task_dir(request.experiment_id, request.task_id)
        if not await storage.isdir(task_src):
            # Legacy fallback for tasks that have not been migrated yet.
            task_dir_root = await get_task_dir()
            task_src = storage.join(task_dir_root, secure_filename(str(request.task_id)))
        if await storage.isdir(task_src):
            workspace_job_dir = await get_job_dir(job_id, request.experiment_id)
            await copy_task_files_to_dir(task_src, workspace_job_dir)

    job_data = {
        "task_name": request.task_name,
        "description": request.description,
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
        "created_by_user_id": str(user.id) if user else None,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }
    if provider.type == ProviderType.LOCAL.value and provider_config_dict.get("workspace_dir"):
        job_data["workspace_dir"] = provider_config_dict["workspace_dir"]
    if request.task_id:
        job_data["task_id"] = request.task_id
    if trackio_project_name_for_job is not None:
        job_data["trackio_project_name"] = trackio_project_name_for_job
    if trackio_run_name_for_job is not None:
        job_data["trackio_run_name"] = trackio_run_name_for_job

    # Store quota_hold_id so the background worker can release it on failure.
    if quota_hold:
        job_data["quota_hold_id"] = str(quota_hold.id)

    await job_service.job_update_job_data_insert_key_values(
        job_id, {k: v for k, v in job_data.items() if v is not None}, request.experiment_id
    )

    disk_size = parse_disk_space_gb(request.disk_space)

    # When file_mounts is True we use lab.copy_file_mounts() in setup; do not send to provider
    file_mounts_for_provider = request.file_mounts if isinstance(request.file_mounts, dict) else {}

    # Validate that we have a non-empty command to run.
    if not command_with_secrets or not command_with_secrets.strip():
        raise HTTPException(
            status_code=400,
            detail="No run command resolved for this task. The task may be missing a 'run' or 'command' field.",
        )

    # Apply provider-level harness hooks (pre/post) around the task command.
    # Hooks are concatenated with ';' so the post hook always runs.

    provider_config_for_hooks = provider.config or {}
    if isinstance(provider_config_for_hooks, str):
        try:
            provider_config_for_hooks = json.loads(provider_config_for_hooks)
        except Exception:
            provider_config_for_hooks = {}
    extra_config_for_hooks = (
        provider_config_for_hooks.get("extra_config", {}) if isinstance(provider_config_for_hooks, dict) else {}
    )
    if not isinstance(extra_config_for_hooks, dict):
        extra_config_for_hooks = {}

    pre_task_hook = extra_config_for_hooks.get("pre_task_hook")
    post_task_hook = extra_config_for_hooks.get("post_task_hook")
    command_with_hooks = build_hooked_command(
        command_with_secrets,
        pre_hook=str(pre_task_hook) if pre_task_hook is not None else None,
        post_hook=str(post_task_hook) if post_task_hook is not None else None,
    )

    # Apply provider-level setup hooks (pre/post) around the resolved setup script (if any).
    pre_setup_hook = extra_config_for_hooks.get("pre_setup_hook")
    post_setup_hook = extra_config_for_hooks.get("post_setup_hook")
    setup_with_hooks = final_setup
    if setup_with_hooks and str(setup_with_hooks).strip():
        setup_with_hooks = build_hooked_command(
            str(setup_with_hooks),
            pre_hook=str(pre_setup_hook) if pre_setup_hook is not None else None,
            post_hook=str(post_setup_hook) if post_setup_hook is not None else None,
        )

    # Wrap the user command with tfl-remote-trap so we can track live_status in job_data.
    # This uses the tfl-remote-trap helper from the transformerlab SDK, which:
    #   - sets job_data.live_status="started" when execution begins
    #   - sets job_data.live_status="finished" on success
    #   - sets job_data.live_status="crashed" on failure
    # Pass the complete command as one quoted payload so shell operators remain intact.
    wrapped_run = f"tfl-remote-trap -- {shlex.quote(command_with_hooks)}"

    # For dstack fleet-based runs, do not pass explicit resource requirements.
    # The provider will schedule by fleet and build resources accordingly.
    dstack_fleet_selected = provider.type == ProviderType.DSTACK.value and bool(provider_config_dict.get("fleet_name"))

    cluster_config = ClusterConfig(
        cluster_name=formatted_cluster_name,
        provider_name=provider_display_name,
        provider_id=provider.id,
        run=wrapped_run,
        setup=setup_with_hooks,
        env_vars=env_vars,
        cpus=None if dstack_fleet_selected else request.cpus,
        memory=None if dstack_fleet_selected else request.memory,
        accelerators=None if dstack_fleet_selected else request.accelerators,
        num_nodes=request.num_nodes,
        disk_size=None if dstack_fleet_selected else disk_size,
        file_mounts=file_mounts_for_provider,
        provider_config=provider_config_dict,
        image_id=skypilot_image_id,
        region=skypilot_region,
        zone=skypilot_zone,
        use_spot=skypilot_use_spot,
    )

    # Persist cluster_config into job_data so the DB-backed queue workers
    # can reconstruct the work item without the in-memory object.
    await job_service.job_update_job_data_insert_key_value(
        job_id, "cluster_config", cluster_config.model_dump(), request.experiment_id
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

    await enqueue_remote_launch(
        job_id=str(job_id),
        experiment_id=str(request.experiment_id),
        team_id=str(team_id),
    )

    return {
        "status": "success",
        "job_id": job_id,
        "cluster_name": formatted_cluster_name,
        "request_id": None,
        "message": "Provider launch enqueued",
    }
