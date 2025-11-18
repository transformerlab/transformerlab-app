from __future__ import annotations

from typing import Optional

from fastapi import Request

from transformerlab.routers.auth.provider.auth_provider import AuthUser


class UserService:
    async def on_after_login(
        self,
        user: AuthUser,
        request: Optional[Request] = None,
        response: Optional[object] = None,
    ) -> None:
        """Called after a user successfully logs in."""
        print(f"User {user.id} has logged in.")


user_service = UserService()
