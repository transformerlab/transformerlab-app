# CLI Deep Dives

This document covers architecture and conventions in the CLI (`cli/`) to help agents work effectively.

## Overview

The CLI is a Python package (`transformerlab-cli`) built with **Typer** for command parsing and **Textual** for interactive TUI screens. It communicates with the API server over HTTP — it does **not** import or depend on the lab-sdk.

The entry point is `lab = transformerlab_cli.main:app`.

## Two UI Paradigms: Typer vs Textual

The CLI has two distinct UI modes. Know when to use each:

### Typer Commands (simple, non-interactive)

Use Typer for commands that take input, call the API, and print output. This covers most commands: `lab job list`, `lab task add`, `lab status`, `lab login`, etc.

Output is formatted with **Rich** — tables, panels, styled text. Commands must support both `--format pretty` (default, Rich-formatted) and `--format json` (machine-readable).

```python
@app.command()
def list(format: str = typer.Option(None)):
    """List all jobs."""
    format_type = format or cli_state.output_format
    response = api.get("/jobs/list")
    if format_type == "json":
        print(json.dumps(response.json()))
    else:
        render_table(response.json(), format_type, columns, title="Jobs")
```

### Textual TUI (interactive, long-running)

Use Textual for interactive screens where the user monitors, navigates, or takes actions in real time. Currently used for the **job monitor** (`lab job monitor`) which shows a live-updating job list with log streaming. This command is for human terminal use only and is not suitable for non-interactive automation or AI agents.

The TUI lives in `commands/job_monitor/` and is a full Textual `App` with:
- Custom widgets (JobDetails, JobLogs, modals)
- Textual CSS styling (`styles.tcss`)
- Background workers via `@work` decorator for auto-refresh
- Tokyo Night theme with custom color variables

**When to use Textual**: Only for screens that need live updates, keyboard navigation, or multi-pane layouts. For everything else, use Typer + Rich.

## Project Structure

```
cli/src/transformerlab_cli/
├── main.py                     # Typer app, command registration, global callback
├── state.py                    # CLIState singleton (output_format)
├── commands/                   # One module per command group
│   ├── login.py                # lab login
│   ├── logout.py               # lab logout
│   ├── whoami.py               # lab whoami
│   ├── status.py               # lab status
│   ├── version.py              # lab version
│   ├── config.py               # lab config
│   ├── install_agent_skill.py  # lab install-agent-skill
│   ├── job.py                  # lab job {list,info,machine-logs,task-logs,request-logs,download,metrics,artifacts,discard,stop,delete,delete-all,monitor,publish ...}
│   ├── task.py                 # lab task {list,init,add,validate,edit,upload,delete,info,queue,gallery,interactive}
│   ├── interactive.py          # implementation for `lab task interactive`
│   ├── provider.py             # lab provider {list,add,info,update,delete,check,enable,disable,set-default,clear-default}
│   ├── team.py                 # lab team {setup, secret} (onboarding wizard + secret subgroup)
│   ├── secret.py               # lab team secret {set,list,keys,delete} (registered as a subgroup of `team`)
│   ├── server.py               # lab server {install,version,start,stop,restart,update}
│   ├── experiment.py           # lab experiment {list,create,delete,set-default,tag,tags}
│   ├── notes.py                # lab notes {show,edit,append}
│   ├── dataset.py              # lab dataset {list,info,delete,edit,upload,download}
│   ├── model.py                # lab model {list,info,create,edit,upload,download,delete}
│   └── job_monitor/            # Textual TUI app (flat layout — widgets and modals sit alongside the app entry point)
│       ├── job_monitor.py      # entry point (`run_monitor`)
│       ├── JobMonitorApp.py
│       ├── JobDetails.py
│       ├── JobLogs.py
│       ├── TaskAddModal.py
│       ├── TaskListModal.py
│       ├── ExperimentSelectModal.py
│       ├── GalleryModal.py
│       ├── InteractiveTaskModal.py
│       ├── util.py
│       └── styles.tcss         # Textual CSS
├── templates/
│   └── task_init/              # files written by `lab task init`
└── util/
    ├── api.py                  # HTTP client wrapper (httpx)
    ├── auth.py                 # API key validation, user/team fetching
    ├── browser_login.py        # loopback browser login flow used by `lab login`
    ├── config.py               # ~/.lab/config.json management
    ├── shared.py               # Constants (BASE_URL, credential paths)
    ├── ui.py                   # Rich console, themes, render_table()
    ├── logo.py                 # ASCII logo printed by the root help
    ├── version_check.py        # update-available check shown above every command
    ├── pypi.py                 # PyPI version helpers
    ├── telemetry.py            # Segment analytics wrapper
    ├── asset_paths.py          # path/glob walking for `dataset/model upload`
    ├── chunked_upload.py       # resumable upload client
    └── chunked_download.py     # resumable download client
```

## API Communication

The CLI uses **httpx** (sync mode) via the wrapper in `util/api.py`:

```python
from transformerlab_cli.util import api

response = api.get("/jobs/list")
response = api.post_json("/tasks/create", json_data={"name": "my-task"})
response = api.delete(f"/jobs/{job_id}")
```

Available methods: `get()`, `post()`, `post_json()`, `post_text()`, `patch()`, `delete()`, `check_server_status()`.

