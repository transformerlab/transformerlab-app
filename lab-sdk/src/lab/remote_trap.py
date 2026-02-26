from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from typing import List

from lab import Job, storage


async def _set_live_status_async(job_id: str, status: str) -> None:
    """Async helper to set live_status on a job."""
    try:
        job = await Job.get(job_id)
        if job is None:
            return
        await job.update_job_data_field("live_status", status)
    except Exception:
        # This helper should never cause the wrapped command to fail.
        return


def _set_live_status(status: str) -> None:
    """Set live_status on the current remote job, if _TFL_JOB_ID is available."""
    job_id = os.environ.get("_TFL_JOB_ID")
    if not job_id:
        return

    try:
        asyncio.run(_set_live_status_async(job_id, status))
    except RuntimeError:
        # Fallback in case an event loop already exists.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # In the unlikely case we're already in an event loop, schedule the task
                # but don't wait on it (best-effort update).
                loop.create_task(_set_live_status_async(job_id, status))
            else:
                loop.run_until_complete(_set_live_status_async(job_id, status))
        except Exception:
            return


async def _write_provider_logs_async(job_id: str, logs_text: str) -> None:
    """
    Best-effort helper to write combined stdout/stderr logs to the job directory.

    Uses _TFL_JOB_ID to resolve the job directory via lab.dirs.get_job_dir, then
    writes provider_logs.txt using the storage abstraction.
    """
    try:
        # Import inside helper to avoid circular imports at module load time.
        from lab.dirs import get_job_dir

        job_dir = await get_job_dir(job_id)
        log_path = storage.join(job_dir, "provider_logs.txt")

        # Ensure the directory exists (no-op for remote storage that doesn't require mkdirs).
        try:
            await storage.makedirs(job_dir, exist_ok=True)
        except Exception:
            # Some storage backends may not support makedirs for virtual paths; ignore.
            pass

        async with await storage.open(log_path, "w", encoding="utf-8") as f:
            await f.write(logs_text or "")
    except Exception:
        # Never let logging failures break the wrapped command.
        return


def _write_provider_logs(logs_text: str) -> None:
    """Entry-point wrapper for writing provider logs for the current job."""
    job_id = os.environ.get("_TFL_JOB_ID")
    if not job_id or logs_text is None:
        return

    try:
        asyncio.run(_write_provider_logs_async(job_id, logs_text))
    except RuntimeError:
        # Fallback in case an event loop already exists.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(_write_provider_logs_async(job_id, logs_text))
            else:
                loop.run_until_complete(_write_provider_logs_async(job_id, logs_text))
        except Exception:
            return


def main(argv: List[str] | None = None) -> int:
    """
    Wrapper entrypoint for remote jobs.

    Usage (on the remote machine, after environment/setup is ready):
        python -m lab.remote_trap -- <original command...>

    This will:
      - Mark job_data.live_status = "started" when the command begins.
      - Run the original command.
      - Mark job_data.live_status = "finished" on success, or "crashed" on failure.
    """
    args = list(sys.argv[1:] if argv is None else argv)

    # Support "python -m lab.remote_trap -- <cmd ...>" style invocation.
    if "--" in args:
        sep_index = args.index("--")
        cmd_parts = args[sep_index + 1 :]
    else:
        cmd_parts = args

    if not cmd_parts:
        print("Usage: python -m lab.remote_trap -- <command...>", file=sys.stderr)
        return 1

    command_str = " ".join(cmd_parts)

    # Mark job as started.
    _set_live_status("started")

    # Run the original command in the shell so it behaves exactly as submitted.
    # Capture stdout/stderr so we can save a copy to provider_logs.txt while still
    # echoing output to the current process streams.
    completed = subprocess.run(
        command_str,
        shell=True,
        capture_output=True,
        text=True,
    )

    # Echo captured output back to the current stdout/stderr so provider-native logs
    # (e.g., SkyPilot, SLURM, RunPod) still see the same content.
    if completed.stdout:
        try:
            sys.stdout.write(completed.stdout)
            sys.stdout.flush()
        except Exception:
            pass
    if completed.stderr:
        try:
            sys.stderr.write(completed.stderr)
            sys.stderr.flush()
        except Exception:
            pass

    # Combine stdout + stderr into a single text blob and store it alongside the job.
    combined_logs_parts: List[str] = []
    if completed.stdout:
        combined_logs_parts.append(completed.stdout)
    if completed.stderr:
        combined_logs_parts.append(completed.stderr)
    combined_logs = "\n".join(part.rstrip("\n") for part in combined_logs_parts)

    _write_provider_logs(combined_logs)

    exit_code = completed.returncode

    # Update live_status based on outcome (best-effort).
    if exit_code == 0:
        _set_live_status("finished")
    else:
        _set_live_status("crashed")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
