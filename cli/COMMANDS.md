# Transformer Lab CLI - Command Reference

## Global Options

```
lab [OPTIONS] COMMAND [ARGS]...
```

| Option     | Description                          | Default  |
|------------|--------------------------------------|----------|
| `--format` | Output format: `pretty` or `json`    | `pretty` |
| `--help`   | Show help message and exit           |          |

---

## Commands

### `version`

Display the CLI version.

```bash
lab version
```

---

### `status`

Check the status of the server and configuration.

```bash
lab status
```

---

### `login`

Log in to Transformer Lab. Prompts for server URL and API key if not provided.

```bash
# Interactive login (prompts for server and API key)
lab login

# Login with options
lab login --server https://my-server:8338 --api-key YOUR_API_KEY
```

| Option      | Description     |
|-------------|-----------------|
| `--api-key` | Your API key    |
| `--server`  | Server URL      |

---

### `logout`

Log out from Transformer Lab by deleting the stored API key.

```bash
lab logout
```

---

### `whoami`

Show the current logged-in user, team information, and server.

```bash
lab whoami

# JSON output
lab --format json whoami
```

---

### `install-agent-skill`

Install the Transformer Lab agent skill so AI coding agents (Claude Code, etc.) know how to drive the `lab` CLI for you. Wraps `npx skills add transformerlab/transformerlab-app --skill transformerlab-cli`, so Node.js (which provides `npx`) must be installed.

```bash
lab install-agent-skill
```

---

### `config`

View or set configuration values.

```bash
# View all configuration values
lab config

# Set a configuration value
lab config <key> <value>

# Examples
lab config server http://localhost:8000
lab config current_experiment my_experiment
```

| Argument | Description            |
|----------|------------------------|
| `key`    | Config key to set      |
| `value`  | Config value to set    |

---

### `task`

Task management commands. Requires `current_experiment` to be set in config.

#### `task list`

List all remote tasks in the current experiment.

```bash
lab task list
```

#### `task add`

Add a new task from a local directory or a Git repository.

```bash
# Add from a local directory containing task.yaml
lab task add ./my-task-directory

# Preview without creating (dry run)
lab task add ./my-task-directory --dry-run

# Add from a Git repository
lab task add --from-git https://github.com/user/repo
```

| Argument         | Description                                       |
|------------------|---------------------------------------------------|
| `task_directory`  | Path to the task directory containing `task.yaml` |

| Option       | Description                              |
|--------------|------------------------------------------|
| `--from-git` | Git URL to fetch the task from           |
| `--dry-run`  | Preview the task without creating it     |

#### `task validate`

Validate a `task.yaml` file against the server-side schema.

```bash
# Validate ./task.yaml
lab task validate

# Validate a specific YAML file
lab task validate ./path/to/task.yaml
```

| Argument         | Description                                            |
|------------------|--------------------------------------------------------|
| `task_yaml_path` | Path to `task.yaml` (defaults to `./task.yaml`)       |

| Option      | Description                                 |
|-------------|---------------------------------------------|
| `--timeout` | Request timeout in seconds for validation   |

#### `task info`

Get detailed information for a specific task.

```bash
lab task info <task_id>
```

#### `task delete`

Delete a task by ID.

```bash
lab task delete <task_id>
```

#### `task queue`

Queue a task on a compute provider. Interactively prompts for provider selection and parameter values.

```bash
# Interactive mode (prompts for provider and parameters)
lab task queue <task_id>

# Non-interactive mode (uses defaults)
lab task queue <task_id> --no-interactive
```

| Option             | Description                                    |
|--------------------|------------------------------------------------|
| `--no-interactive` | Skip interactive prompts and use defaults      |

#### `task gallery`

Browse the task gallery. Optionally import a task into the current experiment.

```bash
# List all gallery tasks
lab task gallery

# List interactive templates only
lab task gallery --type interactive

# Import directly (non-interactive)
lab task gallery --import <gallery_id>
```

| Option     | Description                                              |
|------------|----------------------------------------------------------|
| `--type`   | Gallery type: `all` (default) or `interactive`           |
| `--import` | Gallery ID to import as a task (skips interactive prompt)|

