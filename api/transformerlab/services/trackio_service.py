import asyncio
import os
import subprocess
import sys
from typing import Any, Dict

from fastapi import HTTPException

from lab import HOME_DIR, storage
from lab.job import Job


_TRACKIO_PROCESSES: Dict[str, Dict[str, Any]] = {}


async def start_trackio_for_job(job_id: str, org_id: str | None, experiment_id: str | None) -> Dict[str, str]:
    """
    Start a Trackio dashboard for a given job and return its local URL.

    This uses the job's `trackio_db_artifact_path` (written by the lab SDK) as the
    TRACKIO_DIR for a dedicated Trackio subprocess, so each job can have isolated
    metrics storage.
    """
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
    safe_org = str(org_id or "unknown_org")
    safe_exp = str(experiment_id or "unknown_exp")
    cache_root = os.path.join(HOME_DIR, "temp", "trackio")
    cache_dir = os.path.join(cache_root, f"{safe_org}_{safe_exp}_{job_id}")

    # Ensure cache root exists
    os.makedirs(cache_root, exist_ok=True)

    # Refresh cache for this job: remove any previous copy
    if os.path.exists(cache_dir):
        await storage.rm_tree(cache_dir)

    # Copy directory or file from storage into the local cache directory
    if storage.is_remote_path(source_path):
        # Remote path (e.g., s3://...) - use storage API
        src_is_dir = await storage.isdir(source_path)
        if src_is_dir:
            await storage.copy_dir(source_path, cache_dir)
        else:
            os.makedirs(cache_dir, exist_ok=True)
            dest_file = os.path.join(cache_dir, os.path.basename(source_path))
            await storage.copy_file(source_path, dest_file)
    else:
        # Local filesystem path
        if not os.path.exists(source_path):
            raise HTTPException(
                status_code=404,
                detail=f"Trackio directory not found on server: {source_path}",
            )
        if os.path.isdir(source_path):
            await storage.copy_dir(source_path, cache_dir)
        else:
            os.makedirs(cache_dir, exist_ok=True)
            dest_file = os.path.join(cache_dir, os.path.basename(source_path))
            await storage.copy_file(source_path, dest_file)

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
            "project = os.environ.get('_TRACKIO_PROJECT')",
            "kwargs = {'open_browser': False, 'block_thread': False}",
            "if project:",
            "    kwargs['project'] = project",
            "trackio.show(**kwargs)",
            # trackio.show() prints a line like:",
            # '* Trackio UI launched at: http://127.0.0.1:7860/?write_token=...'",
            # We rely on the parent process to parse this line from stdout.",
            "while True:",
            "    time.sleep(3600)",
        ]
        script = "; ".join(script_lines)

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

    _TRACKIO_PROCESSES[job_id] = result
    return {"url": result["url"]}


async def stop_trackio_for_job(job_id: str) -> None:
    """
    Stop a Trackio dashboard subprocess for the given job, if one is running.
    """
    info = _TRACKIO_PROCESSES.pop(job_id, None)
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

    # Best-effort cleanup of the local cache directory for this job
    if isinstance(cache_dir, str) and cache_dir:
        try:
            if os.path.exists(cache_dir):
                asyncio.get_event_loop().create_task(storage.rm_tree(cache_dir))
        except Exception:
            # Ignore cleanup errors
            pass