All requests automatically include:
- `Authorization: Bearer <api_key>` header
- `X-Team-Id` header from config

Base URL defaults to `http://alpha.lab.cloud:8338` and is configurable via `lab config set server <url>`.

## Authentication

The CLI uses **API key** auth (not cookies):

1. `lab login` prompts for an API key.
2. The key is validated against `/users/me` on the server.
3. On success, the key is saved to `~/.lab/credentials` and user info to `~/.lab/config.json`.
4. All subsequent requests include the key as a Bearer token.

## Configuration

Stored in `~/.lab/config.json`. Valid keys: `server`, `team_id`, `team_name`, `user_email`, `current_experiment`.

```python
from transformerlab_cli.util.config import get_config, set_config, check_configs

server = get_config("server")
set_config("team_id", "abc-123", output_format)
check_configs(output_format)  # Validates required keys are present
```

### Per-command experiment override

Experiment-scoped commands use `current_experiment` from config by default, but can be overridden for a single invocation with
`--experiment` / `-e`.

Examples:

```bash
# Uses current_experiment from ~/.lab/config.json
lab job list

# One-off override (does not change config)
lab job list --experiment exp-b
lab task add ./my-task -e exp-c
lab notes show -e exp-d
lab job monitor -e exp-z
```

### Team setup and secrets

Team-scoped configuration lives under `lab team`:

- **`lab team setup`** — an onboarding wizard for a new team. Interactively walks through creating a compute provider (delegating to `create_provider_interactively` in `provider.py`), optionally setting it as the team default, and adding secrets. It is fully scriptable for non-interactive use via flags: `--name`, `--type`, `--config`, `--credentials-file`, `--secret KEY=VALUE` (repeatable), `--set-default` / `--no-set-default`, and `--check` / `--no-check` (run the provider health check at the end).
- **`lab team secret`** — secret management lives under `lab team secret` with `set`, `list`, `keys`, and `delete`. (`keys` shows the platform-recognized secret key names.)

`--no-interactive` and `--format json` are global flags on the root callback, so they must come immediately after `lab`, **before** the `team` subgroup.

```bash
# Interactive onboarding
lab team setup

# Non-interactive (the global --no-interactive flag comes right after `lab`)
lab --no-interactive team setup --name my-provider --type ssh \
  --credentials-file ./creds.json --set-default --secret _HF_TOKEN=hf_xxx --check

# Secrets
lab team secret set _HF_TOKEN hf_xxx
lab team secret list
lab team secret keys
lab team secret delete _HF_TOKEN

# JSON output (the global --format json flag also comes right after `lab`)
lab --format json team secret list
```

## Adding a New Command

1. Create `cli/src/transformerlab_cli/commands/mycommand.py`:

```python
import typer
from transformerlab_cli import state as cli_state
from transformerlab_cli.util import api
from transformerlab_cli.util.ui import console, render_table

app = typer.Typer()

@app.command()
def list(format: str = typer.Option(None)):
    """List my things."""
    format_type = format or cli_state.output_format
    response = api.get("/my-things/list")
    if response.status_code != 200:
        console.print("[error]Error:[/error] Failed to fetch things")
        raise typer.Exit(1)
    render_table(response.json(), format_type, ["id", "name"], title="Things")
```

2. Register in `main.py`:

```python
from .commands.mycommand import app as mycommand_app
app.add_typer(mycommand_app, name="mycommand")
```

## Output Conventions

- **Pretty mode** (default): Use Rich — `console.print()`, `render_table()`, `console.status()` spinners.
- **JSON mode** (`--format json`): Print raw JSON via `print(json.dumps(...))`.
- **Errors**: `console.print("[error]Error:[/error] message")` for pretty; `print(json.dumps({"error": "message"}))` for JSON.
- **No results**: Call `exit_with_no_results(format_type, message)` which exits with code 2.
- **Loading**: Use `with console.status("[bold]Loading...", spinner="dots"):` context manager.

## Testing

Tests use `typer.testing.CliRunner` with mocked API responses:

```python
from typer.testing import CliRunner
from unittest.mock import patch
from transformerlab_cli.main import app

runner = CliRunner()

def test_list():
    with patch("transformerlab_cli.util.api.get") as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = [{"id": 1, "name": "test"}]
        result = runner.invoke(app, ["mycommand", "list"])
        assert result.exit_code == 0
```

Run tests: `cd cli && python -m pytest tests/ -v`

## Key Libraries

| Library | Purpose |
|---------|---------|
| `typer` | CLI command framework |
| `httpx` | HTTP client (sync mode) |
| `rich` | Terminal formatting (tables, panels, styled text) |
| `textual` | Interactive TUI apps (job monitor) |
| `pyyaml` | YAML parsing for task definitions |

## Common Mistakes to Avoid

- **Do not import from lab-sdk** — the CLI talks to the API over HTTP, it doesn't use the SDK directly.
- **Do not use asyncio in Typer commands** — the CLI uses httpx in sync mode. Only the Textual TUI uses async (via Textual's own event loop).
- **Always support both output formats** — every command must handle `--format pretty` and `--format json`.
- **Always run CLI tests after changes** — `cd cli && python -m pytest tests/ -v`.
