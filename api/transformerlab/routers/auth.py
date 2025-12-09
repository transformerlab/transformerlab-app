from fastapi import APIRouter, Depends, HTTPException, Header, Request
from transformerlab.shared.models.user_model import get_async_session, create_personal_team
from transformerlab.shared.models.models import User, Team, UserTeam, TeamRole
from transformerlab.models.users import (
    fastapi_users,
    auth_backend,
    oauth_backend,
    current_active_user,
    UserRead,
    UserCreate,
    UserUpdate,
    get_user_manager,
    get_refresh_strategy,
    google_oauth_client,
    GOOGLE_OAUTH_ENABLED,
    github_oauth_client,
    GITHUB_OAUTH_ENABLED,
    EMAIL_AUTH_ENABLED,
    SECRET,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from transformerlab.routers.auth_utils.api_key_auth import (
    extract_api_key_from_request,
    validate_api_key_and_get_user,
    get_user_personal_team_id,
)

router = APIRouter(tags=["users"])


# Simple Pydantic model for the refresh request body
class RefreshTokenRequest(BaseModel):
    refresh_token: str


# Include Auth and Registration Routers only if EMAIL_AUTH_ENABLED is True
if EMAIL_AUTH_ENABLED:
    # Require user verification before login (is_verified must be True)
    router.include_router(
        fastapi_users.get_auth_router(auth_backend, requires_verification=True),
        prefix="/auth/jwt",
        tags=["auth"],
    )
    # User starts with is_verified=False by default, must verify email
    router.include_router(
        fastapi_users.get_register_router(UserRead, UserCreate),
        prefix="/auth",
        tags=["auth"],
    )
    router.include_router(
        fastapi_users.get_reset_password_router(),
        prefix="/auth",
        tags=["auth"],
    )
    # Include Verify Email Router (allows users to verify their email address)
    router.include_router(
        fastapi_users.get_verify_router(UserRead),
        prefix="/auth",
        tags=["auth"],
    )
# Include User Management Router (allows authenticated users to view/update their profile)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate, requires_verification=True),
    prefix="/users",
    tags=["users"],
)


# Check if Google OAuth is enabled
@router.get("/auth/google/status")
async def google_oauth_status():
    """
    Returns whether Google OAuth is configured and available.
    Frontend can use this to show/hide the Google login button.
    """
    return {"enabled": GOOGLE_OAUTH_ENABLED}


# Include OAuth Router for Google authentication (only if enabled)
if GOOGLE_OAUTH_ENABLED:
    oauth_router = fastapi_users.get_oauth_router(
        google_oauth_client,
        oauth_backend,
        SECRET,
    )
    router.include_router(
        oauth_router,
        prefix="/auth/google",
        tags=["auth"],
    )


async def _get_user_from_jwt_or_api_key(
    request: Request,
    session: AsyncSession,
) -> tuple[User, Optional[str], str]:
    """
    Try to authenticate user via JWT or API key.
    Returns (user, api_key_team_id, auth_method)
    """
    # Check if request has an API key (starts with "tl-")
    api_key = extract_api_key_from_request(request)

    if api_key:
        # API key authentication
        try:
            user, api_key_team_id, _ = await validate_api_key_and_get_user(api_key, session)
            return user, api_key_team_id, "api_key"
        except HTTPException as e:
            raise e

    # Try JWT authentication - check if there's a Bearer token that's not an API key
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        # If it's not an API key format, try JWT validation
        from transformerlab.utils.api_key_utils import validate_api_key_format

        if not validate_api_key_format(token):
            # This looks like a JWT token, try to validate it
            from transformerlab.models.users import auth_backend

            # Create user_db and user_manager directly using the existing session
            from transformerlab.shared.models.models import User, OAuthAccount
            from transformerlab.shared.models.user_model import SQLAlchemyUserDatabaseWithOAuth
            from transformerlab.models.users import UserManager

            try:
                # Create user_db instance
                user_db = SQLAlchemyUserDatabaseWithOAuth(session, User, OAuthAccount)

                # Create user_manager instance
                user_manager = UserManager(user_db)

                # Validate JWT token
                strategy = auth_backend.get_strategy()
                user = await strategy.read_token(token, user_manager)
                if user and user.is_active:
                    return user, None, "jwt"
            except Exception:
                # Token validation failed (expired, invalid, etc.)
                # Continue to raise 401 below
                pass

    # If we get here, neither API key nor JWT worked
    raise HTTPException(status_code=401, detail="Authentication required")


@router.get("/auth/github/status")
async def github_oauth_status():
    return {"enabled": GITHUB_OAUTH_ENABLED}


if GITHUB_OAUTH_ENABLED:
    router.include_router(
        fastapi_users.get_oauth_router(github_oauth_client, oauth_backend, SECRET),
        prefix="/auth/github",
        tags=["auth"],
    )


