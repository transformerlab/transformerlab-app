"""
permissions.py

Router for managing per-user resource permission rules.
All endpoints require the caller to be a team owner.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import ResourcePermission
from transformerlab.db import team as db_team
from transformerlab.db.session import get_async_session
from transformerlab.routers.auth import require_team_owner
from transformerlab.services.permission_service import VALID_ACTIONS

router = APIRouter(tags=["permissions"])


class PermissionRuleRequest(BaseModel):
    user_id: str
    resource_type: str
    resource_id: str = "*"
    actions: list[str]

    @field_validator("actions")
    @classmethod
    def validate_actions(cls, v: list[str]) -> list[str]:
        invalid = set(v) - VALID_ACTIONS
        if invalid:
            raise ValueError(f"Invalid actions: {invalid}. Must be subset of {VALID_ACTIONS}")
        return v


class PermissionRuleResponse(BaseModel):
    id: str
    user_id: str
    team_id: str
    resource_type: str
    resource_id: str
    actions: list[str]


@router.get("/teams/{team_id}/permissions")
async def list_team_permissions(
    team_id: str,
    session: AsyncSession = Depends(get_async_session),
    _: dict = Depends(require_team_owner),
):
    """List all permission rules for the team. Owner only."""
    stmt = select(ResourcePermission).where(ResourcePermission.team_id == team_id)
    result = await session.execute(stmt)
    rules = result.scalars().all()
    return {"permissions": [PermissionRuleResponse.model_validate(r.__dict__) for r in rules]}


@router.get("/teams/{team_id}/permissions/user/{user_id}")
async def get_user_permissions(
    team_id: str,
    user_id: str,
    session: AsyncSession = Depends(get_async_session),
    _: dict = Depends(require_team_owner),
):
    """Get all permission rules for a specific team member. Owner only."""
    stmt = select(ResourcePermission).where(
        ResourcePermission.team_id == team_id,
        ResourcePermission.user_id == user_id,
    )
    result = await session.execute(stmt)
    rules = result.scalars().all()
    return {"permissions": [PermissionRuleResponse.model_validate(r.__dict__) for r in rules]}


@router.put("/teams/{team_id}/permissions")
async def upsert_permission_rule(
    team_id: str,
    body: PermissionRuleRequest,
    session: AsyncSession = Depends(get_async_session),
    _: dict = Depends(require_team_owner),
):
    """
    Create or update a permission rule. Upserts on (user_id, team_id, resource_type, resource_id).
    Owner only.
    """
    membership = await db_team.get_user_team_membership(session, body.user_id, team_id)
    if membership is None:
        raise HTTPException(status_code=404, detail="User is not a member of this team")

    stmt = select(ResourcePermission).where(
        ResourcePermission.user_id == body.user_id,
        ResourcePermission.team_id == team_id,
        ResourcePermission.resource_type == body.resource_type,
        ResourcePermission.resource_id == body.resource_id,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.actions = body.actions
        await session.commit()
        await session.refresh(existing)
        return PermissionRuleResponse.model_validate(existing.__dict__)
    else:
        rule = ResourcePermission(
            id=str(uuid.uuid4()),
            user_id=body.user_id,
            team_id=team_id,
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            actions=body.actions,
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)
        return PermissionRuleResponse.model_validate(rule.__dict__)


@router.delete("/teams/{team_id}/permissions/{permission_id}")
async def delete_permission_rule(
    team_id: str,
    permission_id: str,
    session: AsyncSession = Depends(get_async_session),
    _: dict = Depends(require_team_owner),
):
    """Delete a permission rule by ID. Restores full access for that rule's scope. Owner only."""
    stmt = select(ResourcePermission).where(
        ResourcePermission.id == permission_id,
        ResourcePermission.team_id == team_id,
    )
    result = await session.execute(stmt)
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Permission rule not found")

    await session.delete(rule)
    await session.commit()
    return {"message": "Permission rule deleted"}
