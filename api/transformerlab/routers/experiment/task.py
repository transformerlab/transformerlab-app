from fastapi import (
    APIRouter,
    Body,
    Query,
    HTTPException,
    Depends,
    Request,
    UploadFile,
    File,
    Response,
)
from fastapi.responses import StreamingResponse
from typing import Optional
from werkzeug.utils import secure_filename
import json
import yaml
import zipfile
import os
import posixpath
import tempfile
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from lab.dirs import get_workspace_dir
from lab import storage

from transformerlab.services.task_service import task_service
from transformerlab.services.cache_service import cache, cached
from transformerlab.services.provider_service import list_team_providers
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import (
    fetch_task_json_from_github,
    fetch_task_yaml_from_github,
    list_files_in_github_directory,
    fetch_github_file_bytes,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from lab.task_template import TaskTemplate
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

router = APIRouter(prefix="/task", tags=["task"])


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


@router.get("/list", summary="Returns all the tasks")
@cached(
    key="tasks:list",
    ttl="300s",
    tags=["tasks", "tasks:list"],
)
async def task_get_all():
    tasks = await task_service.task_get_all()
    return tasks


@router.get("/{task_id}/get", summary="Gets all the data for a single task")
async def task_get_by_id(task_id: str):
    task = await task_service.task_get_by_id(task_id)
    if task is None:
        return {"message": "NOT FOUND"}
    return task


@router.get("/list_by_type", summary="Returns all the tasks of a certain type, e.g TRAIN")
async def task_get_by_type(type: str):
    tasks = await task_service.task_get_by_type(type)
    return tasks


@router.get(
    "/list_by_type_in_experiment",
    summary="Returns all the tasks of a certain type in a certain experiment, e.g TRAIN",
)
async def task_get_by_type_in_experiment(experimentId: str, type: str):
    tasks = await task_service.task_get_by_type_in_experiment(type, experimentId)
    return tasks


@router.get(
    "/{task_id}/files",
    response_model=TaskFilesResponse,
    summary="List files associated with a task template (GitHub + local mounts)",
)
async def task_list_files(task_id: str) -> TaskFilesResponse:
    """
    Return a lightweight list of files associated with a task template.

    - If github_repo_url is set, this will attempt a best-effort listing of files
      from the configured repository / directory / branch. For now this may be
      limited to known metadata or left empty if repository crawling is not
      readily available.
    - If file_mounts is set, it will be returned as-is as a list of local paths.
    """
    task = await task_service.task_get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    github_files: list[str] = []
    local_files: list[str] = []

    # For tasks, fields are stored directly (flat structure). Prefer canonical github_repo_* keys,
    # but fall back to legacy github_directory/github_branch for older tasks.
    github_repo_url = task.get("github_repo_url")
    github_repo_dir = task.get("github_repo_dir") or task.get("github_directory")
    github_repo_branch = task.get("github_repo_branch") or task.get("github_branch")

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
    elif isinstance(file_mounts, bool) and file_mounts:
        # For upload-from-directory tasks, files are materialized in the
        # per-task workspace directory: workspace/task/{task_id}. List all
        # entries in that directory so the UI can show what will be mounted.
        try:
            workspace_dir = await get_workspace_dir()
            if workspace_dir:
                task_dir = storage.join(workspace_dir, "task", str(task_id))
                if await storage.exists(task_dir):
                    entries = await storage.ls(task_dir)
                    for entry in entries:
                        # storage.ls returns full paths; strip the task_dir prefix
                        name = entry.replace(task_dir, "").lstrip("/").lstrip("\\")
                        if name:
                            local_files.append(name)
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
async def task_get_file(task_id: str, file_path: str):
    """
    Serve a file from the per-task workspace directory (used for upload-from-directory tasks).

    This mirrors the behavior of the jobs get_job_file endpoint but is scoped to
    workspace/task/{task_id}. It is primarily intended for lightweight previews in
    the UI and supports both text and binary content.
    """
    workspace_dir = await get_workspace_dir()
    if not workspace_dir:
        raise HTTPException(status_code=500, detail="Workspace directory is not configured")

    # Files for upload-from-directory tasks are materialized under workspace/task/{task_id}
    task_dir = storage.join(workspace_dir, "task", str(task_id))
    target = storage.join(task_dir, file_path)

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


@router.get(
    "/{task_id}/github_file/{file_path:path}",
    summary="Serve a file from the task's associated GitHub repository for preview",
)
async def task_get_github_file(task_id: str, file_path: str):
    """
    Serve a file from the GitHub repository configured on the task (github_repo_url).

    This endpoint uses the same GitHub PAT resolution logic as other GitHub helpers
    and is intended for lightweight previews in the UI.
    """
    task = await task_service.task_get_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    github_repo_url = task.get("github_repo_url")
    github_branch = task.get("github_branch")
    if not github_repo_url:
        raise HTTPException(status_code=400, detail="Task has no github_repo_url configured")

    # list_files_in_github_directory returns repo-relative paths; the UI uses those
    # paths directly as file_path for preview, so we can pass them through as-is.
    content_bytes = await fetch_github_file_bytes(
        github_repo_url,
        file_path=file_path,
        ref=github_branch,
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
    tags=["tasks", "tasks:list:{experimentId}"],
)
async def task_get_by_subtype_in_experiment(
    experimentId: str,
    subtype: str,
    type: Optional[str] = Query(None, description="Optional task type filter (e.g., REMOTE)"),
):
    tasks = await task_service.task_get_by_subtype_in_experiment(experimentId, subtype, type)
    return tasks


@router.put("/{task_id}/update", summary="Updates a task with new information")
async def update_task(task_id: str, new_task: dict = Body()):
    # Perform secure_filename before updating the task
    if "name" in new_task:
        new_task["name"] = secure_filename(new_task["name"])

    # Fetch existing task to determine experiment for cache invalidation.
    existing_task = await task_service.task_get_by_id(task_id)
    success = await task_service.update_task(task_id, new_task)
    if success:
        experiment_id = existing_task.get("experiment_id") if isinstance(existing_task, dict) else None
        if experiment_id:
            # Best-effort invalidation of cached task lists for this experiment.
            await cache.invalidate("tasks", f"tasks:list:{experiment_id}")
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{task_id}/delete", summary="Deletes a task")
async def delete_task(task_id: str):
    # Fetch existing task to determine experiment for cache invalidation.
    existing_task = await task_service.task_get_by_id(task_id)
    success = await task_service.delete_task(task_id)
    if success:
        experiment_id = existing_task.get("experiment_id") if isinstance(existing_task, dict) else None
        if experiment_id:
            # Best-effort invalidation of cached task lists for this experiment.
            await cache.invalidate("tasks", f"tasks:list:{experiment_id}")
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


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

        # Use matched provider if found, otherwise use first available as fallback
        if matched_provider:
            task_data["provider_id"] = str(matched_provider.id)
            task_data["provider_name"] = matched_provider.name
        else:
            # No provider specified or no match found, use first available
            first_provider = providers[0]
            task_data["provider_id"] = str(first_provider.id)
            task_data["provider_name"] = first_provider.name
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


async def _store_zip_file(zip_file: UploadFile, task_id: str) -> str:
    """
    Store a zip file locally for a task.
    Returns the stored path that should be mapped to ~/src in file_mounts.
    """
    workspace_dir = await get_workspace_dir()
    if not workspace_dir:
        raise HTTPException(status_code=500, detail="Workspace directory is not configured")

    # Create uploads/task/{task_id} directory
    uploads_root = storage.join(workspace_dir, "uploads", "task")
    await storage.makedirs(uploads_root, exist_ok=True)

    task_dir = storage.join(uploads_root, str(task_id))
    await storage.makedirs(task_dir, exist_ok=True)

    # Generate a safe filename for the zip file
    import uuid

    original_name = zip_file.filename or "source.zip"
    # Avoid path separators from filename
    safe_name = original_name.split("/")[-1].split("\\")[-1]
    suffix = uuid.uuid4().hex[:8]
    stored_filename = f"{safe_name}.{suffix}"
    stored_path = storage.join(task_dir, stored_filename)

    try:
        # Read zip file content
        zip_content = await zip_file.read()

        # Verify it's a valid zip file
        with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temp_zip:
            temp_zip.write(zip_content)
            temp_zip_path = temp_zip.name

        # Verify it's a valid zip file (but don't extract)
        with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
            # Just verify it can be opened, don't extract
            zip_ref.testzip()

        # Store the zip file
        async with await storage.open(stored_path, "wb") as f:
            await f.write(zip_content)

        # Clean up temp file
        os.remove(temp_zip_path)

        # Return the stored path (this will be mapped to ~/src)
        return stored_path

    except zipfile.BadZipFile:
        if "temp_zip_path" in locals() and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive")
    except Exception as e:
        if "temp_zip_path" in locals() and os.path.exists(temp_zip_path):
            os.remove(temp_zip_path)
        raise HTTPException(status_code=500, detail=f"Error storing ZIP file: {str(e)}")


@router.post("/new_task", summary="Create a new task")
async def add_task(
    request: Request,
    experimentId: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    zip_file: Optional[UploadFile] = File(None),
):
    """
    Create a new task. Accepts either:
    1. JSON object with task fields directly (Content-Type: application/json)
    2. YAML string (Content-Type: text/plain, text/yaml, or application/x-yaml)
    3. Multipart/form-data with:
       - yaml or json: YAML/JSON string as form field
       - zip_file: Optional ZIP file (will be extracted to ~/src on remote server)

    For YAML, the format should be (all fields at root level):
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

    If a zip_file is provided, it will be stored locally and file_mounts will be set to map ~/src to the stored zip file path.
    """
    try:
        content_type = request.headers.get("content-type", "").lower()
        task_data = None

        # Check if it's multipart/form-data (for zip file support)
        if "multipart/form-data" in content_type:
            form = await request.form()

            # Get YAML or JSON from form
            yaml_content = form.get("yaml") or form.get("json")
            if not yaml_content:
                raise HTTPException(status_code=400, detail="YAML or JSON content is required in form data")

            yaml_content_str = str(yaml_content)

            try:
                task_data = _parse_yaml_to_task_data(yaml_content_str)
            except yaml.YAMLError as e:
                raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing YAML: {str(e)}")

        # Check if it's YAML (text/plain or text/yaml)
        elif "text/plain" in content_type or "text/yaml" in content_type or "application/x-yaml" in content_type:
            # Read YAML string from body
            yaml_content = await request.body()
            yaml_content_str = yaml_content.decode("utf-8")

            try:
                task_data = _parse_yaml_to_task_data(yaml_content_str)
            except yaml.YAMLError as e:
                raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Error parsing YAML: {str(e)}")

        else:
            # Handle JSON input (existing behavior)
            try:
                new_task = await request.json()

                # Inject experimentId from path parameter if not in JSON
                if "experiment_id" not in new_task:
                    new_task["experiment_id"] = experimentId

                # Handle provider matching for JSON input
                await _resolve_provider(new_task, user_and_team, session)

                # Perform secure_filename before adding the task
                if "name" in new_task:
                    new_task["name"] = secure_filename(new_task["name"])

                # Persist interactive_gallery_id for launch-time command resolution (from template_id or interactive_gallery_id)
                if new_task.get("subtype") == "interactive" or new_task.get("interactive_type"):
                    gid = new_task.get("interactive_gallery_id") or new_task.get("template_id")
                    if gid:
                        new_task["interactive_gallery_id"] = gid

                # All fields are stored directly in the JSON (not nested in inputs/outputs/config)
                task_id = await task_service.add_task(new_task)

                # Handle zip file if provided (for JSON requests, zip_file would come from multipart)
                if zip_file and zip_file.filename:
                    try:
                        await _store_zip_file(zip_file, task_id)
                        # Update task with file_mounts: true so launch runs lab.copy_file_mounts()
                        await task_service.update_task(task_id, {"file_mounts": True})

                    except Exception as e:
                        # Log error but don't fail task creation
                        print(f"Warning: Failed to process zip file: {e}")

                # Invalidate cached task lists for this experiment (best-effort).
                await cache.invalidate("tasks", f"tasks:list:{experimentId}")

                return {"message": "OK", "id": task_id}
            except json.JSONDecodeError:
                # If JSON parsing fails, try YAML as fallback
                yaml_content = await request.body()
                yaml_content_str = yaml_content.decode("utf-8")

                try:
                    task_data = _parse_yaml_to_task_data(yaml_content_str)
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid JSON or YAML: {str(e)}")

                if "name" in task_data:
                    task_data["name"] = secure_filename(task_data["name"])

                # Handle provider matching
                await _resolve_provider(task_data, user_and_team, session)

                task_id = await task_service.add_task(task_data)

                # Handle zip file if provided
                if zip_file and zip_file.filename:
                    try:
                        await _store_zip_file(zip_file, task_id)
                        # Update task with file_mounts: true so launch runs lab.copy_file_mounts()
                        await task_service.update_task(task_id, {"file_mounts": True})
                    except Exception as e:
                        # Log error but don't fail task creation
                        print(f"Warning: Failed to process zip file: {e}")

                return {"message": "OK", "id": task_id}

        # Common processing for YAML-based requests
        if task_data:
            # Always set experiment_id from path so the task belongs to this experiment
            task_data["experiment_id"] = experimentId

            # Add required fields if not present
            if "type" not in task_data:
                task_data["type"] = "REMOTE"
            if "plugin" not in task_data:
                task_data["plugin"] = "remote_orchestrator"

            # Handle provider matching
            await _resolve_provider(task_data, user_and_team, session)

            # Perform secure_filename before adding the task
            if "name" in task_data:
                task_data["name"] = secure_filename(task_data["name"])

            task_id = await task_service.add_task(task_data)

            # Handle zip file if provided
            if zip_file and zip_file.filename:
                try:
                    await _store_zip_file(zip_file, task_id)
                    # Update task with file_mounts: true so launch runs lab.copy_file_mounts()
                    await task_service.update_task(task_id, {"file_mounts": True})
                except Exception as e:
                    # Log error but don't fail task creation
                    print(f"Warning: Failed to process zip file: {e}")

            return {"message": "OK", "id": task_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creating task: {str(e)}")


@router.get("/delete_all", summary="Wipe all tasks")
async def task_delete_all():
    await task_service.task_delete_all()
    return {"message": "OK"}


@router.get("/gallery", summary="List all tasks from the tasks gallery")
async def task_gallery():
    """Get the tasks gallery from the JSON file (same as tasks gallery)"""
    gallery = await galleries.get_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.get("/gallery/interactive", summary="List all interactive task templates")
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
        task_name = gallery_entry.get("name", "Interactive Task")
        interactive_type = gallery_entry.get("interactive_type") or "custom"
        interactive_gallery_id = gallery_entry.get("id")

        # Resolve task setup/command from the gallery entry's source:
        # 1. github_repo_url + github_repo_dir -> fetch task.yaml from GitHub
        # 2. local_task_dir -> read task.yaml from local filesystem
        # 3. inline setup/command fields on the gallery entry
        github_repo_url = gallery_entry.get("github_repo_url")
        github_repo_dir = gallery_entry.get("github_repo_dir")
        github_branch = gallery_entry.get("github_branch")
        local_task_dir = gallery_entry.get("local_task_dir")
        source_yaml_data = {}

        if github_repo_url:
            try:
                task_yaml_content = await fetch_task_yaml_from_github(
                    github_repo_url, directory=github_repo_dir, ref=github_branch
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
                task_data["github_directory"] = github_repo_dir
            if github_branch:
                task_data["github_branch"] = github_branch

        # Merge additional fields from source task.yaml (parameters, env_vars, resources, etc.)
        for key in (
            "parameters",
            "env_vars",
            "github_repo_url",
            "github_directory",
            "github_branch",
            "cpus",
            "memory",
            "disk_space",
            "accelerators",
            "num_nodes",
        ):
            if key in source_yaml_data:
                task_data[key] = source_yaml_data[key]

        # Merge user-provided env_vars from the request (e.g. MODEL_NAME)
        if request.env_vars:
            existing = task_data.get("env_vars", {})
            if not isinstance(existing, dict):
                existing = {}
            existing.update(request.env_vars)
            task_data["env_vars"] = existing

        await _resolve_provider(task_data, user_and_team, session)

        # Create the task
        task_id = await task_service.add_task(task_data)

        # Invalidate cached task lists for this experiment (best-effort).
        await cache.invalidate("tasks", f"tasks:list:{experimentId}")

        # Store task.yaml in the task directory for GitHub-sourced interactive tasks
        if github_repo_url and source_yaml_data:
            task_template = TaskTemplate(secure_filename(str(task_id)))
            task_dir_path = await task_template.get_dir()
            await storage.makedirs(task_dir_path, exist_ok=True)
            yaml_path = storage.join(task_dir_path, "task.yaml")
            async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
                await f.write(task_yaml_content)

        # Copy local_task_dir files into the task directory (inside a subdirectory
        # matching the source directory name, mirroring what github_repo_dir does
        # at clone time) and mark file_mounts so the runner copies them at launch.
        if local_task_dir and os.path.isdir(local_task_dir):
            task_template = TaskTemplate(secure_filename(str(task_id)))
            task_dir_path = await task_template.get_dir()
            await storage.makedirs(task_dir_path, exist_ok=True)
            dest_subdir = storage.join(task_dir_path, os.path.basename(local_task_dir.rstrip("/")))
            await storage.copy_dir(local_task_dir, dest_subdir)
            await task_service.update_task(task_id, {"file_mounts": True})

        return {"status": "success", "message": f"Interactive task '{task_name}' imported successfully", "id": task_id}

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

    # Extract gallery entry fields
    title = gallery_entry.get("title", "Imported Task")
    github_repo_url = gallery_entry.get("github_repo_url") or gallery_entry.get("github_url", "")
    github_repo_dir = (
        gallery_entry.get("github_repo_dir")
        or gallery_entry.get("directory_path")
        or gallery_entry.get("github_directory")
    )
    github_branch = (
        gallery_entry.get("github_branch") or gallery_entry.get("github_repo_branch") or gallery_entry.get("git_branch")
    )

    if not github_repo_url:
        raise HTTPException(status_code=400, detail="Gallery entry missing github_repo_url")

    # Fetch task.yaml from GitHub repository
    try:
        task_yaml_content = await fetch_task_yaml_from_github(
            github_repo_url, directory=github_repo_dir, ref=github_branch
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

    # Ensure GitHub repo info is set (may be in task.yaml as git_repo). Prefer canonical github_repo_* keys.
    if not task_data.get("github_repo_url"):
        task_data["github_repo_url"] = github_repo_url
    if github_repo_dir and not task_data.get("github_repo_dir"):
        task_data["github_repo_dir"] = github_repo_dir
    if github_branch and not task_data.get("github_repo_branch"):
        task_data["github_repo_branch"] = github_branch

    # Resolve provider
    await _resolve_provider(task_data, user_and_team, session)

    # Get task name from task.yaml or use title
    task_name = task_data.get("name") or title
    if "name" in task_data:
        task_data["name"] = secure_filename(task_data["name"])
    else:
        task_data["name"] = secure_filename(task_name)

    # Create the task with all fields stored directly (flat structure)
    task_id = await task_service.add_task(task_data)

    # Store task.yaml in task directory
    task = TaskTemplate(secure_filename(str(task_id)))
    task_dir = await task.get_dir()
    await storage.makedirs(task_dir, exist_ok=True)
    yaml_path = storage.join(task_dir, "task.yaml")
    async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
        await f.write(task_yaml_content)

    # Invalidate cached task lists for this experiment (best-effort).
    await cache.invalidate("tasks", f"tasks:list:{experimentId}")

    return {
        "status": "success",
        "message": f"Task '{task_data['name']}' imported successfully",
        "id": task_id,
    }


@router.get("/gallery/team", summary="List team-specific tasks from the team gallery")
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
    github_repo_url = gallery_entry.get("github_repo_url") or gallery_entry.get("github_url", "")
    github_repo_dir = (
        gallery_entry.get("github_repo_dir")
        or gallery_entry.get("directory_path")
        or gallery_entry.get("github_directory")
    )
    github_branch = (
        gallery_entry.get("github_branch") or gallery_entry.get("github_repo_branch") or gallery_entry.get("git_branch")
    )

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

    interactive_type = gallery_entry.get("interactive_type") or (
        inline_config.get("interactive_type") if inline_config else None
    )
    interactive_gallery_id = gallery_entry.get("interactive_gallery_id") or (
        inline_config.get("interactive_gallery_id") if inline_config else None
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
        if github_branch and not task_data.get("github_repo_branch"):
            task_data["github_repo_branch"] = github_branch

        await _resolve_provider(task_data, user_and_team, session)

        # Create task + copy full directory into the task workspace dir
        task_id = await task_service.add_task(task_data)
        task = TaskTemplate(secure_filename(str(task_id)))
        task_dir = await task.get_dir()
        await storage.makedirs(task_dir, exist_ok=True)

        # Copy the entire directory contents (task.yaml + attachments) into workspace/task/{task_id}
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
                await task_service.update_task(task_id, {"id": task_id})
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Failed to overwrite id in index.json for imported team task: {e}"
            )

        await cache.invalidate("tasks", f"tasks:list:{experimentId}")
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

        await _resolve_provider(task_data, user_and_team, session)
        task_id = await task_service.add_task(task_data)

        # Write a task.yaml into the task directory so the editor works
        task = TaskTemplate(secure_filename(str(task_id)))
        task_dir = await task.get_dir()
        await storage.makedirs(task_dir, exist_ok=True)
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
        yaml_path = storage.join(task_dir, "task.yaml")
        async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
            await f.write(yaml.safe_dump(yaml_obj, sort_keys=False))

        await cache.invalidate("tasks", f"tasks:list:{experimentId}")
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
            github_repo_url, directory=github_repo_dir, ref=github_branch
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

    # Ensure GitHub repo info is set (may be in task.yaml as git_repo)
    if not task_data.get("github_repo_url"):
        task_data["github_repo_url"] = github_repo_url
    if github_repo_dir and not task_data.get("github_directory"):
        task_data["github_directory"] = github_repo_dir
    if github_branch and not task_data.get("github_branch"):
        task_data["github_branch"] = github_branch

    # Resolve provider
    await _resolve_provider(task_data, user_and_team, session)

    # Get task name from task.yaml or use title
    task_name = task_data.get("name") or title
    if "name" in task_data:
        task_data["name"] = secure_filename(task_data["name"])
    else:
        task_data["name"] = secure_filename(task_name)

    # Create the task with all fields stored directly (flat structure)
    task_id = await task_service.add_task(task_data)

    # Store task.yaml in task directory
    task = TaskTemplate(secure_filename(str(task_id)))
    task_dir = await task.get_dir()
    await storage.makedirs(task_dir, exist_ok=True)
    yaml_path = storage.join(task_dir, "task.yaml")
    async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
        await f.write(task_yaml_content)

    # Invalidate cached task lists for this experiment (best-effort).
    await cache.invalidate("tasks", f"tasks:list:{experimentId}")

    return {
        "status": "success",
        "message": f"Task '{task_data['name']}' imported successfully",
        "id": task_id,
    }


@router.post("/gallery/team/export", summary="Export an existing task to the team gallery")
async def export_task_to_team_gallery(
    request: ExportTaskToTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Export a task into the team-specific gallery stored in workspace_dir.
    Tasks store all fields directly (not nested in config).
    """
    task = await task_service.task_get_by_id(request.task_id)
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
    if task.get("github_directory"):
        config["github_directory"] = task.get("github_directory")
    if task.get("github_branch"):
        config["github_branch"] = task.get("github_branch")
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
        "github_repo_dir": task.get("github_directory"),
        "github_branch": task.get("github_branch"),
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

            # Copy from the task's workspace dir (workspace/task/{task_id})
            src_task = TaskTemplate(secure_filename(str(request.task_id)))
            src_dir = await src_task.get_dir()
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
                        "github_repo_dir": task.get("github_directory"),
                        "github_repo_branch": task.get("github_branch"),
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
        "github_repo_branch": request.github_branch,
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
            "github_branch": request.github_branch,
        },
        "github_repo_url": request.github_repo_url,
        "github_repo_dir": request.github_repo_dir,
        "github_branch": request.github_branch,
        "local_task_dir": dest_dir,
    }

    await galleries.add_team_task_to_gallery(gallery_entry)
    return {
        "status": "success",
        "message": f"Task '{request.title}' added to team gallery",
        "data": gallery_entry,
    }


@router.post("/gallery/team/delete", summary="Delete a task from the team gallery")
async def delete_team_task_from_gallery(
    request: DeleteTeamTaskFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Delete a task from the team-specific gallery stored in workspace_dir.
    """
    success = await galleries.delete_team_task_from_gallery(request.task_id)
    if success:
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
