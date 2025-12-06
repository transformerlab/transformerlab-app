from __future__ import annotations

from fastapi import Request
from transformerlab.routers.auth.provider.auth_provider import AuthUser


class UserService:
    async def on_after_login(
        self,
        user: AuthUser,
        request: Request | None = None,
        response: object | None = None,
    ) -> None:
        """Called after a user successfully logs in."""
        print(f"User {user.id} has logged in.")


user_service = UserService()
