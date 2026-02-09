import uuid
from typing import Optional
from fastapi import Depends, Request, Response, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi_users import BaseUserManager, FastAPIUsers, UUIDIDMixin, schemas, exceptions
from fastapi_users.authentication import AuthenticationBackend, BearerTransport, CookieTransport, JWTStrategy, Strategy
from fastapi_users.db import SQLAlchemyUserDatabase
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.clients.github import GitHubOAuth2
from httpx_oauth.clients.openid import OpenID
from httpx_oauth.clients.openid import OpenIDConfigurationError
from transformerlab.shared.models.user_model import get_async_session, create_personal_team, get_user_db
from transformerlab.shared.models.models import User, UserTeam, TeamRole
from transformerlab.utils.email import send_password_reset_email, send_email_verification_link
from sqlalchemy.ext.asyncio import AsyncSession
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

            # Link OAuth account to the newly created user
            oauth_account_dict = {
                "oauth_name": oauth_name,
                "access_token": access_token,
                "account_id": account_id,
                "account_email": account_email,
                "expires_at": expires_at,
                "refresh_token": refresh_token,
            }
            await self.user_db.add_oauth_account(user, oauth_account_dict)
            return user


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


# --- Strategies & Transports ---

bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

# Cookie transport for browser-based authentication
# cookie_secure=False allows cookies over HTTP (for local development)
# Set cookie_secure=True in production with HTTPS
cookie_transport = CookieTransport(
    cookie_name="tlab_auth",
    cookie_max_age=TOKEN_LIFETIME,
    cookie_secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    cookie_httponly=True,
    cookie_samesite="lax",
)


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
# Check if we're in MULTIUSER mode
MULTIUSER_MODE = os.getenv("MULTIUSER", "false").lower() != "false"

if not GOOGLE_OAUTH_ENABLED and MULTIUSER_MODE:
    print(
        "⚠️  Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to enable Google login."
    )
elif GOOGLE_OAUTH_ENABLED and MULTIUSER_MODE:
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

if not GITHUB_OAUTH_ENABLED and MULTIUSER_MODE:
    print(
        "⚠️  GitHub OAuth not configured. Set GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET to enable GitHub login."
    )
elif GITHUB_OAUTH_ENABLED and MULTIUSER_MODE:
    print("✅ GitHub OAuth configured and ready.")


# --- Generic OIDC providers (any OpenID Connect IdP) ---
def _load_oidc_providers() -> list[dict]:
    """
    Load OIDC providers from environment.
    For each N=0,1,2,... if OIDC_N_DISCOVERY_URL, OIDC_N_CLIENT_ID, OIDC_N_CLIENT_SECRET are set,
    create an OpenID client. Discovery URL is the full URL to .well-known/openid-configuration.
    """
    providers: list[dict] = []
    n = 0
    while True:
        base = f"OIDC_{n}"
        discovery_url = os.getenv(f"{base}_DISCOVERY_URL", "").strip()
        client_id = os.getenv(f"{base}_CLIENT_ID", "").strip()
        client_secret = os.getenv(f"{base}_CLIENT_SECRET", "").strip()
        name = os.getenv(f"{base}_NAME", "").strip() or f"OpenID #{n + 1}"
        if not discovery_url or not client_id or not client_secret:
            if n == 0:
                pass  # No OIDC providers configured
            break
        try:
            client = OpenID(
                client_id=client_id,
                client_secret=client_secret,
                openid_configuration_endpoint=discovery_url,
                name=f"oidc-{n}",
            )
            providers.append({"id": f"oidc-{n}", "name": name, "client": client})
        except OpenIDConfigurationError as e:
            print(f"⚠️  OIDC provider {n} ({discovery_url}): discovery failed: {e}")
        except Exception as e:
            print(f"⚠️  OIDC provider {n}: failed to load: {e}")
        n += 1
    return providers


OIDC_PROVIDERS: list[dict] = _load_oidc_providers()
if OIDC_PROVIDERS and MULTIUSER_MODE:
    print(f"✅ {len(OIDC_PROVIDERS)} OIDC provider(s) configured.")


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


# Use the Custom Backend (Bearer transport for API clients)
auth_backend = RefreshTokenBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)


