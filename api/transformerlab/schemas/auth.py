from __future__ import annotations

from typing import Any, Optional, Literal

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: Optional[str] = None
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_picture_url: Optional[str] = None
    organization_id: Optional[str] = None
    role: Optional[Any] = None
    authenticated: bool = False
    source: Literal["session", "api_key", "anonymous"] = "anonymous"
    api_key: Optional[str] = None
