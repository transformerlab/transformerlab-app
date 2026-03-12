# CLI Interactive Tasks

## Summary

Add interactive task support to the Transformer Lab CLI via two paths:

1. **`lab task interactive`** — CLI command: select provider, pick template, configure, launch, poll until ready, print connection info, exit.
2. **TUI integration** — Add interactive gallery support to the existing `lab job monitor` Textual app.

Both use existing backend APIs. No new API endpoints required. One new CLI command (`lab job stop`) is added as a prerequisite.

## CLI Command: `lab task interactive`

### User Flow

```
$ lab task interactive

Select a compute provider:
  1. Local (local)
  2. RunPod (runpod)
> 1

Available interactive tasks:
  1. Jupyter Notebook - Jupyter Lab notebook environment
  2. vLLM Server - vLLM API + Open WebUI
  3. Ollama Server - Ollama + Open WebUI
> 1

Task: Jupyter Notebook
  Title [Jupyter Notebook]: <Enter>

Launching on provider "Local"...
Job 42 created. Waiting for service to be ready...
⠋ Waiting for service... (15s)

✓ Service is ready!

  Jupyter URL: http://localhost:8888/?token=abc123

  Copy this URL to open Jupyter in your browser.

To stop this session: lab job stop 42
To check status:      lab job info 42
```

### Prerequisite: `lab job stop` Command

The CLI currently has no `lab job stop` command. Add it to `cli/src/transformerlab_cli/commands/job.py`:

```python
@app.command("stop")
def stop_job(job_id: str):
```

Calls `GET /experiment/{experiment_id}/jobs/{job_id}/stop` (endpoint already exists in `api/transformerlab/routers/experiment/jobs.py`). Prints confirmation or error. Uses `current_experiment` from config, same as other job commands.

### Implementation

**New file:** `cli/src/transformerlab_cli/commands/interactive.py`

#### Data Flow

```
interactive()
  ├─ provider = _select_provider(experiment_id)
  ├─ template = _select_template(experiment_id, provider)
  ├─ env_vars = _collect_env_params(template, provider)
  ├─ resources = _collect_resources(template)          # remote only; {} for local
  ├─ task_id = _import_task(experiment_id, template, env_vars)
  ├─ job_id = _launch(experiment_id, task_id, provider, resources, env_vars, template)
  ├─ tunnel_info = _poll_until_ready(experiment_id, job_id)
  └─ _print_connection_info(tunnel_info, job_id)
```

`env_vars` is passed to both `_import_task` (stored on the task) and `_launch` (used at launch time for secret resolution).

#### Experiment ID

Retrieved via `get_config("current_experiment")` at the top of `interactive()`, matching the pattern in all existing task/job commands.

#### Functions

