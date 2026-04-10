# Transformer Lab CLI — Command Reference

Full reference for every CLI command. All commands are invoked via:

```bash
lab <command> [subcommand] [options]
```

Global option available on all commands:
- `--format pretty|json` — Output format (default: `pretty`). **Must come before the subcommand.**

```bash
# Correct
lab --format json task list

# Wrong — flag will be ignored
lab task list --format json
```

---

## Top-Level Commands

### `version`

Display CLI version and check for updates.

**JSON output:**
```json
{"version": "0.0.6", "update_available": false}
```

### `status`

Check server connectivity and configuration status.

**JSON output:**
```json
{"server": "http://localhost:8338", "connected": true, "server_version": "0.33.0"}
```

### `config [args...]`

View, get, and set configuration values.

```bash
lab config                        # List all config values
lab config <key>                  # Get a specific value
lab config get <key>              # Get a specific value (explicit)
lab config set <key> <value>      # Set a value
```

Valid keys: `server`, `current_experiment`, `user_email`, `team_id`, `team_name`

### `login`

Authenticate with the server. Also configures `server`, `user_email`, `team_id`, and `team_name` automatically.

| Option | Description |
|---|---|
| `--api-key <key>` | API key (prompted if omitted) |
| `--server <url>` | Server URL (prompted if omitted) |

### `logout`

Remove stored API key.

### `whoami`

Show current user, team, and server.

**JSON output:**
```json
{"email": "user@example.com", "team_id": "...", "team_name": "...", "server": "http://localhost:8338"}
```

---

## Task Commands

**All task commands require `current_experiment` to be set.**

### `task list`

List all remote tasks in the current experiment.

**JSON output:**
```json
[{"id": 1, "name": "my-task", "type": "TRAINING", "status": "READY", ...}]
```

### `task info <task_id>`

Get details for a specific task.

**JSON output:**
```json
{"id": 1, "name": "my-task", "type": "TRAINING", "config": {...}, ...}
```

### `task add [directory]`

Add a new task from a local directory containing `task.yaml`, or from a Git repository.

| Option | Description |
|---|---|
| `--from-git <url>` | Import from a Git repository instead of local directory |
| `--dry-run` | Preview the task without creating it |

**JSON output:** Returns the created task object.

### `task delete <task_id>`

Delete a task by ID.

### `task queue <task_id>`

Queue a task on a compute provider.

| Option | Description |
|---|---|
| `--no-interactive` | Skip prompts. Uses the task's configured provider or first available. Parameters use defaults. **Always use this in automated workflows.** |

**JSON output:** Returns the created job object with `id` and `status`.

### `task gallery`

Browse the task gallery. Use `--import` to non-interactively import a specific task.

| Option | Description |
|---|---|
| `--type all\|interactive` | Filter gallery type (default: `all`) |
| `--import <gallery_id>` | Import a gallery task directly (non-interactive) |

**Note:** Without `--import`, this command is interactive. Avoid in automated contexts.

### `task interactive`

Launch an interactive task (Jupyter, vLLM, Ollama, etc.).

| Option | Description |
|---|---|
| `--timeout <seconds>` | Timeout waiting for service readiness (default: 300) |

**Warning:** This is inherently interactive and blocks. Only use when the user specifically requests it.

---

## Job Commands

**All job commands require `current_experiment` to be set.**

### `job list`

List all jobs in the current experiment.

| Option | Description |
|---|---|
| `--running` | Show only active jobs (WAITING, LAUNCHING, RUNNING, INTERACTIVE) |

**JSON output:**
```json
[{"id": 1, "status": "COMPLETE", "progress": 100, "job_data": {...}, "created_at": "...", ...}]
```

Job statuses: `WAITING`, `LAUNCHING`, `RUNNING`, `INTERACTIVE`, `COMPLETE`, `FAILED`, `STOPPED`

### `job info <job_id>`

Get detailed job information including status, progress, config, resources, provider, artifacts, errors, and scores.

**JSON output:**
```json
{"id": 1, "status": "RUNNING", "progress": 45, "config": {...}, "artifacts": [...], "errors": [...], ...}
```

### `job machine-logs <job_id>`

Fetch machine/provider logs for a job (the raw logs from the compute provider).

| Option | Description |
|---|---|
| `--follow` / `-f` | Stream new lines continuously. Polls every 2 seconds. Stops automatically when the job exits an active state. |

**Note:** `--follow` blocks until the job finishes. Use it for real-time monitoring.

### `job task-logs <job_id>`

Fetch task (Lab SDK) output for a job. This is the output produced by the task script itself.

| Option | Description |
|---|---|
| `--follow` / `-f` | Stream new lines continuously. Polls every 2 seconds. Stops automatically when the job exits an active state. |

### `job request-logs <job_id>`

Fetch provider request/launch logs for a job. These are the orchestration logs from the provider's API server (e.g. SkyPilot launch logs showing cluster provisioning). Only available for providers that support request logs (currently SkyPilot).

### `job artifacts <job_id>`

List job artifacts with filename, path, and size.

**JSON output:**
```json
[{"filename": "model.bin", "path": "/path/to/file", "size": 1024000}]
```

### `job download <job_id>`

Download job artifacts.

| Option | Description |
|---|---|
| `--file <pattern>` | Glob pattern for specific files (repeatable). Omit to download all as a zip. |
| `--output` / `-o <dir>` | Output directory (default: current directory) |

### `job stop <job_id>`

Stop a running job.

### `job monitor`

Launch the interactive job monitor TUI (Textual app).

**Warning:** This launches a full terminal UI. **Never use in automated or agent contexts.** Use `job list` + `job machine-logs` instead.

---

## Provider Commands

**Provider commands do NOT require `current_experiment`.**

### `provider list`

List all compute providers.

| Option | Description |
|---|---|
| `--include-disabled` | Include disabled providers in the list |

**JSON output:**
```json
[{"id": 1, "name": "local", "type": "local", "disabled": false, "healthy": true, ...}]
```

### `provider info <provider_id>`

Show details for a specific provider.

### `provider add`

Add a new compute provider. Interactive prompts by default.

| Option | Description |
|---|---|
| `--name <name>` | Provider name |
| `--type <type>` | Provider type: `slurm`, `skypilot`, `runpod`, `local` |
| `--config <json>` | Config as JSON string |
| `--interactive` / `--no-interactive` | Toggle prompts. Non-interactive requires `--name` and `--type`; `--config` also required unless `--type local`. |

**Always use `--no-interactive` with `--name`, `--type`, and `--config` in automated workflows.**

### `provider update <provider_id>`

Update a compute provider. Fields are merged with existing config.

| Option | Description |
|---|---|
| `--name <name>` | New provider name |
| `--config <json>` | Config fields as JSON string (merged with existing) |
| `--disabled` / `--enabled` | Disable or enable the provider |

### `provider delete <provider_id>`

Delete a compute provider.

| Option | Description |
|---|---|
| `--yes` / `-y` | Skip confirmation prompt. **Always use in automated workflows.** |

### `provider check <provider_id>`

Check connectivity and health of a provider.

### `provider enable <provider_id>`

Enable a disabled provider.

### `provider disable <provider_id>`

Disable a provider.

---

## Server Commands

### `server install`

Interactive setup wizard for Transformer Lab server. Configures frontend URL, storage backend, admin account, compute provider, email, and auth.

| Option | Description |
|---|---|
| `--dry-run` | Preview configuration without installing |
| `--config <path>` | Path to a config file |

### `server version`

Show installed server version.

### `server update`

Update to latest server version.
