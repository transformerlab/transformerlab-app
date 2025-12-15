import json
import base64
import httpx

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from typing import Optional
from werkzeug.utils import secure_filename
from pydantic import BaseModel

from lab import Dataset
from lab.dirs import get_workspace_dir
from transformerlab.services.job_service import job_create
from transformerlab.models import model_helper
from transformerlab.services.tasks_service import tasks_service
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import read_github_pat_from_workspace
from transformerlab.routers.auth import get_user_and_team

router = APIRouter(prefix="/tasks", tags=["tasks"])


class DeleteTeamTaskFromGalleryRequest(BaseModel):
    task_id: str


@router.get("/list", summary="Returns all the tasks")
async def tasks_get_all():
    tasks = tasks_service.tasks_get_all()
    return tasks


@router.get("/{task_id}/get", summary="Gets all the data for a single task")
async def tasks_get_by_id(task_id: str):
    task = tasks_service.tasks_get_by_id(task_id)
    if task is None:
        return {"message": "NOT FOUND"}
    return task


@router.get("/list_by_type", summary="Returns all the tasks of a certain type, e.g TRAIN")
async def tasks_get_by_type(type: str):
    tasks = tasks_service.tasks_get_by_type(type)
    return tasks


@router.get(
    "/list_by_type_in_experiment", summary="Returns all the tasks of a certain type in a certain experiment, e.g TRAIN"
)
async def tasks_get_by_type_in_experiment(type: str, experiment_id: str):
    tasks = tasks_service.tasks_get_by_type_in_experiment(type, experiment_id)
    return tasks


@router.get(
    "/list_by_subtype_in_experiment",
    summary="Returns all tasks for an experiment filtered by config.subtype and optionally remote_task",
)
async def tasks_get_by_subtype_in_experiment(
    experiment_id: str,
    subtype: str,
    remote_task: Optional[bool] = None,
):
    tasks = tasks_service.tasks_get_by_experiment(experiment_id)
    filtered = []
    for t in tasks:
        cfg = t.get("config", {})
        if not isinstance(cfg, dict):
            try:
                import json

                cfg = json.loads(cfg)
            except Exception:
                cfg = {}
        if cfg.get("subtype") == subtype:
            if remote_task is None or bool(t.get("remote_task", False)) == bool(remote_task):
                filtered.append(t)
    return filtered


@router.put("/{task_id}/update", summary="Updates a task with new information")
async def update_task(task_id: str, new_task: dict = Body()):
    # Perform secure_filename before updating the task
    if "name" in new_task:
        new_task["name"] = secure_filename(new_task["name"])
    success = tasks_service.update_task(task_id, new_task)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{task_id}/delete", summary="Deletes a task")
async def delete_task(task_id: str):
    success = tasks_service.delete_task(task_id)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.put("/new_task", summary="Create a new task")
async def add_task(new_task: dict = Body()):
    # Perform secure_filename before adding the task
    new_task["name"] = secure_filename(new_task["name"])
    # Support optional remote_task flag to mark remote task templates
    remote_task_flag = False
    try:
        remote_task_flag = bool(new_task.get("remote_task", False))
    except Exception:
        remote_task_flag = False

    tasks_service.add_task(
        new_task["name"],
        new_task["type"],
        new_task["inputs"],
        new_task["config"],
        new_task["plugin"],
        new_task["outputs"],
        new_task["experiment_id"],
        remote_task=remote_task_flag,
    )
    if new_task["type"] == "TRAIN":
        if not isinstance(new_task["config"], dict):
            new_task["config"] = json.loads(new_task["config"])
        config = new_task["config"]
        # Get the dataset info from the config
        datasets = config.get("_tlab_recipe_datasets", {})
        datasets = datasets.get("path", "")

        # Get the model info from the config
        model = config.get("_tlab_recipe_models", {})
        model_path = model.get("path", "")

        if datasets == "" and model_path == "":
            return {"message": "OK"}

        # Check if the model and dataset are installed
        # For model: get a list of local models to determine what has been downloaded already
        model_downloaded = await model_helper.is_model_installed(model_path)

        # Repeat for dataset
        dataset_downloaded = False
        local_datasets = Dataset.list_all()
        for dataset in local_datasets:
            if dataset["dataset_id"] == datasets:
                dataset_downloaded = True

        # generate a repsonse to tell if model and dataset need to be downloaded
        response = {}

        # Dataset info - including whether it needs to be downloaded or not
        dataset_status = {}
        dataset_status["path"] = datasets
        dataset_status["downloaded"] = dataset_downloaded
        response["dataset"] = dataset_status

        # Model info - including whether it needs to be downloaded or not
        model_status = {}
        model_status["path"] = model_path
        model_status["downloaded"] = model_downloaded
        response["model"] = model_status

        return {"status": "OK", "data": response}

    return {"message": "OK"}


