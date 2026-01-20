"""Pydantic schemas for SSH key management."""

from pydantic import BaseModel, Field
from typing import Optional


class SshKeyCreate(BaseModel):
    name: Optional[str] = Field(None, description="Optional name/description for the SSH key")


class SshKeyUpdate(BaseModel):
    name: Optional[str] = None


class SshKeyResponse(BaseModel):
    id: str
    name: Optional[str]
    created_at: str
    created_by_user_id: str
