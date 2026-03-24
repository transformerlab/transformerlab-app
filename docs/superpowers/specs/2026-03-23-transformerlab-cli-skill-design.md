# Transformer Lab CLI Agent Skill — Design Spec

## Overview

An agent skill at `.agents/skills/transformerlab-cli/` that teaches agents how to use the Transformer Lab CLI to interact with the backend programmatically. Complements the existing `agent-browser` skill — agents use the browser for UI interactions (creating experiments, configuring tasks, visual verification) and the CLI for structured data queries (job status, logs, artifacts, task lists).

## Motivation

When agents test features end-to-end, they often need to:
- Create a job via the web UI, then check its status and read logs
- Queue a task and monitor it through completion
- Download artifacts from completed jobs
- Verify provider configuration

The browser skill handles UI interactions well, but polling for job status or streaming logs is far more efficient via CLI. This skill bridges that gap.

## SKILL.md Frontmatter

```yaml
---
name: transformerlab-cli
description: Use the Transformer Lab CLI to check job status, stream logs, download artifacts, list tasks, manage providers, and query backend state. Use when you need structured data from the Transformer Lab API without going through the browser UI.
---
```

## Skill Structure

```
.agents/skills/transformerlab-cli/
├── SKILL.md              # Main guide: invocation, prerequisites, workflow patterns, command overview
└── references/
    └── commands.md       # Full command reference with all options and examples
```

No templates directory — the workflow patterns in SKILL.md serve that purpose inline.

## SKILL.md Content

### 1. Invocation

All commands run from the repo root via:

```bash
uv run cli/src/transformerlab_cli/main.py <command> [subcommand] [options]
```

Global option: `--format json` produces machine-readable JSON output (default is `pretty` with Rich-formatted tables/panels). Use `--format json` when you need to parse the output programmatically.

### 2. Prerequisites

- `uv` must be installed (used to run the CLI in development)
- A running Transformer Lab server (default: `http://localhost:8338`)
- **Required for most commands:** `server`, `team_id`, and `user_email` must be configured. The easiest way is to run `login`, which sets all three automatically.
- **Required for `task` and `job` commands:** a current experiment must also be set via `config set current_experiment <id>`

Quick setup sequence:
```bash
# Check server is up
uv run cli/src/transformerlab_cli/main.py status

# Log in (sets server, team_id, user_email automatically)
uv run cli/src/transformerlab_cli/main.py login

# Set the current experiment (required for task/job commands)
uv run cli/src/transformerlab_cli/main.py config set current_experiment <experiment_id>
```

### 3. When to Use CLI vs Browser

| Use CLI for | Use Browser for |
|---|---|
| Checking job/task status | Creating experiments |
| Streaming job logs | Configuring tasks via forms |
| Downloading artifacts | Visual UI verification |
| Listing providers | Navigating the app |
| Querying structured data | Anything requiring UI interaction |

The two skills complement each other. A typical flow: use `agent-browser` to create and configure a task in the UI, then switch to CLI to queue it, monitor the job, and download results.

### 4. Common Workflow Patterns

**Monitor a running job:**
```bash
# List jobs to find the ID
uv run cli/src/transformerlab_cli/main.py job list --format json

# Stream logs until job completes
uv run cli/src/transformerlab_cli/main.py job logs <job_id> --follow
```

**Queue a task and track it:**
```bash
# List tasks in the current experiment
uv run cli/src/transformerlab_cli/main.py task list --format json

# Queue a task (non-interactive to skip prompts, use defaults)
uv run cli/src/transformerlab_cli/main.py task queue <task_id> --no-interactive

# Watch the resulting job
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
# List what artifacts exist
uv run cli/src/transformerlab_cli/main.py job artifacts <job_id>

# Download specific files
uv run cli/src/transformerlab_cli/main.py job download <job_id> --file "*.csv" -o ./results

# Download all as zip
uv run cli/src/transformerlab_cli/main.py job download <job_id> -o ./results
```

**Complement browser testing:**
```bash
# After creating a job via the browser UI...

# Poll for job completion
uv run cli/src/transformerlab_cli/main.py job list --running --format json

# Get full job details
uv run cli/src/transformerlab_cli/main.py job info <job_id>

# Check logs for errors
uv run cli/src/transformerlab_cli/main.py job logs <job_id>
```

### 5. Command Overview

Brief table pointing to `references/commands.md` for full details:

| Command | Description |
|---|---|
| `status` | Check server connectivity |
| `config` | View/set CLI configuration (server, current_experiment, etc.) |
| `login` | Authenticate with API key |
| `logout` | Remove stored API key |
| `whoami` | Show current user and team |
| `version` | Show CLI version |
| `task list` | List tasks in current experiment |
| `task info <id>` | Get task details |
| `task add <dir>` | Add task from local directory or `--from-git` URL |
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

