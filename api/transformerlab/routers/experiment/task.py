from fastapi import APIRouter, Body, Query, HTTPException, Depends, Request
from typing import Optional
from werkzeug.utils import secure_filename
import json
import yaml
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.services.task_service import task_service
from transformerlab.services.provider_service import list_team_providers
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import (
    fetch_task_json_from_github_helper,
    fetch_task_json_from_github,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.schemas.task import (
    ExportTaskToTeamGalleryRequest,
    ImportTaskFromGalleryRequest,
    ImportTaskFromTeamGalleryRequest,
    DeleteTeamTaskFromGalleryRequest,
)

router = APIRouter(prefix="/task", tags=["task"])


@router.get("/list", summary="Returns all the tasks")
async def task_get_all():
    tasks = task_service.task_get_all()
    return tasks


@router.get("/{task_id}/get", summary="Gets all the data for a single task")
async def task_get_by_id(task_id: str):
    task = task_service.task_get_by_id(task_id)
    if task is None:
        return {"message": "NOT FOUND"}
    return task


@router.get("/list_by_type", summary="Returns all the tasks of a certain type, e.g TRAIN")
async def task_get_by_type(type: str):
    tasks = task_service.task_get_by_type(type)
    return tasks


@router.get(
    "/list_by_type_in_experiment",
    summary="Returns all the tasks of a certain type in a certain experiment, e.g TRAIN",
)
async def task_get_by_type_in_experiment(experimentId: str, type: str):
    tasks = task_service.task_get_by_type_in_experiment(type, experimentId)
    return tasks


@router.get(
    "/list_by_subtype_in_experiment",
    summary="Returns all tasks for an experiment filtered by subtype and optionally by type",
)
async def task_get_by_subtype_in_experiment(
    experimentId: str,
    subtype: str,
    type: Optional[str] = Query(None, description="Optional task type filter (e.g., REMOTE)"),
):
    tasks = task_service.task_get_by_subtype_in_experiment(experimentId, subtype, type)
    return tasks


@router.put("/{task_id}/update", summary="Updates a task with new information")
async def update_task(task_id: str, new_task: dict = Body()):
    # Perform secure_filename before updating the task
    if "name" in new_task:
        new_task["name"] = secure_filename(new_task["name"])
    success = task_service.update_task(task_id, new_task)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{task_id}/delete", summary="Deletes a task")
async def delete_task(task_id: str):
    success = task_service.delete_task(task_id)
    if success:
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
    Expected YAML format:
    task:
      name: task-name
      resources:
        compute_provider: provider-name
        cpus: 2
        memory: 4
      envs:
        KEY: value
      setup: "command"
      run: "command"
      git_repo: "url"
      git_repo_directory: "dir"
      parameters: {...}
      sweeps:
        sweep_config: {...}
        sweep_metric: "metric"
        lower_is_better: true
      files: # handled separately via file upload
    """
    # Parse YAML
    yaml_data = yaml.safe_load(yaml_content)

    if not yaml_data or "task" not in yaml_data:
        raise HTTPException(status_code=400, detail="YAML must contain a 'task' key")

    task_yaml = yaml_data["task"]

    # Convert YAML structure to task structure
    task_data = {}

    # Basic fields
    if "name" in task_yaml:
        task_data["name"] = secure_filename(str(task_yaml["name"]))

    # Resources
    if "resources" in task_yaml:
        resources = task_yaml["resources"]
        if "compute_provider" in resources:
            task_data["provider_name"] = resources["compute_provider"]
        if "cpus" in resources:
            task_data["cpus"] = str(resources["cpus"])
        if "memory" in resources:
            task_data["memory"] = str(resources["memory"])
        if "disk_space" in resources:
            task_data["disk_space"] = str(resources["disk_space"])
        if "accelerators" in resources:
            task_data["accelerators"] = str(resources["accelerators"])
        if "num_nodes" in resources:
            task_data["num_nodes"] = int(resources["num_nodes"])

    # Environment variables
    if "envs" in task_yaml:
        task_data["env_vars"] = task_yaml["envs"]

    # Setup and run commands
    if "setup" in task_yaml:
        task_data["setup"] = str(task_yaml["setup"])
    if "run" in task_yaml:
        task_data["command"] = str(task_yaml["run"])

    # GitHub
    if "git_repo" in task_yaml:
        task_data["github_repo_url"] = str(task_yaml["git_repo"])
    if "git_repo_directory" in task_yaml:
        task_data["github_directory"] = str(task_yaml["git_repo_directory"])

    # Parameters
    if "parameters" in task_yaml:
        task_data["parameters"] = task_yaml["parameters"]

    # Sweeps
    if "sweeps" in task_yaml:
        sweeps = task_yaml["sweeps"]
        task_data["run_sweeps"] = True
        if "sweep_config" in sweeps:
            task_data["sweep_config"] = sweeps["sweep_config"]
        if "sweep_metric" in sweeps:
            task_data["sweep_metric"] = str(sweeps["sweep_metric"])
        if "lower_is_better" in sweeps:
            task_data["lower_is_better"] = bool(sweeps["lower_is_better"])

    # Files are handled separately via file upload endpoint

    return task_data


@router.post("/new_task", summary="Create a new task")
async def add_task(
    request: Request,
    experimentId: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a new task. Accepts either:
    1. JSON object with task fields directly (Content-Type: application/json)
    2. YAML string (Content-Type: text/plain, text/yaml, or application/x-yaml)

    For YAML, the format should be:
    task:
      name: task-name
      resources:
        compute_provider: provider-name
        cpus: 2
        memory: 4
      envs:
        KEY: value
      setup: "command"
      run: "command"
      git_repo: "url"
      git_repo_directory: "dir"
      parameters: {...}
      sweeps:
        sweep_config: {...}
        sweep_metric: "metric"
        lower_is_better: true
    """
    try:
        content_type = request.headers.get("content-type", "").lower()

        # Check if it's YAML (text/plain or text/yaml)
        if "text/plain" in content_type or "text/yaml" in content_type or "application/x-yaml" in content_type:
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

            # Inject experimentId from path parameter if not in YAML
            if "experiment_id" not in task_data:
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

            task_id = task_service.add_task(task_data)
            return {"message": "OK", "id": task_id}
        else:
            # Handle JSON input (existing behavior)
            try:
                new_task = await request.json()
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

                task_id = task_service.add_task(task_data)
                return {"message": "OK", "id": task_id}

            # Inject experimentId from path parameter if not in JSON
            if "experiment_id" not in new_task:
                new_task["experiment_id"] = experimentId

            # Handle provider matching for JSON input
            await _resolve_provider(new_task, user_and_team, session)

            # Perform secure_filename before adding the task
            if "name" in new_task:
                new_task["name"] = secure_filename(new_task["name"])

            # All fields are stored directly in the JSON (not nested in inputs/outputs/config)
            task_id = task_service.add_task(new_task)
            return {"message": "OK", "id": task_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error creating task: {str(e)}")


@router.get("/delete_all", summary="Wipe all tasks")
async def task_delete_all():
    task_service.task_delete_all()
    return {"message": "OK"}


@router.get("/gallery", summary="List all tasks from the tasks gallery")
async def task_gallery():
    """Get the tasks gallery from the JSON file (same as tasks gallery)"""
    gallery = galleries.get_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/import", summary="Import a task from the tasks gallery")
async def import_task_from_gallery(
    experimentId: str,
    request: ImportTaskFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Import a task from the tasks gallery.
    Creates a new task using the gallery entry's config and GitHub info.
    Uses the team's GitHub PAT if available.
    """
    gallery = galleries.get_tasks_gallery()

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
    config = gallery_entry.get("config", {})

    if not github_repo_url:
        raise HTTPException(status_code=400, detail="Gallery entry missing github_repo_url")

    if not isinstance(config, dict):
        try:
            config = json.loads(config) if isinstance(config, str) else {}
        except Exception:
            config = {}

    # Try to fetch task.json from GitHub repository
    task_json = None
    if github_repo_url:
        task_json = await fetch_task_json_from_github_helper(github_repo_url, github_repo_dir)

    # Build the task config, merging gallery config with task.json (task.json takes precedence)
    task_config = {
        **config,  # Start with gallery config
        "github_repo_url": github_repo_url,
    }

    # Merge task.json if found (overrides gallery config)
    if task_json:
        task_config.update(task_json)

    if github_repo_dir:
        task_config["github_directory"] = github_repo_dir

    # Get task name from config or use title
    task_name = task_config.get("name") or task_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = "echo 'No command specified'"

    # Create the task with all fields stored directly (flat structure)
    new_task = {
        "name": task_name,
        "type": "REMOTE",
        "plugin": "remote_orchestrator",
        "experiment_id": experimentId,
        **task_config,  # All config fields go directly into task
    }

    # Perform secure_filename before adding the task
    new_task["name"] = secure_filename(new_task["name"])

    task_service.add_task(new_task)

    return {"status": "success", "message": f"Task '{task_name}' imported successfully"}


@router.get("/gallery/team", summary="List team-specific tasks from the team gallery")
async def team_task_gallery():
    """Get the team-specific tasks gallery stored in workspace_dir (same as tasks gallery)"""
    gallery = galleries.get_team_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/team/import", summary="Import a task from the team tasks gallery")
async def import_task_from_team_gallery(
    experimentId: str,
    request: ImportTaskFromTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Import a task from the team-specific tasks gallery (workspace_dir/team_specific_tasks.json).
    """
    gallery = galleries.get_team_tasks_gallery()

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
    config = gallery_entry.get("config", {})

    if not isinstance(config, dict):
        try:
            config = json.loads(config) if isinstance(config, str) else {}
        except Exception:
            config = {}

    # Try to fetch task.json from GitHub repository if repo URL is provided
    task_json = None
    if github_repo_url:
        task_json = await fetch_task_json_from_github_helper(github_repo_url, github_repo_dir)

    # Build the task config, merging gallery config with task.json (task.json takes precedence)
    task_config = {
        **config,  # Start with gallery config
    }

    # Merge task.json if found (overrides gallery config)
    if task_json:
        task_config.update(task_json)

    if github_repo_url:
        task_config["github_repo_url"] = github_repo_url
    if github_repo_dir:
        task_config["github_directory"] = github_repo_dir

    # Get task name from config or use title
    task_name = task_config.get("name") or task_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = "echo 'No command specified'"

    # Create the task with all fields stored directly (flat structure)
    new_task = {
        "name": task_name,
        "type": "REMOTE",
        "plugin": "remote_orchestrator",
        "experiment_id": experimentId,
        **task_config,  # All config fields go directly into task
    }

    # Perform secure_filename before adding the task
    new_task["name"] = secure_filename(new_task["name"])

    task_service.add_task(new_task)

    return {"status": "success", "message": f"Task '{task_name}' imported successfully"}


@router.post("/gallery/team/export", summary="Export an existing task to the team gallery")
async def export_task_to_team_gallery(
    request: ExportTaskToTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Export a task into the team-specific gallery stored in workspace_dir.
    Tasks store all fields directly (not nested in config).
    """
    task = task_service.task_get_by_id(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    # For tasks, all fields are stored directly (not nested in config)
    # Build config object from task fields for gallery entry
    config = {}
    # Copy relevant fields to config for gallery compatibility
    if task.get("cluster_name"):
        config["cluster_name"] = task.get("cluster_name")
    if task.get("command"):
        config["command"] = task.get("command")
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

    gallery_entry = {
        "id": task.get("id") or request.task_id,
        "title": task.get("name") or "Untitled Task",
        "description": task.get("description"),
        "config": config,
        "github_repo_url": task.get("github_repo_url"),
        "github_repo_dir": task.get("github_directory"),
    }

    galleries.add_team_task_to_gallery(gallery_entry)

    return {
        "status": "success",
        "message": f"Task '{gallery_entry['title']}' exported to team gallery",
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
    success = galleries.delete_team_task_from_gallery(request.task_id)
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
        owner, repo, branch, path = blob_match.groups()
        repo_url = f"https://github.com/{owner}/{repo}.git"
        directory = path.rstrip("/")
        task_json = await fetch_task_json_from_github(repo_url, directory)
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
        owner, repo, branch, path = raw_match.groups()
        repo_url = f"https://github.com/{owner}/{repo}.git"
        directory = path.rstrip("/")
        task_json = await fetch_task_json_from_github(repo_url, directory)
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
