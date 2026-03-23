---
name: transformerlab-cli
description: Use the Transformer Lab CLI to check job status, stream logs, download artifacts, list tasks, manage providers, and query backend state. Use when you need structured data from the Transformer Lab API without going through the browser UI.
---

# Transformer Lab CLI

Use the Transformer Lab CLI to interact with the backend programmatically. This complements the `agent-browser` skill — use the browser for UI interactions (creating experiments, configuring tasks, visual verification) and the CLI for structured data queries (job status, logs, artifacts, task lists).

## Invocation

All commands run from the repo root:

```bash
uv run cli/src/transformerlab_cli/main.py <command> [subcommand] [options]
```

Global option: `--format json` produces machine-readable JSON output. Default is `pretty` with Rich-formatted tables and panels.

## Prerequisites

- `uv` must be installed
- A running Transformer Lab server (default: `http://localhost:8338`)
- **Required for most commands:** `server`, `team_id`, and `user_email` must be configured. Run `login` to set all three automatically.
- **Required for `task` and `job` commands:** a current experiment must also be set

Quick setup:
```bash
uv run cli/src/transformerlab_cli/main.py status
uv run cli/src/transformerlab_cli/main.py login
uv run cli/src/transformerlab_cli/main.py config set current_experiment <experiment_id>
```

## When to Use CLI vs Browser

| Use CLI for | Use Browser for |
|---|---|
| Checking job/task status | Creating experiments |
| Streaming job logs | Configuring tasks via forms |
| Downloading artifacts | Visual UI verification |
| Listing providers | Navigating the app |
| Querying structured data | Anything requiring UI interaction |

Typical flow: use `agent-browser` to create and configure a task in the UI, then switch to CLI to queue it, monitor the job, and download results.

## Common Workflow Patterns

**Monitor a running job:**
```bash
uv run cli/src/transformerlab_cli/main.py job list --format json
uv run cli/src/transformerlab_cli/main.py job logs <job_id> --follow
```

**Queue a task and track it:**
```bash
uv run cli/src/transformerlab_cli/main.py task list --format json
uv run cli/src/transformerlab_cli/main.py task queue <task_id> --no-interactive
uv run cli/src/transformerlab_cli/main.py job list --running --format json
uv run cli/src/transformerlab_cli/main.py job logs <job_id> --follow
```

**Check system state:**
```bash
uv run cli/src/transformerlab_cli/main.py status
uv run cli/src/transformerlab_cli/main.py provider list
uv run cli/src/transformerlab_cli/main.py job list
```

**Download job results:**
```bash
uv run cli/src/transformerlab_cli/main.py job artifacts <job_id>
uv run cli/src/transformerlab_cli/main.py job download <job_id> --file "*.csv" -o ./results
uv run cli/src/transformerlab_cli/main.py job download <job_id> -o ./results
```

**Complement browser testing:**
```bash
# After creating a job via the browser UI...
uv run cli/src/transformerlab_cli/main.py job list --running --format json
uv run cli/src/transformerlab_cli/main.py job info <job_id>
uv run cli/src/transformerlab_cli/main.py job logs <job_id>
```

## Command Overview

See `references/commands.md` for full details on every option.

| Command | Description |
|---|---|
| `status` | Check server connectivity |
| `config` | View/set CLI configuration |
| `login` | Authenticate (also sets server, team_id, user_email, team_name) |
| `logout` | Remove stored API key |
| `whoami` | Show current user and team |
| `version` | Show CLI version |
| `task list` | List tasks in current experiment |
| `task info <id>` | Get task details |
| `task add [dir]` | Add task from local directory or `--from-git` URL |
| `task delete <id>` | Delete a task |
| `task queue <id>` | Queue task on a compute provider |
| `task gallery` | Browse and import from task gallery |
| `task interactive` | Launch interactive task (Jupyter, vLLM, etc.) |
| `job list` | List jobs (optionally `--running` only) |
| `job info <id>` | Get detailed job information |
| `job logs <id>` | Fetch logs (`--follow` to stream) |
| `job artifacts <id>` | List job artifacts |
| `job download <id>` | Download artifacts (`--file` for specific files) |
| `job stop <id>` | Stop a running job |
| `job monitor` | Launch interactive TUI monitor |
| `provider list` | List compute providers |
| `provider info <id>` | Show provider details |
| `provider add` | Add a new compute provider |
| `provider update <id>` | Update provider config |
| `provider delete <id>` | Delete a provider |
| `provider check <id>` | Check provider health |
| `provider enable <id>` | Enable a provider |
| `provider disable <id>` | Disable a provider |

## Tips

- Use `--format json` when you need to parse output (e.g., extracting a job ID from `job list`)
- `job logs --follow` streams continuously until the job exits an active state (RUNNING, LAUNCHING, INTERACTIVE, WAITING)
- `task queue --no-interactive` skips all prompts and uses defaults — ideal for automated workflows
- `job monitor` launches a full TUI — avoid in non-interactive contexts
- Config keys: `server`, `current_experiment`, `user_email`, `team_id`, `team_name`

## Error Handling

- Commands exit with a non-zero status code on failure
- With `--format json`, errors return `{"error": "<message>"}`
- With `--format pretty`, errors print with `[error]Error:[/error]` styling
- If you get "config not set" errors, run `login` first to configure `server`, `team_id`, and `user_email`
