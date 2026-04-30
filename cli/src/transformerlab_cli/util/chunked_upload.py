"""Reusable chunked-upload-of-one-file helper used by task, model, and dataset commands.

Uses the generic /upload/{init,chunk,status,complete} endpoints in the API. Returns the
upload_id of the assembled file so callers can plumb it through to a domain-specific
endpoint (e.g. /model/fileupload?upload_id=...).
"""

import math
import os
from typing import Optional

from rich.progress import Progress, TaskID

import transformerlab_cli.util.api as api


def upload_one_file(
    local_path: str,
    *,
    server_filename: Optional[str] = None,
    progress: Optional[Progress] = None,
    progress_task: Optional[TaskID] = None,
) -> str:
    """Upload one file via /upload/init → /chunk → /complete and return upload_id.

    Resume-aware: if /upload/{id}/status reports already-received chunks, those
    chunk indices are skipped.

    `server_filename`, if provided, is what the server records in the staged
    metadata (used for filename rather than relpath; relpath is passed
    separately to the domain endpoint).

    `progress` and `progress_task` are optional: when set, the helper advances
    the rich progress task by one per uploaded chunk.
    """
    size = os.path.getsize(local_path)
    filename = server_filename or os.path.basename(local_path)

    init_resp = api.post_json(
        "/upload/init",
        json_data={"filename": filename, "total_size": size},
    )
    if init_resp.status_code != 200:
        raise RuntimeError(f"upload init failed ({init_resp.status_code}): {init_resp.text}")
    init_body = init_resp.json()
    upload_id = init_body["upload_id"]
    chunk_size = init_body["chunk_size"]
    total_chunks = math.ceil(size / chunk_size)

    status_resp = api.get(f"/upload/{upload_id}/status")
    received: set[int] = set(status_resp.json().get("received", [])) if status_resp.status_code == 200 else set()
    if progress is not None and progress_task is not None:
        progress.advance(progress_task, len(received))

    with open(local_path, "rb") as fh:
        for i in range(total_chunks):
            if i in received:
                continue
            fh.seek(i * chunk_size)
            chunk = fh.read(chunk_size)
            put_resp = api.put(
                f"/upload/{upload_id}/chunk?chunk_index={i}",
                content=chunk,
                headers={"Content-Type": "application/octet-stream"},
            )
            if put_resp.status_code != 200:
                raise RuntimeError(f"chunk {i} failed ({put_resp.status_code}): {put_resp.text}")
            if progress is not None and progress_task is not None:
                progress.advance(progress_task, 1)

    complete_resp = api.post_json(
        f"/upload/{upload_id}/complete",
        json_data={"total_chunks": total_chunks},
        timeout=None,
    )
    if complete_resp.status_code != 200:
        raise RuntimeError(f"upload complete failed ({complete_resp.status_code}): {complete_resp.text}")
    return upload_id
