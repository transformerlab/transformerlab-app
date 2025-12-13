import uuid
from typing import Optional
from fastapi import Depends, Request, Response
from fastapi.responses import JSONResponse
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas, exceptions
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, JWTStrategy, Strategy
from fastapi_users.db import SQLAlchemyUserDatabase
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.clients.github import GitHubOAuth2
from transformerlab.shared.models.user_model import get_async_session, create_personal_team, get_user_db
from transformerlab.shared.models.models import User, UserTeam, TeamRole
from transformerlab.utils.email import send_password_reset_email, send_email_verification_link
import os


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

if not SECRET or not REFRESH_SECRET or SECRET == DEFAULT_SECRET or REFRESH_SECRET == DEFAULT_REFRESH_SECRET:
    print(
        "Missing or insecure JWT secrets. Please set TRANSFORMERLAB_JWT_SECRET and TRANSFORMERLAB_REFRESH_SECRET "
        "to strong, different values in your environment variables or .env file. Exiting."
    )


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = SECRET
    verification_token_secret = SECRET
    reset_password_token_lifetime_seconds = TOKEN_LIFETIME
    reset_password_token_audience = "fastapi-users:reset"

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        """
        Called after a user successfully registers.
        Creates a personal team for the user and sends verification email.
        """
        print(f"User {user.id} has registered.")

        # Create personal team for this user as owner
        async for session in get_async_session():
            try:
                team = await create_personal_team(session, user)
                user_team = UserTeam(user_id=str(user.id), team_id=team.id, role=TeamRole.OWNER.value)
                session.add(user_team)
                await session.commit()
                print(f"Created personal team '{team.name}' for user {user.email}")
            except Exception as e:
                print(f"⚠️  Failed to create team for {user.email}: {e}")
                await session.rollback()
            finally:
                break  # Only use first session

        # Automatically send verification email
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

        print(f"Click on verification URL to verify your account: {verification_url}")

        try:
            send_email_verification_link(to_email=user.email, verification_url=verification_url)
            print(f"✅ Verification email sent to {user.email}")
        except Exception as e:
            print(f"❌ Failed to send verification email to {user.email}: {str(e)}")

    async def oauth_callback(
        self,
        oauth_name: str,
        access_token: str,
        account_id: str,
        account_email: str,
        expires_at: int | None = None,
        refresh_token: str | None = None,
        request: Request | None = None,
        **kwargs,
    ) -> User:
        """
        Handle OAuth callback. If user exists by OAuth account, return it.
        If user exists by email, link the OAuth account and return the user.
        Otherwise, create a new user.
        """
        # First, check if OAuth account already exists
        user = await self.user_db.get_by_oauth_account(oauth_name, account_id)
        if user:
            return user

        # Check if user exists by email
        try:
            existing_user = await self.get_by_email(account_email)
            # Link OAuth account to existing user
            oauth_account_dict = {
                "oauth_name": oauth_name,
                "access_token": access_token,
                "account_id": account_id,
                "account_email": account_email,
                "expires_at": expires_at,
                "refresh_token": refresh_token,
            }
            await self.user_db.add_oauth_account(existing_user, oauth_account_dict)
            return existing_user
        except exceptions.UserNotExists:
            # User doesn't exist, create new user
            import secrets

            random_password = secrets.token_urlsafe(32)  # Generate a secure random password
            user_create = UserCreate(
                email=account_email, password=random_password, is_verified=True
            )  # OAuth emails are pre-verified
            user = await self.create(user_create, request=request)
            return user


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
    scopes=[
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
    ],
)

# Check if OAuth is properly configured
GOOGLE_OAUTH_ENABLED = os.getenv("GOOGLE_OAUTH_ENABLED", "false").lower() == "true" and bool(
    os.getenv("GOOGLE_OAUTH_CLIENT_ID") and os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
)

if not GOOGLE_OAUTH_ENABLED:
    print(
        "⚠️  Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to enable Google login."
    )
else:
    print("✅ Google OAuth configured and ready.")

# --- GitHub OAuth Configuration ---
github_oauth_client = GitHubOAuth2(
    client_id=os.getenv("GITHUB_OAUTH_CLIENT_ID", ""),
    client_secret=os.getenv("GITHUB_OAUTH_CLIENT_SECRET", ""),
    scopes=["user:email"],
)

GITHUB_OAUTH_ENABLED = os.getenv("GITHUB_OAUTH_ENABLED", "false").lower() == "true" and bool(
    os.getenv("GITHUB_OAUTH_CLIENT_ID") and os.getenv("GITHUB_OAUTH_CLIENT_SECRET")
)

if not GITHUB_OAUTH_ENABLED:
    print(
        "⚠️  GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET to enable GitHub login."
    )
else:
    print("✅ GitHub OAuth configured and ready.")


EMAIL_AUTH_ENABLED = os.getenv("EMAIL_AUTH_ENABLED", "true").lower() == "true"

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
        callback_url = (
            f"{frontend_url}/auth/callback?access_token={access_token}&refresh_token={refresh_token}&token_type=bearer"
        )

        return Response(status_code=302, headers={"Location": callback_url})


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
