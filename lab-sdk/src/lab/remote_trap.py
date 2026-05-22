from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import sys
import tempfile
import time
from typing import List, Optional

from lab import Job, storage
from lab.job_status import JobStatus
from lab.profiling import copy_profiling_to_job, finalize_profiling, inject_torch_profiler, maybe_start_profiling


async def _set_live_status_async(job_id: str, status: str) -> None:
    """Async helper to set live_status on a job and mirror failures to job status."""
    try:
        experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
        if not experiment_id:
            return

        job = await Job.get(job_id, experiment_id)
        if job is None:
            return
        await job.update_job_data_field("live_status", status)

        # If the remote command crashed, also mark the job as FAILED.
        if status == "Remote command crashed":
            await job.update_status(JobStatus.FAILED)
    except Exception:
        # This helper should never cause the wrapped command to fail.
        return


async def _set_status_async(job_id: str, status: str) -> None:
    """Async helper to set the high-level job status."""
    try:
        experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
        if not experiment_id:
            return

        job = await Job.get(job_id, experiment_id)
        if job is None:
            return

        # Avoid overriding INTERACTIVE jobs with RUNNING. Interactive jobs are
        # already considered active, and their status transitions are managed
        # by the interactive flow instead of tfl-remote-trap.
        if status == JobStatus.RUNNING:
            try:
                current_status = await job.get_status()
            except Exception:
                current_status = None
            if current_status == JobStatus.INTERACTIVE:
                return

        await job.update_status(status)
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


def _set_status(status: str) -> None:
    """Set high-level job status for the current remote job, if _TFL_JOB_ID is available."""
    job_id = os.environ.get("_TFL_JOB_ID")
    if not job_id:
        return

    try:
        asyncio.run(_set_status_async(job_id, status))
    except RuntimeError:
        # Fallback in case an event loop already exists.
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(_set_status_async(job_id, status))
            else:
                loop.run_until_complete(_set_status_async(job_id, status))
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

        experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
        if not experiment_id:
            return

        job_dir = await get_job_dir(job_id, experiment_id)
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


async def _append_provider_logs_async(job_id: str, logs_text: str) -> None:
    """Best-effort helper to append stdout/stderr chunks to provider_logs.txt."""
    try:
        from lab.dirs import get_job_dir

        experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
        if not experiment_id:
            return

        job_dir = await get_job_dir(job_id, experiment_id)
        log_path = storage.join(job_dir, "provider_logs.txt")

        try:
            await storage.makedirs(job_dir, exist_ok=True)
        except Exception:
            pass

        if not logs_text:
            return

        # Prefer append mode for local filesystems. If append is unsupported on a
        # backend, fall back to read-modify-write.
        try:
            async with await storage.open(log_path, "a", encoding="utf-8") as f:
                await f.write(logs_text)
            return
        except Exception:
            pass

        existing = ""
        if await storage.exists(log_path):
            async with await storage.open(log_path, "r", encoding="utf-8") as f:
                existing = await f.read()
        async with await storage.open(log_path, "w", encoding="utf-8") as f:
            await f.write((existing or "") + logs_text)
    except Exception:
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


