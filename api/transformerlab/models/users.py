import uuid
from typing import Optional
from fastapi import Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy, Strategy
from fastapi_users.db import SQLAlchemyUserDatabase
from httpx_oauth.clients.google import GoogleOAuth2
from transformerlab.shared.models.user_model import User, OAuthAccount, get_async_session, create_personal_team
from transformerlab.shared.models.models import UserTeam, TeamRole
from transformerlab.utils.email import send_password_reset_email, send_email_verification_link
from sqlalchemy.ext.asyncio import AsyncSession
import os
import sys


# --- Pydantic Schemas for API interactions ---
class UserRead(schemas.BaseUser[uuid.UUID]):
    """
    Schema for reading user data (returned by API).
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
    Inherits: email, password, is_active, is_superuser, is_verified
    """

    first_name: Optional[str] = None
    last_name: Optional[str] = None


# --- User Manager (Handles registration, password reset, etc.) ---
DEFAULT_SECRET = "YOUR_STRONG_SECRET"  # insecure default for detection only
DEFAULT_REFRESH_SECRET = "YOUR_REFRESH_TOKEN_SECRET"  # insecure default for detection only
TOKEN_LIFETIME = 3600  # 1 hour in seconds

SECRET = os.getenv("TRANSFORMERLAB_JWT_SECRET")
REFRESH_SECRET = os.getenv("TRANSFORMERLAB_REFRESH_SECRET")
REFRESH_LIFETIME = 60 * 60 * 24 * 7  # 7 days

if os.getenv("TFL_MULTITENANT") == "true":
    if not SECRET or not REFRESH_SECRET or SECRET == DEFAULT_SECRET or REFRESH_SECRET == DEFAULT_REFRESH_SECRET:
        print(
            "Missing or insecure JWT secrets. Please set TRANSFORMERLAB_JWT_SECRET and TRANSFORMERLAB_REFRESH_SECRET "
            "to strong, different values in your environment variables or .env file. Exiting."
        )
        sys.exit(1)


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET
    reset_password_token_lifetime_seconds = TOKEN_LIFETIME
    reset_password_token_audience = "fastapi-users:reset"

    # Optional: Define custom logic after registration
    async def on_after_register(self, user: User, request: Optional[Request] = None):
        """
        Called after a user successfully registers.
        Creates a personal team for the user and sends verification email.
        """
        print(f"User {user.id} has registered.")

        # Create personal team for this user as owner
        async with self.user_db.session as session:
            team = await create_personal_team(session, user)
            user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
            session.add(user_team)
            await session.commit()
            print(f"Created personal team '{team.name}' for user {user.email}")

        # Automatically send verification email
        # This calls the built-in request_verify which generates a token
        # and triggers on_after_request_verify hook
        if not user.is_verified:
            try:
                await self.request_verify(user, request)
                print(f"📧 Verification email requested for {user.email}")
            except Exception as e:
                print(f"⚠️  Could not send verification email: {e}")

    async def on_after_forgot_password(self, user: User, token: str, request: Request | None = None):
        """
        Called after a user requests a password reset.
        Sends an email with a reset link containing the token.
        """
        print(f"User {user.id} has requested password reset. Token: {token}")

        # Get frontend URL from environment or use default
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:1212")
        # Use hash router format for the reset URL
        reset_url = f"{frontend_url}/#/?reset_token={token}"
        try:
            send_password_reset_email(to_email=user.email, reset_url=reset_url)
            print(f"✅ Password reset email sent to {user.email}")
        except Exception as e:
            print(f"❌ Failed to send password reset email to {user.email}: {str(e)}")

    async def on_after_request_verify(self, user: User, token: str, request: Request | None = None):
        """
        Called when a user requests email verification (or resend verification).
        Sends an email with a verification link containing the token.
        """
        print(f"Verification requested for user {user.id}. Token: {token}")

        # Get frontend URL from environment or use default
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:1212")
        verification_url = f"{frontend_url}/#/?token={token}"

        print(f"Verification requested for user {user.id}.")
        print(f"Click on verification URL to verify your account: {verification_url}")
        try:
            send_email_verification_link(to_email=user.email, verification_url=verification_url)
            print(f"✅ Verification email sent to {user.email}")
        except Exception as e:
            print(f"❌ Failed to send verification email to {user.email}: {str(e)}")


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, User)


async def get_oauth_account_db(session: AsyncSession = Depends(get_async_session)):
    yield SQLAlchemyUserDatabase(session, OAuthAccount)


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# --- Strategies & Transports ---

bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    # Access token lasts for 3600 seconds (1 hour)
    return JWTStrategy(secret=SECRET, lifetime_seconds=TOKEN_LIFETIME)


def get_refresh_strategy() -> JWTStrategy:
    # Refresh token lasts for 7 days
    return JWTStrategy(secret=REFRESH_SECRET, lifetime_seconds=REFRESH_LIFETIME)


# --- OAuth Configuration ---
google_oauth_client = GoogleOAuth2(
    client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID", ""),
    client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", ""),
)

# Check if OAuth is properly configured
GOOGLE_OAUTH_ENABLED = bool(
    os.getenv("GOOGLE_OAUTH_CLIENT_ID") and 
    os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
)

if not GOOGLE_OAUTH_ENABLED:
    print("⚠️  Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to enable Google login.")
else:
    print("✅ Google OAuth configured and ready.")


# --- Custom Authentication Backend ---


class RefreshTokenBackend(AuthenticationBackend):
    """
    Overrides the default login behavior to return both Access and Refresh tokens.
    """

    async def login(self, strategy: Strategy, user: User) -> Response:
        # 1. Generate Access Token (using the default strategy passed in)
        access_token = await strategy.write_token(user)

        # 2. Generate Refresh Token (explicitly using our refresh strategy)
        refresh_strategy = get_refresh_strategy()
        refresh_token = await refresh_strategy.write_token(user)

        # 3. Return combined JSON response
        return JSONResponse(
            content={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
        )


# Use the Custom Backend
auth_backend = RefreshTokenBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# OAuth backend
class OAuthBackend(AuthenticationBackend):
    """
    OAuth backend that redirects to frontend callback with tokens in URL.
    """

    async def login(self, strategy: Strategy, user: User) -> Response:
        # Generate tokens
        access_token = await strategy.write_token(user)
        refresh_token = await get_refresh_strategy().write_token(user)

        # Redirect to frontend callback with tokens in URL
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:1212")
        callback_url = f"{frontend_url}/#/auth/callback?access_token={access_token}&refresh_token={refresh_token}&token_type=bearer"
        
        return Response(
            status_code=302,
            headers={"Location": callback_url}
        )

oauth_backend = OAuthBackend(
    name="oauth",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# --- FastAPIUsers Instance ---
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend, oauth_backend],
)

current_active_user = fastapi_users.current_user(active=True)
