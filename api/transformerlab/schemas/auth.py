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


class CurrentUserResponse(BaseModel):
    """
    Response model for /users/me that is compatible with UserRead
    but also includes api_key_team_id when authenticated via API key.
    """

    id: str
    email: str
    is_active: bool
    is_superuser: bool
    is_verified: bool
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    api_key_team_id: Optional[str] = None
