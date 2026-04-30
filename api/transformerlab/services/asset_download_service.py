"""Shared download/listing logic for model and dataset routers.

`list_files` walks an asset directory and returns relpath+size dicts.
`stream_file` returns a StreamingResponse honoring HTTP Range for resume.
"""

import os
import re
from typing import Optional

from fastapi import Response
from fastapi.responses import StreamingResponse

from lab import storage
from lab.storage import is_remote_path


class InvalidRelpathError(ValueError):
    """Raised when a relpath would escape its asset directory."""


_RANGE_RE = re.compile(r"^bytes=(\d+)-(\d*)$")


def _sanitize_relpath(relpath: str) -> str:
    if not relpath:
        raise InvalidRelpathError("relpath must be non-empty")
    if "\x00" in relpath:
        raise InvalidRelpathError("relpath must not contain NUL")
    candidate = relpath.replace("\\", "/")
    if candidate.startswith("/"):
        raise InvalidRelpathError("relpath must be relative")
    parts = candidate.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise InvalidRelpathError("relpath has invalid segment")
    return "/".join(parts)


async def _walk_with_sizes(asset_dir: str):
    """Yield (full_path, size) for each file under asset_dir, recursively."""
    stack = [asset_dir]
    while stack:
        d = stack.pop()
        try:
            entries = await storage.ls(d, detail=True)
        except FileNotFoundError:
            continue
        for entry in entries:
            name = entry.get("name") or entry.get("Key")
            if not name:
                continue
            etype = entry.get("type")
            if etype == "directory":
                stack.append(name)
            elif etype == "file":
                yield name, int(entry.get("size") or 0)
            else:
                # Fallback: probe via isfile/isdir when type is missing/unknown.
                if await storage.isdir(name):
                    stack.append(name)
                elif await storage.isfile(name):
                    yield name, int(entry.get("size") or 0)


async def list_files(asset_dir: str) -> list[dict]:
    """Return [{relpath, size}, ...] for every regular file under asset_dir.

    Raises FileNotFoundError if the directory doesn't exist.

    Handles three cases robustly:
      - absolute local paths (tmp_path in tests, production paths)
      - relative local paths (when TFL_HOME_DIR is relative, as in tests)
      - remote URIs (s3://, gs://, abfs://, etc.)
    """
    if not await storage.isdir(asset_dir):
        raise FileNotFoundError(asset_dir)

    if is_remote_path(asset_dir):
        normalized_dir = asset_dir.rstrip("/")
    else:
        normalized_dir = os.path.realpath(asset_dir)

    results: list[dict] = []
    async for full, size in _walk_with_sizes(asset_dir):
        if is_remote_path(full):
            full_norm = full
        else:
            full_norm = os.path.realpath(full)
        prefix = normalized_dir.rstrip("/") + "/"
        if not full_norm.startswith(prefix):
            continue
        rel = full_norm[len(prefix) :]
        rel = rel.replace("\\", "/")
        results.append({"relpath": rel, "size": size})
    return results


async def _open_stream(full_path: str, start: int, length: int, chunk: int = 1024 * 1024):
    """Async generator yielding up to `length` bytes from `full_path` starting at `start`."""
    remaining = length
    async with await storage.open(full_path, "rb") as f:
        if start:
            try:
                await f.seek(start)
            except Exception:
                # Fallback: discard start bytes if seek isn't supported.
                discarded = 0
                while discarded < start:
                    blk = await f.read(min(chunk, start - discarded))
                    if not blk:
                        break
                    discarded += len(blk)
        while remaining > 0:
            blk = await f.read(min(chunk, remaining))
            if not blk:
                break
            remaining -= len(blk)
            yield blk


async def _file_size(full_path: str) -> int:
    """Get the size of a single file via storage.ls(parent, detail=True)."""
    parent = "/".join(full_path.rstrip("/").split("/")[:-1]) or "/"
    leaf = full_path.rstrip("/").split("/")[-1]
    entries = await storage.ls(parent, detail=True)
    for entry in entries:
        name = entry.get("name") or entry.get("Key") or ""
        if name.rstrip("/").split("/")[-1] == leaf:
            return int(entry.get("size") or 0)
    raise FileNotFoundError(full_path)


async def stream_file(asset_dir: str, relpath: str, range_header: Optional[str]):
    """Return a StreamingResponse for asset_dir/<relpath>. Honors Range: bytes=N-[M]."""
    safe = _sanitize_relpath(relpath)
    full = storage.join(asset_dir, *safe.split("/"))
    if not await storage.isfile(full):
        raise FileNotFoundError(full)
    total = await _file_size(full)

    if range_header:
        m = _RANGE_RE.match(range_header.strip())
        if not m:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})
        start = int(m.group(1))
        end_str = m.group(2)
        end = int(end_str) if end_str else total - 1
        if start >= total or end >= total or start > end:
            return Response(status_code=416, headers={"Content-Range": f"bytes */{total}"})
        length = end - start + 1
        return StreamingResponse(
            _open_stream(full, start, length),
            status_code=206,
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(length),
                "Content-Range": f"bytes {start}-{end}/{total}",
                "Accept-Ranges": "bytes",
            },
        )

    return StreamingResponse(
        _open_stream(full, 0, total),
        status_code=200,
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(total),
            "Accept-Ranges": "bytes",
        },
    )
