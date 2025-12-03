"""API Key authentication helpers."""

from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from datetime import datetime

from transformerlab.shared.models.models import ApiKey, User, UserTeam
from transformerlab.utils.api_key_utils import verify_api_key, is_key_expired, validate_api_key_format
from transformerlab.shared.models.user_model import create_personal_team

security = HTTPBearer(auto_error=False)


def extract_api_key_from_request(request: Request) -> Optional[str]:
    """
    Extract API key from Authorization header.
    Returns the API key string if found, None otherwise.
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        return None

    # Check for Bearer token format
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        # Check if it looks like an API key (starts with "tl-")
        if validate_api_key_format(token):
            return token

    return None


async def validate_api_key_and_get_user(
    api_key: str, session: AsyncSession
) -> tuple[User, Optional[str], Optional[str]]:
    """
    Validate an API key and return the associated user, team_id, and role.

    Returns:
        tuple: (user, team_id, role) where team_id and role may be None
    """
    # Since Argon2 hashes are salted (non-deterministic), we can't do direct hash lookup
    # We need to verify against stored hashes. Use key_prefix to narrow down candidates for performance.
    from transformerlab.utils.api_key_utils import get_key_prefix

    key_prefix = get_key_prefix(api_key)

    # Get API keys matching the prefix (narrows down candidates significantly)
    stmt = select(ApiKey).where(ApiKey.key_prefix == key_prefix)
    result = await session.execute(stmt)
    candidate_keys = result.scalars().all()

    # If no candidates found by prefix, try all active keys (fallback for keys created before prefix logic)
    if not candidate_keys:
        stmt = select(ApiKey).where(ApiKey.is_active)
        result = await session.execute(stmt)
        candidate_keys = result.scalars().all()

    # Find the matching API key by verifying against each candidate hash
    api_key_obj = None
    for idx, key_obj in enumerate(candidate_keys):
        try:
            if verify_api_key(api_key, key_obj.key_hash):
                api_key_obj = key_obj
                break

        except Exception as e:
            print(f"Exception during verification: {type(e).__name__}: {e}")
            # If verification fails (e.g., hash format mismatch), continue to next candidate
            continue

    if not api_key_obj:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Check if key is active
    if not api_key_obj.is_active:
        raise HTTPException(status_code=401, detail="API key is inactive")

    # Check if key is expired
    if is_key_expired(api_key_obj.expires_at):
        raise HTTPException(status_code=401, detail="API key has expired")

    # Get the user
    stmt = select(User).where(User.id == api_key_obj.user_id)
    result = await session.execute(stmt)
    user = result.unique().scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=401, detail="User associated with API key not found")

    # Check if user is active
    if not user.is_active:
        raise HTTPException(status_code=401, detail="User account is inactive")

    # Update last_used_at
    api_key_obj.last_used_at = datetime.utcnow()
    session.add(api_key_obj)
    await session.commit()

    # Return user and team_id (if scoped to a team)
    return user, api_key_obj.team_id, None  # role will be determined later


async def get_user_personal_team_id(session: AsyncSession, user: User) -> str:
    """
    Get the user's personal team ID. Creates one if it doesn't exist.
    """
    # Check if user has any team associations
    stmt = select(UserTeam).where(UserTeam.user_id == str(user.id))
    result = await session.execute(stmt)
    user_teams = result.scalars().all()

    if not user_teams:
        # Create personal team
        personal_team = await create_personal_team(session, user)
        user_team = UserTeam(user_id=str(user.id), team_id=personal_team.id, role="owner")
        session.add(user_team)
        await session.commit()
        return personal_team.id

    # Return the first team (typically the personal team)
    return user_teams[0].team_id


async def determine_team_id_from_request(request: Request, session: AsyncSession) -> Optional[str]:
    """
    Determine the team_id from the request (middleware helper).
    Checks X-Team-Id header first, then API key if no header.

    Returns:
        team_id if determined, None otherwise (will be handled by dependency)
    """
    # First, check if X-Team-Id header is provided
    x_team = request.headers.get("X-Team-Id")
    if x_team:
        return x_team

    # No X-Team-Id header - check for API key
    api_key = extract_api_key_from_request(request)
    if not api_key:
        # No API key either - return None (JWT will require X-Team-Id in dependency)
        return None

    # We have an API key - validate it and get team_id
    try:
        user, api_key_team_id, _ = await validate_api_key_and_get_user(api_key, session)

        if api_key_team_id:
            # API key is scoped to a specific team
            return api_key_team_id
        else:
            # API key works for all teams, but no X-Team-Id - use personal team
            return await get_user_personal_team_id(session, user)
    except HTTPException:
        # API key validation failed - return None (will be handled by dependency)
        return None
