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

Every `task` subcommand accepts `--experiment` / `-e <id_or_name>` to override the configured default for a single invocation.

#### `task list`

List all remote tasks in the current experiment.

```bash
lab task list
```

#### `task init`

Initialize a `task.yaml` and `main.py` in the current directory using the bundled template.

```bash
# Write the default files into the current directory
lab task init

# Prompt for task settings instead of using defaults
lab task init --interactive

# Overwrite an existing task.yaml without asking
lab task init --force
```

| Option           | Description                                                |
|------------------|------------------------------------------------------------|
| `--interactive`  | Prompt for task settings instead of using defaults.        |
| `--force`        | Overwrite an existing `task.yaml` without prompting.       |

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

#### `task upload`

Upload additional files into an existing task (e.g. add a new dataset or helper script alongside `task.yaml`).

```bash
lab task upload <task_id> ./extra-file.py
lab task upload <task_id> ./assets/        # directory
lab task upload <task_id> ./extra-file.py --no-interactive
```

| Argument | Description                              |
|----------|------------------------------------------|
| `task_id`| Task ID to upload files to.              |
| `path`   | Path to a file or directory to upload.   |

| Option             | Description                |
|--------------------|----------------------------|
| `--no-interactive` | Skip confirmation prompts. |

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

#### `task queue`

Queue a task on a compute provider. Interactively prompts for provider selection and parameter values.

```bash
# Interactive mode (prompts for provider and parameters)
lab task queue <task_id>

# Non-interactive mode (uses defaults)
lab task queue <task_id> --no-interactive

# Override task parameters for this run only (repeatable). Values are parsed as
# YAML scalars: epochs=3 -> int, lr=0.001 -> float, enabled=true -> bool.
lab task queue <task_id> --param epochs=3 --param lr=0.001

# Attach a run description (like a commit description). '-' reads from stdin.
lab task queue <task_id> --description "first run from CLI"
echo "long description" | lab task queue <task_id> -m -

# Enable system or torch profiling for this run.
lab task queue <task_id> --enable-profiling
lab task queue <task_id> --enable-profiling --enable-profiling-torch
```

| Option                     | Description                                                                                       |
|----------------------------|---------------------------------------------------------------------------------------------------|
| `--no-interactive`         | Skip interactive prompts and use defaults.                                                        |
| `--param`, `-p KEY=VALUE`  | Override a task parameter for this queue (repeatable). Unknown keys fail. Values are YAML scalars.|
| `--description`, `-m TEXT` | Markdown note for this run. Pass `-` to read from stdin.                                          |
| `--enable-profiling`       | Enable system profiling (CPU/GPU/memory sampling).                                                |
| `--enable-profiling-torch` | Enable torch profiler trace export (requires `--enable-profiling`).                               |

#### `task interactive`

Launch an interactive task (Jupyter, vLLM, Ollama, etc.) and wait for the service to become reachable.

```bash
lab task interactive
lab task interactive --timeout 600          # wait up to 10 minutes for readiness
```

| Option              | Description                                            |
|---------------------|--------------------------------------------------------|
| `--timeout`, `-t`   | Timeout in seconds waiting for service readiness (default: 300). |

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

#### `task edit`

Edit an existing task. Interactive editor by default; use `--from-file` to replace only `task.yaml`, or `--from-dir` to replace `task.yaml` plus sibling files (e.g. `main.py`).

```bash
# Open task.yaml in $EDITOR (interactive)
lab task edit <task_id>

# Replace task.yaml from a local file
lab task edit <task_id> --from-file ./task.yaml

# Replace task.yaml and any sibling files (e.g. main.py) from a directory
lab task edit <task_id> --from-dir ./my-task

# Preview a --from-dir update without submitting
lab task edit <task_id> --from-dir ./my-task --dry-run
```

| Option             | Description                                                                |
|--------------------|----------------------------------------------------------------------------|
| `--from-file`      | Path to `task.yaml` to apply directly (mutually exclusive with `--from-dir`). |
| `--from-dir`       | Path to a directory containing `task.yaml` (and any attachments) to replace task contents. |
| `--dry-run`        | Preview the task update without submitting it (only applies with `--from-dir`). |
| `--no-interactive` | Skip confirmation prompts.                                                 |
| `--timeout`        | Request timeout in seconds for fetch/validate/save.                        |

