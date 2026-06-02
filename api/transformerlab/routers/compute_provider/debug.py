from typing import Any, Dict

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.db.session import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.compute_provider import storage_probe_service

router = APIRouter(prefix="/debug", tags=["compute_provider"])


@router.post("/storage-probe")
async def launch_storage_probe(
    provider_id: str,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """Launch a probe job that writes a sentinel file to shared storage."""
    return await storage_probe_service.launch_storage_probe(
        provider_id=provider_id,
        user_and_team=user_and_team,
        session=session,
    )


@router.get("/storage-probe/{job_id}")
async def check_storage_probe(
    job_id: str,
    user_and_team=Depends(get_user_and_team),
) -> Dict[str, Any]:
    """Check whether the sentinel file from probe job *job_id* exists in shared storage."""
    team_id = user_and_team["team_id"]
    return await storage_probe_service.check_storage_probe(
        job_id=job_id,
        team_id=team_id,
    )
