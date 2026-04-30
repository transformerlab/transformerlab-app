"""Sweep parent job creation and background child launches."""

import asyncio
import os
import time
from itertools import product
from typing import Any, Dict, List

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.schemas.compute_providers import ProviderTemplateLaunchRequest
from transformerlab.services import job_service
from transformerlab.services.compute_provider.cluster_naming import sanitize_cluster_basename
from transformerlab.services.compute_provider.launch_credentials import (
    COPY_FILE_MOUNTS_SETUP,
    RUNPOD_AWS_CREDENTIALS_DIR,
    generate_aws_credentials_setup,
    generate_azure_credentials_setup,
    generate_gcp_credentials_setup,
    get_aws_credentials_from_file,
)
from transformerlab.services.compute_provider.trackio_launch import (
    apply_trackio_launch_env,
    build_trackio_run_name,
    resolve_trackio_project_name,
)
from transformerlab.services.provider_service import get_team_provider, get_provider_instance
from transformerlab.shared.disk_space_utils import parse_disk_space_gb
from transformerlab.shared.models.models import ProviderType
from transformerlab.shared.github_utils import read_github_pat_from_workspace, generate_github_clone_setup
from transformerlab.shared.secret_utils import load_team_secrets, replace_secrets_in_dict, replace_secret_placeholders
from lab import storage
from lab.dirs import get_workspace_dir, set_organization_id
from lab.job_status import JobStatus
from lab.storage import STORAGE_PROVIDER


