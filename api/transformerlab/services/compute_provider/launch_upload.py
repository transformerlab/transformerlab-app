"""Upload a file for provider-backed task file mounts."""

import logging
import uuid

from fastapi import HTTPException
from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.schemas.compute_providers import ProviderTemplateFileUploadResponse
from transformerlab.services.provider_service import get_team_provider
from lab import storage
from lab.dirs import get_workspace_dir

logger = logging.getLogger(__name__)


async def upload_task_file_for_provider(
    session: AsyncSession,
    team_id: str,
    provider_id: str,
    task_id: str,
    file: UploadFile,
) -> ProviderTemplateFileUploadResponse:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        workspace_dir = await get_workspace_dir()
        if not workspace_dir:
            raise RuntimeError("Workspace directory is not configured")

        uploads_root = storage.join(workspace_dir, "uploads", "task")
        await storage.makedirs(uploads_root, exist_ok=True)

        task_dir = storage.join(uploads_root, str(task_id))
        await storage.makedirs(task_dir, exist_ok=True)

        original_name = file.filename or "uploaded_file"
        suffix = uuid.uuid4().hex[:8]
        safe_name = original_name.split("/")[-1].split("\\")[-1]
        stored_filename = f"{safe_name}.{suffix}"
        stored_path = storage.join(task_dir, stored_filename)

        await file.seek(0)
        content = await file.read()
        async with await storage.open(stored_path, "wb") as f:
            await f.write(content)

        return ProviderTemplateFileUploadResponse(
            status="success",
            stored_path=stored_path,
            message="File uploaded successfully",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Template file upload error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to upload template file") from exc
