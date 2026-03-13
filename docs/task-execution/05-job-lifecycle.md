# Job Lifecycle & Status

## Status transitions

```
                        ┌──────────┐
                        │ QUEUED   │  (initial, before dispatch)
                        └────┬─────┘
                             │
                        ┌────▼─────┐
                        │ WAITING  │  (in local queue, waiting for turn)
                        └────┬─────┘
                             │
                 ┌───────────┼───────────┐
                 │                       │
           ┌─────▼──────┐        ┌───────▼──────┐
           │ LAUNCHING   │        │ INTERACTIVE  │  (interactive tasks)
           └─────┬──────┘        └───────┬──────┘
                 │                       │
           ┌─────▼──────┐               │
           │  RUNNING    │               │
           └─────┬──────┘               │
                 │                       │
       ┌─────────┼─────────┐            │
       │         │         │            │
  ┌────▼───┐ ┌──▼───┐ ┌───▼────┐  ┌───▼────┐
  │COMPLETE│ │FAILED│ │STOPPED │  │STOPPED │
  └────────┘ └──────┘ └────────┘  └────────┘
```

### Status definitions

| Status | Meaning |
|--------|---------|
| `NOT_STARTED` | Created but not yet queued |
| `QUEUED` | Submitted, waiting for provider |
| `WAITING` | In the local provider queue, waiting for its turn |
| `LAUNCHING` | Setup script running, dependencies installing |
| `INTERACTIVE` | Interactive session active (vscode/jupyter/ssh) |
| `RUNNING` | Main command executing |
| `STOPPING` | Stop requested, shutting down |
| `COMPLETE` | Finished successfully |
| `STOPPED` | Stopped by user |
| `FAILED` | Exited with error |
| `CANCELLED` | Cancelled before running |
| `DELETED` | Removed |
| `UNAUTHORIZED` | Rejected (permissions/quota) |

**Terminal statuses** (no further transitions): `COMPLETE`, `STOPPED`, `FAILED`, `CANCELLED`, `DELETED`, `UNAUTHORIZED`

### How status gets updated

- **Local provider**: the queue worker in `local_provider_queue.py` transitions WAITING → LAUNCHING. The `tfl-remote-trap` wrapper transitions LAUNCHING → RUNNING → COMPLETE/FAILED.
- **Remote providers**: `tfl-remote-trap` (running on the remote machine) calls back to the API to set `live_status` and `status`.

---

## tfl-remote-trap

**Source:** `lab-sdk/src/lab/remote_trap.py`

A command wrapper that reports job status back to the TransformerLab API. Both local and remote jobs use it.

```bash
tfl-remote-trap -- python train.py
```

**Behavior:**
1. Sets `job_data.live_status = "started"` and `status = RUNNING` via API call
2. Executes the wrapped command in a shell, merging stdout/stderr
3. Streams output line-by-line to console AND collects in memory
4. On exit code 0: sets `live_status = "finished"`
5. On non-zero exit: sets `live_status = "crashed"` and `status = FAILED`
6. Writes all collected output to `provider_logs.txt` (best-effort)

---

## Logging

### Local provider logs

| File | Content |
|------|---------|
| `{workspace}/jobs/{job_id}/stdout.log` | All stdout (setup + run) |
| `{workspace}/jobs/{job_id}/stderr.log` | All stderr |
| `{workspace}/jobs/{job_id}/pid` | Process ID of the running job |

Logs are opened **before** setup runs, so you can `tail -f` them while dependencies install.

### Remote provider logs

| File | Content |
|------|---------|
| `{workspace}/jobs/{job_id}/provider_logs.txt` | Written by tfl-remote-trap at job end |

For live logs from remote providers, the API calls the provider's native log-fetching method (SLURM REST API, SkyPilot API, SSH, etc.).

### Log API endpoints

| Endpoint | Behavior |
|----------|----------|
| `GET /jobs/{job_id}/provider_logs` | For remote: reads `provider_logs.txt`; for local: reads stdout/stderr |
| `GET /jobs/{job_id}/provider_logs?live=true` | Fetches live from provider API |

