"""Pydantic schemas for provider management."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from transformerlab.shared.models.models import ProviderType


class ProviderConfigBase(BaseModel):
    """Base schema for provider configuration."""

    # SkyPilot-specific config
    server_url: str | None = None
    api_token: str | None = None
    default_env_vars: dict[str, str] = Field(default_factory=dict)
    default_entrypoint_command: str | None = None

    # SLURM-specific config
    mode: str | None = None  # "rest" or "ssh"
    rest_url: str | None = None
    ssh_host: str | None = None
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    ssh_port: int = 22

    # Additional provider-specific config
    extra_config: dict[str, Any] = Field(default_factory=dict)


class ProviderCreate(BaseModel):
    """Schema for creating a new provider."""

    name: str = Field(..., min_length=1, max_length=100)
    type: ProviderType
    config: ProviderConfigBase


class ProviderUpdate(BaseModel):
    """Schema for updating a provider."""

    name: str | None = Field(None, min_length=1, max_length=100)
    config: ProviderConfigBase | None = None


class ProviderRead(BaseModel):
    """Schema for reading provider information (masks sensitive fields)."""

    id: str
    team_id: str
    name: str
    type: str
    config: dict[str, Any]  # Will mask sensitive fields
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


def mask_sensitive_config(config: dict[str, Any], provider_type: str) -> dict[str, Any]:
    """
    Mask sensitive fields in provider configuration.

    Args:
        config: Provider configuration dictionary
        provider_type: Type of provider (slurm or skypilot)

    Returns:
        Configuration with sensitive fields masked
    """
    masked = config.copy()

    # Mask API tokens
    if masked.get("api_token"):
        masked["api_token"] = "***"

    # Mask SSH keys
    if masked.get("ssh_key_path"):
        masked["ssh_key_path"] = "***"

    # Mask any other sensitive fields
    if "password" in masked:
        masked["password"] = "***"
    if "secret" in masked:
        masked["secret"] = "***"

    return masked