async def get_user_and_team(
    request: Request,
    x_team: str | None = Header(None, alias="X-Team-Id"),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Dependency to validate user authentication and team membership.
    Supports both JWT and API key authentication.

    For JWT auth: Requires X-Team-Id header
    For API key auth:
      - If API key has team_id set, uses that team (X-Team-Id not needed)
      - If API key has team_id = null, uses X-Team-Id if provided, otherwise uses personal team

    Returns user, team_id, and role.
    """
    # Authenticate user (JWT or API key)
    user, api_key_team_id, auth_method = await _get_user_from_jwt_or_api_key(request, session)

    # Determine which team to use
    if auth_method == "api_key":
        # API key authentication
        if api_key_team_id:
            # API key is scoped to a specific team - use that team
            team_id = api_key_team_id
        elif x_team:
            # API key works for all teams, and X-Team-Id was provided
            team_id = x_team
        else:
            # API key works for all teams, but no X-Team-Id - use personal team
            team_id = await get_user_personal_team_id(session, user)
    else:
        # JWT authentication - requires X-Team-Id
        if not x_team:
            raise HTTPException(status_code=400, detail="X-Team-Id header required for JWT authentication")
        team_id = x_team

    # Context should already be set by middleware, but ensure it's correct
    # (in case middleware couldn't determine it, or for consistency)
    from transformerlab.shared.request_context import set_current_org_id
    from lab.dirs import set_organization_id as lab_set_org_id

    set_current_org_id(team_id)
    if lab_set_org_id is not None:
        lab_set_org_id(team_id)

    # Verify user is associated with the provided team id
    stmt = select(UserTeam).where(
        UserTeam.user_id == str(user.id),
        UserTeam.team_id == team_id,
    )
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if user_team is None:
        raise HTTPException(status_code=403, detail="User is not a member of the specified team")

    return {"user": user, "team_id": team_id, "role": user_team.role}


async def require_team_owner(
    user: User = Depends(current_active_user),
    x_team: str | None = Header(None, alias="X-Team-Id"),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Dependency to validate user authentication and ensure user is an owner of the team.
    Extracts X-Team-Id header and verifies user has owner role.
    """
    if not x_team:
        raise HTTPException(status_code=400, detail="X-Team-Id header missing")

    # Verify user is an owner of the team
    stmt = select(UserTeam).where(
        UserTeam.user_id == str(user.id),
        UserTeam.team_id == x_team,
    )
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if user_team is None:
        raise HTTPException(status_code=403, detail="User is not a member of the specified team")

    if user_team.role != TeamRole.OWNER.value:
        raise HTTPException(status_code=403, detail="Only team owners can perform this action")

    # Get the team object
    stmt = select(Team).where(Team.id == x_team)
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()

    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")

    return {"user": user, "team_id": x_team, "role": user_team.role, "team": team}


# @router.get("/test-users/authenticated-route")
# async def authenticated_route(user_and_team=Depends(get_user_and_team)):
#     user = user_and_team["user"]
#     team_id = user_and_team["team_id"]
#     return {"message": f"Hello, {user.email}! You are authenticated and acting as part of team {team_id}."}


@router.post("/auth/refresh")
async def refresh_access_token(
    request: RefreshTokenRequest,
    user_manager=Depends(get_user_manager),
):
    """
    Takes a long-lived refresh token, validates it, and returns a new short-lived access token.
    AND rotates the refresh token (returns a new one) to keep the session alive indefinitely.
    """
    refresh_token = request.refresh_token

    try:
        # 1. Get the Refresh Strategy
        refresh_strategy = get_refresh_strategy()

        # 2. Validate the Refresh Token & Get User
        # Use the strategy's read_token method to handle decoding and validation securely
        user = await refresh_strategy.read_token(refresh_token, user_manager)

        if user is None or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

        # 4. Generate a NEW Access Token
        access_strategy = auth_backend.get_strategy()
        new_access_token = await access_strategy.write_token(user)

        # 5. Generate a NEW Refresh Token (Rotation)
        # We use the refresh_strategy to write a completely new token, resetting the clock
        new_refresh_token = await refresh_strategy.write_token(user)

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,  # Return the new token
            "token_type": "bearer",
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Refresh Error: {e}")
        raise HTTPException(status_code=401, detail="Could not refresh token")


@router.get("/users/me/teams")
async def get_user_teams(user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)):
    # Check if user has any team associations
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id))
    result = await session.execute(stmt)
    user_teams = result.scalars().all()

    # If user has no team associations, create personal team as owner
    # (dont seed experiment as existing user may already have experiments from old workspace)
    if not user_teams:
        personal_team = await create_personal_team(session, user)
        user_team = UserTeam(user_id=str(user.id), team_id=personal_team.id, role=TeamRole.OWNER.value)
        session.add(user_team)
        await session.commit()
        await session.refresh(user_team)
        print(f"Created personal team '{personal_team.name}' for existing user {user.email}")
        return {
            "user_id": str(user.id),
            "teams": [{"id": personal_team.id, "name": personal_team.name, "role": TeamRole.OWNER.value}],
        }

    # User has team associations, get the actual team objects
    team_ids = [ut.team_id for ut in user_teams]
    stmt = select(Team).where(Team.id.in_(team_ids))
    result = await session.execute(stmt)
    teams = result.scalars().all()

    # Create a mapping of team_id to team
    teams_dict = {team.id: team for team in teams}

    # Return teams with role information
    teams_with_roles = [
        {"id": ut.team_id, "name": teams_dict[ut.team_id].name, "role": ut.role}
        for ut in user_teams
        if ut.team_id in teams_dict
    ]

    return {"user_id": str(user.id), "teams": teams_with_roles}
