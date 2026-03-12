from fastapi import APIRouter, Depends, Header, HTTPException, Query

from typing import Optional

import transformerlab.db.db as db
from transformerlab.models.users import current_active_user
from transformerlab.services.notification_service import build_notification_request_body
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

    # Validate: user-specific configs require team_id
    if not team_wide and not x_team_id:
        raise HTTPException(status_code=400, detail="X-Team-Id header is required for user-specific configs")

    # Determine user_id: if team_wide, set to None; otherwise use authenticated user's ID
    user_id = None if team_wide else (str(user.id) if user else None)
    await db.config_set(key=k, value=v, user_id=user_id, team_id=x_team_id)
    # Compute team_wide from user_id for response (backward compatibility)
    response_team_wide = user_id is None
    return {"key": k, "value": v, "team_wide": response_team_wide}


@router.post("/test-notification-webhook", summary="Test notification webhook")
async def test_notification_webhook(
    x_team_id: Optional[str] = Header(None, alias="X-Team-Id"),
    user: User = Depends(current_active_user),
):
    """Send a hardcoded sample payload to the user's configured webhook URL."""
    import httpx

    user_id = str(user.id) if user else None
    webhook_url = await db.config_get("notification_webhook_url", user_id=user_id, team_id=x_team_id)

    if not webhook_url:
        raise HTTPException(status_code=400, detail="No webhook URL configured")

    sample_payload = {
        "job_id": "test",
        "status": "COMPLETE",
        "job_type": "TRAIN",
        "experiment_name": "test-experiment",
        "started_at": "2026-03-12 10:00:00",
        "finished_at": "2026-03-12 10:30:00",
        "duration_seconds": 1800,
        "error_message": None,
    }

    body = build_notification_request_body(webhook_url, sample_payload)

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=body)
            response.raise_for_status()
        return {"ok": True}
    except httpx.HTTPStatusError as exc:
        return {
            "ok": False,
            "error": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
        }
    except Exception as exc:
        print(f"Error sending notification webhook: {exc}")
        return {"ok": False, "error": "An error occurred while sending the notification webhook."}
