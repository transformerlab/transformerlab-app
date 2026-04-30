"""Streaming download helper with HTTP Range-based resume."""

import os
from typing import Optional

import httpx
from rich.progress import Progress, TaskID

from transformerlab_cli.util.api import _request_headers
from transformerlab_cli.util.shared import BASE_URL


def _build_client() -> httpx.Client:
    """Return a configured httpx.Client. Indirected so tests can patch it."""
    return httpx.Client(timeout=None)


def download_one_file(
    path: str,
    *,
    target_path: str,
    server_size: int,
    progress: Optional[Progress] = None,
    progress_task: Optional[TaskID] = None,
    chunk_bytes: int = 1024 * 1024,
) -> None:
    """Download `path` (an API path; URL is BASE_URL+path) to `target_path`.

    Behaviours:
    - If target exists and its size matches `server_size`: skip (and advance progress).
    - If target exists with size < server_size: resume via Range: bytes=<size>-.
    - If target exists with size > server_size: delete and start over.
    - On any other error: raise RuntimeError.
    """
    existing = os.path.getsize(target_path) if os.path.isfile(target_path) else 0

    if existing == server_size:
        if progress is not None and progress_task is not None:
            progress.advance(progress_task, server_size)
        return

    if existing > server_size:
        os.remove(target_path)
        existing = 0

    headers = dict(_request_headers())
    if existing > 0:
        headers["Range"] = f"bytes={existing}-"

    if progress is not None and progress_task is not None and existing:
        progress.advance(progress_task, existing)

    os.makedirs(os.path.dirname(target_path) or ".", exist_ok=True)
    mode = "ab" if existing > 0 else "wb"

    url = f"{BASE_URL()}{path}"
    client = _build_client()
    try:
        with client.stream("GET", url, headers=headers) as resp:
            if resp.status_code not in (200, 206):
                raise RuntimeError(f"download failed ({resp.status_code}): {resp.read()!r}")
            with open(target_path, mode) as out:
                for chunk in resp.iter_bytes(chunk_size=chunk_bytes):
                    if not chunk:
                        continue
                    out.write(chunk)
                    if progress is not None and progress_task is not None:
                        progress.advance(progress_task, len(chunk))
    finally:
        client.close()

    final_size = os.path.getsize(target_path)
    if final_size != server_size:
        raise RuntimeError(f"size mismatch after download: expected {server_size}, got {final_size}")
