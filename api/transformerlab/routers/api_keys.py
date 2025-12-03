"""Router for managing API keys."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel, Field

from transformerlab.shared.models.user_model import get_async_session
from transformerlab.shared.models.models import ApiKey, User, Team
from transformerlab.models.users import current_active_user
from transformerlab.utils.api_key_utils import (
    generate_api_key,
    hash_api_key,
    get_key_prefix,
)
from transformerlab.services.provider_service import (
    validate_team_exists,
    validate_user_exists,
    validate_user_team_membership,
)

router = APIRouter(prefix="/auth/api-keys", tags=["api-keys"])


class ApiKeyCreate(BaseModel):
    name: Optional[str] = Field(None, description="Optional name/description for the API key")
    team_id: Optional[str] = Field(
        None, description="Team ID to scope the key to. If null, key works for all user's teams"
    )
    expires_in_days: Optional[int] = Field(
        None, description="Number of days until expiration. If null, key never expires"
    )


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None


class ApiKeyResponse(BaseModel):
    id: str
    key_prefix: str
    name: Optional[str]
    team_id: Optional[str]
    team_name: Optional[str] = None
    is_active: bool
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ApiKeyCreateResponse(BaseModel):
    """Response when creating an API key - includes the full key (only shown once)."""

    id: str
    api_key: str  # Full key - only shown on creation
    key_prefix: str
    name: Optional[str]
    team_id: Optional[str]
    team_name: Optional[str] = None
    expires_at: Optional[datetime]
    created_at: datetime


@router.post("", response_model=ApiKeyCreateResponse)
async def create_api_key(
    api_key_data: ApiKeyCreate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Create a new API key for the authenticated user.
    The full API key is only returned once on creation.
    """
    user_id = str(user.id)

    # Validate user exists (should always be true, but check for consistency)
    await validate_user_exists(session, user_id)

    # If team_id is provided, validate it exists and user is a member
    team_id = api_key_data.team_id
    team_name = None
    if team_id:
        await validate_team_exists(session, team_id)
        await validate_user_team_membership(session, user_id, team_id)
        # Get team name for response
        stmt = select(Team).where(Team.id == team_id)
        result = await session.execute(stmt)
        team = result.scalar_one_or_none()
        if team:
            team_name = team.name

    # Generate API key
    api_key = generate_api_key()
    key_hash = hash_api_key(api_key)
    key_prefix = get_key_prefix(api_key)

    # Calculate expiration
    expires_at = None
    if api_key_data.expires_in_days:
        expires_at = datetime.utcnow() + timedelta(days=api_key_data.expires_in_days)

    # Create API key record
    api_key_obj = ApiKey(
        key_hash=key_hash,
        key_prefix=key_prefix,
        user_id=user_id,
        team_id=team_id,
        name=api_key_data.name,
        is_active=True,
        expires_at=expires_at,
        created_by_user_id=user_id,
    )
    session.add(api_key_obj)
    await session.commit()
    await session.refresh(api_key_obj)

    return ApiKeyCreateResponse(
        id=api_key_obj.id,
        api_key=api_key,  # Full key - only shown once
        key_prefix=api_key_obj.key_prefix,
        name=api_key_obj.name,
        team_id=api_key_obj.team_id,
        team_name=team_name,
        expires_at=api_key_obj.expires_at,
        created_at=api_key_obj.created_at,
    )


@router.get("", response_model=List[ApiKeyResponse])
async def list_api_keys(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """List all API keys for the authenticated user."""
    user_id = str(user.id)

    stmt = select(ApiKey).where(ApiKey.user_id == user_id).order_by(ApiKey.created_at.desc())
    result = await session.execute(stmt)
    api_keys = result.scalars().all()

    # Get team names for keys that have team_id
    team_ids = {key.team_id for key in api_keys if key.team_id}
    team_names = {}
    if team_ids:
        stmt = select(Team).where(Team.id.in_(team_ids))
        result = await session.execute(stmt)
        teams = result.scalars().all()
        team_names = {team.id: team.name for team in teams}

    return [
        ApiKeyResponse(
            id=key.id,
            key_prefix=key.key_prefix,
            name=key.name,
            team_id=key.team_id,
            team_name=team_names.get(key.team_id) if key.team_id else None,
            is_active=key.is_active,
            last_used_at=key.last_used_at,
            expires_at=key.expires_at,
            created_at=key.created_at,
        )
        for key in api_keys
    ]


@router.get("/{key_id}", response_model=ApiKeyResponse)
async def get_api_key(
    key_id: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Get a specific API key by ID. User can only access their own keys."""
    user_id = str(user.id)

    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Get team name if team_id exists
    team_name = None
    if api_key.team_id:
        stmt = select(Team).where(Team.id == api_key.team_id)
        result = await session.execute(stmt)
        team = result.scalar_one_or_none()
        if team:
            team_name = team.name

    return ApiKeyResponse(
        id=api_key.id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        team_id=api_key.team_id,
        team_name=team_name,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
    )


@router.patch("/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: str,
    api_key_data: ApiKeyUpdate,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Update an API key (name, is_active). User can only update their own keys."""
    user_id = str(user.id)

    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    # Update fields
    update_data = {}
    if api_key_data.name is not None:
        update_data["name"] = api_key_data.name
    if api_key_data.is_active is not None:
        update_data["is_active"] = api_key_data.is_active

    if update_data:
        stmt = update(ApiKey).where(ApiKey.id == key_id).values(**update_data)
        await session.execute(stmt)
        await session.commit()
        await session.refresh(api_key)

    # Get team name if team_id exists
    team_name = None
    if api_key.team_id:
        stmt = select(Team).where(Team.id == api_key.team_id)
        result = await session.execute(stmt)
        team = result.scalar_one_or_none()
        if team:
            team_name = team.name

    return ApiKeyResponse(
        id=api_key.id,
        key_prefix=api_key.key_prefix,
        name=api_key.name,
        team_id=api_key.team_id,
        team_name=team_name,
        is_active=api_key.is_active,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
    )


@router.delete("/{key_id}")
async def delete_api_key(
    key_id: str,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_async_session),
):
    """Delete an API key. User can only delete their own keys."""
    user_id = str(user.id)

    stmt = select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == user_id)
    result = await session.execute(stmt)
    api_key = result.scalar_one_or_none()

    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")

    stmt = delete(ApiKey).where(ApiKey.id == key_id)
    await session.execute(stmt)
    await session.commit()

    return {"message": "API key deleted"}