---

### `job`

Job management commands. Most subcommands require `current_experiment` to be set in config.

#### `job list`

List all jobs for the current experiment.

```bash
lab job list
```

#### `job info`

Get detailed information for a specific job.

```bash
lab job info <job_id>
```

#### `job artifacts`

List artifacts for a specific job. Includes filename, path, and size (when available).

```bash
lab job artifacts <job_id>
```

#### `job download`

Download artifacts for a job.

```bash
# Download all as zip (existing behavior)
lab job download <job_id>

# Download a single file
lab job download <job_id> --file model.bin

# Download files matching a glob pattern
lab job download <job_id> --file "*.json"

# Download multiple specific files
lab job download <job_id> --file weights.bin --file config.json

# Download to a specific directory
lab job download <job_id> --file "*.ckpt" --output ./checkpoints
```

| Option          | Description                                                               |
|-----------------|---------------------------------------------------------------------------|
| `--file`        | Filename or glob pattern (repeatable). Omit to download all as zip.      |
| `-o`, `--output`| Output directory (default: current directory)                             |

#### `job monitor`

Launch the interactive job monitor TUI.

```bash
lab job monitor
```

---

### `model`

Manage versioned model groups on the server. A **group** is a named collection of versions (`v1`, `v2`, …); each version points at an underlying asset (e.g. a HuggingFace model ID). Group directories are keyed by UUID, so the display name is freely editable and group lookups by name resolve to the UUID internally.

#### `model list`

List all model groups.

```bash
lab --format json model list
```

#### `model info`

Show details for a single group (by `group_id` or `group_name`).

```bash
lab --format json model info GROUP
```

#### `model create`

Create a model group version. If no group with `--name` exists, a new group is created with version `v1`. If the group already exists, a new version is appended with an auto-incremented `vN` label (or `--version-label` to override).

```bash
# New group + first version (v1)
lab model create my-hf-model-id --name "My Fine-tuned Model" --description "SFT on custom data"

# Append v2 (and v3, v4, …) by re-using --name. The server scans existing
# v\d+ labels in the group and picks the next one.
lab model create my-hf-model-id-v2 --name "My Fine-tuned Model"

# Pin a specific label instead of auto-incrementing. Free-form strings are allowed
# (only the v\d+ pattern auto-increments). Collisions within a group are rejected.
lab model create my-hf-model-id-exp --name "My Fine-tuned Model" --version-label "experimental-2026-05"
```

| Option              | Description                                                                                              |
|---------------------|----------------------------------------------------------------------------------------------------------|
| `--name`            | Display name for the model group (required). Re-use to append a new version.                            |
| `--description`     | Optional description.                                                                                    |
| `--tag`             | Tag to assign to this version (default: `latest`). Tag is moved off any prior holder in the same group. |
| `--version-label`   | Explicit label for this version. Omit to let the server auto-compute the next `vN`.                     |

#### `model edit`

Edit a model group's display name or description.

```bash
lab model edit GROUP --name "New Name" --description "Updated description"
```

#### `model upload`

Upload local files or directories into a model's storage. Creates the model entry if it doesn't exist.

```bash
lab model upload MODEL_ID ./path/to/model-dir
lab model upload MODEL_ID ./tokenizer.json ./config.json
lab model upload MODEL_ID ./path/to/model-dir --force
```

| Option        | Description                                       |
|---------------|---------------------------------------------------|
| `-f, --force` | Overwrite server-side files that already exist.   |

The upload finalizes by reading `config.json` from the upload root; finalization fails (`cannot finalize: no config.json present`) if one isn't present. Re-running upload against the same `MODEL_ID` skips files that already exist (exit code 2) — pass `--force` to overwrite.

#### `model download`

Download a previously-uploaded model's files to `<dest>/<MODEL_ID>/`.

```bash
lab model download MODEL_ID ./local-models
```

#### `model delete`

Delete a model group and all its versions.

```bash
lab model delete GROUP --yes
```

| Option   | Description                          |
|----------|--------------------------------------|
| `--yes`  | Skip the interactive confirmation.   |
