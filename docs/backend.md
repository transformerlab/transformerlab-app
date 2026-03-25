# Backend Deep Dives

This document covers complex flows in the backend (`api/`, `lab-sdk/`) to help agents quickly understand how things work.

## Context Variables (Organization/Team Scoping)

The SDK uses Python `contextvars` to scope filesystem paths to the current organization/team. The key context var is `_current_org_id` in `lab-sdk/src/lab/dirs.py`, set via `lab.dirs.set_organization_id(team_id)`. This affects `get_workspace_dir()`, `get_jobs_dir()`, and all other directory lookups.

**Critical rule**: Context vars do **not** propagate automatically to new threads or to coroutines scheduled via `asyncio.run_coroutine_threadsafe()`. If you run code in a thread executor (e.g. `loop.run_in_executor()`) or schedule a coroutine from a different thread, you must explicitly set the organization context:

```python
# In the coroutine scheduled on the main loop:
lab_dirs.set_organization_id(team_id)
try:
    await job_service.some_operation(...)
finally:
    lab_dirs.set_organization_id(None)
```

Without this, directory lookups will resolve to the wrong path (e.g. `~/.transformerlab/workspace/jobs/` instead of `~/.transformerlab/orgs/<org_id>/workspace/jobs/`) and you'll see errors like "Directory for Job with id 'X' not found".

## Job Execution on Local Providers

When a job is queued for a local provider, it flows through several layers:

1. **Queueing** (`api/transformerlab/routers/compute_provider.py`, ~line 1727): The router builds a `ClusterConfig` and calls `enqueue_local_launch()`, returning immediately with `WAITING` status. For remote (non-local) providers, the command is wrapped with `tfl-remote-trap` to track `live_status` (human-readable strings like `"Remote command started"`/`"Remote command finished"`/`"Remote command crashed"`).

2. **Serialized worker** (`api/transformerlab/services/local_provider_queue.py`): A background `asyncio` worker (`_local_launch_worker`) pulls items from the queue one at a time. It resolves the provider via `get_provider_instance()`, transitions the job to `LAUNCHING`/`INTERACTIVE`, then calls `provider_instance.launch_cluster()` inside a `try/except` block that catches errors, releases quota holds, and marks the job `FAILED`.

3. **Local execution** (`api/transformerlab/compute_providers/local.py`, `LocalProvider.launch_cluster()`): Creates a per-job `uv` virtual environment, runs any setup commands, then launches the job command via `subprocess.Popen` in a detached session with stdout/stderr written to log files in the job directory.

4. **Error handling**: Local providers rely on the queue worker's `try/except` for error capture. Remote providers use the `tfl-remote-trap` SDK helper (`lab-sdk/src/lab/remote_trap.py`) which wraps the command and sets `job_data.live_status` on success or failure.

5. **Plugin harness** (`api/transformerlab/plugin_sdk/plugin_harness.py`): For plugin-based jobs (training, eval), the subprocess entry point that loads and executes plugin logic with its own error/traceback handling.
