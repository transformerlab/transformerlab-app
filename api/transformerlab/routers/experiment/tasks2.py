"""
New task-from-directory flow: from_directory (git or zip), GET/PUT task.yaml.
We maintain a task.yaml file inside the task directory (human-oriented: name, resources,
envs, setup, run, github_repo_url, github_repo_dir, github_repo_branch, etc.). GET returns that file; PUT saves to it and syncs index.json.
Task metadata is also in index.json for listing/run.
Runner uses GET .../task2/{task_id}/directory to fetch task dir as zip for lab.copy_file_mounts().
"""

import os
import tempfile
import zipfile
from typing import Optional

import yaml
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, Depends
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from werkzeug.utils import secure_filename

from lab import storage
from lab.task_template import TaskTemplate

from transformerlab.routers.experiment.task import (
    _parse_yaml_to_task_data,
    _resolve_provider,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.services.task_service import task_service
from transformerlab.shared.github_utils import fetch_task_yaml_from_github

router = APIRouter(prefix="/task2", tags=["task2"])


async def _get_task_dir_path(task_id: str) -> str:
    """Return the filesystem path for a task's directory (task.yaml lives here)."""
    task = TaskTemplate(secure_filename(str(task_id)))
    return await task.get_dir()


@router.options("/from_directory")
async def from_directory_options():
    """CORS preflight for POST /from_directory."""
    return {}


@router.post("/from_directory", summary="Create a task from a directory (git URL or zip)")
async def from_directory(
    experimentId: str,
    request: Request,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
    directory_zip: Optional[UploadFile] = File(None),
):
    """
    Create a task immediately and return its ID. Accepts either:
    - JSON body: { "github_repo_url": "https://github.com/...", "github_repo_dir": "optional/subdir", "github_repo_branch": "optional" }
    - Multipart: directory_zip = ZIP file containing a directory with task.yaml (and optionally other files)

    The directory must contain task.yaml (no task.json). The task is created (index.json)
    and we write task.yaml into the task directory. For zip uploads we copy the whole
    directory into the task directory; at launch the runner uses lab.copy_file_mounts()
    to fetch the task dir from the API and copy to ~/src (no SkyPilot file_mounts).
    """
    content_type = (request.headers.get("content-type") or "").lower()
    task_yaml_content = None
    task_root_for_zip = None  # local path (only valid inside tempdir for zip)
    task_id = None

    if "application/json" in content_type:
        body = await request.json()
        github_repo_url = (body.get("github_repo_url") or "").strip()
        github_repo_dir = (body.get("github_repo_dir") or "").strip() or None
        github_repo_branch = (body.get("github_repo_branch") or "").strip() or None
        create_if_missing = body.get("create_if_missing", False)
        if not github_repo_url:
            raise HTTPException(status_code=400, detail="git_url is required")
        try:
            task_yaml_content = await fetch_task_yaml_from_github(
                github_repo_url, directory=github_repo_dir, ref=github_repo_branch
            )
        except HTTPException as e:
            if e.status_code == 404 and create_if_missing:
                # Create a default task.yaml with git_repo info
                default_yaml_lines = ["name: my-task", "resources:", "  cpus: 2", "  memory: 4", 'run: "echo hello"']
                if github_repo_url:
                    default_yaml_lines.append(f'git_repo: "{github_repo_url}"')
                if github_repo_dir:
                    default_yaml_lines.append(f'git_repo_directory: "{github_repo_dir}"')
                if github_repo_branch:
                    default_yaml_lines.append(f'git_repo_branch: "{github_repo_branch}"')
                task_yaml_content = "\n".join(default_yaml_lines)
            else:
                raise

    elif "multipart/form-data" in content_type:
        form = await request.form()
        zip_file = form.get("directory_zip")
        if not zip_file or not getattr(zip_file, "filename", None):
            raise HTTPException(status_code=400, detail="directory_zip file is required")
        zip_content = await zip_file.read()
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "upload.zip")
            with open(zip_path, "wb") as f:
                f.write(zip_content)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmpdir)
            yaml_candidates = []
            for root, _dirs, files in os.walk(tmpdir):
                for name in files:
                    if name == "task.yaml":
                        yaml_candidates.append(os.path.join(root, name))
            if not yaml_candidates:
                raise HTTPException(
                    status_code=400,
                    detail="ZIP must contain a task.yaml file (no task.json).",
                )
            task_yaml_path = yaml_candidates[0]
            task_root_for_zip = os.path.dirname(task_yaml_path)
            with open(task_yaml_path, "r", encoding="utf-8") as f:
                task_yaml_content = f.read()
            # Parse and create task while tmpdir still exists so we can copy from task_root_for_zip
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
            if "type" not in task_data:
                task_data["type"] = "REMOTE"
            if "plugin" not in task_data:
                task_data["plugin"] = "remote_orchestrator"
            await _resolve_provider(task_data, user_and_team, session)
            if "name" in task_data:
                task_data["name"] = secure_filename(task_data["name"])
            task_id = await task_service.add_task(task_data)
            task_dir = await _get_task_dir_path(task_id)
            await storage.makedirs(task_dir, exist_ok=True)
            await storage.copy_dir(task_root_for_zip, task_dir)
    else:
        raise HTTPException(
            status_code=400,
            detail="Use application/json with git_url or multipart/form-data with directory_zip.",
        )

    # For git path we don't have task_id yet
    if task_id is None:
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
        if "type" not in task_data:
            task_data["type"] = "REMOTE"
        if "plugin" not in task_data:
            task_data["plugin"] = "remote_orchestrator"
        await _resolve_provider(task_data, user_and_team, session)
        if "name" in task_data:
            task_data["name"] = secure_filename(task_data["name"])
        task_id = await task_service.add_task(task_data)

    task_dir = await _get_task_dir_path(task_id)
    await storage.makedirs(task_dir, exist_ok=True)
    yaml_path = storage.join(task_dir, "task.yaml")
    async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
        await f.write(task_yaml_content)
    if task_root_for_zip is not None:
        await task_service.update_task(task_id, {"file_mounts": True})
    return {"id": task_id}


@router.get("/{task_id}/yaml", summary="Get task.yaml from the task directory")
async def get_task_yaml(experimentId: str, task_id: str):
    """Return the task.yaml file (human-oriented YAML) for the editor."""
    task = await task_service.task_get_by_id(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task_dir = await _get_task_dir_path(task_id)
    yaml_path = storage.join(task_dir, "task.yaml")
    if not await storage.exists(yaml_path):
        raise HTTPException(status_code=404, detail="task.yaml not found for this task")
    async with await storage.open(yaml_path, "r", encoding="utf-8") as f:
        content = await f.read()
    return PlainTextResponse(content, media_type="text/plain")


@router.put("/{task_id}/yaml", summary="Save task.yaml and sync index.json")
async def update_task_yaml(experimentId: str, task_id: str, request: Request):
    """Write body to task.yaml, then parse and update index.json so listing/run stay in sync."""
    body = (await request.body()).decode("utf-8")
    task = await task_service.task_get_by_id(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task_dir = await _get_task_dir_path(task_id)
    yaml_path = storage.join(task_dir, "task.yaml")
    await storage.makedirs(task_dir, exist_ok=True)
    async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
        await f.write(body)
    try:
        task_data = _parse_yaml_to_task_data(body)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {str(e)}")
    except HTTPException:
        raise
    # Don't overwrite task id
    task_data.pop("id", None)
    success = await task_service.update_task_from_yaml(task_id, task_data)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "OK"}
