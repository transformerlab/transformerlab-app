"""Storage proxy service — filesystem operations on behalf of authenticated callers.
"""

import logging
from typing import AsyncIterator

from fastapi.responses import StreamingResponse

from lab import storage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# High-level object helpers (get / put / list)
# ---------------------------------------------------------------------------


async def get_object(path: str) -> StreamingResponse:
    """Stream a remote object back to the caller.

    Raises:
        FileNotFoundError: if the path does not exist (404)
        RuntimeError: on any other storage error (502)
    """
    if not await storage.exists(path):
        raise FileNotFoundError(f"{path} not found")

    async def _stream() -> AsyncIterator[bytes]:
        async with await storage.open(path, "rb") as f:
            while True:
                chunk = await f.read(1024 * 1024)  # 1 MiB
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(_stream(), media_type="application/octet-stream")


async def put_object(path: str, data: bytes) -> None:
    """Write *data* to *path*.

    Raises:
        RuntimeError: on storage error (502)
    """
    try:
        async with await storage.open(path, "wb") as f:
            await f.write(data)
    except Exception as exc:
        raise RuntimeError(f"Storage put failed for {path}: {exc}") from exc


async def list_objects(path: str) -> list[str]:
    """Return child paths under *path*.

    Raises:
        RuntimeError: on storage error (502)
    """
    try:
        return await storage.ls(path, detail=False)
    except FileNotFoundError:
        return []
    except Exception as exc:
        raise RuntimeError(f"Storage ls failed for {path}: {exc}") from exc


# ---------------------------------------------------------------------------
# Filesystem metadata helpers (exists / isdir / isfile / makedirs / rm)
# ---------------------------------------------------------------------------


async def fs_exists(path: str) -> bool:
    """Check whether *path* exists."""
    return await storage.exists(path)


async def fs_isdir(path: str) -> bool:
    """Check whether *path* is a directory."""
    return await storage.isdir(path)


async def fs_isfile(path: str) -> bool:
    """Check whether *path* is a regular file."""
    return await storage.isfile(path)


async def fs_makedirs(path: str, exist_ok: bool = True) -> None:
    """Create directory tree at *path*."""
    await storage.makedirs(path, exist_ok=exist_ok)


async def fs_rm(path: str, recursive: bool = False) -> None:
    """Remove *path* (file or, when *recursive*, directory tree)."""
    if recursive:
        await storage.rm_tree(path)
    else:
        await storage.rm(path)


async def fs_find(path: str) -> list[str]:
    """Recursively list all files under *path*."""
    try:
        return await storage.find(path)
    except Exception as exc:
        raise RuntimeError(f"Storage find failed for {path}: {exc}") from exc
