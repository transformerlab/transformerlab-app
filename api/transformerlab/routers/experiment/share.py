import os
from typing import Literal

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.routers.auth import get_user_and_team
from transformerlab.services import share_link_service
from transformerlab.services.permission_service import require_permission
from transformerlab.db.session import get_async_session

router = APIRouter(prefix="/share", tags=["share"])

KIND_TO_RESOURCE = {
    "notes": "experiment_notes",
    "chart": "experiment_chart",
}


def _build_public_url(token: str, request: Request) -> str:
    base = os.getenv("FRONTEND_URL") or str(request.base_url)
    return f"{base.rstrip('/')}/#/public/share/{token}"


def _serialize(link, request: Request) -> dict:
    return {
        "token": link.token,
        "url": _build_public_url(link.token, request),
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


@router.get("/{kind}")
async def get_share(
    request: Request,
    experimentId: str,
    kind: Literal["notes", "chart"] = Path(...),
    session: AsyncSession = Depends(get_async_session),
    _: None = Depends(require_permission("experiment", "read", id_param="experimentId")),
):
    resource_type = KIND_TO_RESOURCE[kind]
    link = await share_link_service.get_active_link(session, resource_type, experimentId)
    return _serialize(link, request) if link else None


@router.post("/{kind}")
async def create_share(
    request: Request,
    experimentId: str,
    kind: Literal["notes", "chart"] = Path(...),
    session: AsyncSession = Depends(get_async_session),
    user_and_team: dict = Depends(get_user_and_team),
    _: None = Depends(require_permission("experiment", "write", id_param="experimentId")),
):
    resource_type = KIND_TO_RESOURCE[kind]
    user_id = str(user_and_team["user"].id)
    team_id = str(user_and_team["team_id"])
    link = await share_link_service.mint_link(
        session,
        resource_type=resource_type,
        resource_id=experimentId,
        team_id=team_id,
        user_id=user_id,
    )
    return _serialize(link, request)


@router.delete("/{kind}")
async def delete_share(
    experimentId: str,
    kind: Literal["notes", "chart"] = Path(...),
    session: AsyncSession = Depends(get_async_session),
    _: None = Depends(require_permission("experiment", "write", id_param="experimentId")),
):
    resource_type = KIND_TO_RESOURCE[kind]
    await share_link_service.revoke_active_link(session, resource_type, experimentId)
    return {"ok": True}
