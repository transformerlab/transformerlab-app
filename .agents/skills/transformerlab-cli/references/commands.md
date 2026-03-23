# Transformer Lab CLI — Command Reference

Full reference for every CLI command. All commands are invoked via:

```bash
uv run cli/src/transformerlab_cli/main.py <command> [subcommand] [options]
```

Global option available on all commands:
- `--format pretty|json` — Output format (default: `pretty`)

---

## Top-Level Commands

### `version`

Display CLI version.

### `status`

Check server connectivity.

### `config [args...]`

View, get, and set configuration values.

```bash
config                        # List all config values
config <key>                  # Get a specific value
config get <key>              # Get a specific value (explicit)
config set <key> <value>      # Set a value
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

---

## Task Commands

### `task list`

List all remote tasks in the current experiment.

### `task info <task_id>`

Get details for a specific task.

### `task add [directory]`

Add a new task from a local directory containing `task.yaml`, or from a Git repository.

| Option | Description |
|---|---|
| `--from-git <url>` | Import from a Git repository instead of local directory |
| `--dry-run` | Preview the task without creating it |

### `task delete <task_id>`

Delete a task by ID.

### `task queue <task_id>`

Queue a task on a compute provider.

| Option | Description |
|---|---|
| `--no-interactive` | Skip prompts. Uses the task's configured provider if set, otherwise the first available provider. Parameters use their default values. |

### `task gallery`

Browse the task gallery. Optionally import a task directly.

| Option | Description |
|---|---|
| `--type all\|interactive` | Filter gallery type (default: `all`) |
| `--import <gallery_id>` | Import a gallery task directly |

### `task interactive`

Launch an interactive task (Jupyter, vLLM, Ollama, etc.).

| Option | Description |
|---|---|
| `--timeout <seconds>` | Timeout waiting for service readiness (default: 300) |

---

## Job Commands

### `job list`

List all jobs in the current experiment.

| Option | Description |
|---|---|
| `--running` | Show only RUNNING, LAUNCHING, and INTERACTIVE jobs |

### `job info <job_id>`

Get detailed job information including status, progress, config, resources, provider, artifacts, errors, and scores.

### `job logs <job_id>`

Fetch provider logs for a job.

| Option | Description |
|---|---|
| `--follow` / `-f` | Stream new lines continuously. Polls every 2 seconds. Stops automatically when the job exits an active state (RUNNING, LAUNCHING, INTERACTIVE, WAITING). |

### `job artifacts <job_id>`

List job artifacts with filename, path, and size.

### `job download <job_id>`

Download job artifacts.

| Option | Description |
|---|---|
| `--file <pattern>` | Glob pattern for specific files (repeatable). Omit to download all as a zip. |
| `--output` / `-o <dir>` | Output directory (default: current directory) |

### `job stop <job_id>`

Stop a running job.

### `job monitor`

Launch the interactive job monitor TUI (Textual app). Not suitable for non-interactive or automated use.

---

## Provider Commands

### `provider list`

List all compute providers.

| Option | Description |
|---|---|
| `--include-disabled` | Include disabled providers in the list |

### `provider info <provider_id>`

Show details for a specific provider.

### `provider add`

Add a new compute provider. Interactive prompts by default.

| Option | Description |
|---|---|
| `--name <name>` | Provider name |
| `--type <type>` | Provider type: `slurm`, `skypilot`, `runpod`, `local`. Note: `local` has no config fields. |
| `--config <json>` | Config as JSON string |
| `--interactive` / `--no-interactive` | Toggle interactive prompts (default: interactive). Non-interactive requires `--name`, `--type`, and `--config`. |

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
| `--yes` / `-y` | Skip confirmation prompt |

### `provider check <provider_id>`

Check connectivity and health of a provider.

### `provider enable <provider_id>`

Enable a disabled provider.

### `provider disable <provider_id>`

Disable a provider.
