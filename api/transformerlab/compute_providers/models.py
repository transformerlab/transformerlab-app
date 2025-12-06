"""Pydantic models for provider bridge system."""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ClusterState(str, Enum):
    """Cluster state enumeration."""

    UNKNOWN = "unknown"
    INIT = "init"
    UP = "up"
    STOPPED = "stopped"
    DOWN = "down"
    FAILED = "failed"


class JobState(str, Enum):
    """Job state enumeration."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"


class ClusterConfig(BaseModel):
    """Configuration for launching a cluster."""

    cluster_name: str | None = None
    provider_name: str | None = None
    provider_id: str | None = None
    # Resource specifications
    instance_type: str | None = None
    cpus: int | str | None = None
    memory: int | str | None = None
    accelerators: str | None = None  # e.g., "A100:1", "V100:2"
    disk_size: int | None = None  # in GB
    num_nodes: int | None = 1

    # Cloud/region settings
    cloud: str | None = None
    region: str | None = None
    zone: str | None = None
    use_spot: bool = False

    # Cluster settings
    idle_minutes_to_autostop: int | None = None
    command: str | None = None  # Initial command to run
    setup: str | None = None  # Setup script
    env_vars: dict[str, str] = Field(default_factory=dict)  # Environment variables

    # File mounts: mapping of remote path -> local path
    # For SkyPilot, this is passed directly to task.set_file_mounts().
    # For SLURM, this is interpreted as SFTP/SCP upload instructions when using SSH mode.
    file_mounts: dict[str, str] = Field(default_factory=dict)

    # Additional provider-specific config
    provider_config: dict[str, Any] = Field(default_factory=dict)


class JobConfig(BaseModel):
    """Configuration for submitting a job."""

    command: str  # Command to execute
    job_name: str | None = None
    env_vars: dict[str, str] = Field(default_factory=dict)
    num_nodes: int | None = None
    timeout: int | None = None  # Timeout in seconds

    # Additional provider-specific config
    provider_config: dict[str, Any] = Field(default_factory=dict)


class ClusterStatus(BaseModel):
    """Normalized cluster status information."""

    cluster_name: str
    state: ClusterState
    status_message: str | None = None
    launched_at: str | None = None
    last_use: str | None = None
    autostop: int | None = None  # Minutes until autostop
    num_nodes: int | None = None
    resources_str: str | None = None  # Human-readable resource description

    # Additional provider-specific data
    provider_data: dict[str, Any] = Field(default_factory=dict)


class JobInfo(BaseModel):
    """Normalized job information."""

    job_id: str | int
    job_name: str | None = None
    state: JobState
    cluster_name: str
    command: str | None = None
    submitted_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    error_message: str | None = None

    # Additional provider-specific data
    provider_data: dict[str, Any] = Field(default_factory=dict)


class ResourceInfo(BaseModel):
    """Normalized resource information for a cluster."""

    cluster_name: str
    gpus: list[dict[str, Any]] = Field(default_factory=list)
    cpus: int | None = None
    memory_gb: float | None = None
    disk_gb: int | None = None
    num_nodes: int | None = None

    # Additional provider-specific data
    provider_data: dict[str, Any] = Field(default_factory=dict)