- `interactive(timeout: int = 300)` — Main Typer command. `--timeout` option controls poll timeout in seconds (default 300). Orchestrates the full flow shown above.
- `_select_provider(experiment_id: str) -> dict` — GET `/compute_provider/`, present numbered list via Rich prompt, return selected provider dict.
- `_select_template(experiment_id: str, provider: dict) -> dict` — GET `/experiment/{id}/task/gallery/interactive`. **Unwrap response:** gallery is in `response["data"]`, not the top-level response. Filter out templates incompatible with provider (remote-only items hidden for local providers, accelerator compatibility check). Present numbered list, return selected gallery entry.
- `_collect_env_params(gallery_entry: dict, provider: dict) -> dict[str, str]` — Iterate `env_parameters` from gallery entry. For local providers: skip tunnel-related params (e.g., NGROK_AUTH_TOKEN). For remote providers: default to `{{secret._KEY}}` placeholders. Prompt user for required values with defaults pre-filled.
- `_collect_resources(gallery_entry: dict) -> dict` — Only called for remote providers. Prompt for CPUs, memory, disk, accelerators with defaults from gallery entry. Return resource dict.
- `_import_task(experiment_id: str, gallery_entry: dict, env_vars: dict) -> str` — POST `/experiment/{id}/task/gallery/import` with body: `gallery_id` (the gallery entry's `id` field), `experiment_id`, `is_interactive=True`, `env_vars`. Response is `{"status": "success", "message": "...", "id": <task_id>}`; extract and return `id`.
- `_build_interactive_launch_payload(...)` — Build payload for interactive tasks. This is **separate from** `build_launch_payload` in `task.py` (which handles regular tasks). Must include these interactive-specific fields: `subtype: "interactive"`, `interactive_type` (from gallery entry's `interactive_type` field), `interactive_gallery_id` (from gallery entry's `id` field), `local` (boolean, true if provider type is local). `cluster_name` is derived from the gallery entry's `name` field (matching the backend import logic at `task.py:953`). Also includes standard fields: `experiment_id`, `task_id`, `run`, `setup`, `env_vars`, resource fields.
- `_launch(experiment_id: str, task_id: str, provider: dict, resources: dict, env_vars: dict, gallery_entry: dict) -> int` — Call `_build_interactive_launch_payload`, POST `/compute_provider/{provider_id}/task/launch`. Return job ID.
- `_poll_until_ready(experiment_id: str, job_id: int, timeout: int) -> dict` — Poll GET `/experiment/{id}/jobs/{job_id}/tunnel_info` every 3 seconds. Show Rich spinner with elapsed time. Return tunnel_info response when `is_ready` is true. On timeout, print job ID and suggest `lab job info`.
- `_print_connection_info(tunnel_info: dict, job_id: int)` — Parse the `instructions` blocks from tunnel_info. Render URLs, codes, commands, and key-value info using Rich panels/tables. Print stop/status reminder commands.

### Command Registration

Add `@app.command("interactive")` in `commands/task.py` that delegates to the `interactive` module, following the pattern of how `command_job_monitor` in `main.py` delegates to `job_monitor.py`:

```python
from transformerlab_cli.commands.interactive import interactive as interactive_cmd

@app.command("interactive")
def interactive():
    """Launch an interactive task (Jupyter, vLLM, etc.)"""
    interactive_cmd()
```

### API Calls (All Existing)

| Step | Method | Endpoint |
|------|--------|----------|
| List providers | GET | `/compute_provider/` |
| Get interactive gallery | GET | `/experiment/{id}/task/gallery/interactive` |
| Import task from gallery | POST | `/experiment/{id}/task/gallery/import` |
| Launch task | POST | `/compute_provider/{provider_id}/task/launch` |
| Poll tunnel info | GET | `/experiment/{id}/jobs/{jobId}/tunnel_info` |

### Smart Defaults for Env Parameters

Match frontend behavior in `NewInteractiveTaskModal.tsx`:

- **Local provider:** Skip `NGROK_AUTH_TOKEN` entirely (no tunnel needed). Skip any param marked for remote-only if the gallery entry defines that.
- **Remote provider:** Default `NGROK_AUTH_TOKEN` to `{{secret._NGROK_AUTH_TOKEN}}`. Default other secret-backed params to their `{{secret._KEY}}` placeholders.
- **All providers:** Prompt for params with no default. Show default value in brackets so user can press Enter to accept.
- **Password fields:** Use `rich.prompt.Prompt` with `password=True` for fields where `password: true` in the gallery entry.

### Resource Configuration

- **Local providers:** Skip resource prompts entirely; use defaults.
- **Remote providers:** Prompt for CPUs, memory (GB), disk (GB), accelerator type, accelerator count, max nodes, max minutes. Show defaults from gallery entry in brackets.

### Error Handling

- No providers available: print message, exit.
- No compatible templates: print message explaining why (e.g., "No interactive tasks available for local providers"), exit.
- Launch failure: print error from API response, exit with non-zero code.
- Poll timeout (5 min): print job ID and suggest `lab job info <id>` to check manually, exit.
- Server unreachable during poll: print warning, continue polling (match frontend behavior of retrying).

## TUI Integration: Job Monitor

### Changes to Existing Files

**Modified:** `cli/src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py`

- Add keybinding `i` → "Launch Interactive Task" that opens `InteractiveTaskModal`.
- Add to footer/help text.

**Modified:** `cli/src/transformerlab_cli/commands/job_monitor/JobDetails.py`

- When displaying a job with `subtype == "interactive"` and status `INTERACTIVE`, fetch tunnel_info and display connection info (URLs, codes, commands) in a dedicated section below the existing job details.

### New File: `InteractiveTaskModal.py`

**Location:** `cli/src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py`

A Textual `ModalScreen` with a multi-step flow:

1. **Provider selection** — `Select` widget listing providers.
2. **Template selection** — `ListView` filtered by provider compatibility. Updates when provider changes.
3. **Configuration** — Dynamic form fields for env parameters (same smart defaults as CLI). Resource fields shown only for remote providers.
4. **Launch** — "Launch" button. On click: import task, launch, dismiss modal. Job appears in monitor's job list automatically via its existing polling.

Follow the patterns established in `TaskQueueModal` (defined inside `TaskListModal.py`) for form construction and API calls via background threads.

### Connection Info in Job Details

Detect interactive jobs by checking `job_data["subtype"] == "interactive"`. Use `job_data["interactive_type"]` for the specific kind (jupyter, vllm, etc.). Show connection info when job status is `INTERACTIVE`:

- Fetch `/experiment/{id}/jobs/{jobId}/tunnel_info` periodically.
- Before ready: show "Waiting for service..." with status indicator.
- When ready: show connection URLs/commands in a Rich-styled panel within the Textual job details widget.
- Use the `instructions` blocks from tunnel_info for rendering, same as the CLI command's `_print_connection_info` logic.

## Stopping Interactive Sessions

- **CLI:** `lab job stop <job_id>` (new command, see Prerequisite section above)
- **TUI:** The monitor could add a "Stop" button on interactive jobs (minor enhancement to JobDetails).

The `lab task interactive` command prints a reminder: `To stop this session: lab job stop <job_id>`.

## Files Changed/Created

| File | Action | Purpose |
|------|--------|---------|
| `cli/src/transformerlab_cli/commands/interactive.py` | Create | CLI `lab task interactive` command |
| `cli/src/transformerlab_cli/commands/job.py` | Modify | Add `lab job stop` command |
| `cli/src/transformerlab_cli/commands/task.py` | Modify | Register `interactive` subcommand |
| `cli/src/transformerlab_cli/commands/job_monitor/InteractiveTaskModal.py` | Create | TUI modal for interactive task launch |
| `cli/src/transformerlab_cli/commands/job_monitor/JobMonitorApp.py` | Modify | Add `i` keybinding, import modal |
| `cli/src/transformerlab_cli/commands/job_monitor/JobDetails.py` | Modify | Show connection info for interactive jobs |

## Not In Scope

- No new API endpoints (all already exist).
- No local tunnel management from CLI.
- No persistent session tracking beyond the existing job system.
- No team gallery management from CLI (can be added later).
- No interactive gallery items from team gallery (only the built-in interactive gallery for now).
