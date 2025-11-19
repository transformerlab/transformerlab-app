from fastapi import APIRouter, Depends, HTTPException, Header
from transformerlab.shared.models.user_model import User, get_async_session, create_default_team
from transformerlab.shared.models.models import Team, UserTeam, TeamRole
from transformerlab.models.users import (
    fastapi_users,
    auth_backend,
    current_active_user,
    UserRead,
    UserCreate,
    UserUpdate,
    get_user_manager,
    get_refresh_strategy,
    jwt_authentication,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from jose import jwt, JWTError

router = APIRouter(tags=["users"])


# Include Auth and Registration Routers
router.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix="/auth/jwt",
    tags=["auth"],
)
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
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
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

    return {"user": user, "team_id": x_team, "role": user_team.role}


@router.get("/test-users/authenticated-route")
async def authenticated_route(user_and_team=Depends(get_user_and_team)):
    user = user_and_team["user"]
    team_id = user_and_team["team_id"]
    return {"message": f"Hello, {user.email}! You are authenticated and acting as part of team {team_id}."}


# To test this, register a new user via /auth/register
# curl -X POST 'http://127.0.0.1:8338/auth/register' \
#  -H 'Content-Type: application/json' \
#  -d '{
#    "email": "test@example.com",
#    "password": "password123"
# }'

# Then
# curl -X POST 'http://127.0.0.1:8338/auth/jwt/login' \
#  -H 'Content-Type: application/x-www-form-urlencoded' \
#  -d 'username=test@example.com&password=password123'

# This will return a token, which you can use to access the authenticated route:
# curl -X GET 'http://127.0.0.1:8338/authenticated-route' \
#  -H 'Authorization: Bearer <YOUR_ACCESS_TOKEN>'


@router.post("/auth/refresh")
async def refresh_access_token(
    refresh_token: str,  # Sent by the client in the request body
    user_manager=Depends(get_user_manager),
):
    try:
        # 1. Decode and Validate the Refresh Token
        # Get a fresh refresh strategy instance and use its secret to decode
        refresh_strategy = get_refresh_strategy()
        payload = jwt.decode(refresh_token, str(refresh_strategy.secret), algorithms=["HS256"])
        user_id = payload.get("sub")

        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid refresh token payload")

        # 2. Get the user object from the database
        user = await user_manager.get(user_id)
        if user is None or not user.is_active:
            raise HTTPException(status_code=401, detail="User inactive or not found")

        # 3. Create a NEW Access Token (using the short-lived strategy from the main JWT)
        new_access_token = jwt_authentication.get_login_response(user)  # Needs custom helper

        return {"access_token": new_access_token["access_token"], "token_type": "bearer"}

    except JWTError:
        raise HTTPException(status_code=401, detail="Expired or invalid refresh token")


@router.get("/users/me/teams")
async def get_user_teams(user: User = Depends(current_active_user), session: AsyncSession = Depends(get_async_session)):
    # Check if user has any team associations
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id))
    result = await session.execute(stmt)
    user_teams = result.scalars().all()

    # If user has no team associations, assign them to default team as owner
    if not user_teams:
        default_team = await create_default_team(session)
        user_team = UserTeam(user_id=str(user.id), team_id=default_team.id, role=TeamRole.OWNER.value)
        session.add(user_team)
        await session.commit()
        await session.refresh(user_team)
        return {"user_id": str(user.id), "teams": [{"id": default_team.id, "name": default_team.name, "role": TeamRole.OWNER.value}]}

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
        for ut in user_teams if ut.team_id in teams_dict
    ]

    return {"user_id": str(user.id), "teams": teams_with_roles}
