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

### `task init`

Scaffold a new task in the current directory. **Prefer this over writing `task.yaml` by hand.** Does not require an experiment to be set.

| Option | Description |
|---|---|
| (default, no flag) | Non-interactive. Creates `task.yaml` with defaults (`name` = folder name, `cpus: 2`, `memory: 4`, `run: python main.py`) and a starter `main.py`. Existing files are skipped, not overwritten. |
| `--interactive` | Prompts for task name, CPUs, memory, accelerators, setup, and run command. Writes only `task.yaml` (no `main.py`). Prompts before overwriting an existing `task.yaml`. |

**JSON output (default):** `{"created": ["task.yaml", "main.py"], "skipped": [], "path": "/abs/dir"}`

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
| `-m`, `--description <text>` | Markdown note describing what this run is trying to accomplish (stored on the job, shown in `lab job info`). Pass `-` to read from stdin. **Agents: required per SKILL.md rule 13.** |

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
| `--interactive` / `--no-interactive` | Toggle prompts. Non-interactive requires `--name`, `--type`, AND `--config` (pass `'{}'` for `local`). |

**Always use `--no-interactive` with `--name`, `--type`, and `--config` in automated workflows.**

#### Per-type config schema

The shape of `--config` depends on `--type`:

| Type | Config keys |
|---|---|
| `local` | (none — pass `{}`) |
| `skypilot` | `server_url`, `api_token` |
| `slurm` | `mode` (`ssh` or `rest`); for `ssh`: `ssh_host`, `ssh_user`, `ssh_key_path`, `ssh_port`; for `rest`: `rest_url`, `api_token` |
| `runpod` | `api_key` (required), `api_base_url`, `default_gpu_type`, `default_region`, `default_template_id`, `default_network_volume_id` |

```bash
lab provider add --no-interactive --name local --type local --config '{}'
lab provider add --no-interactive --name sky1 --type skypilot \
  --config '{"server_url": "https://sky.example.com", "api_token": "TOKEN"}'
lab provider add --no-interactive --name slurm-ssh --type slurm \
  --config '{"mode": "ssh", "ssh_host": "cluster.example.com", "ssh_user": "ali", "ssh_key_path": "~/.ssh/id_rsa", "ssh_port": "22"}'
lab provider add --no-interactive --name rp1 --type runpod \
  --config '{"api_key": "KEY", "default_gpu_type": "NVIDIA H100"}'
```

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
| `--no-interactive` | Skip confirmation prompt. **Always use in automated workflows.** Note: `provider delete` uses `--no-interactive`, NOT `--yes`/`-y` (which is what `model delete` and `dataset delete` use). |

### `provider check <provider_id>`

Check connectivity and health of a provider.

### `provider enable <provider_id>`

Enable a disabled provider.

### `provider disable <provider_id>`

Disable a provider.

---

## Model Commands

**Model commands do NOT require `current_experiment`.**

### `model list`

List all model groups on the server.

**JSON output:**
```json
[{"group_id": "abc123", "group_name": "my-model", "latest_version_label": "v2", "version_count": 2, "tags": ["latest"]}]
```

### `model info <group_id>`

Show detailed information about a specific model group. Accepts `group_id` or `group_name`.

### `model create <asset_id>`

Create a new model group and register its first version. The `asset_id` is the underlying model ID (e.g. a HuggingFace model ID). Version label is auto-generated (v1, v2, …).

| Option | Description |
|---|---|
| `--name <name>` | Display name for the model group (required) |
| `--description <text>` | Optional description |
| `--tag <tag>` | Tag for this version (default: `latest`) |

### `model edit <group_id>`

Edit the name or description of a model group.

| Option | Description |
|---|---|
| `--name <name>` | New display name |
| `--description <text>` | New description |

### `model delete <group_id>`

Delete a model group and all its versions.

| Option | Description |
|---|---|
| `--yes` / `-y` | Skip confirmation prompt. **Always use in automated workflows.** |

### `model upload <model_id> <paths...>`

Upload local files or directories to a model on the server. Creates the model if it does not exist. The `model_id` is the identifier used in subsequent `lab model` commands.

| Option | Description |
|---|---|
| `--force` | Overwrite files that already exist on the server. |

```bash
lab model upload my-model ./path/to/model-dir
lab model upload my-model ./tokenizer.json ./config.json
lab model upload my-model ./path --force
```

The server runs a finalize step at the end of `upload` and requires a `config.json` at the root with at least an `architectures` field (`architectures[0]` is recorded as the model architecture). Without it, finalize fails with `cannot finalize: no config.json present. Upload one first.`

Re-running `upload` against the same `model_id` skips files that already exist on the server and exits with code 2 (skipped some, did not fail). Use `--force` to overwrite.

### `model download <model_id> <dest>`

Download every file in a model's directory on the server to `<dest>/<model_id>/`. The destination directory is created if missing.

```bash
lab model download my-model ./local-models
```

---

## Dataset Commands

**Dataset commands do NOT require `current_experiment`.**

### `dataset list`

List all dataset groups on the server.

**JSON output:**
```json
[{"group_id": "abc123", "group_name": "my-dataset", "latest_version_label": "v1", "version_count": 1, "tags": ["latest"]}]
```

### `dataset info <group_id>`

Show detailed information about a specific dataset group. Accepts `group_id` or `group_name`.

### `dataset upload <dataset_id> <files...>`

Upload local files to a dataset. Creates the dataset if it does not exist. Accepts `.jsonl`, `.json`, or `.csv` files.

```bash
lab dataset upload my-dataset train.jsonl eval.jsonl
```

### `dataset download <dataset_id>`

Download a dataset from the HuggingFace Hub to the server.

| Option | Description |
|---|---|
| `--config <name>` | Dataset config/subset name (optional) |

```bash
lab dataset download Trelis/touch-rugby-rules
lab dataset download Trelis/touch-rugby-rules --config default
```

### `dataset edit <group_id>`

Edit the name or description of a dataset group.

| Option | Description |
|---|---|
| `--name <name>` | New display name |
| `--description <text>` | New description |

### `dataset delete <group_id>`

Delete a dataset group and all its versions.

| Option | Description |
|---|---|
| `--yes` / `-y` | Skip confirmation prompt. **Always use in automated workflows.** |

---

## Job Publish Commands

**Publish commands require `current_experiment` to be set.**

Publish models or datasets produced by a job to the server registry. Interactive by default — prompts for asset name, group, mode, and tag. Use explicit arguments for non-interactive/agent usage.

### `job publish model <job_id> [model_name]`

Publish a model from a job to the registry.

| Option | Description |
|---|---|
| `--group` / `-g <name>` | Registry group name |
| `--mode <new\|existing>` | Publish as a new group or add version to existing (default: `new`) |
| `--tag <tag>` | Version tag (default: `latest`) |
| `--description` / `-d <text>` | Version description |

**Note:** `model_name` is required in `--format json` mode. In pretty mode, omitting it triggers an interactive picker.

### `job publish dataset <job_id> [dataset_name]`

Publish a dataset from a job to the registry. Same options as `job publish model`.

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