@router.get("/delete_all", summary="Wipe the task table")
async def tasks_delete_all():
    tasks_service.tasks_delete_all()
    return {"message": "OK"}


@router.get("/{task_id}/queue", summary="Queue a task to run")
async def queue_task(task_id: str, input_override: str = "{}", output_override: str = "{}"):
    task_to_queue = tasks_service.tasks_get_by_id(task_id)
    if task_to_queue is None:
        return {"message": "TASK NOT FOUND"}

    # Skip remote tasks - they are handled by the launch_remote route, not the job queue
    if task_to_queue.get("remote_task", False):
        return {"message": "REMOTE TASK - Cannot queue remote tasks, use launch_remote endpoint instead"}

    job_type = task_to_queue["type"]
    job_status = "QUEUED"
    job_data = {}
    # these are the input and output configs from the task
    if not isinstance(task_to_queue["inputs"], dict):
        task_to_queue["inputs"] = json.loads(task_to_queue["inputs"])
    if not isinstance(task_to_queue["outputs"], dict):
        task_to_queue["outputs"] = json.loads(task_to_queue["outputs"])

    inputs = task_to_queue["inputs"]
    outputs = task_to_queue["outputs"]

    # these are the in runtime changes that will override the input and output config from the task
    if not isinstance(input_override, dict):
        input_override = json.loads(input_override)
    if not isinstance(output_override, dict):
        output_override = json.loads(output_override)

    if not isinstance(task_to_queue["config"], dict):
        task_to_queue["config"] = json.loads(task_to_queue["config"])

    if job_type == "TRAIN":
        job_data["config"] = task_to_queue["config"]
        job_data["model_name"] = inputs["model_name"]
        job_data["dataset"] = inputs["dataset_name"]
        if "type" not in job_data["config"].keys():
            job_data["config"]["type"] = "LoRA"
        # sets the inputs and outputs from the task
        for key in inputs.keys():
            job_data["config"][key] = inputs[key]
        for key in outputs.keys():
            job_data["config"][key] = outputs[key]

        # overrides the inputs and outputs based on the runtime changes requested
        for key in input_override.keys():
            if key == "model_name":
                job_data["model_name"] = input_override["model_name"]
            if key == "dataset":
                job_data["dataset"] = input_override["dataset_name"]
            job_data["config"][key] = input_override[key]
        for key in output_override.keys():
            job_data["config"][key] = output_override[key]

        job_data["template_id"] = task_to_queue["id"]
        job_data["template_name"] = task_to_queue["name"]
    elif job_type == "EVAL":
        job_data["evaluator"] = task_to_queue["name"]
        job_data["config"] = task_to_queue["config"]
        for key in inputs.keys():
            job_data["config"][key] = inputs[key]
            job_data["config"]["script_parameters"][key] = inputs[key]
        for key in input_override.keys():
            job_data["config"][key] = input_override[key]
            job_data["config"]["script_parameters"][key] = input_override[key]

        job_data["plugin"] = task_to_queue["plugin"]
    elif job_type == "GENERATE":
        job_data["generator"] = task_to_queue["name"]
        job_data["config"] = task_to_queue["config"]
        for key in inputs.keys():
            job_data["config"][key] = inputs[key]
            job_data["config"]["script_parameters"][key] = inputs[key]
        for key in input_override.keys():
            job_data["config"][key] = input_override[key]
            job_data["config"]["script_parameters"][key] = input_override[key]

        for key in outputs.keys():
            job_data["config"][key] = outputs[key]
            job_data["config"]["script_parameters"][key] = outputs[key]
        for key in output_override.keys():
            job_data["config"][key] = output_override[key]
            job_data["config"]["script_parameters"][key] = output_override[key]
        job_data["plugin"] = task_to_queue["plugin"]
    elif job_type == "EXPORT":
        job_data["exporter"] = task_to_queue["name"]
        job_data["config"] = task_to_queue["config"]
        for key in inputs.keys():
            job_data["config"][key] = inputs[key]
        for key in input_override.keys():
            job_data["config"][key] = input_override[key]

        for key in outputs.keys():
            job_data["config"][key] = outputs[key]
        for key in output_override.keys():
            job_data["config"][key] = output_override[key]
        job_data["plugin"] = task_to_queue["plugin"]
    job_id = job_create(
        type=("EXPORT" if job_type == "EXPORT" else job_type),
        status=job_status,
        experiment_id=task_to_queue["experiment_id"],
        job_data=json.dumps(job_data),
    )
    return {"id": job_id}


