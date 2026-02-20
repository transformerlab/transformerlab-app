from __future__ import annotations

import asyncio
import os
import subprocess
import sys
from typing import List

from lab import Job


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
    completed = subprocess.run(command_str, shell=True)
    exit_code = completed.returncode

    # Update live_status based on outcome (best-effort).
    if exit_code == 0:
        _set_live_status("finished")
    else:
        _set_live_status("crashed")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
