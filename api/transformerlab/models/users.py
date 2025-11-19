# users.py
import uuid
from typing import Optional
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy
from fastapi_users.db import SQLAlchemyUserDatabase
from transformerlab.shared.models.user_model import User, get_async_session, create_default_team
from transformerlab.shared.models.models import UserTeam, TeamRole
from sqlalchemy.ext.asyncio import AsyncSession
from jose import jwt as _jose_jwt
from datetime import datetime, timedelta
import os
import sys


# --- Pydantic Schemas for API interactions ---
class UserRead(schemas.BaseUser[uuid.UUID]):
    """
    Schema for reading user data (returned by API).
    Includes all fields that should be visible when fetching user info.
    Inherits: id, email, is_active, is_superuser, is_verified
    """
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserCreate(schemas.BaseUserCreate):
    """
    Schema for creating a new user (registration).
    Inherits: email, password, is_active, is_superuser, is_verified
    """
    first_name: Optional[str] = None
    last_name: Optional[str] = None


class UserUpdate(schemas.BaseUserUpdate):
    """
    Schema for updating user data.
    All fields are optional - only provided fields will be updated.
    Inherits: email, password, is_active, is_superuser, is_verified
    """
    first_name: Optional[str] = None
    last_name: Optional[str] = None


# --- User Manager (Handles registration, password reset, etc.) ---
DEFAULT_SECRET = "YOUR_STRONG_SECRET"  # insecure default for detection only
DEFAULT_REFRESH_SECRET = "YOUR_REFRESH_TOKEN_SECRET"  # insecure default for detection only

SECRET = os.getenv("TRANSFORMERLAB_JWT_SECRET")
REFRESH_SECRET = os.getenv("TRANSFORMERLAB_REFRESH_SECRET")
REFRESH_LIFETIME = 60 * 60 * 24 * 7  # 7 days

if os.getenv("TFL_MULTITENANT") == "true":
    if not SECRET or not REFRESH_SECRET or SECRET == DEFAULT_SECRET or REFRESH_SECRET == DEFAULT_REFRESH_SECRET:
        print(
            "Missing or insecure JWT secrets. Please set TRANSFORMERLAB_JWT_SECRET and TRANSFORMERLAB_REFRESH_SECRET "
            "to strong, different values in your environment variables or .env file. Exiting."
        )
        print(SECRET)
        print(REFRESH_SECRET)
        sys.exit(1)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET

    # Optional: Define custom logic after registration
    async def on_after_register(self, user: User, request: Optional[Request] = None):
        print(f"User {user.id} has registered.")
        # Add to default team as owner
        async with self.user_db.session as session:
            team = await create_default_team(session)
            user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
            session.add(user_team)
            await session.commit()

    async def on_after_forgot_password(self, user: User, token: str, request: Request | None = None):
        print(f"User {user.id} has forgot their password. Reset token: {token}")

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None):
        print(f"Verification requested for user {user.id}. Verification token: {token}")


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# --- Authentication Backend (JWT/Bearer Token) ---
bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    # Token lasts for 3600 seconds (1 hour)
    return JWTStrategy(secret=SECRET, lifetime_seconds=3600)


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# --- FastAPIUsers Instance (The main utility) ---
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend],  # Add more backends (like Google OAuth) here
)

# --- Dependency for Protected Routes ---
# This is what you'll use in your route decorators
current_active_user = fastapi_users.current_user(active=True)


def get_refresh_strategy() -> JWTStrategy:
    return JWTStrategy(secret=REFRESH_SECRET, lifetime_seconds=REFRESH_LIFETIME)


# --- Small helper to create access + refresh tokens for manual flows (e.g. refresh endpoint) ---


class _JWTAuthenticationHelper:
    """Minimal helper that mirrors a login response (access + refresh token).

    We keep this small and explicit so callers (like the `refresh` endpoint in
    `routers/auth.py`) can create new access tokens when given a valid
    refresh token.
    """

    def __init__(
        self,
        access_secret: str,
        refresh_secret: str,
        access_lifetime: int = 3600,
        refresh_lifetime: int = REFRESH_LIFETIME,
    ):
        self.access_secret = access_secret
        self.refresh_secret = refresh_secret
        self.access_lifetime = access_lifetime
        self.refresh_lifetime = refresh_lifetime

    def _create_token(self, user, secret: str, lifetime_seconds: int) -> str:
        now = datetime.utcnow()
        exp = now + timedelta(seconds=lifetime_seconds)
        payload = {
            "sub": str(user.id),
            "email": getattr(user, "email", None),
            "exp": int(exp.timestamp()),
        }
        return _jose_jwt.encode(payload, secret, algorithm="HS256")

    def get_login_response(self, user) -> dict:
        """Return a dict similar to what FastAPI-Users returns on login.

        Keys:
        - access_token: short-lived JWT
        - refresh_token: long-lived JWT (can be validated with refresh strategy)
        - token_type: 'bearer'
        - expires_in: seconds until access token expiry
        """
        access = self._create_token(user, self.access_secret, self.access_lifetime)
        refresh = self._create_token(user, self.refresh_secret, self.refresh_lifetime)
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "expires_in": self.access_lifetime,
        }


# Module-level helpers for imports elsewhere
jwt_authentication = _JWTAuthenticationHelper(
    SECRET, REFRESH_SECRET, access_lifetime=3600, refresh_lifetime=REFRESH_LIFETIME
)
access_strategy = get_jwt_strategy()
refresh_strategy = get_refresh_strategy()
