from fastapi import (
    APIRouter,
    Body,
    Query,
    HTTPException,
    Depends,
    Request,
    Response,
    File,
    UploadFile,
)
from fastapi.responses import StreamingResponse
from typing import Optional
from werkzeug.utils import secure_filename
import json
import yaml
import os
import posixpath
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from lab.dirs import get_workspace_dir
from lab import storage

from transformerlab.services.task_service import task_service
from transformerlab.services.cache_service import cache, cached
from transformerlab.services.provider_service import list_team_providers
from transformerlab.services.upload_service import get_assembled_path, get_filename, delete_upload
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import (
    fetch_task_json_from_github,
    fetch_task_yaml_from_github,
    list_files_in_github_directory,
    fetch_github_file_bytes,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.schemas.task import (
    ExportTaskToTeamGalleryRequest,
    ImportTaskFromGalleryRequest,
    ImportTaskFromTeamGalleryRequest,
    AddTeamTaskToGalleryRequest,
    DeleteTeamTaskFromGalleryRequest,
    TaskYamlSpec,
    TaskFilesResponse,
)
from pydantic import ValidationError
from fastapi.responses import PlainTextResponse, JSONResponse
import tempfile
import zipfile

router = APIRouter(prefix="/task", tags=["task"])


_TASK_RESERVED_FILENAMES = {"index.json", "task.yaml", "task.yml"}


def _is_reserved_task_filename(path: str) -> bool:
    return os.path.basename(path).lower() in _TASK_RESERVED_FILENAMES


def process_env_parameters_to_env_vars(config: dict) -> dict:
    """
    Process env_parameters from config/task.json and convert them to env_vars.

    For each env_parameter:
    - If it has env_var and value, add to env_vars with that value
    - If it has only env_var (no value), add to env_vars with blank value

    Args:
        config: Dictionary that may contain env_parameters

    Returns:
        Updated config with env_vars populated from env_parameters
    """
    if not isinstance(config, dict):
        return config

    env_parameters = config.get("env_parameters", [])
    if not isinstance(env_parameters, list):
        return config

    # Initialize env_vars if not present
    if "env_vars" not in config:
        config["env_vars"] = {}
    elif not isinstance(config["env_vars"], dict):
        # If env_vars exists but is not a dict, try to convert it
        try:
            if isinstance(config["env_vars"], str):
                config["env_vars"] = json.loads(config["env_vars"])
            else:
                config["env_vars"] = {}
        except (json.JSONDecodeError, TypeError):
            config["env_vars"] = {}

    # Process each env_parameter
    for param in env_parameters:
        if not isinstance(param, dict):
            continue

        env_var = param.get("env_var")
        if not env_var:
            continue

        # If value is provided, use it; otherwise use blank string
        value = param.get("value", "")
        config["env_vars"][env_var] = value

    return config


@router.get("/list", summary="Returns all tasks for the given experiment")
@cached(
    key="tasks:list:{experimentId}",
    ttl="300s",
    tags=["tasks:{experimentId}"],
)
async def task_get_all(experimentId: str):
    tasks = await task_service.task_get_by_experiment(experimentId)
    return tasks


@router.get("/{task_id}/get", summary="Gets all the data for a single task")
@cached(
    key="tasks:get:{experimentId}:{task_id}",
    ttl="300s",
    tags=["tasks:{experimentId}"],
)
async def task_get_by_id(experimentId: str, task_id: str):
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if task is None:
        return {"message": "NOT FOUND"}
    return task


@router.get("/list_by_type", summary="Returns all the tasks of a certain type, e.g TRAIN")
@cached(
    key="tasks:list_by_type:{type}",
    ttl="300s",
    tags=["tasks:list_by_type:{type}"],
)
async def task_get_by_type(type: str):
    tasks = await task_service.task_get_by_type(type)
    return tasks


@router.get(
    "/list_by_type_in_experiment",
    summary="Returns all the tasks of a certain type in a certain experiment, e.g TRAIN",
)
@cached(
    key="tasks:list_by_type_in_experiment:{experimentId}:{type}",
    ttl="300s",
    tags=["tasks:{experimentId}"],
)
async def task_get_by_type_in_experiment(experimentId: str, type: str):
    tasks = await task_service.task_get_by_type_in_experiment(type, experimentId)
    return tasks


@router.get(
    "/{task_id}/files",
    response_model=TaskFilesResponse,
    summary="List files associated with a task template (GitHub + local mounts)",
)
async def task_list_files(experimentId: str, task_id: str) -> TaskFilesResponse:
    """
    Return a lightweight list of files associated with a task template.

    - If github_repo_url is set, this will attempt a best-effort listing of files
      from the configured repository / directory / branch. For now this may be
      limited to known metadata or left empty if repository crawling is not
      readily available.
    - If file_mounts is set, it will be returned as-is as a list of local paths.
    """
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    github_files: list[str] = []
    local_files: list[str] = []

    github_repo_url = task.get("github_repo_url")
    github_repo_dir = task.get("github_repo_dir")
    github_repo_branch = task.get("github_repo_branch")

    if github_repo_url:
        try:
            github_files = await list_files_in_github_directory(
                github_repo_url,
                directory=github_repo_dir,
                ref=github_repo_branch,
            )
        except HTTPException:
            # Surface GitHub errors directly to the client
            raise
        except Exception as e:
            # Unexpected errors should not break the whole endpoint; log and continue.
            print(f"Error listing GitHub files for task {task_id}: {e}")

    file_mounts = task.get("file_mounts")
    if isinstance(file_mounts, list):
        # If stored as list of mappings or plain strings, normalize to string paths.
        for entry in file_mounts:
            if isinstance(entry, str):
                local_files.append(entry)
            elif isinstance(entry, dict):
                src = entry.get("source") or entry.get("src") or entry.get("path")
                tgt = entry.get("target") or entry.get("dst")
                if src and tgt:
                    local_files.append(f"{src} -> {tgt}")
                elif src:
                    local_files.append(str(src))
                elif tgt:
                    local_files.append(str(tgt))

    # Always list files from the canonical per-task directory.
    # This directory contains at minimum task.yaml and may include uploaded files.
    try:
        task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
        if await storage.exists(task_dir):
            entries = await storage.ls(task_dir)
            # Build a set of basenames already in local_files for dedup.
            existing_basenames = {os.path.basename(f.split(" -> ")[-1].strip()) for f in local_files}
            for entry in entries:
                # storage.ls returns full paths; compute relative path safely
                try:
                    name = os.path.relpath(entry, task_dir)
                except ValueError:
                    continue  # entry is not under task_dir; skip it
                if not name or name == "." or name == "index.json":
                    continue
                if name not in existing_basenames:
                    local_files.append(name)
                    existing_basenames.add(name)
    except Exception as e:  # pragma: no cover - defensive logging
        print(f"Error listing local files for task {task_id} from task dir: {e}")

    # Return None instead of empty list when there is no data for a source.
    return TaskFilesResponse(
        github_files=github_files or None,
        local_files=local_files or None,
    )


@router.get(
    "/{task_id}/file/{file_path:path}",
    summary="Serve a file from a task's local workspace directory for preview",
)
async def task_get_file(experimentId: str, task_id: str, file_path: str):
    """
    Serve a file from the per-task workspace directory (used for upload-from-directory tasks).

    This mirrors the behavior of the jobs get_job_file endpoint but is scoped to
    the task's experiment-scoped directory. It is primarily intended for lightweight
    previews in the UI and supports both text and binary content.
    """
    task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
    safe_rel = posixpath.normpath(file_path).lstrip("/")
    if safe_rel.startswith("..") or "/.." in safe_rel:
        raise HTTPException(status_code=400, detail="Invalid file path")
    target = storage.join(task_dir, safe_rel)

    if not await storage.exists(target) or not await storage.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")

    # Determine media type (mirrors jobs.get_job_file)
    _, ext = os.path.splitext(file_path.lower())
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".json": "application/json",
        ".txt": "text/plain",
        ".log": "text/plain",
        ".csv": "text/csv",
        ".py": "text/plain",
        ".yaml": "text/plain",
        ".yml": "text/plain",
        ".md": "text/plain",
        ".sh": "text/plain",
        ".cfg": "text/plain",
        ".ini": "text/plain",
        ".toml": "text/plain",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    # For text-like files, return content directly as text so the frontend can render it
    text_types = {
        ".txt",
        ".log",
        ".csv",
        ".py",
        ".yaml",
        ".yml",
        ".md",
        ".sh",
        ".cfg",
        ".ini",
        ".toml",
        ".json",
        ".xml",
        ".html",
        ".css",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".sql",
        ".r",
        ".ipynb",
    }
    if ext in text_types:
        try:
            async with await storage.open(target, "r", encoding="utf-8") as f:
                content = await f.read()
            return Response(content, media_type=media_type)
        except Exception:
            # Fall through to binary streaming below on failure
            pass

    # For binary files, stream the content so it can be used as an <img> src, etc.
    async def generate():
        async with await storage.open(target, "rb") as f:
            while True:
                chunk = await f.read(8192)
                if not chunk:
                    break
                yield chunk

    filename = os.path.basename(file_path)
    return StreamingResponse(
        generate(),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.put(
    "/{task_id}/file/{file_path:path}",
    summary="Save a text file in a task's local workspace directory",
)
async def task_update_file(experimentId: str, task_id: str, file_path: str, request: Request):
    """
    Save a UTF-8 text file to workspace/task/{task_id}/{file_path}.

    This endpoint is intended for editable source/config/document files (for example:
    .py, .md, .yaml/.yml, .json, .txt). Request bodies are decoded as UTF-8 and
    written in text mode. Binary uploads should use the file-upload endpoint.
    """
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
    safe_rel = posixpath.normpath(file_path).lstrip("/")
    if safe_rel.startswith("..") or "/.." in safe_rel:
        raise HTTPException(status_code=400, detail="Invalid file path")
    if _is_reserved_task_filename(safe_rel):
        raise HTTPException(status_code=400, detail=f"{os.path.basename(safe_rel)} cannot be updated via this endpoint")

    target = storage.join(task_dir, safe_rel)
    target_parent = os.path.dirname(target)
    if target_parent:
        await storage.makedirs(target_parent, exist_ok=True)

    body = (await request.body()).decode("utf-8")
    async with await storage.open(target, "w", encoding="utf-8") as f:
        await f.write(body)

    if not task.get("file_mounts"):
        await task_service.update_task(task_id, {"file_mounts": True}, experiment_id=experimentId)

    await cache.invalidate(f"tasks:{experimentId}")
    return {"message": "OK"}


@router.delete(
    "/{task_id}/file/{file_path:path}",
    summary="Delete a file from a task's local workspace directory",
)
async def task_delete_file(experimentId: str, task_id: str, file_path: str):
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
    safe_rel = posixpath.normpath(file_path).lstrip("/")
    if safe_rel.startswith("..") or "/.." in safe_rel:
        raise HTTPException(status_code=400, detail="Invalid file path")
    base_name = os.path.basename(safe_rel).lower()
    if base_name in {"task.yaml", "task.yml"}:
        raise HTTPException(status_code=400, detail="task.yaml cannot be deleted")

    target = storage.join(task_dir, safe_rel)
    if not await storage.exists(target) or not await storage.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")

    await storage.rm(target)
    await cache.invalidate(f"tasks:{experimentId}")
    return {"message": "OK"}


@router.post(
    "/{task_id}/file-upload",
    summary="Upload one or more files into a task's local workspace directory",
)
async def task_upload_file(
    experimentId: str,
    task_id: str,
    files: list[UploadFile] = File(default=[]),
    upload_id: Optional[str] = None,
):
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
    await storage.makedirs(task_dir, exist_ok=True)

    saved_files: list[str] = []

    if upload_id is not None:
        try:
            assembled_path = await get_assembled_path(upload_id)
            filename = await get_filename(upload_id)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        safe_name = secure_filename(filename)
        if not safe_name:
            raise HTTPException(status_code=400, detail="Invalid filename")
        if _is_reserved_task_filename(safe_name):
            raise HTTPException(status_code=400, detail=f"{safe_name} cannot be uploaded")
        target = storage.join(task_dir, safe_name)
        await storage.copy_file(assembled_path, target)
        await delete_upload(upload_id)
        saved_files.append(safe_name)
    else:
        for uploaded in files:
            original_name = (uploaded.filename or "").strip()
            if not original_name:
                continue
            safe_name = secure_filename(original_name)
            if not safe_name:
                continue
            if _is_reserved_task_filename(safe_name):
                continue
            target = storage.join(task_dir, safe_name)
            content = await uploaded.read()
            async with await storage.open(target, "wb") as f:
                await f.write(content)
            saved_files.append(safe_name)

    if not saved_files:
        raise HTTPException(status_code=400, detail="No valid files uploaded")

    if not task.get("file_mounts"):
        await task_service.update_task(task_id, {"file_mounts": True}, experiment_id=experimentId)

    await cache.invalidate(f"tasks:{experimentId}")
    return {"status": "success", "files": saved_files}


@router.get(
    "/{task_id}/github_file/{file_path:path}",
    summary="Serve a file from the task's associated GitHub repository for preview",
)
async def task_get_github_file(experimentId: str, task_id: str, file_path: str):
    """
    Serve a file from the GitHub repository configured on the task (github_repo_url).

    This endpoint uses the same GitHub PAT resolution logic as other GitHub helpers
    and is intended for lightweight previews in the UI.
    """
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    github_repo_url = task.get("github_repo_url")
    github_repo_branch = task.get("github_repo_branch")
    if not github_repo_url:
        raise HTTPException(status_code=400, detail="Task has no github_repo_url configured")

    # list_files_in_github_directory returns repo-relative paths; the UI uses those
    # paths directly as file_path for preview, so we can pass them through as-is.
    content_bytes = await fetch_github_file_bytes(
        github_repo_url,
        file_path=file_path,
        ref=github_repo_branch,
    )

    _, ext = os.path.splitext(file_path.lower())
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".json": "application/json",
        ".txt": "text/plain",
        ".log": "text/plain",
        ".csv": "text/csv",
        ".py": "text/plain",
        ".yaml": "text/plain",
        ".yml": "text/plain",
        ".md": "text/plain",
        ".sh": "text/plain",
        ".cfg": "text/plain",
        ".ini": "text/plain",
        ".toml": "text/plain",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    text_types = {
        ".txt",
        ".log",
        ".csv",
        ".py",
        ".yaml",
        ".yml",
        ".md",
        ".sh",
        ".cfg",
        ".ini",
        ".toml",
        ".json",
        ".xml",
        ".html",
        ".css",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".sql",
        ".r",
        ".ipynb",
    }
    if ext in text_types:
        try:
            text_content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            # Fall back to binary streaming if we cannot decode as UTF-8
            pass
        else:
            return Response(text_content, media_type=media_type)

    async def generate():
        # Stream bytes as-is for binary or undecodable content
        yield content_bytes

    filename = os.path.basename(file_path)
    return StreamingResponse(
        generate(),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get(
    "/list_by_subtype_in_experiment",
    summary="Returns all tasks for an experiment filtered by subtype and optionally by type",
)
@cached(
    key="tasks:list:{experimentId}:{subtype}:{type}",
    ttl="300s",
    tags=["tasks:{experimentId}"],
)
async def task_get_by_subtype_in_experiment(
    experimentId: str,
    subtype: str,
    type: Optional[str] = Query(None, description="Optional task type filter (e.g., REMOTE)"),
):
    tasks = await task_service.task_get_by_subtype_in_experiment(experimentId, subtype, type)
    return tasks


@router.put("/{task_id}/update", summary="Updates a task with new information")
async def update_task(experimentId: str, task_id: str, new_task: dict = Body()):
    # Perform secure_filename before updating the task
    if "name" in new_task:
        new_task["name"] = secure_filename(new_task["name"])

    success = await task_service.update_task(task_id, new_task, experiment_id=experimentId)
    if success:
        # Best-effort invalidation: task detail + this experiment's task lists.
        await cache.invalidate(f"tasks:{experimentId}")
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{task_id}/delete", summary="Deletes a task")
async def delete_task(experimentId: str, task_id: str):
    success = await task_service.delete_task(task_id, experiment_id=experimentId)
    if success:
        # Best-effort invalidation: task detail + this experiment's task lists.
        await cache.invalidate(f"tasks:{experimentId}")
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


def _clear_interactive_launch_provider(task_data: dict) -> None:
    """Drop provider hints for interactive tasks; compute provider is chosen at launch in the UI."""
    task_data.pop("provider_id", None)
    task_data.pop("provider_name", None)


def _merge_interactive_gallery_env_parameters(task_data: dict, gallery_entry: dict) -> None:
    """
    Ensure env vars declared on the gallery entry (env_parameters) exist on the task.

    GitHub task.yaml may omit keys that the interactive gallery still defines for the UI
    (e.g. NGROK_AUTH_TOKEN). YAML/envs still win for keys already present; this only adds
    missing keys with empty defaults so launch can merge secrets and user values.
    """
    env_params = gallery_entry.get("env_parameters")
    if not isinstance(env_params, list) or not env_params:
        return
    existing = task_data.get("env_vars")
    if not isinstance(existing, dict):
        existing = {}
    for param in env_params:
        if not isinstance(param, dict):
            continue
        ev = param.get("env_var")
        if not isinstance(ev, str) or not ev.strip():
            continue
        if ev not in existing:
            existing[ev] = ""
    task_data["env_vars"] = existing


async def _resolve_provider(
    task_data: dict,
    user_and_team: dict,
    session: AsyncSession,
):
    """
    Resolve provider_id and provider_name from compute_provider name or use default.
    Only resolves if provider_id is not already set (e.g., when YAML is sent directly).
    If compute_provider is provided, match by name. Otherwise, use first available provider.
    """
    try:
        # Skip if provider_id is already set (frontend already resolved it)
        if "provider_id" in task_data and task_data.get("provider_id"):
            return

        team_id = user_and_team.get("team_id")
        if not team_id:
            return

        providers = await list_team_providers(session, team_id)

        if not providers:
            # No providers available, skip
            return

        # Check if provider_name is set (from YAML parsing: resources.compute_provider)
        provider_name = task_data.get("provider_name")

        matched_provider = None

        if provider_name:
            # Try to match by name (case-insensitive)
            provider_name_lower = provider_name.lower().strip()
            for provider in providers:
                if provider.name.lower().strip() == provider_name_lower:
                    matched_provider = provider
                    break

        # Use matched provider if found, otherwise prefer the team's default
        # provider (is_default=True), falling back to the first available.
        if matched_provider:
            task_data["provider_id"] = str(matched_provider.id)
            task_data["provider_name"] = matched_provider.name
        else:
            chosen_provider = next((p for p in providers if getattr(p, "is_default", False)), providers[0])
            task_data["provider_id"] = str(chosen_provider.id)
            task_data["provider_name"] = chosen_provider.name
    except Exception:
        # If provider resolution fails, continue without it
        # The task can still be created, provider selection can happen later
        pass


def _parse_yaml_to_task_data(yaml_content: str) -> dict:
    """
    Parse YAML content and convert it to the task structure.
    Title and description are gallery/catalog metadata (from the gallery entry),
    not part of task.yaml. Expected YAML format (all fields at root level):
    name: task-name
    resources:
      compute_provider: provider-name
      cpus: 2
      memory: 4
    envs:
      KEY: value
    setup: "command"
    run: "command"
    github_repo_url: "url"
    github_repo_dir: "optional/subdir"
    github_repo_branch: "optional branch/tag"
    parameters: {...}
    sweeps:
      sweep_config: {...}
      sweep_metric: "metric"
      lower_is_better: true
    files: # handled separately via file upload
    """
    # Parse YAML
    yaml_data = yaml.safe_load(yaml_content)

    if not yaml_data:
        raise HTTPException(status_code=400, detail="YAML content is empty or invalid")

    # Support both old format (with "task:" key) and new format (direct fields)
    # for backward compatibility
    if "task" in yaml_data:
        task_yaml = yaml_data["task"]
    else:
        task_yaml = yaml_data

    # Backward compatibility: accept legacy "command" field as alias for "run".
    # If run is missing/empty and command is present, promote command to run and
    # remove command before validation so TaskYamlSpec(extra="forbid") still applies.
    if isinstance(task_yaml, dict):
        has_run = bool(task_yaml.get("run"))
        legacy_command = task_yaml.get("command")
        if not has_run and legacy_command:
            task_yaml["run"] = legacy_command
            task_yaml.pop("command", None)

    # Validate and normalize against canonical task.yaml schema
    try:
        validated = TaskYamlSpec.model_validate(task_yaml)
    except ValidationError as e:
        # Build a concise human-readable error message
        messages = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err.get("loc", []))
            msg = err.get("msg", "")
            if loc:
                messages.append(f"{loc}: {msg}")
            else:
                messages.append(msg)
        detail_msg = "; ".join(messages) if messages else "Invalid task.yaml"
        raise HTTPException(status_code=400, detail=detail_msg)

    # Convert validated model into the internal flat task structure
    task_data = {}

    # Basic fields
    task_data["name"] = secure_filename(str(validated.name))

    # Resources
    if validated.resources is not None:
        resources = validated.resources
        if resources.compute_provider is not None:
            task_data["provider_name"] = resources.compute_provider
        if resources.cpus is not None:
            task_data["cpus"] = str(resources.cpus)
        if resources.memory is not None:
            task_data["memory"] = str(resources.memory)
        if resources.disk_space is not None:
            task_data["disk_space"] = str(resources.disk_space)
        if resources.accelerators is not None:
            task_data["accelerators"] = str(resources.accelerators)
        if resources.num_nodes is not None:
            task_data["num_nodes"] = int(resources.num_nodes)
        if resources.fleet_name is not None:
            task_data["config"] = task_data.get("config", {})
            task_data["config"]["fleet_name"] = str(resources.fleet_name)

    # Environment variables
    if validated.envs is not None:
        task_data["env_vars"] = validated.envs

    # Setup and run commands
    if validated.setup is not None:
        task_data["setup"] = str(validated.setup)
    task_data["run"] = str(validated.run)

    # GitHub (task.yaml: github_repo_url, github_repo_dir, github_repo_branch).
    # Canonical internal keys match the YAML (`github_repo_url`, `github_repo_dir`, `github_repo_branch`).
    if validated.github_repo_url is not None:
        task_data["github_repo_url"] = str(validated.github_repo_url)
    if validated.github_repo_dir is not None:
        task_data["github_repo_dir"] = str(validated.github_repo_dir)
    if validated.github_repo_branch is not None:
        task_data["github_repo_branch"] = str(validated.github_repo_branch)

    # Parameters
    if validated.parameters is not None:
        task_data["parameters"] = validated.parameters

    # Sweeps
    if validated.sweeps is not None:
        sweeps = validated.sweeps
        task_data["run_sweeps"] = True
        if sweeps.sweep_config is not None:
            task_data["sweep_config"] = sweeps.sweep_config
        if sweeps.sweep_metric is not None:
            task_data["sweep_metric"] = str(sweeps.sweep_metric)
        if sweeps.lower_is_better is not None:
            task_data["lower_is_better"] = bool(sweeps.lower_is_better)

    # Files are handled separately via file upload endpoint

    return task_data


@router.post("/create", summary="Unified task creation endpoint")
async def create_task(
    experimentId: str,
    request: Request,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    upload_id: Optional[str] = None,
):
    """
    Unified creation for blank, GitHub, and uploaded directory sources.

    Accepts:
    - JSON: { "source": "blank" } to create a blank task template.
    - JSON: { "github_repo_url": "...", "github_repo_dir": "...", "github_repo_branch": "...", "create_if_missing": bool }
    - Multipart/form-data: directory_zip=<zip>
    - Query param: upload_id=<id> to create from a previously uploaded zip
    """
    try:
        if upload_id is not None:
            try:
                zip_path = await get_assembled_path(upload_id)
            except ValueError as exc:
                raise HTTPException(status_code=404, detail=str(exc))
            task_id = await task_service.create_task_from_zip_path(
                experimentId,
                zip_path,
                user_and_team,
                session,
                _resolve_provider,
                _parse_yaml_to_task_data,
            )
            await delete_upload(upload_id)
            await cache.invalidate(f"tasks:{experimentId}")
            return {"id": task_id}

        content_type = (request.headers.get("content-type") or "").lower()
        task_id: Optional[str] = None

        if "application/json" in content_type:
            body = await request.json()
            if (body.get("source") or "").strip().lower() == "blank":
                task_id = await task_service.create_task_from_blank(
                    experimentId,
                    user_and_team,
                    session,
                    _resolve_provider,
                )
                await cache.invalidate(f"tasks:{experimentId}")
                return {"id": task_id}

            github_repo_url = (body.get("github_repo_url") or "").strip()
            if github_repo_url:
                github_repo_dir = (body.get("github_repo_dir") or "").strip() or None
                github_repo_branch = (body.get("github_repo_branch") or "").strip() or None
                create_if_missing = body.get("create_if_missing", False)
                task_id = await task_service.create_task_from_github(
                    experimentId,
                    github_repo_url,
                    github_repo_dir,
                    github_repo_branch,
                    create_if_missing,
                    user_and_team,
                    session,
                    _resolve_provider,
                    fetch_task_yaml_from_github,
                    _parse_yaml_to_task_data,
                )
            else:
                body["experiment_id"] = body.get("experiment_id") or experimentId
                await _resolve_provider(body, user_and_team, session)
                if "name" in body:
                    body["name"] = secure_filename(body["name"])
                if body.get("subtype") == "interactive" or body.get("interactive_type"):
                    gid = body.get("interactive_gallery_id") or body.get("template_id")
                    if gid:
                        body["interactive_gallery_id"] = gid
                task_id = await task_service.add_task(body)

        elif "multipart/form-data" in content_type:
            form = await request.form()
            zip_file = form.get("directory_zip")
            if not zip_file or not getattr(zip_file, "filename", None):
                raise HTTPException(status_code=400, detail="directory_zip file is required")
            zip_content = await zip_file.read()
            task_id = await task_service.create_task_from_directory_zip(
                experimentId,
                zip_content,
                user_and_team,
                session,
                _resolve_provider,
                _parse_yaml_to_task_data,
            )
        else:
            raise HTTPException(
                status_code=400,
                detail="Use application/json (blank/git) or multipart/form-data (directory_zip).",
            )

        if task_id is None:
            raise HTTPException(status_code=400, detail="Unable to create task from request payload")
        await cache.invalidate(f"tasks:{experimentId}")
        return {"id": task_id}
    except HTTPException:
        raise
    except Exception as exc:
        raw_error = str(exc) or exc.__class__.__name__
        normalized = raw_error.lower()
        status_code = 500
        message = "Task creation failed"
        hint = "Check task inputs and storage/provider configuration."

        if "profile" in normalized and ("not found" in normalized or "could not be found" in normalized):
            status_code = 400
            message = "Storage credentials profile not found"
            hint = "Configure the required cloud profile (for example with aws configure --profile <name>)."
        elif "nocredentialserror" in normalized or "unable to locate credentials" in normalized:
            status_code = 400
            message = "Cloud credentials are missing"
            hint = "Configure cloud credentials for your selected storage provider."

        raise HTTPException(
            status_code=status_code,
            detail={"message": message, "hint": hint, "error": raw_error},
        ) from exc


@router.post("/{task_id}/edit", summary="Update an existing task from an uploaded zip")
async def edit_task(
    experimentId: str,
    task_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    upload_id: Optional[str] = None,
):
    """
    Update an existing task in place.

    Accepts:
    - Query param: upload_id=<id> for a previously uploaded task zip.
    """
    if upload_id is None:
        raise HTTPException(status_code=400, detail="upload_id is required")

    existing_task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if existing_task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        zip_path = await get_assembled_path(upload_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    success = await task_service.update_task_from_zip_path(
        experiment_id=experimentId,
        task_id=task_id,
        zip_path=zip_path,
        existing_task=existing_task,
        user_and_team=user_and_team,
        session=session,
        resolve_provider=_resolve_provider,
        parse_yaml=_parse_yaml_to_task_data,
    )
    await delete_upload(upload_id)

    if not success:
        raise HTTPException(status_code=404, detail="Task not found")

    await cache.invalidate(f"tasks:{experimentId}")
    return {"id": task_id}


@router.post("/{task_id}/upload", summary="Upload additional files into an existing task directory")
async def upload_task_files(
    experimentId: str,
    task_id: str,
    upload_id: Optional[str] = None,
):
    """
    Upload additional files to an existing task in place.

    Accepts:
    - Query param: upload_id=<id> for a previously uploaded zip.
    """
    if upload_id is None:
        raise HTTPException(status_code=400, detail="upload_id is required")

    existing_task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if existing_task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    try:
        zip_path = await get_assembled_path(upload_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
    await storage.makedirs(task_dir, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmpdir:
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmpdir)
        for root, _dirs, files in os.walk(tmpdir):
            for name in files:
                rel = os.path.relpath(os.path.join(root, name), tmpdir)
                if _is_reserved_task_filename(rel):
                    raise HTTPException(
                        status_code=400,
                        detail=f"{os.path.basename(rel)} cannot be uploaded via this endpoint",
                    )
        await storage.copy_dir(tmpdir, task_dir)

    await delete_upload(upload_id)
    await task_service.update_task(task_id, {"file_mounts": True}, experiment_id=experimentId)
    await cache.invalidate(f"tasks:{experimentId}")
    return {"id": task_id}


@router.get("/{task_id}/yaml", summary="Get task.yaml from the task directory")
async def get_task_yaml(experimentId: str, task_id: str):
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    content = await task_service.read_task_yaml(task_id, experiment_id=experimentId)
    return PlainTextResponse(content, media_type="text/plain")


@router.put("/{task_id}/yaml", summary="Save task.yaml and sync index.json")
async def update_task_yaml(experimentId: str, task_id: str, request: Request):
    body = (await request.body()).decode("utf-8")
    task = await task_service.task_get_by_id(task_id, experiment_id=experimentId)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    await task_service.write_task_yaml(task_id, body, experiment_id=experimentId)
    task_data = _parse_yaml_to_task_data(body)
    task_data.pop("id", None)
    success = await task_service.update_task_from_yaml(task_id, task_data, experiment_id=experimentId)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    await cache.invalidate(f"tasks:{experimentId}")
    return {"message": "OK"}


@router.post("/validate", summary="Validate task.yaml content without saving")
async def validate_task_yaml(request: Request):
    body = (await request.body()).decode("utf-8")
    try:
        _parse_yaml_to_task_data(body)
    except HTTPException as e:
        raise e
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error validating task.yaml: {str(e)}")
    return JSONResponse({"valid": True})


@router.get("/delete_all", summary="Wipe all tasks")
async def task_delete_all():
    await task_service.task_delete_all()
    return {"message": "OK"}


@router.get("/gallery", summary="List all tasks from the tasks gallery")
@cached(
    key="tasks:gallery",
    ttl="120s",
    tags=["tasks:gallery"],
)
async def task_gallery():
    """Get the tasks gallery from the JSON file (same as tasks gallery)"""
    gallery = await galleries.get_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.get("/gallery/interactive", summary="List all interactive task templates")
@cached(
    key="tasks:gallery:interactive",
    ttl="120s",
    tags=["tasks:gallery", "tasks:gallery:interactive"],
)
async def interactive_gallery():
    """Get the interactive tasks gallery (vscode, jupyter, vllm, ssh templates)"""
    gallery = await galleries.get_interactive_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/import", summary="Import a task from the tasks gallery")
async def import_task_from_gallery(
    experimentId: str,
    request: ImportTaskFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Import a task from the tasks gallery or interactive gallery.
    Creates a new task using task.yaml from GitHub repository (for regular tasks)
    or creates an interactive task template from gallery definition.
    Uses the team's GitHub PAT if available.
    """
    try:
        # Check if importing from interactive gallery
        if request.is_interactive:
            # Import from interactive gallery
            gallery = await galleries.get_interactive_gallery()

            # Find the gallery entry by index or ID
            try:
                gallery_index = int(request.gallery_id)
                if gallery_index < 0 or gallery_index >= len(gallery):
                    raise HTTPException(status_code=404, detail="Gallery entry not found")
                gallery_entry = gallery[gallery_index]
            except (ValueError, IndexError):
                gallery_entry = None
                for entry in gallery:
                    if entry.get("id") == request.gallery_id:
                        gallery_entry = entry
                        break
                if not gallery_entry:
                    raise HTTPException(status_code=404, detail="Gallery entry not found")

            # Create interactive task template (store interactive_gallery_id for launch-time run resolution)
            requested_name = (request.name or "").strip()
            task_name = requested_name or gallery_entry.get("name", "Interactive Task")
            interactive_type = gallery_entry.get("interactive_type") or gallery_entry.get("id") or "custom"
            interactive_gallery_id = gallery_entry.get("id")

            # Resolve task setup/command from the gallery entry's source:
            # 1. github_repo_url + github_repo_dir -> fetch task.yaml from GitHub
            # 2. local_task_dir -> read task.yaml from local filesystem
            # 3. inline setup/command fields on the gallery entry
            github_repo_url = gallery_entry.get("github_repo_url")
            github_repo_dir = gallery_entry.get("github_repo_dir")
            github_repo_branch = gallery_entry.get("github_repo_branch")
            local_task_dir = gallery_entry.get("local_task_dir")
            source_yaml_data = {}

            if github_repo_url:
                try:
                    task_yaml_content = await fetch_task_yaml_from_github(
                        github_repo_url, directory=github_repo_dir, ref=github_repo_branch
                    )
                    source_yaml_data = _parse_yaml_to_task_data(task_yaml_content)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to fetch task.yaml from GitHub: {e}")
            elif local_task_dir and os.path.isdir(local_task_dir):
                local_yaml_path = os.path.join(local_task_dir, "task.yaml")
                if os.path.isfile(local_yaml_path):
                    with open(local_yaml_path, "r", encoding="utf-8") as f:
                        source_yaml_data = _parse_yaml_to_task_data(f.read())

            # Resolve provider
            task_data = {
                "name": secure_filename(task_name),
                "type": "REMOTE",
                "plugin": "remote_orchestrator",
                "experiment_id": experimentId,
                "cluster_name": task_name,
                "run": source_yaml_data.get("run", source_yaml_data.get("command", "")),
                "setup": source_yaml_data.get("setup", "") or gallery_entry.get("setup", ""),
                "interactive_type": interactive_type,
                "subtype": "interactive",
                "interactive_gallery_id": interactive_gallery_id,
            }

            # Store GitHub repo info so the runner can clone files at launch time
            if github_repo_url:
                task_data["github_repo_url"] = github_repo_url
                if github_repo_dir:
                    task_data["github_repo_dir"] = github_repo_dir
                if github_repo_branch:
                    task_data["github_repo_branch"] = github_repo_branch

            # Merge additional fields from source task.yaml (parameters, env_vars, resources, etc.)
            for key in (
                "parameters",
                "env_vars",
                "github_repo_url",
                "github_repo_dir",
                "github_repo_branch",
                "cpus",
                "memory",
                "disk_space",
                "accelerators",
                "num_nodes",
            ):
                if key in source_yaml_data:
                    task_data[key] = source_yaml_data[key]

            _merge_interactive_gallery_env_parameters(task_data, gallery_entry)

            # Merge user-provided env_vars from the request (e.g. MODEL_NAME)
            if request.env_vars:
                existing = task_data.get("env_vars", {})
                if not isinstance(existing, dict):
                    existing = {}
                existing.update(request.env_vars)
                task_data["env_vars"] = existing

            # For interactive gallery imports, allow the UI modal to override the
            # resources parsed from GitHub task.yaml.
            if request.cpus is not None:
                task_data["cpus"] = str(request.cpus)
            if request.memory is not None:
                task_data["memory"] = str(request.memory)
            if request.disk_space is not None:
                task_data["disk_space"] = str(request.disk_space)
            if request.accelerators is not None:
                task_data["accelerators"] = str(request.accelerators)
            if request.num_nodes is not None:
                task_data["num_nodes"] = int(request.num_nodes)

            # Interactive gallery tasks: do not resolve provider from task.yaml or team defaults.
            # The user picks the compute provider in the UI when launching; storing a resolved
            # provider_id here (often the first-listed local provider) was misleading and ignored
            # the modal selection.
            _clear_interactive_launch_provider(task_data)

            # Create the task
            task_id = await task_service.add_task(task_data)

            # Invalidate cached task lists for this experiment (best-effort).
            await cache.invalidate(f"tasks:{experimentId}")

            # Store task.yaml in the task directory for GitHub-sourced interactive tasks.
            # Use task_service.write_task_yaml so the file lands in the experiment-scoped
            # path that task_list_files reads from (workspace/experiments/{exp_id}/tasks/{id}).
            if github_repo_url and source_yaml_data:
                await task_service.write_task_yaml(task_id, task_yaml_content, experiment_id=experimentId)

            # Copy local_task_dir files into the task directory (inside a subdirectory
            # matching the source directory name, mirroring what github_repo_dir does
            # at clone time) and mark file_mounts so the runner copies them at launch.
            if local_task_dir and os.path.isdir(local_task_dir):
                task_dir_path = await task_service.get_task_dir(task_id, experiment_id=experimentId)
                await storage.makedirs(task_dir_path, exist_ok=True)
                dest_subdir = storage.join(task_dir_path, os.path.basename(local_task_dir.rstrip("/")))
                await storage.copy_dir(local_task_dir, dest_subdir)
                await task_service.update_task(task_id, {"file_mounts": True}, experiment_id=experimentId)

            return {
                "status": "success",
                "message": f"Interactive task '{task_name}' imported successfully",
                "id": task_id,
            }

        # Regular task import (existing logic)
        gallery = await galleries.get_tasks_gallery()

        # Find the gallery entry by index or ID
        try:
            gallery_index = int(request.gallery_id)
            if gallery_index < 0 or gallery_index >= len(gallery):
                raise HTTPException(status_code=404, detail="Gallery entry not found")
            gallery_entry = gallery[gallery_index]
        except (ValueError, IndexError):
            # Try to find by title or other identifier
            gallery_entry = None
            for entry in gallery:
                if entry.get("id") == request.gallery_id or entry.get("title") == request.gallery_id:
                    gallery_entry = entry
                    break
            if not gallery_entry:
                raise HTTPException(status_code=404, detail="Gallery entry not found")

        # Create interactive task template (store interactive_gallery_id for launch-time run resolution)
        requested_name = (request.name or "").strip()
        task_name = requested_name or gallery_entry.get("name", "Interactive Task")
        interactive_type = gallery_entry.get("interactive_type") or "custom"
        interactive_gallery_id = gallery_entry.get("id")

        # Resolve task setup/command from the gallery entry's source:
        # 1. github_repo_url + github_repo_dir -> fetch task.yaml from GitHub
        # 2. local_task_dir -> read task.yaml from local filesystem
        # 3. inline setup/command fields on the gallery entry
        github_repo_url = gallery_entry.get("github_repo_url")
        github_repo_dir = gallery_entry.get("github_repo_dir")
        github_repo_branch = gallery_entry.get("github_repo_branch")

        if not github_repo_url:
            raise HTTPException(status_code=400, detail="Gallery entry missing github_repo_url")

        # Fetch task.yaml from GitHub repository
        try:
            task_yaml_content = await fetch_task_yaml_from_github(
                github_repo_url, directory=github_repo_dir, ref=github_repo_branch
            )
        except HTTPException as e:
            if e.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail="task.yaml not found in repository. Please ensure the repository contains a task.yaml file.",
                )
            raise

        # Parse task.yaml to task data
        try:
            task_data = _parse_yaml_to_task_data(task_yaml_content)
        except yaml.YAMLError as e:
            raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Error parsing YAML: {str(e)}")

        # Mark tasks imported from the *main* gallery so the UI can show
        # a one-time resource compatibility reminder.
        task_data["gallery_import"] = True

        # Carry over any per-provider accelerator suggestions from the gallery entry.
        # Expected shape (example):
        # {
        #   "NVIDIA": { "resources": { "accelerators": "RTX3090:1", "cpus": "2", "memory": "4" } }
        # }
        supported_accelerators = gallery_entry.get("supportedAccelerators")
        if isinstance(supported_accelerators, dict):
            task_data["supportedAccelerators"] = supported_accelerators

        # Always set experiment_id from path so the task belongs to this experiment
        task_data["experiment_id"] = experimentId

        # Ensure required fields
        if "type" not in task_data:
            task_data["type"] = "REMOTE"
        if "plugin" not in task_data:
            task_data["plugin"] = "remote_orchestrator"

        # Ensure GitHub repo info is set when gallery YAML omits it.
        if not task_data.get("github_repo_url"):
            task_data["github_repo_url"] = github_repo_url
        if github_repo_dir and not task_data.get("github_repo_dir"):
            task_data["github_repo_dir"] = github_repo_dir
        if github_repo_branch and not task_data.get("github_repo_branch"):
            task_data["github_repo_branch"] = github_repo_branch

        # Resolve provider
        await _resolve_provider(task_data, user_and_team, session)

        # Get task name from task.yaml or use title
        task_name = task_data.get("name") or requested_name
        if "name" in task_data:
            task_data["name"] = secure_filename(task_data["name"])
        else:
            task_data["name"] = secure_filename(task_name)

        # Create the task with all fields stored directly (flat structure)
        task_id = await task_service.add_task(task_data)

        # Store task.yaml in the experiment-scoped task directory
        await task_service.write_task_yaml(task_id, task_yaml_content, experiment_id=experimentId)

        # Invalidate cached task lists for this experiment (best-effort).
        await cache.invalidate(f"tasks:{experimentId}")

        return {
            "status": "success",
            "message": f"Task '{task_data['name']}' imported successfully",
            "id": task_id,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raw_error = str(exc) or exc.__class__.__name__
        normalized = raw_error.lower()
        status_code = 500
        message = "Task gallery import failed"
        hint = "Check gallery task configuration and storage/provider credentials."

        if "profile" in normalized and ("not found" in normalized or "could not be found" in normalized):
            status_code = 400
            message = "Storage credentials profile not found"
            hint = "Configure the required cloud profile (for example with aws configure --profile <name>)."
        elif "nocredentialserror" in normalized or "unable to locate credentials" in normalized:
            status_code = 400
            message = "Cloud credentials are missing"
            hint = "Configure cloud credentials for your selected storage provider."

        raise HTTPException(
            status_code=status_code,
            detail={"message": message, "hint": hint, "error": raw_error},
        ) from exc


@router.get("/gallery/team", summary="List team-specific tasks from the team gallery")
@cached(
    key="tasks:gallery:team",
    ttl="60s",
    tags=["tasks:gallery", "tasks:gallery:team"],
)
async def team_task_gallery():
    """Get the team-specific tasks gallery stored in workspace_dir (same as tasks gallery)"""
    gallery = await galleries.get_team_tasks_gallery()
    return {"status": "success", "data": gallery}


def _find_team_gallery_entry(gallery: list[dict], gallery_id: str) -> Optional[dict]:
    """Find a team gallery entry by id or title, matching existing import/delete behavior."""
    for entry in gallery:
        if entry.get("id") == gallery_id or entry.get("title") == gallery_id:
            return entry
    return None


@router.get(
    "/gallery/team/{gallery_id}/files",
    summary="List files in a team gallery task directory (local_task_dir)",
)
async def list_team_gallery_files(gallery_id: str):
    """
    List all files in the team gallery entry's local_task_dir.
    Returns paths relative to that directory.
    """
    gallery = await galleries.get_team_tasks_gallery()
    entry = _find_team_gallery_entry(gallery, gallery_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Task not found in team gallery")

    local_task_dir = entry.get("local_task_dir")
    if not local_task_dir:
        # GitHub-only entry; no local directory to show.
        return {"status": "success", "files": []}

    if not await storage.exists(str(local_task_dir)) or not await storage.isdir(str(local_task_dir)):
        raise HTTPException(status_code=404, detail="local_task_dir does not exist")

    # storage.find returns file paths (not directories)
    try:
        full_paths = await storage.find(str(local_task_dir))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list files: {e}")

    rels: list[str] = []
    base = str(local_task_dir).rstrip("/")
    for p in full_paths:
        ps = str(p)
        if not ps.startswith(base):
            continue
        rel = ps[len(base) :].lstrip("/")
        if not rel or rel.startswith("."):
            continue
        rels.append(rel)

    rels = sorted(set(rels))
    return {"status": "success", "files": rels}


@router.get(
    "/gallery/team/{gallery_id}/file/{file_path:path}",
    summary="Serve a file from a team gallery task directory for preview",
)
async def get_team_gallery_file(gallery_id: str, file_path: str):
    """
    Serve a file from the team gallery entry's local_task_dir for preview.
    """
    gallery = await galleries.get_team_tasks_gallery()
    entry = _find_team_gallery_entry(gallery, gallery_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Task not found in team gallery")

    local_task_dir = entry.get("local_task_dir")
    if not local_task_dir:
        raise HTTPException(status_code=400, detail="Task has no local_task_dir")

    base = str(local_task_dir).rstrip("/")
    # Normalize and prevent traversal
    safe_rel = posixpath.normpath(file_path).lstrip("/")
    if safe_rel.startswith("..") or "/.." in safe_rel:
        raise HTTPException(status_code=400, detail="Invalid file path")

    target = storage.join(base, safe_rel)
    if not await storage.exists(target) or not await storage.isfile(target):
        raise HTTPException(status_code=404, detail="File not found")

    _, ext = os.path.splitext(safe_rel.lower())
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".json": "application/json",
        ".txt": "text/plain",
        ".log": "text/plain",
        ".csv": "text/csv",
        ".py": "text/plain",
        ".yaml": "text/plain",
        ".yml": "text/plain",
        ".md": "text/plain",
        ".sh": "text/plain",
        ".cfg": "text/plain",
        ".ini": "text/plain",
        ".toml": "text/plain",
        ".pdf": "application/pdf",
        ".zip": "application/zip",
    }
    media_type = media_type_map.get(ext, "application/octet-stream")

    text_types = {
        ".txt",
        ".log",
        ".csv",
        ".py",
        ".yaml",
        ".yml",
        ".md",
        ".sh",
        ".cfg",
        ".ini",
        ".toml",
        ".json",
        ".xml",
        ".html",
        ".css",
        ".js",
        ".ts",
        ".tsx",
        ".jsx",
        ".sql",
        ".r",
        ".ipynb",
    }
    if ext in text_types:
        try:
            async with await storage.open(target, "r", encoding="utf-8") as f:
                content = await f.read()
            return Response(content, media_type=media_type)
        except Exception:
            pass

    async def generate():
        async with await storage.open(target, "rb") as f:
            while True:
                chunk = await f.read(8192)
                if not chunk:
                    break
                yield chunk

    filename = os.path.basename(safe_rel)
    return StreamingResponse(
        generate(),
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/gallery/team/import", summary="Import a task from the team tasks gallery")
async def import_task_from_team_gallery(
    experimentId: str,
    request: ImportTaskFromTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Import a task from the team-specific tasks gallery (workspace_dir/team_specific_tasks.json).

    Supports 3 entry types:
    - GitHub-backed entries (github_repo_url): fetch task.yaml from GitHub
    - Filesystem-backed entries (local_task_dir): read task.yaml and copy the entire directory
    - Inline-config entries (config.run): synthesize task.yaml and create the task
    """
    gallery = await galleries.get_team_tasks_gallery()

    # Find the gallery entry by index or ID
    try:
        gallery_index = int(request.gallery_id)
        if gallery_index < 0 or gallery_index >= len(gallery):
            raise HTTPException(status_code=404, detail="Gallery entry not found")
        gallery_entry = gallery[gallery_index]
    except (ValueError, IndexError):
        gallery_entry = None
        for entry in gallery:
            if entry.get("id") == request.gallery_id or entry.get("title") == request.gallery_id:
                gallery_entry = entry
                break
        if not gallery_entry:
            raise HTTPException(status_code=404, detail="Gallery entry not found")

    # Extract gallery entry fields
    title = gallery_entry.get("title", "Imported Task")
    github_repo_url = gallery_entry.get("github_repo_url") or ""
    github_repo_dir = gallery_entry.get("github_repo_dir")
    github_repo_branch = gallery_entry.get("github_repo_branch")

    local_task_dir = gallery_entry.get("local_task_dir")
    inline_config = gallery_entry.get("config") if isinstance(gallery_entry.get("config"), dict) else None

    # Determine whether the imported task should be an interactive task.
    # This is primarily driven by the client (team interactive tab), but we also infer from gallery metadata.
    gallery_subtype = gallery_entry.get("subtype") or (inline_config.get("subtype") if inline_config else None)
    is_interactive_import = bool(
        request.is_interactive
        or gallery_subtype == "interactive"
        or gallery_entry.get("interactive_type")
        or gallery_entry.get("interactive_gallery_id")
    )

    interactive_gallery_id = gallery_entry.get("interactive_gallery_id") or (
        inline_config.get("interactive_gallery_id") if inline_config else None
    )
    interactive_type = gallery_entry.get("interactive_type") or (
        inline_config.get("interactive_type") if inline_config else None
    )

    # --- 1) Filesystem-backed entry: read task.yaml and copy whole directory ---
    if local_task_dir:
        # local_task_dir is expected to be a workspace-local path (shared FS for clustered nodes)
        yaml_path = storage.join(str(local_task_dir), "task.yaml")
        if not await storage.exists(yaml_path) or not await storage.isfile(yaml_path):
            raise HTTPException(status_code=400, detail="local_task_dir is missing task.yaml")

        try:
            async with await storage.open(yaml_path, "r", encoding="utf-8") as f:
                task_yaml_content = await f.read()
            task_data = _parse_yaml_to_task_data(task_yaml_content)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to read/parse task.yaml from local_task_dir: {e}")

        task_data["experiment_id"] = experimentId
        task_data.setdefault("type", "REMOTE")
        task_data.setdefault("plugin", "remote_orchestrator")
        if is_interactive_import:
            task_data["subtype"] = "interactive"
            if interactive_type:
                task_data["interactive_type"] = interactive_type
            if interactive_gallery_id:
                task_data["interactive_gallery_id"] = interactive_gallery_id

        # Ensure GitHub metadata is carried through if present in the gallery entry
        if github_repo_url and not task_data.get("github_repo_url"):
            task_data["github_repo_url"] = github_repo_url
        if github_repo_dir and not task_data.get("github_repo_dir"):
            task_data["github_repo_dir"] = github_repo_dir
        if github_repo_branch and not task_data.get("github_repo_branch"):
            task_data["github_repo_branch"] = github_repo_branch

        if not is_interactive_import:
            await _resolve_provider(task_data, user_and_team, session)
        else:
            _clear_interactive_launch_provider(task_data)

        # Create task + copy full directory into the task workspace dir
        task_id = await task_service.add_task(task_data)
        task_dir = await task_service.get_task_dir(task_id, experiment_id=experimentId)
        await storage.makedirs(task_dir, exist_ok=True)

        # Copy the entire directory contents (task.yaml + attachments) into the experiment-scoped task dir
        try:
            await storage.copy_dir(str(local_task_dir), task_dir)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to copy local_task_dir into task directory: {e}")

        # If the source directory contained an old index.json (from a different task id),
        # we want to preserve all other metadata fields but ensure the task id matches
        # the newly-created task directory name.
        #
        # So: update only the "id" field in index.json (and create index.json if missing).
        try:
            copied_index = storage.join(task_dir, "index.json")
            if await storage.exists(copied_index) and await storage.isfile(copied_index):
                async with await storage.open(copied_index, "r", encoding="utf-8") as f:
                    raw = await f.read()
                try:
                    data = json.loads(raw) if raw else {}
                except Exception:
                    data = {}
                if not isinstance(data, dict):
                    data = {}
                data["id"] = task_id
                async with await storage.open(copied_index, "w", encoding="utf-8") as f:
                    await f.write(json.dumps(data, indent=2))
            else:
                # No index.json in the copied directory; write at least minimal metadata.
                await task_service.update_task(task_id, {"id": task_id}, experiment_id=experimentId)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to overwrite id in index.json for imported team task: {e}"
            )

        await cache.invalidate(f"tasks:{experimentId}")
        return {
            "status": "success",
            "message": f"Task '{task_data.get('name') or title}' imported successfully",
            "id": task_id,
        }

    # --- 2) Inline-config entry: synthesize minimal task.yaml and create the task ---
    if (not github_repo_url) and inline_config and inline_config.get("run"):
        # Convert inline config into the internal flat task structure (minimal)
        task_data = {
            "name": secure_filename(str(title)),
            "run": inline_config.get("run"),
            "setup": inline_config.get("setup") or None,
            "experiment_id": experimentId,
            "type": "REMOTE",
            "plugin": "remote_orchestrator",
        }
        if is_interactive_import:
            task_data["subtype"] = "interactive"
            if interactive_type:
                task_data["interactive_type"] = interactive_type
            if interactive_gallery_id:
                task_data["interactive_gallery_id"] = interactive_gallery_id

        for key in ("cpus", "memory", "disk_space", "accelerators", "num_nodes", "env_vars", "parameters"):
            if inline_config.get(key) is not None:
                task_data[key] = inline_config.get(key)

        # Merge user-provided env_vars from the request (best-effort)
        if request.env_vars:
            existing = task_data.get("env_vars", {})
            if not isinstance(existing, dict):
                existing = {}
            existing.update(request.env_vars)
            task_data["env_vars"] = existing

        if not is_interactive_import:
            await _resolve_provider(task_data, user_and_team, session)
        else:
            _clear_interactive_launch_provider(task_data)
        task_id = await task_service.add_task(task_data)

        # Write a task.yaml into the experiment-scoped task directory so the editor works
        yaml_obj = {
            "name": task_data["name"],
            "setup": task_data.get("setup"),
            "run": task_data["run"],
            "resources": {
                "cpus": task_data.get("cpus"),
                "memory": task_data.get("memory"),
                "disk_space": task_data.get("disk_space"),
                "accelerators": task_data.get("accelerators"),
                "num_nodes": task_data.get("num_nodes"),
            },
            "envs": task_data.get("env_vars"),
            "parameters": task_data.get("parameters"),
        }
        # Remove empty values so YAML stays tidy
        yaml_obj["resources"] = {k: v for k, v in (yaml_obj.get("resources") or {}).items() if v is not None}
        yaml_obj = {k: v for k, v in yaml_obj.items() if v not in (None, {}, [])}
        await task_service.write_task_yaml(
            task_id, yaml.safe_dump(yaml_obj, sort_keys=False), experiment_id=experimentId
        )

        await cache.invalidate(f"tasks:{experimentId}")
        return {
            "status": "success",
            "message": f"Task '{task_data['name']}' imported successfully",
            "id": task_id,
        }

    # --- 3) GitHub-backed entry (existing behavior) ---
    if not github_repo_url:
        raise HTTPException(
            status_code=400,
            detail="Gallery entry missing github_repo_url (and has no local_task_dir/config.run to import)",
        )

    # Fetch task.yaml from GitHub repository
    try:
        task_yaml_content = await fetch_task_yaml_from_github(
            github_repo_url, directory=github_repo_dir, ref=github_repo_branch
        )
    except HTTPException as e:
        if e.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="task.yaml not found in repository. Please ensure the repository contains a task.yaml file.",
            )
        raise

    # Parse task.yaml to task data
    try:
        task_data = _parse_yaml_to_task_data(task_yaml_content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing YAML: {str(e)}")

    # Always set experiment_id from path so the task belongs to this experiment
    task_data["experiment_id"] = experimentId

    # Ensure required fields
    if "type" not in task_data:
        task_data["type"] = "REMOTE"
    if "plugin" not in task_data:
        task_data["plugin"] = "remote_orchestrator"
    if is_interactive_import:
        task_data["subtype"] = "interactive"
        if interactive_type and not task_data.get("interactive_type"):
            task_data["interactive_type"] = interactive_type
        if interactive_gallery_id and not task_data.get("interactive_gallery_id"):
            task_data["interactive_gallery_id"] = interactive_gallery_id

    if not task_data.get("github_repo_url"):
        task_data["github_repo_url"] = github_repo_url
    if github_repo_dir and not task_data.get("github_repo_dir"):
        task_data["github_repo_dir"] = github_repo_dir
    if github_repo_branch and not task_data.get("github_repo_branch"):
        task_data["github_repo_branch"] = github_repo_branch

    # Interactive imports: provider is chosen at launch in the UI, not from YAML/defaults.
    if not is_interactive_import:
        await _resolve_provider(task_data, user_and_team, session)
    else:
        _clear_interactive_launch_provider(task_data)

    # Get task name from task.yaml or use title
    task_name = task_data.get("name") or title
    if "name" in task_data:
        task_data["name"] = secure_filename(task_data["name"])
    else:
        task_data["name"] = secure_filename(task_name)

    # Create the task with all fields stored directly (flat structure)
    task_id = await task_service.add_task(task_data)

    # Store task.yaml in the experiment-scoped task directory
    await task_service.write_task_yaml(task_id, task_yaml_content, experiment_id=experimentId)

    # Invalidate cached task lists for this experiment (best-effort).
    await cache.invalidate(f"tasks:{experimentId}")

    return {
        "status": "success",
        "message": f"Task '{task_data['name']}' imported successfully",
        "id": task_id,
    }


@router.post("/gallery/team/export", summary="Export an existing task to the team gallery")
async def export_task_to_team_gallery(
    experimentId: str,
    request: ExportTaskToTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Export a task into the team-specific gallery stored in workspace_dir.
    Tasks store all fields directly (not nested in config).
    """
    task = await task_service.task_get_by_id(request.task_id, experiment_id=experimentId)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # For tasks, all fields are stored directly (not nested in config)
    # Build config object from task fields for gallery entry (for backwards compatibility)
    config = {}
    # Copy relevant fields to config for gallery compatibility
    if task.get("cluster_name"):
        config["cluster_name"] = task.get("cluster_name")
    if task.get("run"):
        config["run"] = task.get("run")
    if task.get("cpus"):
        config["cpus"] = task.get("cpus")
    if task.get("memory"):
        config["memory"] = task.get("memory")
    if task.get("disk_space"):
        config["disk_space"] = task.get("disk_space")
    if task.get("accelerators"):
        config["accelerators"] = task.get("accelerators")
    if task.get("num_nodes"):
        config["num_nodes"] = task.get("num_nodes")
    if task.get("setup"):
        config["setup"] = task.get("setup")
    if task.get("env_vars"):
        config["env_vars"] = task.get("env_vars")
    if task.get("parameters"):
        config["parameters"] = task.get("parameters")
    if task.get("file_mounts"):
        config["file_mounts"] = task.get("file_mounts")
    if task.get("github_repo_url"):
        config["github_repo_url"] = task.get("github_repo_url")
    if task.get("github_repo_dir"):
        config["github_repo_dir"] = task.get("github_repo_dir")
    if task.get("github_repo_branch"):
        config["github_repo_branch"] = task.get("github_repo_branch")
    # Preserve interactive metadata in the exported entry so the team interactive tab can round-trip.
    if task.get("subtype"):
        config["subtype"] = task.get("subtype")
    if task.get("interactive_type"):
        config["interactive_type"] = task.get("interactive_type")
    if task.get("interactive_gallery_id"):
        config["interactive_gallery_id"] = task.get("interactive_gallery_id")

    gallery_entry = {
        "id": task.get("id") or request.task_id,
        "title": task.get("name") or "Untitled Task",
        "description": task.get("description"),
        "config": config,
        "github_repo_url": task.get("github_repo_url"),
        "github_repo_dir": task.get("github_repo_dir"),
        "github_repo_branch": task.get("github_repo_branch"),
        "subtype": task.get("subtype"),
        "interactive_type": task.get("interactive_type"),
        "interactive_gallery_id": task.get("interactive_gallery_id"),
    }

    # Also export the *entire* on-disk task directory (task.yaml + any files) into a stable
    # team gallery directory so imports can round-trip local files without relying on GitHub.
    try:
        workspace_dir = await get_workspace_dir()
        if workspace_dir:
            export_root = storage.join(workspace_dir, "team_gallery_tasks")
            await storage.makedirs(export_root, exist_ok=True)

            safe_title = secure_filename(str(gallery_entry["title"])) or "task"
            short_id = secure_filename(str(request.task_id))[:12]
            dest_dir = storage.join(export_root, f"{safe_title}-{short_id}")

            # Copy from the task's experiment-scoped workspace directory
            src_dir = await task_service.get_task_dir(request.task_id, experiment_id=experimentId)
            if await storage.exists(src_dir):
                # Ensure destination is clean
                if await storage.exists(dest_dir):
                    # Remove and re-copy to ensure it's fresh
                    await storage.rm_tree(dest_dir)
                await storage.copy_dir(src_dir, dest_dir)

                # Keep index.json in the exported directory so imports can preserve
                # non-YAML metadata fields (e.g. file_mounts). The importer will overwrite
                # only its "id" field to match the newly-created task id.

                # Ensure there's a task.yaml at the root of the exported directory
                exported_yaml_path = storage.join(dest_dir, "task.yaml")
                if not await storage.exists(exported_yaml_path):
                    yaml_obj = {
                        "name": gallery_entry["title"],
                        "setup": task.get("setup"),
                        "run": task.get("run") or "",
                        "resources": {
                            "cpus": task.get("cpus"),
                            "memory": task.get("memory"),
                            "disk_space": task.get("disk_space"),
                            "accelerators": task.get("accelerators"),
                            "num_nodes": task.get("num_nodes"),
                        },
                        "envs": task.get("env_vars") if isinstance(task.get("env_vars"), dict) else None,
                        "parameters": task.get("parameters") if isinstance(task.get("parameters"), dict) else None,
                        "github_repo_url": task.get("github_repo_url"),
                        "github_repo_dir": task.get("github_repo_dir"),
                        "github_repo_branch": task.get("github_repo_branch"),
                    }
                    yaml_obj["resources"] = {
                        k: v for k, v in (yaml_obj.get("resources") or {}).items() if v is not None
                    }
                    yaml_obj = {k: v for k, v in yaml_obj.items() if v not in (None, {}, [])}
                    async with await storage.open(exported_yaml_path, "w", encoding="utf-8") as f:
                        await f.write(yaml.safe_dump(yaml_obj, sort_keys=False))

                gallery_entry["local_task_dir"] = dest_dir
    except Exception as e:
        # If filesystem export fails, don't create or update the gallery entry.
        raise HTTPException(
            status_code=500,
            detail=f"Failed to export task directory for team gallery: {e}",
        )

    await galleries.add_team_task_to_gallery(gallery_entry)
    await cache.invalidate("tasks:gallery", "tasks:gallery:team")

    return {
        "status": "success",
        "message": f"Task '{gallery_entry['title']}' exported to team gallery",
        "data": gallery_entry,
    }


@router.post("/gallery/team/add", summary="Add a new task to the team gallery (writes task.yaml + directory)")
async def add_task_to_team_gallery(
    experimentId: str,
    request: AddTeamTaskToGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Create a new team-gallery entry backed by a workspace directory containing task.yaml.

    This is used by the UI's "Add Team Task" modal. The created gallery entry can then
    be imported via /gallery/team/import without requiring GitHub.
    """
    workspace_dir = await get_workspace_dir()
    if not workspace_dir:
        raise HTTPException(status_code=500, detail="Workspace directory is not configured")

    export_root = storage.join(workspace_dir, "team_gallery_tasks")
    await storage.makedirs(export_root, exist_ok=True)

    safe_title = secure_filename(request.title) or "task"

    suffix = uuid.uuid4().hex[:8]
    dest_dir = storage.join(export_root, f"{safe_title}-{suffix}")
    await storage.makedirs(dest_dir, exist_ok=True)

    # Build a canonical-ish task.yaml (compatible with TaskYamlSpec)
    yaml_obj = {
        "name": request.title,
        "setup": request.setup,
        "run": request.run,
        "resources": {
            "cpus": request.cpus,
            "memory": request.memory,
            "accelerators": request.supported_accelerators,
        },
        "github_repo_url": request.github_repo_url,
        "github_repo_dir": request.github_repo_dir,
        "github_repo_branch": request.github_repo_branch,
    }
    yaml_obj["resources"] = {k: v for k, v in (yaml_obj.get("resources") or {}).items() if v not in (None, "")}
    yaml_obj = {k: v for k, v in yaml_obj.items() if v not in (None, "", {}, [])}

    # Validate before writing so we don't persist broken YAML
    try:
        TaskYamlSpec.model_validate(yaml_obj)
    except ValidationError as e:
        messages = []
        for err in e.errors():
            loc = ".".join(str(x) for x in err.get("loc", []))
            msg = err.get("msg", "")
            messages.append(f"{loc}: {msg}" if loc else msg)
        raise HTTPException(status_code=400, detail="; ".join(messages) if messages else "Invalid task.yaml")

    yaml_path = storage.join(dest_dir, "task.yaml")
    async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
        await f.write(yaml.safe_dump(yaml_obj, sort_keys=False))

    gallery_entry = {
        "id": f"{safe_title}-{suffix}",
        "title": request.title,
        "description": request.description,
        "config": {
            "setup": request.setup,
            "run": request.run,
            "cpus": request.cpus,
            "memory": request.memory,
            "supported_accelerators": request.supported_accelerators,
            "github_repo_url": request.github_repo_url,
            "github_repo_dir": request.github_repo_dir,
            "github_repo_branch": request.github_repo_branch,
        },
        "github_repo_url": request.github_repo_url,
        "github_repo_dir": request.github_repo_dir,
        "github_repo_branch": request.github_repo_branch,
        "local_task_dir": dest_dir,
    }

    await galleries.add_team_task_to_gallery(gallery_entry)
    await cache.invalidate("tasks:gallery", "tasks:gallery:team")
    return {
        "status": "success",
        "message": f"Task '{request.title}' added to team gallery",
        "data": gallery_entry,
    }


@router.post("/gallery/team/delete", summary="Delete a task from the team gallery")
async def delete_team_task_from_gallery(
    experimentId: str,
    request: DeleteTeamTaskFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Delete a task from the team-specific gallery stored in workspace_dir.
    """
    success = await galleries.delete_team_task_from_gallery(request.task_id)
    if success:
        await cache.invalidate("tasks:gallery", "tasks:gallery:team")
        return {
            "status": "success",
            "message": "Task deleted from team gallery",
        }
    else:
        raise HTTPException(status_code=404, detail="Task not found in team gallery")


@router.get("/fetch_task_json", summary="Fetch task.json from a GitHub repository or URL")
async def fetch_task_json_endpoint(
    url: str = Query(..., description="GitHub repository URL, blob URL, or raw URL"),
    user_and_team=Depends(get_user_and_team),
):
    """
    Fetch task.json file from a GitHub repository or direct URL.
    Supports both public and private repositories using the team's GitHub PAT.

    Accepts various URL formats:
    - GitHub repo URL: https://github.com/owner/repo.git (with optional directory query param)
    - GitHub blob URL: https://github.com/owner/repo/blob/branch/path/task.json
    - Raw GitHub URL: https://raw.githubusercontent.com/owner/repo/branch/path/task.json
    - Any direct JSON URL: https://example.com/path/task.json

    Args:
        url: Full URL to task.json or GitHub repository URL

    Returns:
        JSON object containing the task.json content, or error if not found
    """
    import re

    # Convert GitHub blob URL to extract info
    # https://github.com/owner/repo/blob/branch/path/task.json
    blob_pattern = r"^https://github\.com/([^/]+)/([^/]+)/blob/([^/]+)/(.+)/task\.json$"
    blob_match = re.match(blob_pattern, url)
    if blob_match:
        owner, repo, branch_or_commit, path = blob_match.groups()
        repo_url = f"https://github.com/{owner}/{repo}.git"
        directory = path.rstrip("/")
        task_json = await fetch_task_json_from_github(repo_url, directory, ref=branch_or_commit)
        return {
            "status": "success",
            "data": task_json,
            "repo": f"{owner}/{repo}",
            "path": f"{directory}/task.json",
        }

    # Handle raw.githubusercontent.com URLs
    # https://raw.githubusercontent.com/owner/repo/branch/path/task.json
    raw_pattern = r"^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.+)/task\.json$"
    raw_match = re.match(raw_pattern, url)
    if raw_match:
        owner, repo, branch_or_commit, path = raw_match.groups()
        repo_url = f"https://github.com/{owner}/{repo}.git"
        directory = path.rstrip("/")
        task_json = await fetch_task_json_from_github(repo_url, directory, ref=branch_or_commit)
        return {
            "status": "success",
            "data": task_json,
            "repo": f"{owner}/{repo}",
            "path": f"{directory}/task.json",
        }

    # Handle regular GitHub repo URLs (backward compatibility)
    # https://github.com/owner/repo.git or https://github.com/owner/repo
    if url.startswith("https://github.com/") and (url.endswith(".git") or "/blob" not in url and "/tree" not in url):
        # This is a repo URL, but we need directory - check if it's in query params
        # For now, assume root directory if no path specified
        repo_url = url
        directory = None
        task_json = await fetch_task_json_from_github(repo_url, directory)
        repo_url_clean = repo_url.replace(".git", "").strip()
        parts = repo_url_clean.replace("https://github.com/", "").split("/")
        owner = parts[0] if len(parts) > 0 else ""
        repo = parts[1] if len(parts) > 1 else ""
        file_path = "task.json"
        return {
            "status": "success",
            "data": task_json,
            "repo": f"{owner}/{repo}",
            "path": file_path,
        }

    # For non-GitHub URLs, return error (frontend should handle direct fetch)
    raise HTTPException(
        status_code=400,
        detail="URL must be a GitHub repository URL, blob URL, or raw GitHub URL. For other URLs, use direct fetch.",
    )
