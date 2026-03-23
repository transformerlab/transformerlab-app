"""Pydantic schemas for task management."""

from typing import Any, Dict, Literal, Optional, List

from pydantic import BaseModel, ConfigDict, model_validator


class ExportTaskToTeamGalleryRequest(BaseModel):
    task_id: str


class ImportTaskFromGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str
    is_interactive: Optional[bool] = False  # Whether importing from interactive gallery
    env_vars: Optional[dict] = None  # User-provided environment variable values


class ImportTaskFromTeamGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str
    is_interactive: Optional[bool] = False  # Whether to import as an interactive task
    env_vars: Optional[dict] = None  # User-provided environment variable values (merged into env_vars)


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


class GroupChildConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    run: Optional[str] = None
    setup: Optional[str] = None
    subtype: Optional[str] = None
    interactive_type: Optional[str] = None
    resources: Optional[Dict[str, Any]] = (
        None  # reserved for future use; flat fields (accelerators, num_nodes, etc.) are used by the dispatcher
    )
    env_vars: Optional[Dict[str, Any]] = None
    cpus: Optional[str] = None
    memory: Optional[str] = None
    disk_space: Optional[str] = None
    accelerators: Optional[str] = None
    num_nodes: Optional[int] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_repo_branch: Optional[str] = None
    provider_id: Optional[str] = None


class GroupYamlSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    failure_policy: Literal["continue", "stop_all", "stop_new"] = "continue"
    jobs: List["GroupChildConfig"]


class GroupLaunchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    experiment_id: str
    failure_policy: Literal["continue", "stop_all", "stop_new"] = "continue"
    jobs: List[GroupChildConfig]


class TaskYamlSpec(BaseModel):
    """
    Canonical schema for task.yaml content.

    This is intentionally a bit permissive on numeric/string fields so we can
    accept both numbers and strings for resources, but it enforces that `run`
    is present (unless a `group` is specified) and that the overall shape
    matches what the runner expects.
    """

    model_config = ConfigDict(extra="forbid")

    name: str
    resources: Optional[TaskYamlResources] = None
    envs: Optional[Dict[str, Any]] = None
    setup: Optional[str] = None
    run: Optional[str] = None
    group: Optional[GroupYamlSpec] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_repo_branch: Optional[str] = None
    parameters: Optional[Dict[str, Any]] = None
    sweeps: Optional[TaskYamlSweeps] = None
    minutes_requested: Optional[int] = None

    @model_validator(mode="after")
    def run_required_without_group(self) -> "TaskYamlSpec":
        if self.group is None and not self.run:
            raise ValueError("'run' is required when 'group' is not specified")
        return self


class TaskFilesResponse(BaseModel):
    """List of files associated with a task template."""

    github_files: Optional[List[str]] = None
    local_files: Optional[List[str]] = None
