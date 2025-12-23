"""Pydantic schemas for provider management."""

from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
from datetime import datetime
from transformerlab.shared.models.models import ProviderType


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
        provider_type: Type of provider (slurm or skypilot)

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
