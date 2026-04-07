"""Storage proxy router.

Provides endpoints that let authenticated callers (remote GPU nodes, users)
perform cloud-storage operations without ever receiving cloud credentials.
The API server performs the real operations using its own credentials via
the ``lab.storage`` abstraction (supports S3, GCS, Azure, local).

Authentication follows the same ``Depends(get_user_and_team)`` pattern used
on all other protected routes (see docs/Auth.md).

Two groups of endpoints:

1. **Object endpoints** — read / write / list objects by full cloud path
   (e.g. ``s3://bucket/key``).
2. **Filesystem metadata endpoints** — exists, isdir, isfile, makedirs, rm,
   find — matching the operations that ``lab.storage`` exposes and that the
   SDK calls from remote nodes.
"""

import logging

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from transformerlab.routers.auth import get_user_and_team
from transformerlab.services import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/storage", tags=["storage"])


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class PathRequest(BaseModel):
    path: str


class MakedirsRequest(BaseModel):
    path: str
    exist_ok: bool = True


class RmRequest(BaseModel):
    path: str
    recursive: bool = False


# ---------------------------------------------------------------------------
# Object endpoints (read / write / list)
# ---------------------------------------------------------------------------


@router.post("/proxy/get")
async def get_object(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> Response:
    """Stream a cloud object to the caller."""
    try:
        return await storage_service.get_object(body.path)
    except FileNotFoundError:
        return JSONResponse(status_code=404, content={"detail": f"Not found: {body.path}"})
    except RuntimeError as exc:
        logger.error("Storage proxy GET failed: %s", exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})


@router.post("/proxy/put")
async def put_object(
    request: Request,
    path: str,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Upload data to a cloud path.  The raw request body is written as-is."""
    data = await request.body()
    try:
        await storage_service.put_object(path, data)
        return JSONResponse(status_code=200, content={"status": "ok"})
    except RuntimeError as exc:
        logger.error("Storage proxy PUT failed: %s", exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})


@router.post("/proxy/ls")
async def list_objects(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """List child paths under a cloud directory."""
    try:
        paths = await storage_service.list_objects(body.path)
        return JSONResponse(status_code=200, content={"paths": paths})
    except RuntimeError as exc:
        logger.error("Storage proxy LS failed: %s", exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})


# ---------------------------------------------------------------------------
# Filesystem metadata endpoints
# ---------------------------------------------------------------------------


@router.post("/proxy/exists")
async def fs_exists(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Check whether a path exists."""
    result = await storage_service.fs_exists(body.path)
    return JSONResponse(content={"result": result})


@router.post("/proxy/isdir")
async def fs_isdir(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Check whether a path is a directory."""
    result = await storage_service.fs_isdir(body.path)
    return JSONResponse(content={"result": result})


@router.post("/proxy/isfile")
async def fs_isfile(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Check whether a path is a file."""
    result = await storage_service.fs_isfile(body.path)
    return JSONResponse(content={"result": result})


@router.post("/proxy/makedirs")
async def fs_makedirs(
    body: MakedirsRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Create a directory tree."""
    await storage_service.fs_makedirs(body.path, exist_ok=body.exist_ok)
    return JSONResponse(content={"status": "ok"})


@router.post("/proxy/rm")
async def fs_rm(
    body: RmRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Remove a file or (recursively) a directory."""
    await storage_service.fs_rm(body.path, recursive=body.recursive)
    return JSONResponse(content={"status": "ok"})


@router.post("/proxy/find")
async def fs_find(
    body: PathRequest,
    _auth: dict = Depends(get_user_and_team),
) -> JSONResponse:
    """Recursively list all files under a path."""
    try:
        paths = await storage_service.fs_find(body.path)
        return JSONResponse(content={"paths": paths})
    except RuntimeError as exc:
        logger.error("Storage proxy FIND failed: %s", exc)
        return JSONResponse(status_code=502, content={"detail": str(exc)})
