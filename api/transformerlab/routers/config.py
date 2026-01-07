from fastapi import APIRouter, Header, Query, Depends
from typing import Optional
import transformerlab.db.db as db
from transformerlab.models.users import current_active_user
from transformerlab.shared.models.models import User


router = APIRouter(prefix="/config", tags=["config"])


@router.get("/get/{key}", summary="")
async def config_get(
    key: str,
    x_team_id: Optional[str] = Header(None, alias="X-Team-Id"),
    user: User = Depends(current_active_user),
):
    """
    Get config value with priority: user-specific -> team-specific -> global.
    """
    user_id = str(user.id) if user else None
    value = await db.config_get(key=key, user_id=user_id, team_id=x_team_id)
    # Return as JSON string to ensure consistent response format
    return value if value is not None else None


@router.get("/set", summary="")
async def config_set(
    k: str,
    v: str,
    x_team_id: Optional[str] = Header(None, alias="X-Team-Id"),
    team_wide: bool = Query(True, description="If True, sets team-wide config. If False, sets user-specific config."),
    user: User = Depends(current_active_user),
):
    """
    Set config value.
    - If team_wide=True: Sets team-wide config (shared with all team members)
    - If team_wide=False: Sets user-specific config (only for this user)
    """
    # Determine user_id: if team_wide, set to None; otherwise use authenticated user's ID
    user_id = None if team_wide else (str(user.id) if user else None)
    await db.config_set(key=k, value=v, user_id=user_id, team_id=x_team_id)
    # Compute team_wide from user_id for response (backward compatibility)
    response_team_wide = user_id is None
    return {"key": k, "value": v, "team_wide": response_team_wide}
