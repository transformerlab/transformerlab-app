from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: str | None = None
    email: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    profile_picture_url: str | None = None
    organization_id: str | None = None
    role: Any | None = None
    authenticated: bool = False
    source: Literal["session", "api_key", "anonymous"] = "anonymous"
    api_key: str | None = None
