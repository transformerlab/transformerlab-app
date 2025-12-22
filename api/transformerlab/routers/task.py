from fastapi import APIRouter, Body, Query, HTTPException, Depends
from typing import Optional
from werkzeug.utils import secure_filename
import json

from transformerlab.services.task_service import task_service
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import (
    fetch_task_json_from_github_helper,
)
from transformerlab.routers.auth import get_user_and_team
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
async def task_get_by_type_in_experiment(type: str, experiment_id: str):
    tasks = task_service.task_get_by_type_in_experiment(type, experiment_id)
    return tasks


@router.get(
    "/list_by_subtype_in_experiment",
    summary="Returns all tasks for an experiment filtered by subtype and optionally by type",
)
async def task_get_by_subtype_in_experiment(
    experiment_id: str,
    subtype: str,
    type: Optional[str] = Query(None, description="Optional task type filter (e.g., REMOTE)"),
):
    tasks = task_service.task_get_by_subtype_in_experiment(experiment_id, subtype, type)
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


@router.put("/new_task", summary="Create a new task")
async def add_task(new_task: dict = Body()):
    # Perform secure_filename before adding the task
    if "name" in new_task:
        new_task["name"] = secure_filename(new_task["name"])

    # All fields are stored directly in the JSON (not nested in inputs/outputs/config)
    task_id = task_service.add_task(new_task)
    return {"message": "OK", "id": task_id}


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
        "experiment_id": request.experiment_id,
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
        "experiment_id": request.experiment_id,
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