@router.get("/gallery", summary="List all tasks from the tasks gallery")
async def tasks_gallery():
    """Get the tasks gallery from the JSON file"""
    gallery = galleries.get_tasks_gallery()
    return {"status": "success", "data": gallery}


class ImportTaskFromGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class ImportTaskFromTeamGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class ExportTaskToTeamGalleryRequest(BaseModel):
    task_id: str


class AddTeamTaskToGalleryRequest(BaseModel):
    title: str
    description: Optional[str] = None
    setup: Optional[str] = None
    command: str
    cpus: Optional[str] = None
    memory: Optional[str] = None
    accelerators: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None


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

    # Get task name from config or use title
    task_name = config.get("name") or config.get("cluster_name") or title

    # Build the task config, merging gallery config with GitHub info
    task_config = {
        **config,  # Start with gallery config
        "github_enabled": True,
        "github_repo_url": github_repo_url,
    }

    if github_repo_dir:
        task_config["github_directory"] = github_repo_dir

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = config.get("command", "echo 'No command specified'")

    # Create the task
    new_task = {
        "name": task_name,
        "type": "REMOTE",
        "inputs": {},
        "config": task_config,
        "plugin": "remote_orchestrator",
        "outputs": {},
        "experiment_id": request.experiment_id,
        "remote_task": True,
    }

    # Perform secure_filename before adding the task
    new_task["name"] = secure_filename(new_task["name"])

    tasks_service.add_task(
        new_task["name"],
        new_task["type"],
        new_task["inputs"],
        new_task["config"],
        new_task["plugin"],
        new_task["outputs"],
        new_task["experiment_id"],
        remote_task=True,
    )

    return {"status": "success", "message": f"Task '{task_name}' imported successfully"}


@router.get("/gallery/team", summary="List team-specific tasks from the team gallery")
async def team_tasks_gallery():
    """Get the team-specific tasks gallery stored in workspace_dir"""
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

    # Get task name from config or use title
    task_name = config.get("name") or config.get("cluster_name") or title

    # Build the task config, merging gallery config with GitHub info
    task_config = {
        **config,  # Start with gallery config
    }

    if github_repo_url:
        task_config["github_enabled"] = True
        task_config["github_repo_url"] = github_repo_url
    if github_repo_dir:
        task_config["github_directory"] = github_repo_dir

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = config.get("command", "echo 'No command specified'")

    # Create the task
    new_task = {
        "name": task_name,
        "type": "REMOTE",
        "inputs": {},
        "config": task_config,
        "plugin": "remote_orchestrator",
        "outputs": {},
        "experiment_id": request.experiment_id,
        "remote_task": True,
    }

    # Perform secure_filename before adding the task
    new_task["name"] = secure_filename(new_task["name"])

    tasks_service.add_task(
        new_task["name"],
        new_task["type"],
        new_task["inputs"],
        new_task["config"],
        new_task["plugin"],
        new_task["outputs"],
        new_task["experiment_id"],
        remote_task=True,
    )

    return {"status": "success", "message": f"Task '{task_name}' imported successfully"}