### 6. Tips

- Use `--format json` when you need to parse output (e.g., extracting a job ID from `job list`)
- `job logs --follow` streams continuously until the job exits an active state (RUNNING, LAUNCHING, INTERACTIVE, WAITING) — no need to poll manually
- `task queue --no-interactive` skips all prompts and uses defaults — ideal for automated workflows
- The `job monitor` command launches a full TUI — avoid using it in non-interactive contexts
- Config keys: `server`, `current_experiment`, `user_email`, `team_id`, `team_name`

### 7. Error Handling

- Commands exit with a non-zero status code on failure.
- With `--format json`, errors are returned as `{"error": "<message>"}`.
- With `--format pretty`, errors are printed with `[error]Error:[/error]` styling.
- If a command fails with "config not set" errors, run `login` first to configure `server`, `team_id`, and `user_email`.

## commands.md Reference Content

The content below maps directly to the `references/commands.md` file. Full reference for every command with syntax, all options, and brief descriptions.

### Top-Level Commands

**`version`** — Display CLI version.

**`status`** — Check server connectivity.

**`config [args...]`** — View/get/set configuration.
- `config` — list all config values
- `config <key>` or `config get <key>` — get a specific value
- `config set <key> <value>` — set a value
- Valid keys: `server`, `current_experiment`, `user_email`, `team_id`, `team_name`

**`login`** — Authenticate with the server. Also configures `server`, `user_email`, `team_id`, and `team_name` automatically.
- `--api-key <key>` — API key (prompted if omitted)
- `--server <url>` — Server URL (prompted if omitted)

**`logout`** — Remove stored API key.

**`whoami`** — Show current user, team, and server.

### Task Commands (`task <subcommand>`)

**`task list`** — List all remote tasks in current experiment.

**`task info <task_id>`** — Get task details.

**`task add [directory]`** — Add task from a local directory with task.yaml.
- `--from-git <url>` — Import from a Git repository instead
- `--dry-run` — Preview without creating

**`task delete <task_id>`** — Delete a task.

**`task queue <task_id>`** — Queue task on a compute provider.
- `--no-interactive` — Skip prompts. Uses the task's configured `provider_id` if set, otherwise falls back to the first available provider. Parameters use their default values.

**`task gallery`** — Browse the task gallery.
- `--type all|interactive` — Filter gallery type (default: `all`)
- `--import <gallery_id>` — Import a gallery task directly

**`task interactive`** — Launch an interactive task (Jupyter, vLLM, Ollama, etc.).
- `--timeout <seconds>` — Timeout waiting for service readiness (default: 300)

### Job Commands (`job <subcommand>`)

**`job list`** — List all jobs in current experiment.
- `--running` — Show only RUNNING/LAUNCHING/INTERACTIVE jobs

**`job info <job_id>`** — Get detailed job information (status, progress, config, resources, etc.).

**`job logs <job_id>`** — Fetch provider logs.
- `--follow` / `-f` — Stream new lines continuously (polls every 2s, stops when job exits active state)

**`job artifacts <job_id>`** — List job artifacts with filename, path, and size.

**`job download <job_id>`** — Download job artifacts.
- `--file <pattern>` — Glob pattern for specific files (repeatable). Omit to download all as zip.
- `--output` / `-o <dir>` — Output directory (default: current directory)

**`job stop <job_id>`** — Stop a running job.

**`job monitor`** — Launch interactive job monitor TUI. (Not suitable for non-interactive/automated use.)

### Provider Commands (`provider <subcommand>`)

**`provider list`** — List all compute providers.
- `--include-disabled` — Include disabled providers

**`provider info <provider_id>`** — Show provider details.

**`provider add`** — Add a new compute provider (interactive prompts by default).
- `--name <name>` — Provider name
- `--type <type>` — Provider type: `slurm`, `skypilot`, `runpod`, `local` (`local` has no config fields)
- `--config <json>` — Config as JSON string
- `--interactive` / `--no-interactive` — Toggle interactive prompts (default: interactive). Non-interactive requires `--name`, `--type`, and `--config`.

**`provider update <provider_id>`** — Update a compute provider.
- `--name <name>` — New name
- `--config <json>` — Config fields as JSON (merged with existing)
- `--disabled` / `--enabled` — Disable or enable

**`provider delete <provider_id>`** — Delete a compute provider.
- `--yes` / `-y` — Skip confirmation

**`provider check <provider_id>`** — Check connectivity and health.

**`provider enable <provider_id>`** — Enable a disabled provider.

**`provider disable <provider_id>`** — Disable a provider.

## Out of Scope

- The skill does not cover the `job monitor` TUI in depth (it's interactive-only)
- No templates directory — workflow patterns are inline in SKILL.md
- The skill does not duplicate agent-browser guidance — it focuses solely on CLI usage