def _append_provider_logs(logs_text: str) -> None:
    """Entry-point wrapper for appending provider logs for the current job."""
    job_id = os.environ.get("_TFL_JOB_ID")
    if not job_id or not logs_text:
        return

    try:
        asyncio.run(_append_provider_logs_async(job_id, logs_text))
    except RuntimeError:
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(_append_provider_logs_async(job_id, logs_text))
            else:
                loop.run_until_complete(_append_provider_logs_async(job_id, logs_text))
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
        print("Error: No command provided to run. The task may be missing a 'run' field.", file=sys.stderr)
        _set_live_status("Remote command crashed")
        return 1

    command_str = " ".join(cmd_parts)

    # Mark job as started.
    _set_live_status("Remote command started")
    _set_status(JobStatus.RUNNING)

    job_id = os.environ.get("_TFL_JOB_ID")
    # Profiling writes to a temp dir; we copy it into job's "profiling" folder on exit
    # (and lab.finish/error copy from _TFL_PROFILING_TEMP_DIR when the user calls them).
    profiling_temp_dir: str = ""
    if job_id and os.environ.get("_TFL_PROFILING") == "1":
        try:
            profiling_temp_dir = tempfile.mkdtemp(prefix="tfl_profiling_")
        except OSError:
            profiling_temp_dir = ""

    proc_env = os.environ.copy()
    if profiling_temp_dir:
        proc_env["_TFL_PROFILING_TEMP_DIR"] = profiling_temp_dir
    torch_tmp_dir = inject_torch_profiler(profiling_temp_dir, proc_env) if profiling_temp_dir else ""

    # Run the original command in the shell so it behaves exactly as submitted.
    # Stream output line-by-line to avoid buffering large logs in memory (training
    # jobs can produce GBs of output). stdout and stderr are merged into a single
    # stream (stderr redirected to stdout) so we can tee to both the console and
    # the provider_logs.txt file.
    log_lines: List[str] = []
    pending_log_lines: List[str] = []
    periodic_flush_interval_s = max(0.5, float(os.getenv("TFL_PROVIDER_LOG_FLUSH_INTERVAL_SECONDS", "2.0")))
    periodic_flush_min_lines = max(1, int(os.getenv("TFL_PROVIDER_LOG_FLUSH_MIN_LINES", "25")))
    last_periodic_flush_ts = time.monotonic()
    start_time = time.monotonic()
    proc: Optional[subprocess.Popen] = None
    profiling_thread = None

    def _terminate_child_process() -> None:
        if proc is None or proc.poll() is not None:
            return
        try:
            # Linux/Unix: terminate the entire process group so child shells and
            # descendants also receive the stop signal.
            os.killpg(proc.pid, signal.SIGTERM)
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass

    def _handle_stop_signal(signum, _frame) -> None:  # type: ignore[no-untyped-def]
        _set_live_status(f"Remote command received signal {signum}; shutting down")
        _terminate_child_process()

    previous_sigterm = signal.getsignal(signal.SIGTERM)
    previous_sigint = signal.getsignal(signal.SIGINT)
    signal.signal(signal.SIGTERM, _handle_stop_signal)
    signal.signal(signal.SIGINT, _handle_stop_signal)

    try:
        # Fresh file per run so repeated restarts don't duplicate stale content.
        _write_provider_logs("")

        popen_kwargs = {
            "shell": True,
            "stdout": subprocess.PIPE,
            "stderr": subprocess.STDOUT,
            "text": True,
            "env": proc_env if torch_tmp_dir else None,
        }
        if os.name != "nt":
            popen_kwargs["preexec_fn"] = os.setsid

        proc = subprocess.Popen(command_str, **popen_kwargs)

        # Start profiling sidecar thread (no-op if _TFL_PROFILING is not set).
        profiling_thread = maybe_start_profiling(proc.pid, profiling_temp_dir) if profiling_temp_dir else None

        assert proc.stdout is not None
        for line in proc.stdout:
            try:
                sys.stdout.write(line)
                sys.stdout.flush()
            except Exception:
                pass
            log_lines.append(line)
            pending_log_lines.append(line)

            now = time.monotonic()
            should_flush = (
                len(pending_log_lines) >= periodic_flush_min_lines
                or (now - last_periodic_flush_ts) >= periodic_flush_interval_s
            )
            if should_flush:
                _append_provider_logs("".join(pending_log_lines))
                pending_log_lines.clear()
                last_periodic_flush_ts = now

        exit_code = proc.wait()
    finally:
        # Restore prior handlers for good hygiene in case this process hosts other code.
        signal.signal(signal.SIGTERM, previous_sigterm)
        signal.signal(signal.SIGINT, previous_sigint)
    wall_time = time.monotonic() - start_time

    if pending_log_lines:
        _append_provider_logs("".join(pending_log_lines))
        pending_log_lines.clear()

    combined_logs = "".join(log_lines)
    # Final overwrite keeps backwards compatibility for consumers expecting the
    # complete file content to exactly match captured output.
    _write_provider_logs(combined_logs)

    # Finalise profiling: stop sampler thread and write report to profiling temp dir.
    finalize_profiling(profiling_thread, profiling_temp_dir, wall_time)

    # Copy profiling output from temp dir into job's profiling folder (same as lab.finish/error).
    if profiling_temp_dir and job_id:
        try:
            experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
            asyncio.run(copy_profiling_to_job(profiling_temp_dir, job_id, experiment_id=experiment_id))
        except Exception:
            pass
        try:
            import shutil

            shutil.rmtree(profiling_temp_dir, ignore_errors=True)
        except Exception:
            pass

    # Clean up torch sitecustomize temp dir (best-effort).
    if torch_tmp_dir:
        try:
            import shutil

            shutil.rmtree(torch_tmp_dir, ignore_errors=True)
        except Exception:
            pass

    # Update live_status based on outcome (best-effort).
    if exit_code == 0:
        _set_live_status("Remote command finished")
    else:
        _set_live_status("Remote command crashed")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
