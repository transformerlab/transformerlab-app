import json
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from lab import Dataset
from pydantic import BaseModel
from transformerlab.models import model_helper
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.job_service import job_create
from transformerlab.services.tasks_service import tasks_service
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import fetch_task_json_from_github, fetch_task_json_from_github_helper
from transformerlab.shared.task_utils import process_env_parameters_to_env_vars
from werkzeug.utils import secure_filename

router = APIRouter(prefix="/tasks", tags=["tasks"])


class DeleteTeamTaskFromGalleryRequest(BaseModel):
    task_id: str


@router.get("/list", summary="Returns all the tasks")
async def tasks_get_all():
    tasks = await tasks_service.tasks_get_all()
    return tasks


@router.get("/{task_id}/get", summary="Gets all the data for a single task")
async def tasks_get_by_id(task_id: str):
    task = await tasks_service.tasks_get_by_id(task_id)
    if task is None:
        return {"message": "NOT FOUND"}
    return task


@router.get("/list_by_type", summary="Returns all the tasks of a certain type, e.g TRAIN")
async def tasks_get_by_type(type: str):
    tasks = await tasks_service.tasks_get_by_type(type)
    return tasks


@router.get(
    "/list_by_type_in_experiment", summary="Returns all the tasks of a certain type in a certain experiment, e.g TRAIN"
)
async def tasks_get_by_type_in_experiment(type: str, experiment_id: str):
    tasks = await tasks_service.tasks_get_by_type_in_experiment(type, experiment_id)
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
    tasks = await tasks_service.tasks_get_by_experiment(experiment_id)
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
    success = await tasks_service.update_task(task_id, new_task)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{task_id}/delete", summary="Deletes a task")
async def delete_task(task_id: str):
    success = await tasks_service.delete_task(task_id)
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

    await tasks_service.add_task(
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
        local_datasets = await Dataset.list_all()
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
    await tasks_service.tasks_delete_all()
    return {"message": "OK"}


@router.get("/{task_id}/queue", summary="Queue a task to run")
async def queue_task(
    task_id: str,
    input_override: str = "{}",
    output_override: str = "{}",
    user_and_team=Depends(get_user_and_team),
):
    task_to_queue = await tasks_service.tasks_get_by_id(task_id)
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

    # Store user_id in job_data for user-specific configs when job runs
    user = user_and_team.get("user") if user_and_team else None
    if user:
        job_data["user_id"] = str(user.id)

    job_id = await job_create(
        type=job_type,
        status=job_status,
        experiment_id=task_to_queue["experiment_id"],
        job_data=json.dumps(job_data),
    )
    return {"id": job_id}


@router.get("/gallery", summary="List all tasks from the tasks gallery")
async def tasks_gallery():
    """Get the tasks gallery from the JSON file"""
    gallery = await galleries.get_tasks_gallery()
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
    supported_accelerators: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_branch: Optional[str] = None


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

    # Process env_parameters into env_vars if present
    task_config = process_env_parameters_to_env_vars(task_config)

    # Get task name from config or use title
    task_name = task_config.get("name") or task_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = "echo 'No command specified'"

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

    await tasks_service.add_task(
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
    gallery = await galleries.get_team_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/team/import", summary="Import a task from the team tasks gallery")
async def import_task_from_team_gallery(
    request: ImportTaskFromTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Import a task from the team-specific tasks gallery (workspace_dir/team_specific_tasks.json).
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

    # Process env_parameters into env_vars if present
    task_config = process_env_parameters_to_env_vars(task_config)

    # Get task name from config or use title
    task_name = task_config.get("name") or task_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in task_config:
        task_config["cluster_name"] = task_name
    if "command" not in task_config:
        task_config["command"] = "echo 'No command specified'"

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

    await tasks_service.add_task(
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
    task = await tasks_service.tasks_get_by_id(request.task_id)
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

    await galleries.add_team_task_to_gallery(gallery_entry)

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
    if request.supported_accelerators:
        config["supported_accelerators"] = request.supported_accelerators
    if request.github_repo_url:
        config["github_repo_url"] = request.github_repo_url
    if request.github_repo_dir:
        config["github_directory"] = request.github_repo_dir
    if request.github_branch:
        config["github_branch"] = request.github_branch

    # Create gallery entry
    gallery_entry = {
        "id": str(uuid.uuid4()),  # Generate a unique ID
        "title": request.title,
        "description": request.description,
        "config": config,
        "github_repo_url": request.github_repo_url,
        "github_repo_dir": request.github_repo_dir,
        "github_branch": request.github_branch,
    }

    await galleries.add_team_task_to_gallery(gallery_entry)

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
    success = await galleries.delete_team_task_from_gallery(request.task_id)
    if success:
        return {
            "status": "success",
            "message": "Task deleted from team gallery",
        }
    else:
        raise HTTPException(status_code=404, detail="Task not found in team gallery")


@router.get("/fetch_task_json", summary="Fetch task.json from a GitHub repository")
async def fetch_task_json_endpoint(
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
    # Use the shared helper function which handles all the logic and error handling
    task_json = await fetch_task_json_from_github(repo_url, directory)

    # Extract repo info for the response
    repo_url_clean = repo_url.replace(".git", "").strip()
    parts = repo_url_clean.replace("https://github.com/", "").split("/")
    owner = parts[0] if len(parts) > 0 else ""
    repo = parts[1] if len(parts) > 1 else ""
    file_path = f"{directory}/task.json" if directory else "task.json"
    file_path = file_path.strip("/")

    return {
        "status": "success",
        "data": task_json,
        "repo": f"{owner}/{repo}",
        "path": file_path,
    }