# Cookie-based authentication backend for browser clients
class CookieAuthBackend(AuthenticationBackend):
    """
    Cookie-based authentication backend that sets both access and refresh tokens as cookies.
    """

    async def login(self, strategy: Strategy, user: User) -> Response:
        access_token = await strategy.write_token(user)
        refresh_token = await get_refresh_strategy().write_token(user)

        response = JSONResponse(
            content={"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
        )

        # Set access token cookie
        response.set_cookie(
            key="tlab_auth",
            value=access_token,
            max_age=TOKEN_LIFETIME,
            httponly=True,
            secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            samesite="lax",
        )

        # Set refresh token cookie
        response.set_cookie(
            key="tlab_refresh",
            value=refresh_token,
            max_age=REFRESH_LIFETIME,
            httponly=True,
            secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
            samesite="lax",
        )

        return response

    async def logout(self, strategy: Strategy, user: User, token: str) -> Response:
        response = JSONResponse(content={"detail": "Logged out"})
        response.delete_cookie("tlab_auth")
        response.delete_cookie("tlab_refresh")
        return response


cookie_auth_backend = CookieAuthBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)


# OAuth backend
class OAuthBackend(AuthenticationBackend):
    """
    OAuth backend that redirects back to the frontend.

    Behavior:
    - If FRONTEND_URL is set: issue cookie-based auth (tlab_auth/tlab_refresh)
      and redirect cleanly to the frontend root.
    - If FRONTEND_URL is not set: fall back to legacy behavior and include
      tokens in the redirect URL query string (for non-UI clients).
    """

    async def login(self, strategy: Strategy, user: User) -> Response:
        # Generate tokens
        access_token = await strategy.write_token(user)
        refresh_token = await get_refresh_strategy().write_token(user)

        frontend_url = os.getenv("FRONTEND_URL")

        # FRONTEND_URL not configured: legacy behavior with tokens in URL
        if not frontend_url:
            legacy_frontend_url = "http://localhost:1212"
            frontend_url_normalized = legacy_frontend_url.rstrip("/")
            callback_url = (
                f"{frontend_url_normalized}/?access_token={access_token}"
                f"&refresh_token={refresh_token}&token_type=bearer"
            )
            return RedirectResponse(url=callback_url, status_code=302)

        # FRONTEND_URL configured: cookie-based auth + clean redirect
        frontend_url_normalized = frontend_url.rstrip("/")
        response = RedirectResponse(url=f"{frontend_url_normalized}/", status_code=302)

        cookie_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"

        # Set access token cookie
        response.set_cookie(
            key="tlab_auth",
            value=access_token,
            max_age=TOKEN_LIFETIME,
            httponly=True,
            secure=cookie_secure,
            samesite="lax",
        )

        # Set refresh token cookie
        response.set_cookie(
            key="tlab_refresh",
            value=refresh_token,
            max_age=REFRESH_LIFETIME,
            httponly=True,
            secure=cookie_secure,
            samesite="lax",
        )

        return response


oauth_backend = OAuthBackend(
    name="oauth",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

# --- FastAPIUsers Instance ---
fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager,
    [auth_backend, cookie_auth_backend, oauth_backend],
)


# Custom current_active_user that supports JWT (header and cookie) and API key authentication
async def current_active_user(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
) -> User:
    """
    Custom authentication dependency that supports JWT (via Bearer token or cookie) and API key authentication.
    This replaces the default fastapi_users.current_user() to add API key and cookie support.
    """
    # Import here to avoid circular dependency
    from transformerlab.shared.api_key_auth import extract_api_key_from_request, validate_api_key_and_get_user
    from transformerlab.utils.api_key_utils import validate_api_key_format

    # Check if request has an API key (starts with "tl-")
    api_key = extract_api_key_from_request(request)

    if api_key:
        # API key authentication
        try:
            user, _, _ = await validate_api_key_and_get_user(api_key, session)
            if not user.is_active:
                raise HTTPException(status_code=401, detail="User is not active")
            return user
        except HTTPException as e:
            # Re-raise the specific HTTPException from API key validation
            raise e

    # Try JWT authentication from Authorization header
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        # Skip if it looks like an API key
        if validate_api_key_format(token):
            token = None

    # If no Bearer token, try to get JWT from cookie
    if not token:
        token = request.cookies.get("tlab_auth")

    if token:
        from transformerlab.shared.models.models import OAuthAccount
        from transformerlab.shared.models.user_model import SQLAlchemyUserDatabaseWithOAuth

        try:
            # Create user_db instance
            user_db = SQLAlchemyUserDatabaseWithOAuth(session, User, OAuthAccount)

            # Create user_manager instance
            user_manager = UserManager(user_db)

            # Validate JWT token
            strategy = auth_backend.get_strategy()
            user = await strategy.read_token(token, user_manager)

            if user and user.is_active:
                return user
            elif user and not user.is_active:
                raise HTTPException(status_code=401, detail="User is not active")
        except Exception:
            # Token validation failed (expired, invalid, etc.)
            pass

    # If we get here, neither API key nor JWT worked
    raise HTTPException(status_code=401, detail="Authentication required")