#### `task delete`

Delete a task by ID.

```bash
lab task delete <task_id>
```

---

### `job`

Job management commands. Most subcommands require `current_experiment` to be set in config.

Every `job` subcommand accepts `--experiment` / `-e <id_or_name>` to override the configured default for a single invocation.

#### `job list`

List all jobs for the current experiment.

```bash
# All jobs in the current experiment
lab job list

# Only currently-active jobs (WAITING, LAUNCHING, RUNNING, INTERACTIVE)
lab job list --running

# Sort by a recorded score metric. Defaults to descending.
lab job list --score-metric eval/loss --score-order asc
```

| Option                       | Description                                                                                  |
|------------------------------|----------------------------------------------------------------------------------------------|
| `--running`                  | Show only active jobs (WAITING, LAUNCHING, RUNNING, INTERACTIVE).                            |
| `--score-metric`, `--sort-by`| Sort jobs by this score metric key (e.g. `eval/loss`).                                       |
| `--score-order`              | Score ordering direction: `desc` (default) or `asc`.                                         |

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

#### `job metrics`

Show training metrics for a job. By default prints the last N rows; `--follow` polls and streams new rows.

```bash
# Last 20 rows (default tail)
lab job metrics <job_id>

# Last 50 rows
lab job metrics <job_id> --tail 50

# Stream new rows until interrupted
lab job metrics <job_id> --follow

# Restrict to specific metric keys
lab job metrics <job_id> --keys train/loss,eval/loss

# Raw JSONL output (for piping to jq etc.)
lab job metrics <job_id> --json
```

| Option              | Description                                              |
|---------------------|----------------------------------------------------------|
| `--follow`, `-f`    | Poll for new metric rows until interrupted.              |
| `--tail`, `-n N`    | Show last N rows (default: 20; ignored with `--follow`). |
| `--keys k1,k2,...`  | Comma-separated metric keys to display.                  |
| `--json`            | Emit raw JSONL rows to stdout.                           |

#### `job machine-logs`

