from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.models.users import (
    EMAIL_AUTH_ENABLED,
    GITHUB_OAUTH_ENABLED,
    GOOGLE_OAUTH_ENABLED,
    SECRET,
    UserCreate,
    UserRead,
    UserUpdate,
    auth_backend,
    current_active_user,
    fastapi_users,
    get_refresh_strategy,
    get_user_manager,
    github_oauth_client,
    google_oauth_client,
    oauth_backend,
)
from transformerlab.shared.models.models import Team, TeamRole, User, UserTeam
from transformerlab.shared.models.user_model import create_personal_team, get_async_session

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
    user: User = Depends(current_active_user),
    x_team: str | None = Header(None, alias="X-Team-Id"),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Dependency to validate user authentication and team membership.
    Extracts X-Team-Id header and verifies user belongs to that team.
    Returns user, team_id, and role.
    """
    if not x_team:
        raise HTTPException(status_code=400, detail="X-Team-Id header missing")

    # Verify user is associated with the provided team id
    stmt = select(UserTeam).where(
        UserTeam.user_id == str(user.id),
        UserTeam.team_id == x_team,
    )
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()

    if user_team is None:
        raise HTTPException(status_code=403, detail="User is not a member of the specified team")

    return {"user": user, "team_id": x_team, "role": user_team.role}


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
async def get_user_teams(
    user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)
):
    # Check if user has any team associations
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id))
    result = await session.execute(stmt)
    user_teams = result.scalars().all()

    # If user has no team associations, create personal team as owner
    # (dont seed experiment as existing user may already have experiments from old workspace)
    if not user_teams:
        personal_team = await create_personal_team(session, user)
        user_team = UserTeam(
            user_id=str(user.id), team_id=personal_team.id, role=TeamRole.OWNER.value
        )
        session.add(user_team)
        await session.commit()
        await session.refresh(user_team)
        print(f"Created personal team '{personal_team.name}' for existing user {user.email}")
        return {
            "user_id": str(user.id),
            "teams": [
                {"id": personal_team.id, "name": personal_team.name, "role": TeamRole.OWNER.value}
            ],
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
