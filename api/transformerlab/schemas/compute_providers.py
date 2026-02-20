"""Pydantic schemas for provider management."""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Union
from datetime import datetime
from transformerlab.shared.models.models import ProviderType, AcceleratorType


class ProviderConfigBase(BaseModel):
    """Base schema for provider configuration."""

    # SkyPilot-specific config
    server_url: Optional[str] = None
    api_token: Optional[str] = None
    default_env_vars: Dict[str, str] = Field(default_factory=dict)
    default_entrypoint_command: Optional[str] = None

    # SLURM-specific config
    mode: Optional[str] = None  # "rest" or "ssh"
    rest_url: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_user: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_port: int = 22

    # Runpod-specific config
    api_key: Optional[str] = None  # Runpod API key (sensitive)
    api_base_url: Optional[str] = None  # Defaults to https://rest.runpod.io/v1
    default_gpu_type: Optional[str] = None  # Default GPU type (e.g., "RTX 3090", "A100")
    default_region: Optional[str] = None  # Default region
    default_template_id: Optional[str] = None  # Default Docker template ID
    default_network_volume_id: Optional[str] = None  # Default network volume ID

    # Accelerators supported by this provider
    supported_accelerators: Optional[List[AcceleratorType]] = Field(default=None)

    # Additional provider-specific config
    extra_config: Dict[str, Any] = Field(default_factory=dict)


class ProviderCreate(BaseModel):
    """Schema for creating a new provider."""

    name: str = Field(..., min_length=1, max_length=100)
    type: ProviderType
    config: ProviderConfigBase


class ProviderUpdate(BaseModel):
    """Schema for updating a provider."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    config: Optional[ProviderConfigBase] = None


class ProviderRead(BaseModel):
    """Schema for reading provider information (masks sensitive fields)."""

    id: str
    team_id: str
    name: str
    type: str
    config: Dict[str, Any]  # Will mask sensitive fields
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def mask_sensitive_config(config: Dict[str, Any], provider_type: str) -> Dict[str, Any]:
    """
    Mask sensitive fields in provider configuration.

    Args:
        config: Provider configuration dictionary
        provider_type: Type of provider (slurm, skypilot, or runpod)

    Returns:
        Configuration with sensitive fields masked
    """
    masked = config.copy()

    # Mask API tokens
    if "api_token" in masked and masked["api_token"]:
        masked["api_token"] = "***"

    # Mask any other sensitive fields
    if "password" in masked:
        masked["password"] = "***"
    if "secret" in masked:
        masked["secret"] = "***"

    return masked


class ProviderTemplateLaunchRequest(BaseModel):
    """Payload for launching a remote template via providers."""

    experiment_id: str = Field(..., description="Experiment that owns the job")
    task_id: Optional[str] = Field(
        None, description="Task ID; required when file_mounts is True for lab.copy_file_mounts()"
    )
    task_name: Optional[str] = Field(None, description="Friendly task name")
    cluster_name: Optional[str] = Field(None, description="Base cluster name, suffix is appended automatically")
    command: str = Field(..., description="Command to execute on the cluster")
    subtype: Optional[str] = Field(None, description="Optional subtype for filtering")
    interactive_type: Optional[str] = Field(None, description="Interactive task type (e.g. vscode)")
    cpus: Optional[str] = None
    memory: Optional[str] = None
    disk_space: Optional[str] = None
    accelerators: Optional[str] = None
    num_nodes: Optional[int] = None
    setup: Optional[str] = None
    env_vars: Dict[str, str] = Field(default_factory=dict, description="Environment variables as key-value pairs")
    # File mounts: True = use lab.copy_file_mounts() at launch (task_id required); or dict for legacy path mapping
    file_mounts: Optional[Union[Dict[str, str], bool]] = Field(
        default=None,
        description="True to copy task dir to ~/src via lab.copy_file_mounts(); or {<remote_path>: <local_path>} for legacy",
    )
    parameters: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Task parameters (hyperparameters, config, etc.) that will be accessible via lab.get_config()",
    )
    config: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Configuration values to override for this specific run. These will be merged with parameters defaults.",
    )
    provider_name: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_directory: Optional[str] = None
    github_branch: Optional[str] = None
    # Sweep configuration
    run_sweeps: Optional[bool] = Field(
        default=False,
        description="Enable parameter sweeps. When True, generates jobs for all parameter combinations in sweep_config.",
    )
    sweep_config: Optional[Dict[str, List[Any]]] = Field(
        default=None,
        description="Sweep configuration: parameter names mapped to lists of values to try. Example: {'learning_rate': ['1e-5', '3e-5'], 'batch_size': ['4', '8']}",
    )
    sweep_metric: Optional[str] = Field(
        default="eval/loss",
        description="Metric name to use for determining best configuration. Should match a metric logged by the task.",
    )
    lower_is_better: Optional[bool] = Field(
        default=True,
        description="Whether lower values of sweep_metric are better. If False, higher values are better.",
    )
    local: Optional[bool] = Field(
        default=False,
        description="Whether to use direct local access for interactive sessions (skip tunnels).",
    )
    minutes_requested: Optional[int] = Field(
        default=None,
        description="Number of minutes requested for this task. Required for quota tracking.",
    )


class ProviderTemplateFileUploadResponse(BaseModel):
    """Response for a single template file upload."""

    status: str
    stored_path: str
    message: Optional[str] = None


class ResumeFromCheckpointRequest(BaseModel):
    """Request body for resuming a REMOTE job from a checkpoint."""

    checkpoint: str = Field(..., description="Checkpoint filename to resume from")