Fetch provider/machine logs for a job (the host process's stdout/stderr).

```bash
lab job machine-logs <job_id>
lab job machine-logs <job_id> --follow
```

| Option           | Description                              |
|------------------|------------------------------------------|
| `--follow`, `-f` | Stream new lines continuously.           |

#### `job task-logs`

Fetch task output (Lab SDK) for a job. This is usually the most useful log for understanding what the user code did.

```bash
lab job task-logs <job_id>
lab job task-logs <job_id> --follow
```

| Option           | Description                              |
|------------------|------------------------------------------|
| `--follow`, `-f` | Stream new lines continuously.           |

#### `job request-logs`

Fetch provider request/launch logs (e.g. SkyPilot launch logs) for a job. Useful when a job fails before user code runs.

```bash
lab job request-logs <job_id>
```

#### `job stop`

Stop a running job and tear down its provider cluster.

```bash
lab job stop <job_id>
```

#### `job discard`

Toggle the `discard` flag on a job's score record. Discarded jobs are still kept but hidden from default scoring views.

```bash
# Mark a job as discarded
lab job discard <job_id>

# Undo the discard
lab job discard <job_id> --undo
```

| Option   | Description                                |
|----------|--------------------------------------------|
| `--undo` | Unset discard and mark the job as not discarded. |

#### `job delete`

Delete a single job.

```bash
lab job delete <job_id>
lab job delete <job_id> --no-interactive
```

| Option             | Description                |
|--------------------|----------------------------|
| `--no-interactive` | Skip confirmation prompts. |

#### `job delete-all`

Delete **all** jobs in the current experiment. Prompts for confirmation by default.

```bash
lab job delete-all
lab job delete-all --no-interactive
```

| Option             | Description                |
|--------------------|----------------------------|
| `--no-interactive` | Skip confirmation prompts. |

#### `job publish dataset`

Publish a dataset produced by a job into the asset registry. Version label is auto-generated (`v1`, `v2`, …) when re-using an existing group.

```bash
# Publish into a new group (interactive prompts pick dataset name + group)
lab job publish dataset <job_id>

# Publish a specific named dataset into a named group
lab job publish dataset <job_id> my_dataset --group "my-dataset-group" --tag latest

# Append a new version to an existing group
lab job publish dataset <job_id> my_dataset --group "my-dataset-group" --mode existing
```

| Option                    | Description                                              |
|---------------------------|----------------------------------------------------------|
| `--group`, `-g`           | Registry group name (target_name).                       |
| `--mode`                  | Publish mode: `new` (default) or `existing`.             |
| `--tag`                   | Version tag (default: `latest`).                         |
| `--description`, `-d`     | Version description.                                     |

#### `job publish model`

Publish a model produced by a job into the asset registry. Same shape as `job publish dataset`.

```bash
lab job publish model <job_id>
lab job publish model <job_id> my_model --group "my-model-group" --tag latest
lab job publish model <job_id> my_model --group "my-model-group" --mode existing
```

| Option                    | Description                                              |
|---------------------------|----------------------------------------------------------|
| `--group`, `-g`           | Registry group name (target_name).                       |
| `--mode`                  | Publish mode: `new` (default) or `existing`.             |
| `--tag`                   | Version tag (default: `latest`).                         |
| `--description`, `-d`     | Version description.                                     |

#### `job monitor`

Launch the interactive job monitor TUI.

For human terminal use only. Not suitable for non-interactive automation or AI agents because it blocks in a full-screen TUI. For automation, use `lab job list`, `lab job info`, and `lab job task-logs` (optionally `--follow`).

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

---

### `experiment`

Manage experiments. Most other commands (`task`, `job`, `notes`) are scoped to the default experiment in `~/.lab/config.json` — change it with `experiment set-default` or override per-command with `--experiment` / `-e`.

#### `experiment list`

List all experiments. Marks the current default with a `*` in the `default` column.

```bash
# All experiments
lab experiment list

# Filter by one or more tags (multiple --tag flags are AND'd)
lab experiment list --tag prod
lab experiment list --tag prod --tag eval
```

| Option       | Description                                                |
|--------------|------------------------------------------------------------|
| `--tag NAME` | Filter experiments by tag. Repeat to AND multiple tags.    |

#### `experiment create`

Create a new experiment.

```bash
lab experiment create my-experiment
lab experiment create my-experiment --set-default
```

| Option           | Description                                       |
|------------------|---------------------------------------------------|
| `--set-default`  | Set the new experiment as the default after creation. |

#### `experiment delete`

Delete an experiment.

```bash
lab experiment delete <experiment_id>
lab experiment delete <experiment_id> --no-interactive
```

| Option             | Description                |
|--------------------|----------------------------|
| `--no-interactive` | Skip confirmation prompts. |

#### `experiment set-default`

Set the default experiment used by other commands. Stored in `~/.lab/config.json`.

```bash
lab experiment set-default <experiment_id>
```

#### `experiment tag add` / `experiment tag remove`

Add or remove one or more tags on an experiment.

```bash
lab experiment tag add my-experiment prod eval
lab experiment tag remove my-experiment eval
```

#### `experiment tags`

List all distinct tags across experiments you can read.

```bash
lab experiment tags
```

---

### `notes`

Markdown notes attached to an experiment. Stored on the server; rendered by Rich. Requires `current_experiment` to be set in config (or pass `--experiment` / `-e`).

#### `notes show`

Render the current experiment's notes.

```bash
# Rendered markdown
lab notes show

# Raw markdown
lab notes show --raw
```

| Option   | Description                                       |
|----------|---------------------------------------------------|
| `--raw`  | Print raw markdown instead of rendered output.   |

#### `notes edit`

Open the experiment's notes in `$EDITOR` (defaults to `nano`). Saves on exit.

```bash
lab notes edit
EDITOR=vim lab notes edit
```

#### `notes append`

Append a line of text to the experiment's notes without opening an editor.

```bash
lab notes append "ran v3 with lr=1e-4, eval/loss=0.42"
```

---

### `provider`

Manage compute providers. Configuration field requirements vary by provider type; the interactive `provider add` flow prompts for each required field based on the selected type.

Recognised provider types: `slurm`, `skypilot`, `runpod`, `vastai`, `dstack`, `aws`, `gcp`, `azure`, `local`.

#### `provider list`

List all providers.

```bash
# Only enabled providers (default)
lab provider list

# Include disabled providers
lab provider list --include-disabled
```

| Option                | Description                          |
|-----------------------|--------------------------------------|
| `--include-disabled`  | Include disabled providers.          |

#### `provider add`

Add a new compute provider. Interactive by default — prompts for the provider type, then for the per-type config fields listed below.

```bash
# Interactive
lab provider add

# Non-interactive (requires --name, --type, --config JSON)
lab provider add --no-interactive \
    --name "my-skypilot" \
    --type skypilot \
    --config '{"server_url":"http://127.0.0.1:46580","api_token":"..."}'

# Keep secrets out of argv (and shell history / ps listings)
lab provider add --type aws --credentials-file ./aws-creds.json
lab provider add --type gcp --credentials-file ./service-account.json
```

| Option                  | Description                                                                                       |
|-------------------------|---------------------------------------------------------------------------------------------------|
| `--name`                | Provider name.                                                                                    |
| `--type`                | One of: `slurm`, `skypilot`, `runpod`, `vastai`, `dstack`, `aws`, `gcp`, `azure`, `local`.        |
| `--config JSON`         | Provider config as a JSON string. Required with `--no-interactive`.                               |
| `--interactive` / `--no-interactive` | Use interactive prompts (default: interactive).                                      |
| `--credentials-file PATH` | Path to a JSON file containing provider secrets. Shape depends on `--type` (see below).         |

**Provider config fields**, by `--type` (these are what `provider add` prompts for interactively, and what to put in the `--config` JSON object for `--no-interactive`):

| Type       | Fields                                                                                                                                 |
|------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `skypilot` | `server_url`, `api_token`                                                                                                              |
| `slurm`    | `mode` (`ssh` or `rest`), `rest_url` (if `mode=rest`), `ssh_host`, `ssh_user`, `ssh_key_path`, `ssh_port`, `api_token` (if `mode=rest`) |
| `runpod`   | `api_key`, `api_base_url`, `default_gpu_type`, `default_region`, `default_template_id`, `default_network_volume_id`                    |
| `dstack`   | `server_url`, `api_token`, `dstack_project`                                                                                            |
| `aws`      | `region` (credentials supplied via `--credentials-file` JSON `{ "aws_access_key_id": "...", "aws_secret_access_key": "..." }`)         |
| `gcp`      | `region`, `zone` (service account JSON supplied via `--credentials-file <path-to-service-account.json>`)                               |
| `azure`    | `azure_subscription_id`, `azure_tenant_id`, `azure_client_id`, `azure_client_secret`, `azure_location`                                 |
| `vastai`   | `api_key`                                                                                                                              |
| `local`    | (no fields)                                                                                                                            |

For `--type aws`, both `aws_access_key_id` and `aws_secret_access_key` must be supplied together (either via `--credentials-file` or the interactive prompt). For `--type gcp`, a service-account JSON file is required at create time — the provider will fail its health check without it.

#### `provider info`

Show details for a single provider.

```bash
lab provider info <provider_id>
```

#### `provider update`

Update an existing provider. All option flags are optional; pass at least one.

```bash
# Rename
lab provider update <provider_id> --name "new name"

# Patch the config (merged with existing fields)
lab provider update <provider_id> --config '{"region":"us-west-2"}'

# Rotate AWS credentials without exposing them on the command line
lab provider update <provider_id> --credentials-file ./aws-creds.json

# Toggle enabled / disabled
lab provider update <provider_id> --disabled
lab provider update <provider_id> --enabled

# Toggle "team default" used when a task does not specify a provider
lab provider update <provider_id> --default
lab provider update <provider_id> --no-default
```

| Option                    | Description                                                                            |
|---------------------------|----------------------------------------------------------------------------------------|
| `--name`                  | New provider name.                                                                     |
| `--config JSON`           | Config fields to merge with existing config.                                           |
| `--credentials-file PATH` | Path to a JSON file with provider secrets (shape depends on the provider's type).      |
| `--disabled` / `--enabled` | Disable or enable the provider.                                                       |
| `--default` / `--no-default` | Mark / unmark this provider as the team default.                                    |

#### `provider check`

Run a connectivity / health check against a provider.

```bash
lab provider check <provider_id>
```

#### `provider delete`

Delete a provider.

```bash
lab provider delete <provider_id>
lab provider delete <provider_id> --no-interactive
```

#### `provider enable` / `provider disable`

Enable or disable a provider (equivalent to `provider update --enabled` / `--disabled`).

```bash
lab provider enable <provider_id>
lab provider disable <provider_id>
```

#### `provider set-default` / `provider clear-default`

Mark or clear a provider as the team's default. The default provider is used when a task is dispatched without specifying one. Marking a provider as default automatically clears the flag from any other provider in the team.

```bash
lab provider set-default <provider_id>
lab provider clear-default <provider_id>
```

---

### `dataset`

Manage versioned dataset groups on the server. Mirrors the `model` command surface: a **group** is a named collection of versions; uploads create a new version under a group.

#### `dataset list`

List all dataset groups.

```bash
lab dataset list
lab --format json dataset list
```

#### `dataset info`

Show details for a single group (by `group_id` or `group_name`).

```bash
lab dataset info GROUP
```

#### `dataset edit`

Edit a dataset group's display name or description.

```bash
lab dataset edit GROUP --name "New Name" --description "Updated description"
```

| Option           | Description                                  |
|------------------|----------------------------------------------|
| `--name`         | New display name for the dataset group.      |
| `--description`  | New description for the dataset group.       |

#### `dataset upload`

Upload local files or directories into a dataset on the server. Creates the dataset if it doesn't exist.

```bash
lab dataset upload DATASET_ID ./path/to/data-dir
lab dataset upload DATASET_ID ./train.jsonl ./eval.jsonl
lab dataset upload DATASET_ID ./path/to/data-dir --force
```

| Option        | Description                                       |
|---------------|---------------------------------------------------|
| `-f, --force` | Overwrite server-side files that already exist.   |

Re-running upload against the same `DATASET_ID` skips files that already exist (exit code 2) — pass `--force` to overwrite.

#### `dataset download`

Download a dataset's files to `<dest>/<DATASET_ID>/`.

```bash
lab dataset download DATASET_ID ./local-data
```

#### `dataset delete`

Delete a dataset group and all its versions.

```bash
lab dataset delete GROUP --yes
```

| Option       | Description                          |
|--------------|--------------------------------------|
| `-y`, `--yes`| Skip the interactive confirmation.   |

---

### `server`

Install, run, and update the Transformer Lab Teams edition server on the local machine. These commands operate on `~/.transformerlab/`.

#### `server install`

Run the installer to generate `~/.transformerlab/.env` and lay down the server source under `~/.transformerlab/src`. Interactive by default.

```bash
# Interactive install
lab server install

# Preview the configuration without writing anything
lab server install --dry-run

# Install from a pre-written .env config file (skips prompts)
lab server install --config ./my-config.env
```

| Option        | Description                                                                            |
|---------------|----------------------------------------------------------------------------------------|
| `--dry-run`   | Show configuration without writing any files.                                          |
| `--config PATH` | Path to a `.env` config file. Skips interactive prompts and installs from this file. |

> ⚠️ Do not run `server install` from inside `~/.transformerlab/src` — that directory is deleted during installation. Change to a different directory first (`cd ~ && lab server install`).

#### `server version`

Show the installed server version and check PyPI for a newer release.

```bash
lab server version
lab --format json server version
```

#### `server start`

Start the local server (defaults to port 8338). Runs in the background by default; logs to `~/.transformerlab/server.log`.

```bash
lab server start
lab server start --port 9000
lab server start --foreground
```

| Option         | Description                                            |
|----------------|--------------------------------------------------------|
| `--port`       | Port to start the server on (default: 8338).           |
| `--foreground` | Run in the foreground instead of background.           |

#### `server stop`

Stop the local server.

```bash
lab server stop
lab server stop --port 9000
lab server stop --force            # SIGKILL instead of SIGTERM
```

| Option        | Description                                                                |
|---------------|----------------------------------------------------------------------------|
| `--port`      | Port the server is running on (default: 8338).                             |
| `--force`, `-f` | Force kill (SIGKILL) instead of graceful shutdown.                        |

#### `server restart`

Stop the server (graceful, with SIGKILL fallback) and start it again on the same port.

```bash
lab server restart
lab server restart --port 9000
```

#### `server update`

Update an existing server installation to the latest published version (runs the install script again, preserving config).

```bash
lab server update
```