---

## Sweeps

Sweeps run a task multiple times with different parameter combinations.

**Source:** `api/transformerlab/routers/compute_provider.py` (lines ~1034-1250)

### Flow

1. **User submits** with `run_sweeps: true` and a `sweep_config`:
   ```json
   {
     "sweep_config": {
       "learning_rate": [0.001, 0.01, 0.1],
       "batch_size": [16, 32]
     },
     "sweep_metric": "eval/loss",
     "lower_is_better": true
   }
   ```

2. **Parent job created** (`_create_sweep_parent_job()`):
   - Type: `SWEEP`, Status: `RUNNING`
   - Tracks: `sweep_total`, `sweep_completed`, `sweep_running`, `sweep_failed`, `sweep_job_ids`

3. **Child jobs launched** (`_launch_sweep_jobs()`, async background):
   - Generates all combinations via `itertools.product()`
   - For each combo: creates a REMOTE job, merges sweep params with base params, launches
   - Each child stores `parent_job_id` in `job_data`

4. **Progress tracking**:
   - Child completion → `job_service.job_update_sweep_progress()` → updates parent counters
   - Frontend polls parent job to show overall sweep progress

---

## Interactive tasks

Interactive tasks (VS Code, Jupyter, SSH, Ollama, vLLM) differ from regular tasks in several ways.

**Source:** `api/transformerlab/routers/compute_provider.py` (lines ~1548-1782)

### Differences from regular tasks

| Aspect | Regular task | Interactive task |
|--------|-------------|------------------|
| Initial status | QUEUED/WAITING → LAUNCHING | QUEUED/WAITING → INTERACTIVE |
| Completion | Automatic when command exits | User terminates or idle timeout |
| Output | Logs only | Tunnel URL for browser/IDE access |
| Gallery lookup | Task gallery | Interactive gallery for setup/run templates |

### Interactive setup

1. Gallery entry loaded via `find_interactive_gallery_entry()` — provides `setup`, `run`, and `url_patterns`
2. Run command resolved via `resolve_interactive_command()` (may override user command)
3. SSH public key injected for SSH-based access (SSH, RunPod)
4. TransformerLab SDK installed for remote status callbacks

### Tunnel/URL discovery

After the interactive job starts, the frontend polls `GET /jobs/{job_id}/tunnel_info`:
- Parses logs for URL patterns (ngrok URLs for remote, localhost for local)
- Uses regex `url_patterns` from the gallery entry
- Caches discovered URLs in `job_data.tunnel_info_urls`
- Frontend renders clickable links to open VS Code, Jupyter, etc.

---

## Launch progress tracking

Jobs report granular progress via `job_data.launch_progress`:

```json
{
  "phase": "launching_cluster",
  "percent": 50,
  "message": "Installing dependencies...",
  "steps": [
    { "name": "checking_quota", "status": "complete" },
    { "name": "building_config", "status": "complete" },
    { "name": "launching_cluster", "status": "in_progress" }
  ]
}
```

Updated via `job_service.job_update_launch_progress()`. The frontend uses this to show a progress bar during the LAUNCHING phase.

## Debugging tips

- **Job stuck in WAITING**: Check if another local job is running (only one at a time). Look at `local_provider_queue.py` worker status.
- **Job stuck in LAUNCHING**: Check `stdout.log` — setup script may be hanging (e.g., waiting for input, network timeout). 10-minute timeout applies.
- **Job immediately FAILED**: Check `stderr.log` for the setup script error, or `provider_logs.txt` for remote jobs. Common causes: missing dependencies, GPU not found, invalid command.
- **No logs appearing**: For local jobs, logs are at `{workspace}/jobs/{job_id}/stdout.log`. For remote jobs, try `?live=true` to fetch from the provider directly.
- **Interactive task no URL**: Check logs for tunnel URL patterns. For local, look for `http://localhost:*`. For remote, look for ngrok URLs. The `url_patterns` from the interactive gallery entry control what gets matched.
