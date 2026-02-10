"""Schemas for secrets management (team and user secrets)."""

from pydantic import BaseModel, Field


class TeamSecretsRequest(BaseModel):
    secrets: dict[str, str] = Field(..., description="Team secrets as key-value pairs")


class UserSecretsRequest(BaseModel):
    secrets: dict[str, str] = Field(..., description="User secrets as key-value pairs")


class SpecialSecretRequest(BaseModel):
    secret_type: str = Field(..., description="Type of special secret: _GITHUB_PAT_TOKEN, _HF_TOKEN, or _WANDB_API_KEY")
    value: str = Field(..., description="Secret value")


# Special secret types mapping
SPECIAL_SECRET_TYPES = {
    "_GITHUB_PAT_TOKEN": "GitHub Personal Access Token",
    "_HF_TOKEN": "HuggingFace Token",
    "_WANDB_API_KEY": "Weights & Biases API Key",
}

# Special secret keys that cannot be set via regular secrets endpoints
SPECIAL_SECRET_KEYS = {"_GITHUB_PAT_TOKEN", "_HF_TOKEN", "_WANDB_API_KEY"}
