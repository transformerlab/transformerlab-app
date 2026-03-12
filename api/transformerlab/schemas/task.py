"""Pydantic schemas for task management."""

from typing import Any, Dict, Optional, List

from pydantic import BaseModel, ConfigDict


class ExportTaskToTeamGalleryRequest(BaseModel):
    task_id: str


class ImportTaskFromGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str
    is_interactive: Optional[bool] = False  # Whether importing from interactive gallery


class ImportTaskFromTeamGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class AddTeamTaskToGalleryRequest(BaseModel):
    title: str
    description: Optional[str] = None
    setup: Optional[str] = None
    # Main task entrypoint; historically called "command" in some APIs.
    # New code should prefer "run" to match task.yaml.
    run: str
    cpus: Optional[str] = None
    memory: Optional[str] = None
    supported_accelerators: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_branch: Optional[str] = None


class DeleteTeamTaskFromGalleryRequest(BaseModel):
    task_id: str


# -------- task.yaml validation models --------


class TaskYamlResources(BaseModel):
    model_config = ConfigDict(extra="forbid")

    compute_provider: Optional[str] = None
    cpus: Optional[Any] = None
    memory: Optional[Any] = None
    disk_space: Optional[Any] = None
    accelerators: Optional[str] = None
    num_nodes: Optional[int] = None


class TaskYamlSweeps(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sweep_config: Optional[Dict[str, Any]] = None
    sweep_metric: Optional[str] = None
    lower_is_better: Optional[bool] = None


class TaskYamlSpec(BaseModel):
    """
    Canonical schema for task.yaml content.

    This is intentionally a bit permissive on numeric/string fields so we can
    accept both numbers and strings for resources, but it enforces that `run`
    is present and that the overall shape matches what the runner expects.
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    resources: Optional[TaskYamlResources] = None
    envs: Optional[Dict[str, Any]] = None
    setup: Optional[str] = None
    run: str
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_repo_branch: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    sweeps: Optional[TaskYamlSweeps] = None
    minutes_requested: Optional[int] = None


class TaskFilesResponse(BaseModel):
    """List of files associated with a task template."""

    github_files: Optional[List[str]] = None
    local_files: Optional[List[str]] = None