@router.post("/gallery/team/export", summary="Export an existing task to the team gallery")
async def export_task_to_team_gallery(
    request: ExportTaskToTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Export a task template into the team-specific gallery stored in workspace_dir.
    """
    task = tasks_service.tasks_get_by_id(request.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    config = task.get("config") or {}
    if isinstance(config, str):
        try:
            config = json.loads(config)
        except Exception:
            config = {}

    gallery_entry = {
        "id": task.get("id") or request.task_id,
        "title": task.get("name") or config.get("name") or "Untitled Task",
        "description": task.get("description") or config.get("description"),
        "config": config,
        "github_repo_url": config.get("github_repo_url") or config.get("github_url"),
        "github_repo_dir": config.get("github_directory") or config.get("github_repo_dir"),
    }

    galleries.add_team_task_to_gallery(gallery_entry)

    return {
        "status": "success",
        "message": f"Task '{gallery_entry['title']}' exported to team gallery",
        "data": gallery_entry,
    }


@router.post("/gallery/team/add", summary="Add a new task directly to the team gallery")
async def add_team_task_to_gallery(
    request: AddTeamTaskToGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Add a new task directly to the team-specific gallery stored in workspace_dir.
    This allows creating team tasks without first creating a task template.
    """
    import uuid

    # Build the config object from the request
    config = {}
    if request.setup:
        config["setup"] = request.setup
    if request.command:
        config["command"] = request.command
    if request.cpus:
        config["cpus"] = request.cpus
    if request.memory:
        config["memory"] = request.memory
    if request.accelerators:
        config["accelerators"] = request.accelerators
    if request.github_repo_url:
        config["github_repo_url"] = request.github_repo_url
        config["github_enabled"] = True
    if request.github_repo_dir:
        config["github_directory"] = request.github_repo_dir

    # Create gallery entry
    gallery_entry = {
        "id": str(uuid.uuid4()),  # Generate a unique ID
        "title": request.title,
        "description": request.description,
        "config": config,
        "github_repo_url": request.github_repo_url,
        "github_repo_dir": request.github_repo_dir,
    }

    galleries.add_team_task_to_gallery(gallery_entry)

    return {
        "status": "success",
        "message": f"Task '{gallery_entry['title']}' added to team gallery",
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
@router.get("/fetch_task_json", summary="Fetch task.json from a GitHub repository")
async def fetch_task_json_from_github(
    repo_url: str = Query(..., description="GitHub repository URL"),
    directory: Optional[str] = Query(None, description="Optional subdirectory path"),
    user_and_team=Depends(get_user_and_team),
):
    """
    Fetch task.json file from a GitHub repository.
    Supports both public and private repositories using the team's GitHub PAT.

    Args:
        repo_url: GitHub repository URL (e.g., https://github.com/owner/repo.git)
        directory: Optional subdirectory within the repo where task.json is located

    Returns:
        JSON object containing the task.json content, or error if not found
    """
    # Extract owner and repo from URL
    repo_url_clean = repo_url.replace(".git", "").strip()
    if not repo_url_clean.startswith("https://github.com/"):
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository URL. Must start with https://github.com/",
        )

    # Extract owner/repo from URL (e.g., https://github.com/owner/repo -> owner/repo)
    parts = repo_url_clean.replace("https://github.com/", "").split("/")
    if len(parts) < 2:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub repository URL format",
        )

    owner = parts[0]
    repo = parts[1]

    # Build file path
    file_path = f"{directory}/task.json" if directory else "task.json"
    # Normalize path (remove leading/trailing slashes)
    file_path = file_path.strip("/")

    # Get GitHub PAT from workspace
    workspace_dir = get_workspace_dir()
    github_pat = read_github_pat_from_workspace(workspace_dir)

    # Build GitHub API URL
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{file_path}"

    # Prepare headers
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "TransformerLab",
    }

    # Add authentication if PAT is available
    if github_pat:
        headers["Authorization"] = f"token {github_pat}"

    try:
        # Fetch file from GitHub API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(api_url, headers=headers)

            if response.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"task.json not found at {file_path} in repository {owner}/{repo}",
                )

            if response.status_code == 403:
                # Could be rate limit or private repo without auth
                if github_pat:
                    raise HTTPException(
                        status_code=403,
                        detail="Access denied. Please check your GitHub PAT permissions.",
                    )
                else:
                    raise HTTPException(
                        status_code=403,
                        detail="Repository is private. Please configure a GitHub PAT in team settings.",
                    )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Failed to fetch task.json: {response.text}",
                )

            # Parse response
            file_data = response.json()

            # GitHub API returns base64-encoded content
            if "content" not in file_data:
                raise HTTPException(
                    status_code=500,
                    detail="GitHub API response missing content field",
                )

            # Decode base64 content
            try:
                content = base64.b64decode(file_data["content"]).decode("utf-8")
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to decode file content: {str(e)}",
                )

            # Parse JSON
            try:
                task_json = json.loads(content)
            except json.JSONDecodeError as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"task.json is not valid JSON: {str(e)}",
                )

            return {
                "status": "success",
                "data": task_json,
                "repo": f"{owner}/{repo}",
                "path": file_path,
            }

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Request to GitHub API timed out",
        )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to connect to GitHub API: {str(e)}",
        )
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Unexpected error fetching task.json: {str(e)}",
        )
