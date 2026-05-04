"""
permission_service.py

Service for evaluating resource-level access permissions.

Denylist default: if no rule exists for a user/resource combo, access is allowed.
Lookup priority (most specific wins):
  1. User is owner  → always allow
  2. Exact match    (user, team, resource_type, resource_id)
  3. Type wildcard  (user, team, resource_type, "*")
  4. Global wildcard(user, team, "*",           "*")
  5. No record      → allow
"""

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import ResourcePermission, TeamRole, UserTeam
from transformerlab.shared.models.user_model import get_async_session

VALID_ACTIONS = frozenset({"read", "write", "execute", "delete", "admin"})


async def get_user_team(
    session: AsyncSession,
    user_id: str,
    team_id: str,
) -> UserTeam | None:
    """Fetch the UserTeam membership row for a (user, team) pair, or None."""
    stmt = select(UserTeam).where(
        UserTeam.user_id == user_id,
        UserTeam.team_id == team_id,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def check_permission(
    session: AsyncSession,
    user_id: str,
    team_id: str,
    resource_type: str,
    resource_id: str,
    action: str,
    user_team: UserTeam | None = None,
) -> bool:
    """
    Returns True if the user may perform `action` on the given resource.
    Raises nothing — callers decide how to handle False.
    `action` must be one of VALID_ACTIONS; unknown actions are always denied.

    Callers iterating over many resources for the same (user, team) should
    fetch the membership once via `get_user_team()` and pass it as `user_team`
    to avoid re-running that lookup per item.
    """
    if action not in VALID_ACTIONS:
        return False

    # Step 1: resolve membership + owner shortcut
    if user_team is None:
        user_team = await get_user_team(session, user_id, team_id)

    if user_team is None:
        return False  # Not a member of this team

    if user_team.role == TeamRole.OWNER.value:
        return True  # Owners always have full access

    # Steps 2-4: ACL lookup in specificity order
    candidates = [
        (resource_type, resource_id),  # exact match
        (resource_type, "*"),  # type wildcard
        ("*", "*"),  # global wildcard
    ]

    for rt, rid in candidates:
        stmt = select(ResourcePermission).where(
            ResourcePermission.user_id == user_id,
            ResourcePermission.team_id == team_id,
            ResourcePermission.resource_type == rt,
            ResourcePermission.resource_id == rid,
        )
        result = await session.execute(stmt)
        record = result.scalar_one_or_none()
        if record is not None:
            return action in record.actions

    # Step 5: denylist default — no rule means full access
    return True


def require_permission(resource_type: str, action: str, id_param: str = "id"):
    """
    FastAPI dependency factory. Injects a permission check into a route.

    Args:
        resource_type: "experiment", "model", "dataset", etc.
        action:        one of VALID_ACTIONS: "read", "write", "execute", "delete", "admin"
        id_param:      name of the path or query parameter containing the resource ID.
                       Defaults to "id". Falls back to "*" (type-level check) if absent.

    Usage:
        @router.get("/{id}/delete")
        async def delete_experiment(
            id: str,
            _: None = Depends(require_permission("experiment", "delete")),
        ):
            ...

        @router.get("/model/delete")
        async def model_local_delete(
            model_id: str,
            _: None = Depends(require_permission("model", "delete", id_param="model_id")),
        ):
            ...
    """
    # Deferred import avoids a top-level services → routers circular dependency.
    from transformerlab.routers.auth import get_user_and_team  # noqa: PLC0415

    async def dependency(
        request: Request,
        session: AsyncSession = Depends(get_async_session),
        user_and_team: dict = Depends(get_user_and_team),
    ) -> None:
        user = user_and_team["user"]
        team_id = user_and_team["team_id"]

        # Explicit None checks so a falsy-but-present ID (e.g. "0") is not
        # silently collapsed to the wildcard "*".
        if id_param in request.path_params:
            resource_id = request.path_params[id_param]
        elif id_param in request.query_params:
            resource_id = request.query_params[id_param]
        else:
            resource_id = "*"

        allowed = await check_permission(
            session=session,
            user_id=str(user.id),
            team_id=team_id,
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
        )
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail=f"Permission denied: cannot {action} this {resource_type}",
            )

    return dependency
