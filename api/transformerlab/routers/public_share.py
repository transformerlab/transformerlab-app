import os
import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from werkzeug.utils import secure_filename

from lab import Experiment, storage
from lab.dirs import set_organization_id as lab_set_org_id
from transformerlab.routers.experiment.notes import (
    ALLOWED_IMAGE_EXTENSIONS,
    IMAGE_MEDIA_TYPES,
    read_notes,
)
from transformerlab.services import share_link_service
from transformerlab.services import experiment_service
from transformerlab.services import job_service
from transformerlab.db.session import get_async_session

router = APIRouter(prefix="/public/share", tags=["public-share"])

# Matches markdown image syntax and HTML <img src="..."> pointing at notes/assets/<filename>.
# We intentionally constrain to filenames with safe characters.
_ASSET_REF_RE = re.compile(r"notes/assets/([A-Za-z0-9_\-]+\.[A-Za-z0-9]+)")


def _rewrite_asset_paths(markdown: str, token: str) -> str:
    return _ASSET_REF_RE.sub(
        lambda m: f"/public/share/{token}/asset/{m.group(1)}",
        markdown,
    )


async def _resolve_or_404(session: AsyncSession, token: str):
    link = await share_link_service.resolve_token(session, token)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found or revoked")
    return link


async def _build_notes_payload(experiment_id: str, token: str) -> dict[str, Any]:
    markdown = await read_notes(experiment_id)
    return {"markdown": _rewrite_asset_paths(markdown, token)}


async def _build_chart_payload(experiment_id: str) -> dict[str, Any]:
    raw_jobs = await job_service.jobs_get_all(type="REMOTE", status="", experiment_id=experiment_id)
    projected = []
    for j in raw_jobs:
        jd = j.get("job_data") or {}
        projected.append(
            {
                "id": j.get("id"),
                "status": j.get("status"),
                "created_at": j.get("created_at"),
                "job_data": {
                    "score": jd.get("score"),
                    "discard": jd.get("discard"),
                    "description": jd.get("description"),
                    "start_time": jd.get("start_time"),
                    "end_time": jd.get("end_time"),
                    "lower_is_better": jd.get("lower_is_better"),
                },
            }
        )
    return {"jobs": projected}


@router.get("/{token}")
async def get_share(token: str, session: AsyncSession = Depends(get_async_session)):
    link = await _resolve_or_404(session, token)
    # The public route has no X-Team-Id header, so the global middleware leaves
    # org_id unset. Restore it from the link's stored team_id so downstream
    # service calls (Experiment dir resolution, job_service, experiment_service)
    # operate against the owning team's workspace.
    lab_set_org_id(link.team_id)
    try:
        experiment = await experiment_service.experiment_get(link.resource_id)
        if experiment is None:
            raise HTTPException(status_code=404, detail="Experiment not found")

        if link.resource_type == "experiment_notes":
            payload = await _build_notes_payload(link.resource_id, token)
        elif link.resource_type == "experiment_chart":
            payload = await _build_chart_payload(link.resource_id)
        else:
            raise HTTPException(status_code=404, detail="Unsupported share resource")

        experiment_name = experiment.get("name") if isinstance(experiment, dict) else None

        return {
            "resource_type": link.resource_type,
            "experiment_name": experiment_name,
            "payload": payload,
        }
    finally:
        lab_set_org_id(None)


@router.get("/{token}/asset/{filename}")
async def get_asset(
    token: str,
    filename: str,
    session: AsyncSession = Depends(get_async_session),
):
    link = await _resolve_or_404(session, token)
    if link.resource_type != "experiment_notes":
        raise HTTPException(status_code=404, detail="Asset not available for this link")

    safe_name = secure_filename(filename)
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid filename")

    _, ext = os.path.splitext(safe_name.lower())
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")

    lab_set_org_id(link.team_id)
    try:
        exp_obj = Experiment(link.resource_id)
        experiment_dir = await exp_obj.get_dir()
        asset_path = storage.join(experiment_dir, "notes", "assets", safe_name)
        if not await storage.exists(asset_path):
            raise HTTPException(status_code=404, detail="Asset not found")

        async with await storage.open(asset_path, "rb") as f:
            content = await f.read()
    finally:
        lab_set_org_id(None)

    return Response(
        content=content,
        media_type=IMAGE_MEDIA_TYPES.get(ext, "application/octet-stream"),
    )
