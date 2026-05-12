import logging
import os
from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile
from fastapi.responses import Response
from werkzeug.utils import secure_filename

from lab import Experiment, storage
from transformerlab.services.permission_service import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg"}
MAX_ASSET_BYTES = 20 * 1024 * 1024

IMAGE_MEDIA_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}


async def resolve_unique_asset_filename(assets_dir: str, filename: str) -> str:
    """
    Return a collision-free filename inside assets_dir.

    If filename exists, append an incrementing suffix before the extension:
    image.png -> image-1.png -> image-2.png -> ...
    """
    stem, ext = os.path.splitext(filename)
    candidate = filename
    suffix = 1

    while await storage.exists(storage.join(assets_dir, candidate)):
        candidate = f"{stem}-{suffix}{ext}"
        suffix += 1

    return candidate


async def read_notes(experimentId: str) -> str:
    """Read notes content, falling back to legacy readme.md at experiment root."""
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    notes_file = storage.join(experiment_dir, "notes", "readme.md")

    try:
        async with await storage.open(notes_file, "r", encoding="utf-8") as f:
            return await f.read()
    except FileNotFoundError:
        pass

    legacy_file = storage.join(experiment_dir, "readme.md")
    try:
        async with await storage.open(legacy_file, "r", encoding="utf-8") as f:
            return await f.read()
    except FileNotFoundError:
        return ""


async def migrate_if_needed(experimentId: str) -> None:
    """Move legacy readme.md → notes/readme.md on first save if needed."""
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    notes_dir = storage.join(experiment_dir, "notes")
    notes_file = storage.join(notes_dir, "readme.md")
    legacy_file = storage.join(experiment_dir, "readme.md")

    if await storage.exists(notes_file):
        return

    if not await storage.exists(legacy_file):
        return

    async with await storage.open(legacy_file, "r", encoding="utf-8") as f:
        content = await f.read()

    await storage.makedirs(notes_dir, exist_ok=True)

    async with await storage.open(notes_file, "w", encoding="utf-8") as f:
        await f.write(content)

    await storage.rm(legacy_file)


@router.get("")
async def get_notes(experimentId: str):
    return await read_notes(experimentId)


@router.post("")
async def save_notes(
    experimentId: str,
    file_contents: Annotated[str, Body()],
    _: None = Depends(require_permission("experiment", "write", id_param="experimentId")),
):
    await migrate_if_needed(experimentId)
    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    notes_dir = storage.join(experiment_dir, "notes")
    notes_file = storage.join(notes_dir, "readme.md")
    await storage.makedirs(notes_dir, exist_ok=True)
    # Write a space instead of empty string — some storage backends treat empty files as deletions
    async with await storage.open(notes_file, "w", encoding="utf-8") as f:
        await f.write(file_contents if file_contents.strip() else " ")
    return {"message": "OK"}


@router.post("/assets")
async def upload_asset(
    experimentId: str,
    file: UploadFile,
    _: None = Depends(require_permission("experiment", "write", id_param="experimentId")),
):
    filename = secure_filename(file.filename or "")
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f'File type "{ext}" not allowed. Allowed: {", ".join(sorted(ALLOWED_IMAGE_EXTENSIONS))}',
        )

    content = await file.read()
    if len(content) > MAX_ASSET_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 20 MB limit")

    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    assets_dir = storage.join(experiment_dir, "notes", "assets")
    await storage.makedirs(assets_dir, exist_ok=True)

    filename = await resolve_unique_asset_filename(assets_dir, filename)
    asset_path = storage.join(assets_dir, filename)
    async with await storage.open(asset_path, "wb") as f:
        await f.write(content)

    return {"path": f"notes/assets/{filename}"}


@router.get("/assets/{filename}")
async def get_asset(experimentId: str, filename: str):
    filename = secure_filename(filename)
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    _, ext = os.path.splitext(filename.lower())
    if ext not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="File type not allowed")

    exp_obj = Experiment(experimentId)
    experiment_dir = await exp_obj.get_dir()
    asset_path = storage.join(experiment_dir, "notes", "assets", filename)

    if not await storage.exists(asset_path):
        raise HTTPException(status_code=404, detail=f"Asset '{filename}' not found")

    async with await storage.open(asset_path, "rb") as f:
        content = await f.read()

    return Response(
        content=content,
        media_type=IMAGE_MEDIA_TYPES.get(ext, "application/octet-stream"),
    )
