"""Pydantic models for provider bridge system."""

from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any, Union
from enum import Enum


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

    cluster_name: Optional[str] = None
    provider_name: Optional[str] = None
    provider_id: Optional[str] = None
    # Resource specifications
    instance_type: Optional[str] = None
    cpus: Optional[Union[int, str]] = None
    memory: Optional[Union[int, str]] = None
    accelerators: Optional[str] = None  # e.g., "A100:1", "V100:2"
    disk_size: Optional[int] = None  # in GB
    num_nodes: Optional[int] = 1

    # Cloud/region settings
    cloud: Optional[str] = None
    region: Optional[str] = None
    zone: Optional[str] = None
    use_spot: bool = False

    # Cluster settings
    idle_minutes_to_autostop: Optional[int] = None
    command: Optional[str] = None  # Initial command to run
    setup: Optional[str] = None  # Setup script
    env_vars: Dict[str, str] = Field(default_factory=dict)  # Environment variables

    # File mounts: mapping of remote path -> local path
    # For SkyPilot, this is passed directly to task.set_file_mounts().
    # For SLURM, this is interpreted as SFTP/SCP upload instructions when using SSH mode.
    file_mounts: Dict[str, str] = Field(default_factory=dict)

    # Additional provider-specific config
    provider_config: Dict[str, Any] = Field(default_factory=dict)


class JobConfig(BaseModel):
    """Configuration for submitting a job."""

    command: str  # Command to execute
    job_name: Optional[str] = None
    env_vars: Dict[str, str] = Field(default_factory=dict)
    num_nodes: Optional[int] = None
    timeout: Optional[int] = None  # Timeout in seconds

    # Additional provider-specific config
    provider_config: Dict[str, Any] = Field(default_factory=dict)


class ClusterStatus(BaseModel):
    """Normalized cluster status information."""

    cluster_name: str
    state: ClusterState
    status_message: Optional[str] = None
    launched_at: Optional[str] = None
    last_use: Optional[str] = None
    autostop: Optional[int] = None  # Minutes until autostop
    num_nodes: Optional[int] = None
    resources_str: Optional[str] = None  # Human-readable resource description

    # Additional provider-specific data
    provider_data: Dict[str, Any] = Field(default_factory=dict)


class JobInfo(BaseModel):
    """Normalized job information."""

    job_id: Union[str, int]
    job_name: Optional[str] = None
    state: JobState
    cluster_name: str
    command: Optional[str] = None
    submitted_at: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None

    # Additional provider-specific data
    provider_data: Dict[str, Any] = Field(default_factory=dict)


class ResourceInfo(BaseModel):
    """Normalized resource information for a cluster."""

    cluster_name: str
    gpus: List[Dict[str, Any]] = Field(default_factory=list)
    cpus: Optional[int] = None
    memory_gb: Optional[float] = None
    disk_gb: Optional[int] = None
    num_nodes: Optional[int] = None

    # Additional provider-specific data
    provider_data: Dict[str, Any] = Field(default_factory=dict)