async def create_sweep_parent_job(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team: dict,
    session: AsyncSession,
    sweep_config: Dict[str, List[Any]],
    sweep_metric: str,
    lower_is_better: bool,
    total_configs: int,
) -> str:
    team_id = user_and_team["team_id"]
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

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
        "description": request.description,
        "subtype": request.subtype,
        "provider_id": provider.id,
        "provider_type": provider.type,
        "provider_name": provider_display_name,
        "user_info": user_info or None,
        "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
    }

    parent_job_updates = {key: value for key, value in parent_job_data.items() if value is not None}
    if parent_job_updates:
        await job_service.job_update_job_data_insert_key_values(
            parent_job_id, parent_job_updates, request.experiment_id
        )

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
    from transformerlab.db.session import async_session
    from lab.dirs import set_organization_id as lab_set_org_id

    team_id = user_and_team["team_id"]
    if lab_set_org_id is not None:
        lab_set_org_id(team_id)

    try:
        async with async_session() as session:
            team_id = user_and_team["team_id"]
            user = user_and_team["user"]
            provider = await get_team_provider(session, team_id, provider_id)
            if not provider:
                print(f"Provider {provider_id} not found for sweep job {parent_job_id}")
                return

            user_id_str = str(user.id)
            provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

            user_info = {}
            if getattr(user, "first_name", None) or getattr(user, "last_name", None):
                user_info["name"] = " ".join(
                    part for part in [getattr(user, "first_name", ""), getattr(user, "last_name", "")] if part
                ).strip()
            if getattr(user, "email", None):
                user_info["email"] = getattr(user, "email")

            provider_display_name = request.provider_name or provider.name

            user_id = str(user_and_team["user"].id)
            team_secrets = await load_team_secrets(user_id=user_id)

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
                merged_params = {**(base_parameters or {}), **config_params}

                run_suffix = f"sweep-{i + 1}"
                parent_job_short_id = job_service.get_short_job_id(parent_job_id)
                formatted_cluster_name = f"{sanitize_cluster_basename(base_name)}-{run_suffix}-{parent_job_short_id}"

                child_job_id = await job_service.job_create(
                    type="REMOTE",
                    status=JobStatus.QUEUED,
                    experiment_id=request.experiment_id,
                )

                env_vars = request.env_vars.copy() if request.env_vars else {}

                if env_vars and team_secrets:
                    env_vars = replace_secrets_in_dict(env_vars, team_secrets)

                # Explicitly pass storage provider to launched jobs so runtime
                # behavior does not depend on inherited parent env.
                env_vars["TFL_STORAGE_PROVIDER"] = STORAGE_PROVIDER
                env_vars["_TFL_JOB_ID"] = str(child_job_id)
                env_vars["_TFL_EXPERIMENT_ID"] = request.experiment_id
                env_vars["TFL_EXPERIMENT_ID"] = request.experiment_id
                env_vars["_TFL_USER_ID"] = user_id

                trackio_project_name_for_child: str | None = None
                trackio_run_name_for_child: str | None = None
                if request.enable_trackio:
                    st_project_name = resolve_trackio_project_name(request.experiment_id, request.trackio_project_name)
                    child_job_short_id = job_service.get_short_job_id(child_job_id)
                    st_run_name = build_trackio_run_name(request.task_name, child_job_short_id)
                    trackio_project_name_for_child = st_project_name
                    trackio_run_name_for_child = st_run_name
                    await apply_trackio_launch_env(
                        env_vars,
                        job_id=child_job_id,
                        experiment_id=request.experiment_id,
                        project_name=st_project_name,
                        run_name=st_run_name,
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

                if provider.type == ProviderType.RUNPOD.value:
                    env_vars["UV_SYSTEM_PYTHON"] = "1"

                if provider.type == ProviderType.LOCAL.value and team_id:
                    set_organization_id(team_id)
                    try:
                        workspace_dir = await get_workspace_dir()
                        if workspace_dir and not storage.is_remote_path(workspace_dir):
                            env_vars["TFL_WORKSPACE_DIR"] = workspace_dir
                    finally:
                        set_organization_id(None)

                setup_commands = []

                if os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true":
                    if STORAGE_PROVIDER == "aws":
                        from transformerlab.shared.remote_workspace import get_default_aws_profile

                        aws_profile = get_default_aws_profile()
                        aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(
                            get_aws_credentials_from_file, aws_profile
                        )
                        if aws_access_key_id and aws_secret_access_key:
                            aws_credentials_dir = (
                                RUNPOD_AWS_CREDENTIALS_DIR if provider.type == ProviderType.RUNPOD.value else None
                            )
                            aws_setup = generate_aws_credentials_setup(
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

                if provider.type == ProviderType.RUNPOD.value:
                    setup_commands.append("curl -LsSf https://astral.sh/uv/install.sh | sh")

                if provider.type != ProviderType.LOCAL.value:
                    setup_commands.append("pip install -q transformerlab")

                    if request.enable_profiling_torch:
                        setup_commands.append("pip install -q torch")

                if request.file_mounts is True and request.task_id:
                    setup_commands.append(COPY_FILE_MOUNTS_SETUP)

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

                child_job_data = {
                    "parent_sweep_job_id": str(parent_job_id),
                    "sweep_run_index": i + 1,
                    "sweep_total": total_configs,
                    "sweep_params": config_params,
                    "task_name": f"{request.task_name or 'Task'} (Sweep {i + 1}/{total_configs})"
                    if request.task_name
                    else None,
                    "description": request.description,
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
                if request.task_id:
                    child_job_data["task_id"] = request.task_id
                if trackio_project_name_for_child is not None:
                    child_job_data["trackio_project_name"] = trackio_project_name_for_child
                if trackio_run_name_for_child is not None:
                    child_job_data["trackio_run_name"] = trackio_run_name_for_child

                child_job_updates = {key: value for key, value in child_job_data.items() if value is not None}
                if child_job_updates:
                    await job_service.job_update_job_data_insert_key_values(
                        child_job_id, child_job_updates, request.experiment_id
                    )

                disk_size = parse_disk_space_gb(request.disk_space)

                file_mounts_for_provider = request.file_mounts if isinstance(request.file_mounts, dict) else {}

                sweep_image_id: str | None = None
                sweep_region: str | None = None
                sweep_zone: str | None = None
                sweep_use_spot: bool = False
                if provider.type == ProviderType.SKYPILOT.value:
                    prov_cfg = provider.config or {}
                    sweep_image_id = prov_cfg.get("docker_image") or None
                    sweep_region = prov_cfg.get("default_region") or None
                    sweep_zone = prov_cfg.get("default_zone") or None
                    sweep_use_spot = prov_cfg.get("use_spot", False) is True
                    if request.config:
                        if request.config.get("docker_image"):
                            sweep_image_id = str(request.config["docker_image"]).strip()
                        if request.config.get("region"):
                            sweep_region = str(request.config["region"]).strip()
                        if request.config.get("use_spot"):
                            sweep_use_spot = True

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
                    image_id=sweep_image_id,
                    region=sweep_region,
                    zone=sweep_zone,
                    use_spot=sweep_use_spot,
                )

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

            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_job_ids", child_job_ids, request.experiment_id
            )
            await job_service.job_update_job_data_insert_key_value(
                parent_job_id, "sweep_running", len(child_job_ids), request.experiment_id
            )

            print(f"Completed launching {len(child_job_ids)} child jobs for sweep {parent_job_id}")
    finally:
        if lab_set_org_id is not None:
            lab_set_org_id(None)
