# Transformer Lab CLI — Command Reference

Full reference for every CLI command. All commands are invoked via:

```bash
lab <command> [subcommand] [options]
```

Global options available on all commands (**must come before the subcommand**):
- `--format pretty|json` — Output format (default: `pretty`).
- `--profile <name>` — Select the profile (server + team + credentials) for this invocation. Overrides the `LAB_PROFILE` env var; defaults to `default`. See [`profile`](#profile) below.

```bash
# Correct
lab --format json task list
lab --profile prod job list

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

To log into a **named profile**, combine the global `--profile` flag with `--server` — the credentials and config are written under that profile instead of `default`:

```bash
lab --profile prod login --server https://prod.example.com:8338
```

### `logout`

Remove the stored API key for the active profile (selected via `--profile` / `LAB_PROFILE`; defaults to `default`).

### `whoami`

Show current user, team, and server.

**JSON output:**
```json
{"email": "user@example.com", "team_id": "...", "team_name": "...", "server": "http://localhost:8338"}
```

### `profile`

Manage CLI **profiles** — independent `(server + team + experiment + API key)` sets, so two `lab` commands can talk to two different servers in parallel. The `default` profile lives at the legacy root (`~/.lab/config.json`, `~/.lab/credentials`); named profiles live under `~/.lab/profiles/<name>/`.

Selection is **per-process** (there is no `use` subcommand / stored "current profile"). Precedence: `--profile <name>` (root-level flag, before the subcommand) > `LAB_PROFILE` env var > `default`.

```bash
lab profile list                 # list all profiles; marks active + which have credentials
lab profile show [name]          # show a profile's config (defaults to the active profile)
lab profile delete <name> --yes  # delete a named profile ('default' cannot be deleted)

# Create/authenticate a profile via login (see `login` above):
lab --profile prod login --server https://prod.example.com:8338

# Run two servers in parallel:
LAB_PROFILE=prod    lab job list &
LAB_PROFILE=staging lab job list &
```

| Subcommand | Description |
|---|---|
| `list` | List all profiles. JSON: array of `{name, active, has_credentials}`. |
| `show [name]` | Show `name`/`server`/`team_id`/`team_name`/`user_email`/`current_experiment`/`has_credentials` for a profile (defaults to the active one). |
| `delete <name>` | Delete a named profile directory. Refuses `default`. `--yes`/`-y` skips the confirm prompt. |

---

## Experiment Commands

### `experiment list [--tag <tag>]...`

List experiments. Pass `--tag` one or more times to filter to experiments that have **all** of the given tags (AND semantics). Filtering is client-side.

```bash
lab experiment list --tag fine-tuning            # all experiments tagged fine-tuning
lab experiment list --tag fine-tuning --tag llama  # must have both tags
lab --format json experiment list --tag llama    # JSON output includes `tags` field
```

### `experiment tag add <experiment> <tags...>`

Add one or more tags to an experiment. `<experiment>` is a name or id; `<tags...>` is one or more space-separated tags. Both arguments are required.

```bash
lab experiment tag add my-experiment fine-tuning           # add one tag
lab experiment tag add my-experiment fine-tuning llama     # add multiple at once
```

### `experiment tag remove <experiment> <tags...>`

Remove one or more tags from an experiment. Same argument shape as `tag add`.

```bash
lab experiment tag remove my-experiment llama
lab experiment tag remove my-experiment fine-tuning llama
```

### `experiment tags`

List every distinct tag across all experiments you can read. No arguments.

```bash
lab experiment tags
```

> **Note:** `experiment create` does **not** accept tags — there is no `--tag` flag on `create`. Create the experiment first, then apply tags with `experiment tag add`.

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

### `task edit <task_id>`

Update an existing task on the server. Three modes:

| Option | Description |
|---|---|
| (no flag) | Interactive — fetches current `task.yaml`, opens `$EDITOR`, validates and PUTs it back. YAML-only. |
| `--from-file <path>` | Replace **only** `task.yaml` from the given path. Leaves `main.py` and other attachments untouched on the server. |
| `--from-dir <path>` | Replace `task.yaml` **and** sibling files (e.g. `main.py`, configs). Zips the directory, uploads, and applies. **Use this whenever the task's `run` references a script file you've also modified — `--from-file` alone will desync the YAML from the script.** |
| `--no-interactive` | Skip confirmation prompt (required in automated contexts) |
| `--dry-run` | With `--from-dir`, preview the upload without submitting |
| `--timeout <seconds>` | Request timeout for fetch/validate/save (default: 300) |

`--from-file` and `--from-dir` are mutually exclusive.

### `task upload <task_id> <path>`

Upload additional files (or a whole directory) into an existing task without touching `task.yaml`. Useful when you want to add an attachment to a task whose YAML is already correct.

### `task delete <task_id>`

Delete a task by ID.

### `task queue <task_id>`

Queue a task on a compute provider.

| Option | Description |
|---|---|
| `--no-interactive` | Skip prompts. Uses the task's configured provider or first available. Parameters use defaults. **Always use this in automated workflows.** |
| `-m`, `--description <text>` | Markdown note describing what this run is trying to accomplish (stored on the job, shown in `lab job info`). Pass `-` to read from stdin. **Agents: required per SKILL.md rule 13.** |
| `--image <image>` | Custom image for this run. RunPod: a pod image (e.g. `runpod/pytorch:...`). SkyPilot: prefix with `docker:` to run in a container. Falls back to the provider's image when omitted; ignored by providers that don't support image overrides. |

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
| `--provider <name_or_id>` | Provider name or ID (skips interactive selection) |
| `--template <gallery_id>` | Gallery template ID or name (e.g. `jupyter`, `vllm`, `ollama`) |
| `--env <KEY=VALUE>` | Environment variable (repeatable). E.g. `--env MODEL_NAME=llama3` |
| `--cpus <n>` | CPUs for remote provider |
| `--memory <n>` | Memory in GB for remote provider |
| `--disk <n>` | Disk in GB for remote provider |
| `--accelerators <spec>` | Accelerator spec for remote provider (e.g. `A100:1`) |
| `--num-nodes <n>` | Number of nodes for remote provider |
| `--minutes <n>` | Max minutes for remote provider |
| `--no-poll` | Launch and exit immediately without waiting for readiness |
| `--timeout <seconds>` | Timeout waiting for service readiness (default: 300) |

**Non-interactive mode:** Pass `--provider` and `--template` to skip all prompts. Use `--format json` for machine-readable output. Combine with `--no-poll` to launch and check readiness later via `lab job tunnel-info`.

```bash
# Non-interactive launch (agent-friendly)
lab --format json task interactive --provider local --template jupyter --no-poll

# With env vars and resources
lab --format json task interactive --provider my-aws --template vllm \
  --env MODEL_NAME=meta-llama/Llama-3-8B --accelerators "A100:1" --memory 32 --no-poll

# Launch and wait for readiness (blocks up to --timeout seconds)
lab --format json task interactive --provider local --template jupyter --timeout 120
```

**JSON output (with `--no-poll`):**
```json
{"job_id": "abc-123", "task_id": "def-456", "experiment_id": "alpha"}
```

**JSON output (without `--no-poll`, after service is ready):**
```json
{"is_ready": true, "tunnel_url": "https://...", "token": "...", "instructions": [...], "job_id": "abc-123", "task_id": "def-456", "experiment_id": "alpha"}
```

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

Get detailed job information including status, progress, config, resources, provider, artifacts, errors, and scores. For interactive jobs (`subtype: "interactive"`), automatically includes `tunnel_info` with connection URLs, tokens, ports, and readiness status.

**JSON output:**
```json
{"id": "abc-123", "status": "RUNNING", "progress": 45, "config": {...}, "artifacts": [...], "errors": [...], ...}
```

**JSON output for interactive jobs (extra `tunnel_info` field):**
```json
{
  "id": "abc-123", "status": "INTERACTIVE", ...,
  "tunnel_info": {
    "is_ready": true,
    "tunnel_url": "http://localhost:8888",
    "token": "...",
    "interactive_type": "jupyter",
    "ports": [{"port": 8888, "label": "Jupyter Lab", "protocol": "http"}],
    "instructions": [{"kind": "url", "title": "Open Jupyter", "value_key": "jupyter_url"}, ...]
  }
}
```

When `tunnel_info.is_ready` is `false`, the service is still starting — poll again after a few seconds. For VS Code, the `auth_code` may appear before `tunnel_url` (user must complete GitHub device auth at https://github.com/login/device first).

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

### `job chart`

Export the experiment's job runs chart as a PNG image (each run's metric score over time, best-so-far runs highlighted, discarded runs grayed out, best-so-far step line), and/or enable public sharing of the live chart. The PNG is rendered server-side via `GET /experiment/{id}/jobs/chart.png`; sharing uses the `/experiment/{id}/share/chart` endpoints — both require a server new enough to have them.

| Option | Description |
|---|---|
| `--output` / `-o <path>` | Path to write the PNG file. Required unless `--share` is given. |
| `--share` | Enable public sharing for the jobs chart and print the public link (anyone with the link can view the live chart, no login). Reuses the existing active link; only mints a new one when sharing is off, with a confirmation prompt unless `--no-interactive` / `--format json` is set. |
| `--metric <key>` | Metric key to plot (default: auto-detected primary metric — prefers a key named `score`, else the first metric key). PNG only. |
| `--lower-is-better` / `--higher-is-better` | Direction for "best" run highlighting (default: majority vote over each job's `job_data.lower_is_better`). PNG only. |
| `--experiment` / `-e <id>` | Per-command experiment override. |

```bash
lab job chart -o runs.png
lab job chart -o runs.png --metric eval/loss --lower-is-better
lab job chart --share                  # public link only, no PNG
lab job chart --share -o runs.png      # both
```

At least one of `-o`/`--share` is required. Errors: exits 1 with the server's message when the experiment has no scored jobs or `--metric` is unknown; on older servers without the endpoints it reports that chart export (or public sharing) is unsupported.

**JSON output (success):**
```json
{"saved": "/absolute/path/to/runs.png"}
```
With `--share` (printed as its own JSON object before the `saved` line when `-o` is also given):
```json
{"url": "https://.../#/public/share/<token>", "token": "<token>", "created_at": "..."}
```

Related: `lab notes show --share` works the same way for the experiment notes (`/experiment/{id}/share/notes`).

### `job stop <job_id>`

Stop a running job.

### `job monitor`

Launch the interactive job monitor TUI (Textual app).

**Warning:** This launches a full terminal UI. **Never use when operating as an AI agent or in non-interactive automation.** Use `job list`, `job info`, and `job task-logs` instead.

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
| `--type <type>` | Provider type: `slurm`, `skypilot`, `runpod`, `local`, `dstack`, `aws`, `gcp`, `azure` |
| `--config <json>` | Config as JSON string |
| `--interactive` / `--no-interactive` | Toggle prompts. Non-interactive requires `--name`, `--type`, AND `--config` (pass `'{}'` for `local`). |
| `--credentials-file <path>` | Path to a JSON file containing provider secrets. Shape depends on `--type` (see below). Keeps secrets out of `argv` (shell history, `ps`). |

**Always use `--no-interactive` with `--name`, `--type`, and `--config` in automated workflows.**

#### Per-type config schema

The shape of `--config` depends on `--type`:

| Type | Config keys | `--credentials-file` shape |
|---|---|---|
| `local` | (none — pass `{}`) | (n/a) |
| `skypilot` | `server_url` | `{"api_token": "..."}` (or any other secret keys to merge into config) |
| `slurm` | `mode` (`ssh` or `rest`); for `ssh`: `ssh_host`, `ssh_user`, `ssh_key_path`, `ssh_port`; for `rest`: `rest_url` | `{"api_token": "..."}` for REST mode |
| `runpod` | `api_base_url`, `default_gpu_type`, `default_region`, `default_template_id`, `default_network_volume_id` | `{"api_key": "..."}` |
| `dstack` | `server_url`, `dstack_project` | `{"api_token": "..."}` |
| `aws` | `region`. | `{"aws_access_key_id": "...", "aws_secret_access_key": "..."}` — uploaded to `~/.aws/credentials` on the API host. |
| `gcp` | `region`, optional `zone`. | The **raw service account JSON key file** (point `--credentials-file` directly at the file you'd pass to `gcloud auth activate-service-account --key-file=`). |
| `azure` | `azure_subscription_id`, `azure_tenant_id`, `azure_client_id`, `azure_location` | `{"azure_client_secret": "..."}` |
| `nebius` | optional `parent_id` (project id; required unless `subnet_id` set), `subnet_id`, `default_platform`, `default_preset`, `boot_image_family`, `disk_size_gib` | `{"service_account_id": "...", "public_key_id": "...", "private_key": "..."}` — uploaded to the dedicated `/nebius/credentials` endpoint. |

You can put any combination of secret fields in `--credentials-file` — for non-AWS/GCP/Nebius types they merge on top of `--config` and take precedence on conflict. AWS access keys, GCP service account JSON, and Nebius service-account key pairs are routed to their dedicated upload endpoints.

```bash
lab provider add --no-interactive --name local --type local --config '{}'

# Secrets via --credentials-file — preferred for scripted / CI flows
# skypilot-creds.json: {"api_token": "TOKEN"}
lab provider add --no-interactive --name sky1 --type skypilot \
  --config '{"server_url": "https://sky.example.com"}' \
  --credentials-file ./skypilot-creds.json

# slurm-creds.json: {"api_token": "TOKEN"}
lab provider add --no-interactive --name slurm-ssh --type slurm \
  --config '{"mode": "ssh", "ssh_host": "cluster.example.com", "ssh_user": "ali", "ssh_key_path": "~/.ssh/id_rsa", "ssh_port": "22"}'

# runpod-creds.json: {"api_key": "KEY"}
lab provider add --no-interactive --name rp1 --type runpod \
  --config '{"default_gpu_type": "NVIDIA H100"}' \
  --credentials-file ./runpod-creds.json

# dstack-creds.json: {"api_token": "TOKEN"}
lab provider add --no-interactive --name dstack1 --type dstack \
  --config '{"server_url": "http://0.0.0.0:3000", "dstack_project": "main"}' \
  --credentials-file ./dstack-creds.json

# aws-creds.json: {"aws_access_key_id": "AKIA...", "aws_secret_access_key": "..."}
lab provider add --no-interactive --name aws1 --type aws \
  --config '{"region": "us-east-1"}' \
  --credentials-file ./aws-creds.json

# Pass the GCP service account JSON file directly
lab provider add --no-interactive --name gcp1 --type gcp \
  --config '{"region": "us-central1"}' \
  --credentials-file ~/.config/gcloud/sa-key.json

# azure-creds.json: {"azure_client_secret": "REDACTED"}
lab provider add --no-interactive --name azure1 --type azure \
  --config '{"azure_subscription_id": "sub", "azure_tenant_id": "tenant", "azure_client_id": "client", "azure_location": "eastus"}' \
  --credentials-file ./azure-creds.json
```

> **Security note:** Secrets embedded inside `--config` (`api_token`, `api_key`, `azure_client_secret`, etc.) appear in your shell history and in `ps`/proc listings while the command runs. **For scripted / CI use, prefer `--credentials-file PATH`** — values stay on disk, never on `argv`. `chmod 600` the file, source it from a secret manager / CI vault, and delete it after the `lab provider add` call. For one-off interactive use, the interactive `lab provider add` flow prompts for secrets without echoing them to argv.

### `provider update <provider_id>`

Update a compute provider. Fields are merged with existing config.

| Option | Description |
|---|---|
| `--name <name>` | New provider name |
| `--config <json>` | Config fields as JSON string (merged with existing) |
| `--credentials-file <path>` | Path to a JSON file whose fields are merged into the config patch (file values win over `--config`). Use this for credential rotation — keeps secrets out of `argv`. |
| `--disabled` / `--enabled` | Disable or enable the provider |

### `provider delete <provider_id>`

Delete a compute provider.

| Option | Description |
|---|---|
| `--no-interactive` | Skip confirmation prompt. **Always use in automated workflows.** Note: `provider delete` uses `--no-interactive`, NOT `--yes`/`-y` (which is what `model delete` and `dataset delete` use). |

### `provider check <provider_id>`

Check connectivity and health of a provider.

### `provider gpus <provider_id_or_name>`

Show the GPUs available on a provider. The argument accepts either a provider id
or a name (resolved the same way as `provider delete`). Output is a `GPU | Count`
table, or `--format json` returns `{provider_id, provider_type, gpus: [{gpu, count}]}`.

Semantics: **live availability where the backend can report it** — Slurm (free
GPUs per node), SkyPilot (catalog across enabled clouds), RunPod, Lambda
(regions with capacity), Vast.ai (rentable offers), Local (detected GPUs) —
otherwise the provider's **catalog of launchable GPU types** (AWS, GCP, Azure,
Nebius, and the fallback for the live providers). `count` is the available
quantity for live sources, or the max launchable count per node for catalog
sources; there is no live-vs-catalog flag in the output. An empty list
(`No GPU information available`) is expected for dstack (no enumeration endpoint)
and CPU-only local hosts. The command never errors on backend failures — it
degrades to the catalog or an empty list.

```bash
lab provider gpus my-skypilot
lab --format json provider gpus PROVIDER_ID
```

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
