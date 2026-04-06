"""Sub-router for compute provider launch logic, including sweep dispatch."""

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.routers.auth import get_user_and_team
from transformerlab.schemas.compute_providers import (
    ProviderTemplateLaunchRequest,
    ProviderTemplateFileUploadResponse,
)
from transformerlab.services.compute_provider.launch_template import (
    launch_template_on_provider as launch_template_service,
)
from transformerlab.services.compute_provider.launch_upload import (
    upload_task_file_for_provider as upload_task_file_service,
)

router = APIRouter(prefix="/launch", tags=["launch"])


@router.post("/{task_id}/file-upload", response_model=ProviderTemplateFileUploadResponse)
async def upload_task_file_for_provider(
    provider_id: str,
    task_id: str,
    file: UploadFile = File(...),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload a single file for a provider-backed task."""
    team_id = user_and_team["team_id"]
    return await upload_task_file_service(session, team_id, provider_id, task_id, file)


@router.post("/")
async def launch_template_on_provider(
    provider_id: str,
    request: ProviderTemplateLaunchRequest,
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """Create a REMOTE job and launch a provider-backed cluster."""
    return await launch_template_service(provider_id, request, user_and_team, session)
