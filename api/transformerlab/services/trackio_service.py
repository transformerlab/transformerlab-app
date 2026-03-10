import asyncio
import os
import shutil
import subprocess
import sys
from typing import Any, Dict

from fastapi import HTTPException

from lab import HOME_DIR, storage
from lab.job import Job

from werkzeug.utils import secure_filename


_TRACKIO_PROCESSES: Dict[str, Dict[str, Any]] = {}


async def start_trackio_for_job(job_id: str, org_id: str | None, experiment_id: str | None) -> Dict[str, str]:
    """
    Start a Trackio dashboard for a given job and return its local URL.

    This uses the job's `trackio_db_artifact_path` (written by the lab SDK) as the
    TRACKIO_DIR for a dedicated Trackio subprocess, so each job can have isolated
    metrics storage.
    """
    # Sanitize identifiers before they are used in any filesystem paths or keys.
    safe_job_id = secure_filename(job_id)
    if not safe_job_id:
        raise HTTPException(status_code=400, detail="Invalid job_id for Trackio")
    safe_org_id = secure_filename(org_id) if org_id else ""
    safe_experiment_id = secure_filename(experiment_id) if experiment_id else ""

    try:
        job = await Job.get(job_id)
    except Exception:
        job = None

    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job_data = await job.get_job_data()
    if not isinstance(job_data, dict):
        raise HTTPException(status_code=400, detail="Job data is not a dictionary")

    source_path = job_data.get("trackio_db_artifact_path")
    if not source_path:
        raise HTTPException(
            status_code=404,
            detail="Trackio metrics not found for this job (trackio_db_artifact_path missing)",
        )

    # If there's already a Trackio process for this job, just return its URL
    existing = _TRACKIO_PROCESSES.get(job_id)
    if existing and isinstance(existing.get("url"), str):
        return {"url": existing["url"]}

    project = job_data.get("trackio_project")

    # Always run Trackio from a local temporary copy of the metrics directory.
    # This works for both local and remote storage backends. Use HOME_DIR so the
    # cache is guaranteed to be on the local filesystem (even when workspace_dir
    # points to remote storage).
    cache_root = os.path.join(HOME_DIR, "temp", "trackio")
    cache_dir = os.path.join(cache_root, f"{safe_org_id}_{safe_experiment_id}_{safe_job_id}")

    # Normalize and validate the cache directory to ensure it stays under cache_root.
    cache_root_real = os.path.realpath(cache_root)
    cache_dir_safe = os.path.realpath(cache_dir)
    if not (cache_dir_safe == cache_root_real or cache_dir_safe.startswith(cache_root_real + os.sep)):
        raise HTTPException(status_code=400, detail="Invalid cache directory for Trackio job")

    # Ensure cache root exists
    os.makedirs(cache_root_real, exist_ok=True)

    # Refresh cache for this job: remove any previous copy
    if os.path.exists(cache_dir_safe):
        await storage.rm_tree(cache_dir_safe)

    # Copy directory or file into the local cache directory without going through
    # the global storage backend for the destination (which may be remote).
    if storage.is_remote_path(source_path):
        # Remote path (e.g., s3://...) - stream from remote FS into local files
        src_fs, _ = storage._get_fs_for_path(source_path)  # type: ignore[attr-defined]

        def _copy_remote_tree() -> None:
            os.makedirs(cache_dir_safe, exist_ok=True)
            try:
                src_files = src_fs.find(source_path)
            except Exception:
                src_files = []
                for _dirpath, _dirs, files in src_fs.walk(source_path):
                    for f in files:
                        src_files.append(os.path.join(_dirpath, f))

            for raw_src_file in src_files:
                src_file = raw_src_file
                rel_path = src_file[len(source_path) :].lstrip("/").lstrip("\\")
                dest_file = os.path.join(cache_dir_safe, rel_path)
                dest_parent = os.path.dirname(dest_file)
                if dest_parent:
                    os.makedirs(dest_parent, exist_ok=True)
                with src_fs.open(src_file, "rb") as r, open(dest_file, "wb") as w:
                    shutil.copyfileobj(r, w)

        await asyncio.to_thread(_copy_remote_tree)
    else:
        # Local filesystem path -> local cache dir
        # Constrain local source paths to live under the lab HOME_DIR to avoid
        # copying from arbitrary locations on the filesystem.
        safe_root = os.path.realpath(HOME_DIR)
        normalized_source_path = os.path.realpath(source_path)
        try:
            # Ensure the normalized source path is within the safe root.
            if os.path.commonpath([safe_root, normalized_source_path]) != safe_root:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid Trackio directory path",
                )
        except ValueError:
            # os.path.commonpath can raise ValueError on different drive letters
            raise HTTPException(
                status_code=400,
                detail="Invalid Trackio directory path",
            )

        if not os.path.exists(normalized_source_path):
            raise HTTPException(
                status_code=404,
                detail=f"Trackio directory not found on server: {source_path}",
            )
        if os.path.isdir(normalized_source_path):
            # shutil.copytree with dirs_exist_ok to merge into an existing cache_dir
            shutil.copytree(normalized_source_path, cache_dir_safe, dirs_exist_ok=True)
        else:
            os.makedirs(cache_dir_safe, exist_ok=True)
            dest_file = os.path.join(cache_dir_safe, os.path.basename(normalized_source_path))
            shutil.copy2(normalized_source_path, dest_file)

    def _launch_trackio_subprocess() -> Dict[str, Any]:
        """
        Launch a small Python subprocess that:
        - Sets TRACKIO_DIR so Trackio reads metrics from the job's artifact path.
        - Calls trackio.show(open_browser=False, block_thread=False, host='127.0.0.1', project=...)
        - Prints the local URL to stdout, then sleeps to keep the server alive.

        Returns a dict with the subprocess handle and the discovered URL.
        """
        env = os.environ.copy()
        env["TRACKIO_DIR"] = cache_dir
        if isinstance(project, str) and project.strip():
            env["_TRACKIO_PROJECT"] = project.strip()

        script_lines = [
            "import os, sys, time",
            "import trackio",
            "kwargs = {'open_browser': False, 'block_thread': False, 'host': '0.0.0.0'}",
            "trackio.show(**kwargs)",
            "while True:",
            "    time.sleep(3600)",
        ]
        # Use newlines so the while loop has proper Python syntax
        script = "\n".join(script_lines)

        proc = subprocess.Popen(
            [sys.executable, "-c", script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
        )

        if proc.stdout is None:
            raise RuntimeError("Failed to read Trackio output from subprocess stdout")

        # Read stdout until we find the line where Trackio announces the UI URL.
        url: str | None = None
        marker = "Trackio UI launched at:"
        while True:
            line = proc.stdout.readline()
            if not line:
                break
            if marker in line:
                # Extract the URL portion after the marker
                url = line.split(marker, 1)[1].strip()
                break

        if not url:
            # If we couldn't read a URL, terminate the process and raise
            proc.terminate()
            raise RuntimeError("Trackio subprocess did not output a dashboard URL")

        return {"proc": proc, "url": url, "cache_dir": cache_dir}

    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(None, _launch_trackio_subprocess)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start Trackio dashboard: {e}",
        ) from e

    # Use sanitized job identifier as the key for tracking subprocess state.
    safe_job_id = secure_filename(job_id) or job_id
    _TRACKIO_PROCESSES[safe_job_id] = result
    return {"url": result["url"]}


async def stop_trackio_for_job(job_id: str) -> None:
    """
    Stop a Trackio dashboard subprocess for the given job, if one is running.
    """
    safe_job_id = secure_filename(job_id) or job_id
    info = _TRACKIO_PROCESSES.pop(safe_job_id, None)
    if not info:
        return

    proc = info.get("proc")
    cache_dir = info.get("cache_dir")

    if isinstance(proc, subprocess.Popen):
        try:
            proc.terminate()
        except Exception:
            # Best-effort; ignore termination errors
            pass
    # Best-effort cleanup of the local cache directory for this job.
    # This cache is always on the local filesystem (under HOME_DIR), so we use
    # shutil.rmtree directly rather than going through the storage backend.
    if isinstance(cache_dir, str) and cache_dir:
        try:
            if os.path.exists(cache_dir):
                shutil.rmtree(cache_dir, ignore_errors=True)
        except Exception:
            # Ignore cleanup errors
            pass
