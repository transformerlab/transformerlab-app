---
name: transformerlab-cli
description: Transformer Lab CLI for managing ML training tasks, jobs, compute providers, models, and datasets. Use when the user needs to check job status, stream logs, download artifacts, queue training tasks, upload or edit tasks, manage compute providers, list or create models, upload or download datasets, publish job outputs, run autonomous experiment loops (autoresearch), or interact with Transformer Lab programmatically. Triggers include "check job status", "download results", "queue a task", "upload a task", "edit a task", "list providers", "add provider", "configure provider", "stream logs", "what's running", "monitor training", "add a task", "check provider health", "list models", "create model", "upload dataset", "download dataset", "publish model", "publish dataset", "run autoresearch", "optimize X in a loop", "set up autoresearch", "/lab-autoresearch".
allowed-tools: Bash(lab *), Bash(curl *lab.cloud*), Bash(curl *localhost:8338*), WebFetch(domain:lab.cloud)
---

# Transformer Lab CLI

Use the `lab` CLI to interact with Transformer Lab programmatically — managing tasks, jobs, compute providers, models, datasets, and server configuration from the terminal.

## Official Documentation

The canonical Transformer Lab documentation is published at **https://lab.cloud**. When in doubt about a feature, schema, or SDK call, fetch the relevant page rather than guessing.

- **Documentation index (LLM-friendly):** https://lab.cloud/llms.txt — start here to discover all available pages.
- **`task.yaml` structure:** https://lab.cloud/for-teams/running-a-task/task-yaml-structure.md — full schema reference for every field in `task.yaml` (resources, sweeps, parameters, envs, etc.).
- **Lab SDK (Python):** https://lab.cloud/for-teams/lab-sdk.md — how to use the optional `transformerlab` SDK inside a task's `main.py` (or any Python script) — `lab.init()`, `lab.log()`, `lab.update_progress()`, `lab.get_config()`, `lab.save_artifact()`, `lab.finish()`, `lab.error()`.

Use `WebFetch` to load these directly when working on related code — the `task.yaml` and Lab SDK pages are the source of truth and may contain newer fields than this skill captures.

## Installation

```bash
uv tool install transformerlab-cli
# or
pip install transformerlab-cli
```

Verify: `lab version`

## First-Time Setup & Authentication

**If the CLI returns `Missing required configuration keys: team_id, user_email` (or any other auth/config error), do NOT ask the user for an API key.** Instead, tell them to run:

```bash
lab login
```

This launches the interactive login flow in their terminal. Wait for them to complete it, then retry the original command. Never prompt the user to paste an API key into the conversation.

**The CLI only supports API key authentication.** There is no `--email` or `--password` flag. To connect:

```bash
# Step 1: Set the server (if not using default localhost)
lab config set server https://your-server-url

# Step 2: Login with an API key
lab login --api-key YOUR_API_KEY --server https://your-server-url

# Step 3: Set the current experiment.
#   Use `lab experiment list` to see existing experiments.
#   If yours doesn't exist yet, run `lab experiment create your_experiment_name` first.
#   `lab experiment set-default <id>` is a convenience equivalent to this command.
lab config set current_experiment your_experiment_name

# Step 4: Verify connectivity
lab status
```

`login` validates the key and automatically configures `server`, `team_id`, `user_email`, and `team_name`.

**Getting an API key:** If `lab status` fails with auth errors, **stop and ask the user to provide an API key.** Do NOT attempt to create API keys programmatically by logging in with email/password. API keys are created in the Transformer Lab web UI under team settings. The user must provide the key to you.

### Verifying You're Connected to the Right Server

After login, always verify:

```bash
lab config        # Shows server URL, team, user, experiment
lab status        # Shows server version and connectivity
lab whoami        # Confirms authenticated user and team
```

If `lab status` returns errors but `curl -s https://SERVER/` returns 200, the issue is likely auth — re-run `lab login`.

## Critical: `--format` Flag Placement

The `--format` flag is a **root-level option** and MUST come immediately after `lab`, before any subcommand:

```bash
# CORRECT
lab --format json job list
lab --format json task info 42

# WRONG — will be ignored or cause an error
lab job list --format json
```

## Profiles: talking to multiple servers in parallel

A **profile** bundles one server's URL, team, experiment, and API key. The `default` profile lives at the legacy location (`~/.lab/config.json`, `~/.lab/credentials`); named profiles live under `~/.lab/profiles/<name>/`. This lets two `lab` commands hit two different servers (with different teams / API keys) **at the same time** without clobbering each other.

Selection is **per-process** — there is no stored "current profile" to switch (so nothing one process can yank out from under another). Precedence (highest first):

1. `--profile <name>` — a root-level flag; like `--format` it MUST come before the subcommand: `lab --profile prod job list`
2. `LAB_PROFILE` environment variable
3. `default`

```bash
# Create/authenticate a profile. `login` is the profile-creating command;
# combine the global --profile flag with --server:
lab --profile prod    login --server https://prod.example.com:8338
lab --profile staging login --server https://staging.example.com:8338

# Run against two servers in parallel — fully isolated, safe:
LAB_PROFILE=prod    lab job list &
LAB_PROFILE=staging lab job list &

# One-off override without exporting the env var:
lab --profile prod job list
```

Manage profiles:

```bash
lab profile list           # all profiles; marks the active one + which have saved credentials
lab profile show [name]    # server/team/user/experiment for a profile (defaults to the active one)
lab profile delete <name>  # remove a named profile ('default' cannot be deleted)
```

**For agents:** to run workstreams against different *servers* concurrently, give each its own profile and set `LAB_PROFILE` per process (or pass `--profile` on every call). This is the server/team/credentials analogue of the per-command `-e/--experiment` override — profiles scope which server+team+key you talk to, `-e` scopes which experiment *within* that server (see "Scoping a single command to an experiment"). Profiles do **not** scope the experiment; keep using `-e` for that.

## Core Workflow

The standard pattern for working with Transformer Lab:

```bash
# 1. Check server is up
lab status

# 2. List available tasks
lab task list

# 3. Queue a task on a compute provider
#    NOTE: --no-interactive silently picks the DEFAULT provider (Local).
#    To pick a specific provider, run interactively (see "Selecting a provider" below).
#    ALWAYS pass --description/-m with a markdown note describing the iteration
#    (see "Always write a run description" below).
lab task queue TASK_ID --no-interactive -m "Testing lr=3e-5 after loss plateaued at 2.1"

# 4. Monitor the job (three log streams — see "Job logs: three real commands" below)
lab job list --running
lab job task-logs JOB_ID --follow      # Lab SDK output (lab.log, progress) — start here
lab job machine-logs JOB_ID --follow   # Raw process stdout+stderr from the remote node
lab job request-logs JOB_ID --follow   # Provider launch/provisioning logs (e.g. SkyPilot)

# 5. Download results
lab job artifacts JOB_ID
lab job download JOB_ID --file "*.csv" -o ./results

# 6. (Optional) Export the experiment's job runs chart as a PNG, or share it publicly
lab job chart -o runs.png
lab job chart --share          # enable public sharing and print the public link
```

## Creating Tasks

### Scaffold a new task with `lab task init`

**When the user asks to create, initialize, or start a new task, always use `lab task init`** rather than writing `task.yaml` / `main.py` by hand. It scaffolds both files with sensible defaults in the current directory so the user has a working starting point.

```bash
mkdir my-task && cd my-task
lab task init            # writes task.yaml + main.py with defaults (skips existing files)
lab task init --interactive   # prompts for name, CPUs, memory, setup, and run command
```

- Default mode is non-interactive. It creates `task.yaml` (with `name`, `resources: {cpus: 2, memory: 4}`, and `run: python main.py`) and a starter `main.py`. Existing files are skipped, not overwritten.
- `--interactive` writes only `task.yaml` (no `main.py`) and prompts for each field. In this mode `task.yaml` will prompt before overwrite.
- After init, edit `main.py`, customize `task.yaml`, then run `lab task add .` to create it on the server.

### task.yaml Structure

**Full schema reference:** https://lab.cloud/for-teams/running-a-task/task-yaml-structure.md — fetch this page when adding any field not shown below or when validating an unfamiliar `task.yaml`.

```yaml
name: my-task                          # Required — task identifier
resources:                             # Optional but recommended
  cpus: 2                              # CPU count (integer or string)
  memory: 4                            # RAM in GB (integer or string, NOT "4Gi")
  disk_space: 100                      # Storage in GB
  accelerators: "H100:8"              # GPU spec as "TYPE:COUNT"
  num_nodes: 2                         # For distributed training
  compute_provider: my-provider        # Target provider name
setup: |                               # Optional — runs before main task
  pip install -r requirements.txt      # The `transformerlab` SDK is preinstalled — do NOT add `pip install transformerlab`
run: python main.py                    # Required — main entry point
envs:                                  # Optional environment variables
  HF_TOKEN: "{{secret._HF_TOKEN}}"     # Secrets use {{secret.<name>}} — NOT ${...} shell syntax (which silently resolves empty)
parameters:                            # Optional — accessible via lab.get_config()
  learning_rate: 0.001
  batch_size: 32
sweeps:                                # Optional — hyperparameter sweep
  sweep_config:
    learning_rate: ["1e-5", "3e-5"]
  sweep_metric: "eval/loss"
  lower_is_better: true
minutes_requested: 60                  # Optional time limit
github_repo_url: https://...           # Optional — clone from git
github_repo_dir: path/in/repo
github_repo_branch: main
```

**Important:** `memory` and `disk_space` are plain numbers in GB (e.g., `4`, `16`), NOT Kubernetes-style strings like `4Gi`. The schema accepts both but the canonical format is plain integers.

### Secrets in task configs (`{{secret.<name>}}`)

Reference account secrets anywhere in a task config with `{{secret.<secret_name>}}` —
the system substitutes real values at launch. Works in `run` commands
(`python script.py --api-key {{secret.API_KEY}}`), `setup`
(`export TOKEN={{secret.TOKEN}}`), and `envs`
(`HF_TOKEN: "{{secret._HF_TOKEN}}"`); in Python, `lab.get_secret("API_KEY")`.

**Special secrets** are pre-provisioned per account with a leading underscore:
`_HF_TOKEN`, `_GITHUB_PAT_TOKEN`, `_WANDB_API_KEY`, `_NGROK_AUTH_TOKEN` (managed in
the UI's Special Secrets section; custom secrets are added under Custom Secrets).
For gated HuggingFace repos (e.g. meta-llama), the task MUST set
`HF_TOKEN: "{{secret._HF_TOKEN}}"` in `envs` — jobs get NO HF credentials by default,
and shell-style `${HF_TOKEN}` silently resolves to empty (HF then 401s with
"Please log in").

### Validation

`lab task add` automatically validates task.yaml against the server schema before creating the task. You can also validate directly with `lab task validate [path/to/task.yaml]` (defaults to `./task.yaml`), including JSON output via `lab --format json task validate`.

To validate without creating, use `lab task add ./my-task --dry-run`.

### Editing an existing task

Use `lab task edit` to update an existing task on the server. Three modes:

```bash
# Interactive editor flow (opens $EDITOR with current task.yaml)
lab task edit TASK_ID

# Replace ONLY task.yaml (leaves main.py and other attachments untouched)
lab task edit TASK_ID --from-file ./task.yaml --no-interactive

# Replace task.yaml AND attachments (main.py, configs, etc.) from a directory
lab task edit TASK_ID --from-dir ./my-task --no-interactive
```

**Choosing between `--from-file` and `--from-dir`:**
- `--from-file <task.yaml>` only updates the YAML. Use it when you're tweaking parameters or the `run` command and the rest of the task directory is unchanged.
- `--from-dir <directory>` zips and uploads the whole directory (must contain `task.yaml`), replacing the task's files server-side. Use it when you've also modified `main.py` or any sibling files. **If the task's `run` references a script (e.g. `python main.py`), reuploading just the YAML will leave the old script in place — use `--from-dir` to keep them in sync.**

`--from-file` and `--from-dir` are mutually exclusive. `lab task edit` also supports `--no-interactive`, `--dry-run` (with `--from-dir`), and `--timeout`.

### Uploading extra files to an existing task

Use `lab task upload` to upload files or directories into an existing task:

```bash
# Upload a single file
lab task upload TASK_ID ./tokenizer.json

# Upload a directory
lab task upload TASK_ID ./prompts --no-interactive
```

`lab task upload` requires both `TASK_ID` and `PATH`.

### Lab SDK Quick Reference

**Full SDK docs:** https://lab.cloud/for-teams/lab-sdk.md — fetch this page when using the SDK from a Python script (inside or outside a task), or when you need a method not covered below.

Tasks use the Lab SDK (`transformerlab` PyPI package). Import pattern:

```python
from lab import lab

lab.init()                                    # Required — connects to the job
lab.log("message")                            # Write to job output log
lab.update_progress(50)                       # Set progress 0-100
config = lab.get_config()                     # Read parameters from task.yaml
lab.save_artifact("metrics.json")             # Save a generic artifact
lab.save_artifact("eval_results.csv", name="eval_results.csv", type="evals")  # Save eval results

lab.finish(message="Done!")                              # success, no score
lab.finish(message="Done!", score={"accuracy": 0.78})    # success with metric(s)
lab.finish(score={"accuracy": 0.78, "f1": 0.83})         # multiple metrics
lab.error(message="Something went wrong")                # Mark job as FAILED
```

**Common mistakes:**
- `lab.finish()` has NO `status` parameter — just `message`. For failures, use `lab.error()`.
- `score=` takes a **dict** of named metrics, not a scalar. Use `score={"accuracy": 0.78}`, never `score=0.78`. The dict populates `job_data.score`, visible in `lab job list` (Score column) and `lab job info`, and is read by sweep / autoresearch flows.
- Use `lab.save_artifact(..., type="evals")` for file-based eval outputs so they appear in eval results metadata, not as generic artifacts.
- Always call `lab.init()` before any other SDK call.
- Always call `lab.finish()` or `lab.error()` at the end — otherwise the job stays in RUNNING state.

### Example: Minimal Hello World Task

**task.yaml:**
```yaml
name: hello-world
run: python main.py                    # No `setup:` needed — the `transformerlab` SDK is preinstalled in the task environment
resources:
  cpus: 2
  memory: 4
```

**main.py:**
```python
import time
from lab import lab

lab.init()
lab.log("Hello from Transformer Lab!")
lab.update_progress(25)
time.sleep(3)
lab.log("Working...")
lab.update_progress(75)
time.sleep(2)
lab.log("Done!")
lab.update_progress(100)
lab.finish(message="Hello world complete!")
```

**Add it:**
```bash
lab task add ./hello-world-task --no-interactive
```

## Managing Experiments

Use `lab experiment` commands to list, create, delete, tag, and set the default experiment. **Experiments are the container for tasks and jobs** — `lab task` / `lab job` / `lab notes` commands operate against the *current* experiment (the one stored in `~/.lab/config.json` as `current_experiment`) **unless you override it per-command with `--experiment/-e`** (see "Scoping a single command to an experiment" below).

```bash
# List all experiments. The current default is marked with `*`.
lab experiment list
lab --format json experiment list

# Create a new experiment
lab experiment create my-experiment

# Create and immediately set as the default
lab experiment create my-experiment --set-default

# Delete an experiment (`--no-interactive` to skip confirmation)
lab experiment delete my-experiment --no-interactive

# Switch which experiment is the default. This writes to ~/.lab/config.json.
lab experiment set-default my-experiment
```

### Scoping a single command to an experiment: `--experiment/-e`

`lab task`, `lab job`, and `lab notes` subcommands all accept a per-command **`--experiment/-e <id_or_name>`** override. When present it takes precedence over the global `current_experiment`; when absent the command falls back to the global default. This is the *only* way to target an experiment **without mutating shared state**:

```bash
lab task queue TASK_ID -e exp-a --no-interactive -m "..."   # queues into exp-a
lab --format json job list -e exp-a --score-metric eval/loss
lab notes append "..." -e exp-a
```

**Why this matters — concurrent work across experiments.** `lab experiment set-default` and `lab config set current_experiment` both write the *single, shared* `current_experiment` key in `~/.lab/config.json`. If two workflows are operating on two different experiments at the same time (e.g. several autoresearch sessions, or a fan-out across model families), whoever calls `set-default` last wins, and any command that *didn't* pass `-e` silently lands in the wrong experiment. To run experiments in parallel safely:

- **Pass `-e <exp>` on every `task` / `job` / `notes` command** for that workstream. Treat it as mandatory, not optional — a single omitted `-e` leaks into the global default.
- **Never call `lab experiment set-default` (or `lab config set current_experiment`) mid-flight** while other experiments are in flight — it yanks the default out from under any command that forgot its `-e`.
- There is **no environment variable** (e.g. `LAB_EXPERIMENT`) and **no per-session config file** to scope the *experiment* once for a whole session — the `-e` override is strictly per-command. Plan for passing `-e` on each call. (The *server/team/credentials* dimension is different: that **can** be scoped per-process via a profile + `LAB_PROFILE` — see "Profiles: talking to multiple servers in parallel". A profile does not pin the experiment, so even within a profile you still pass `-e` per command.)

For a single, sequential workflow it's fine to set the default once with `set-default` and omit `-e`. The `-e` discipline only becomes load-bearing when more than one experiment is active concurrently.

### Tagging experiments

Experiments support free-form tags for organizing and filtering. **`lab experiment create` does NOT accept tags** — there is no `--tag` flag on `create`. Tags are managed *after* creation with the dedicated `lab experiment tag` subcommands, and you filter by them with `lab experiment list --tag`.

```bash
# Add one or more tags to an experiment (by name or id). Both args required.
lab experiment tag add my-experiment fine-tuning llama

# Remove one or more tags from an experiment
lab experiment tag remove my-experiment llama

# List every distinct tag across experiments you can read
lab experiment tags

# Filter experiments by tag. Repeat --tag to AND multiple tags (client-side filter).
lab experiment list --tag fine-tuning
lab experiment list --tag fine-tuning --tag llama   # must have BOTH tags
lab --format json experiment list --tag llama       # JSON output includes a `tags` field
```

To create-and-tag in one flow, run `create` then `tag add`:

```bash
lab experiment create my-experiment --set-default
lab experiment tag add my-experiment fine-tuning llama
```

**Tags are how you regroup experiments that were run in parallel.** When you fan out across several experiments at once (each scoped via `-e`, see above), give them all one shared campaign tag at creation time so you can find and rank them together afterward:

```bash
# Tag every experiment in a campaign with the same label...
lab experiment tag add exp-a my-campaign
lab experiment tag add exp-b my-campaign
# ...then list the whole fleet in one shot.
lab --format json experiment list --tag my-campaign
```

### `lab experiment set-default` vs `lab config set current_experiment`

Both write the same key (`current_experiment`) to `~/.lab/config.json`. Differences:

- `lab experiment set-default <id>` validates that the experiment exists on the server before writing. Prefer this when scripting — it fails fast on a typo.
- `lab config set current_experiment <id>` is a raw config write and does not validate. Useful when bootstrapping a config (e.g. before the server is reachable) or when you've already confirmed the experiment exists.

### Finding an experiment ID by name

`lab experiment list` (and the JSON form) is the only sanctioned way to discover experiment IDs. **Do not fall back to `curl /experiment/`** — even when you only have a name and need the ID, this CLI surface covers it:

```bash
# Get just the ID for a given name
lab --format json experiment list | jq -r '.experiments[] | select(.name=="my-experiment") | .id'
```

`lab --format json experiment list` returns:
```json
{
  "current_experiment": "my-experiment",
  "experiments": [
    {"id": "my-experiment", "name": "my-experiment", "config": {}}
  ]
}
```

## Experiment Notes

Each experiment has a single shared markdown document — the "experiment notes" — that persists on the server. It's separate from per-job `-m/--description` notes: those describe one run, the experiment notes describe the experiment as a whole (hypothesis, running findings, decisions, links to key job IDs).

```bash
# Render the notes (markdown, with formatting)
lab notes show
lab notes show --raw           # plain markdown, no rendering — better for piping/grepping

# Edit interactively in $EDITOR (defaults to nano if unset)
lab notes edit

# Append a single line, non-interactive — best for agents
lab notes append "2026-05-05: switched provider from local to skypilot; queue depth was >12"

# Enable public sharing for the notes and print the public link (instead of the notes)
lab notes show --share
```

All commands operate on the **current experiment** (`require_current_experiment` — set it first via `lab experiment set-default`). There is no `--format json` output for the notes content itself; `show` returns the raw string and `append`/`edit` write it back.

`lab notes show --share` enables **public sharing** for the experiment notes and prints the public link instead of the notes. Anyone with the link can view the live notes (no login). It reuses the experiment's existing active link if one exists; only when sharing is off does it mint a new one, asking for confirmation first unless `--no-interactive` / `--format json` is set. With `--format json` it prints `{"url": ..., "token": ..., "created_at": ...}`. Requires the `/experiment/{id}/share/notes` endpoints — on older servers the CLI reports "This server does not support public sharing".

### When agents should use it

Experiment notes are the right place for context that future conversations (or teammates) will need but that doesn't belong on a single job:

- **Running hypothesis log** — append after each batch of runs: "Tried lr ∈ {1e-5, 3e-5, 5e-5}; 3e-5 wins on eval/loss. Next: try larger batch."
- **Decisions and their rationale** — "Dropped baseline-v1 from comparison; tokenizer mismatch made eval scores incomparable."
- **Pointers** — "Best run so far: job 7f21abcd, score 0.83. Worst: 9c12, diverged at step 500."
- **Open questions / next steps** — so the next session picks up where this one stopped.

**Default flow for agents working in an experiment:**

1. At the start of a session, run `lab notes show --raw` to load prior context.
2. After each meaningful action (queueing a sweep, finding a winning config, hitting a blocker), `lab notes append "..."` with a dated one-liner. Always lead with today's date (e.g. `2026-05-05:`) so the log stays chronological.
3. Use `lab notes edit` only when the user asks to reorganize or rewrite — appending is safer because it never destroys prior content.

Don't duplicate per-run details (those go in `lab task queue -m`). Don't use experiment notes as a TODO list for the conversation — that's what plans/tasks are for. Keep entries terse and specific.

## Managing Models

Use `lab model` commands to list, inspect, create, edit, and delete model groups on the server. Models are organized as **groups** — each group can contain multiple versions (e.g. v1, v2, …).

```bash
# List all model groups
lab --format json model list

# Get details for a specific model (by group_id or group_name)
lab --format json model info GROUP_ID

# Register a new model (e.g. a HuggingFace model ID) — creates a new group with version v1
lab --format json model create my-hf-model-id --name "My Fine-tuned Model" --description "SFT on custom data"

# Edit a model group's name or description
lab model edit GROUP_ID --name "New Name" --description "Updated description"

# Delete a model group and all its versions (--yes to skip confirmation)
lab model delete GROUP_ID --yes
```

### Adding a new version to an existing model group

Re-run `lab model create` with the **same `--name`** as an existing group. The server resolves the group by name and appends a new version with an auto-incremented label (`v2`, `v3`, …). The `latest` tag (or whatever you pass via `--tag`) is moved to the new version automatically.

```bash
# Adds version v2 to "My Fine-tuned Model" (assuming v1 already exists).
# The server scans existing v\d+ labels and picks the next one.
lab --format json model create my-hf-model-id-v2 --name "My Fine-tuned Model" --description "Retrained with more data"

# Pin a specific version label instead of auto-incrementing.
# Labels are free-form strings — server only auto-increments the v\d+ pattern.
# Collisions within a group are rejected with an error.
lab model create my-hf-model-id-exp --name "My Fine-tuned Model" --version-label "experimental-2026-05"
```

The version label is the human-readable identifier in `lab model info` output. The internal `id` (UUID) remains unique per version regardless of label.

### Uploading model files

```bash
# Upload local files/directories to a model on the server.
# Creates the model if it doesn't exist; MODEL_ID is what you'll use
# in subsequent lab model commands.
lab model upload MODEL_ID ./path/to/model-dir

# Multiple paths in one call
lab model upload MODEL_ID ./tokenizer.json ./config.json

# Overwrite server-side files that already exist
lab model upload MODEL_ID ./path/to/model-dir --force
```

The server runs a finalize step at the end of `upload`. Finalize fails with `cannot finalize: no config.json present. Upload one first.` unless the upload includes a `config.json` at the root with at least an `architectures` field. Minimal example:

```json
{
  "model_type": "fake",
  "architectures": ["LlamaForCausalLM"],
  "hidden_size": 4096
}
```

For real models this is the standard HuggingFace `config.json`. The server records `architectures[0]` as the model architecture.

Re-running `lab model upload` against the same `MODEL_ID` skips files that already exist on the server and exits with code 2 (skipped some, did not fail). Use `--force` to overwrite.

### Downloading model files

```bash
# Download a previously-uploaded model to <dest>/<MODEL_ID>/
lab model download MODEL_ID ./local-models
```

The server streams every file in the model directory; the destination directory is created if missing, and files land under `<dest>/<MODEL_ID>/`.

### Publishing a model from a job

After a training job completes, publish its output model to the registry:

```bash
# Interactive — prompts for model name, group, mode, tag
lab job publish model JOB_ID

# Non-interactive (for agents) — all options explicit
lab --format json job publish model JOB_ID MODEL_NAME --group "my-model-group" --mode new --tag latest --description "Trained with lr=3e-5"
```

## Managing Datasets

Use `lab dataset` commands to list, inspect, upload, download, edit, and delete datasets. Like models, datasets are organized as **groups** with versions.

```bash
# List all dataset groups
lab --format json dataset list

# Get details for a specific dataset (by group_id or group_name)
lab --format json dataset info GROUP_ID

# Edit a dataset group's name or description
lab dataset edit GROUP_ID --name "New Name" --description "Updated description"

# Delete a dataset group and all its versions (--yes to skip confirmation)
lab dataset delete GROUP_ID --yes
```

### Uploading dataset files

```bash
# Upload local files/directories to a dataset on the server.
# Creates the dataset if it doesn't exist; DATASET_ID is what you'll use
# in subsequent lab dataset commands.
lab dataset upload DATASET_ID ./train.jsonl ./eval.jsonl

# Upload a directory (preserves relative paths under DATASET_ID/)
lab dataset upload DATASET_ID ./my-dataset-dir

# Overwrite server-side files that already exist
lab dataset upload DATASET_ID ./train.jsonl --force
```

Re-running `lab dataset upload` against the same `DATASET_ID` skips files that already exist on the server and exits with code 2 (skipped some, did not fail). Use `--force` to overwrite. Adding a brand-new file to an existing dataset is a normal upload (no conflict, exit 0) — just include the new path in the command.

The first successful upload registers the dataset in the asset_versions registry as `v1`/`latest`, which is what makes it appear in `lab dataset list`, `lab dataset info`, and the Dataset Registry UI. Re-uploads (with or without `--force`) do **not** spawn a new version — the registry stays at `v1`/`latest` and points at the same on-disk directory. To explicitly create a new version, use `lab job publish dataset` from a job that produced new outputs.

### Downloading dataset files

```bash
# Download a previously-uploaded dataset to <dest>/<DATASET_ID>/
lab dataset download DATASET_ID ./local-datasets
```

Both `DATASET_ID` and `DEST_DIR` are required. The server streams every file in the dataset directory; the destination is created if missing, and files land under `<dest>/<DATASET_ID>/` (including a server-generated `index.json`).

**Note:** `lab dataset download` no longer pulls from HuggingFace Hub — it only downloads a dataset that already lives on the server. To get a HuggingFace dataset onto the server, either (a) upload it via `lab dataset upload` after fetching it locally, or (b) reference it from inside a task's code using `datasets.load_dataset("user/repo")`.

### Publishing a dataset from a job

After a job produces output datasets, publish them to the registry:

```bash
# Interactive — prompts for dataset name, group, mode, tag
lab job publish dataset JOB_ID

# Non-interactive (for agents) — all options explicit
lab --format json job publish dataset JOB_ID DATASET_NAME --group "my-dataset-group" --mode new --tag latest --description "Generated eval set"
```

### Dataset workflow for tasks

When a task needs a specific dataset, ensure it exists on the server **before** queuing:

```bash
# 1. Check if the dataset already exists
lab --format json dataset list

# 2. If not, upload local files (creates the dataset)
lab dataset upload my-dataset ./train.jsonl ./eval.jsonl

# 3. Reference the dataset in task.yaml parameters
#    The task code uses lab.get_config()["dataset_id"] to access it

# 4. Queue the task
lab task queue TASK_ID --no-interactive -m "Training on my-dataset"
```

## Managing Providers

Use `lab provider` commands to list, inspect, add, configure, enable/disable, and health-check compute providers. Providers are the backends that actually run jobs (Local, SkyPilot clusters, Slurm clusters, RunPod).

```bash
# List providers (omit --include-disabled by default — only active ones show)
lab --format json provider list
lab --format json provider list --include-disabled

# Show details for one provider
lab --format json provider info PROVIDER_ID

# Health check (verifies the CLI can reach the provider's backend)
lab --format json provider check PROVIDER_ID

# Show the GPUs available on a provider (accepts an id OR a name, like `delete`).
# Reports live availability where the backend can report it (Slurm, SkyPilot,
# RunPod, Lambda, Vast, Local), otherwise the provider's catalog of launchable
# GPU types (AWS, GCP, Azure, Nebius). Each row is a GPU name + count; an empty
# result ("No GPU information available") is normal for dstack and CPU-only hosts.
lab --format json provider gpus PROVIDER_ID_OR_NAME

# Toggle availability without deleting
lab provider enable PROVIDER_ID
lab provider disable PROVIDER_ID

# Update fields (config is MERGED with existing — pass only the keys you change)
lab provider update PROVIDER_ID --name "new-name"
lab provider update PROVIDER_ID --config '{"api_token": "new-token"}'
lab provider update PROVIDER_ID --credentials-file ./rotated-secrets.json   # merge secrets from file, keep them out of argv
lab provider update PROVIDER_ID --enabled        # or --disabled
lab provider update PROVIDER_ID --default        # mark as the team default (or --no-default to clear)

# Delete (use --no-interactive to skip the confirm prompt)
lab provider delete PROVIDER_ID --no-interactive
```

### When to add a provider

**Default to listing first.** Before adding anything, run `lab provider list` to see what already exists. Most servers ship with a `local` provider already configured. Only add a new provider when:

1. The user **explicitly asks** to add/configure a specific backend (Slurm, SkyPilot, RunPod, dstack, AWS, GCP, Azure).
2. `lab provider list` shows none of the existing providers match the resources the user needs (e.g. they want H100s and only `local` is registered).
3. A `task queue` attempt failed with "No compute providers available".

**Do NOT add a provider speculatively.** Adding one writes credentials/URLs to the server and may fail health checks until configured correctly. If it's unclear which provider type the user wants, ask.

### Adding a provider non-interactively

`provider add` requires `--name`, `--type`, and `--config` (a JSON string) when run with `--no-interactive`. The config schema depends on the type:

| Type | Required/optional config fields |
|---|---|
| `local` | `{}` — no config needed |
| `skypilot` | `server_url`, `api_token` |
| `slurm` | `mode` (`ssh` or `rest`), then either `ssh_host` + `ssh_user` + `ssh_key_path` + `ssh_port`, or `rest_url` + `api_token` |
| `runpod` | `api_key`, plus optional `api_base_url`, `default_gpu_type`, `default_region`, `default_template_id`, `default_network_volume_id` |
| `dstack` | `server_url`, `api_token`, `dstack_project` |
| `aws` | `region`. Provide AWS access keys via `--credentials-file PATH` pointing at a JSON file with `aws_access_key_id` + `aws_secret_access_key` (uploaded to the API host's `~/.aws/credentials`) |
| `gcp` | `region`, optional `zone`. Must also pass `--credentials-file PATH` pointing at your service account JSON key file |
| `azure` | `azure_subscription_id`, `azure_tenant_id`, `azure_client_id`, `azure_client_secret`, `azure_location` |
| `nebius` | optional infra config `parent_id` (project id; required unless `subnet_id` set), `subnet_id`, `default_platform`, `default_preset`, `boot_image_family`, `disk_size_gib`. Provide the service-account key pair via `--credentials-file PATH` pointing at a JSON file with `service_account_id` + `public_key_id` + `private_key` (uploaded via the dedicated `/nebius/credentials` endpoint) |

### `--credentials-file` for secrets (preferred)

`provider add` and `provider update` both accept `--credentials-file PATH` to keep secrets out of `argv` (and therefore out of shell history and `ps` listings on shared hosts). The file shape depends on `--type`:

- **`aws`**: JSON object with `aws_access_key_id` + `aws_secret_access_key`. Uploaded via the dedicated AWS credentials endpoint; remaining keys (if any) merge into `--config`.
- **`gcp`**: the raw service account JSON key file itself (the file you'd otherwise pass to `gcloud auth activate-service-account --key-file=...`). Uploaded via the dedicated GCP credentials endpoint.
- **everything else** (`skypilot`, `runpod`, `dstack`, `azure`, `slurm` REST, `vastai`): a flat JSON object whose fields merge on top of `--config`. File values win on conflict.

`chmod 600` the file, source it from a secret manager / CI vault, and delete it after the `lab provider add` call. **Prefer this over embedding `api_token` / `azure_client_secret` / etc. inside `--config`** whenever you're scripting.

```bash
# Local (rare — usually pre-installed)
lab provider add --no-interactive --name local --type local --config '{}'

# SkyPilot
lab provider add --no-interactive --name my-skypilot --type skypilot \
  --config '{"server_url": "https://sky.example.com", "api_token": "TOKEN"}'

# Slurm over SSH
lab provider add --no-interactive --name my-slurm --type slurm \
  --config '{"mode": "ssh", "ssh_host": "cluster.example.com", "ssh_user": "ali", "ssh_key_path": "~/.ssh/id_rsa", "ssh_port": "22"}'

# Slurm over REST
lab provider add --no-interactive --name my-slurm --type slurm \
  --config '{"mode": "rest", "rest_url": "https://slurm.example.com/api", "api_token": "TOKEN"}'

# RunPod
lab provider add --no-interactive --name my-runpod --type runpod \
  --config '{"api_key": "RUNPOD_KEY", "default_gpu_type": "NVIDIA H100"}'

# dstack
lab provider add --no-interactive --name my-dstack --type dstack \
  --config '{"server_url": "http://0.0.0.0:3000", "api_token": "TOKEN", "dstack_project": "main"}'

# AWS — credentials live in a JSON file: {"aws_access_key_id": "...", "aws_secret_access_key": "..."}
lab provider add --no-interactive --name my-aws --type aws \
  --config '{"region": "us-east-1"}' \
  --credentials-file ./aws-creds.json

# GCP — point --credentials-file at your raw service account JSON key file
lab provider add --no-interactive --name my-gcp --type gcp \
  --config '{"region": "us-central1"}' \
  --credentials-file ~/.config/gcloud/sa-key.json

# Azure — secrets can live in --credentials-file (preferred) instead of --config
# azure-secrets.json: {"azure_client_secret": "REDACTED"}
lab provider add --no-interactive --name my-azure --type azure \
  --config '{"azure_subscription_id": "sub", "azure_tenant_id": "tenant", "azure_client_id": "client", "azure_location": "eastus"}' \
  --credentials-file ./azure-secrets.json

# Nebius — service-account key pair lives in --credentials-file (uploaded via /nebius/credentials)
# nebius-creds.json: {"service_account_id": "serviceaccount-...", "public_key_id": "publickey-...", "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
lab provider add --no-interactive --name my-nebius --type nebius \
  --config '{"parent_id": "project-123"}' \
  --credentials-file ./nebius-creds.json

# SkyPilot / RunPod / dstack — same pattern: put api_token / api_key in --credentials-file
# skypilot-secrets.json: {"api_token": "TOKEN"}
lab provider add --no-interactive --name my-skypilot-prod --type skypilot \
  --config '{"server_url": "https://sky.example.com"}' \
  --credentials-file ./skypilot-secrets.json
```

`provider add` automatically runs a health check after creation, so a successful `add` already confirms connectivity. **Re-run `lab provider check PROVIDER_ID` before queuing if you're using an existing provider** (credentials may have rotated, the backend may be down) or after a `provider update` that changed config. If a check fails, fix the config with `lab provider update` rather than deleting and re-adding.

### Don't ask the user for credentials in chat

Provider configs (`api_token`, `api_key`, `ssh_key_path`) contain secrets. If the user has not provided them already, ask them to either run `lab provider add` interactively themselves (the CLI prompts for each field privately) or to paste the values from a secure source. Don't request the user paste raw keys into a multi-message conversation.

Also note that secrets passed inside `--config` (e.g. `api_token`, `azure_client_secret`) appear in shell history and `ps` listings. For scripted / CI flows, prefer `--credentials-file PATH` (see above) — it keeps secrets out of `argv` entirely. For ad-hoc runs, the interactive flow is fine, or have the user prefix the command with a space under `HISTCONTROL=ignorespace`.

## Agent-Specific Rules

1. **NEVER call the REST API as a workaround for the CLI.** The CLI is the supported interface — don't reach for `curl` because a CLI command appears missing or broken. Run `lab <command> --help` first and check this skill. *Reading* the API source under `api/transformerlab/` (routers, services) when debugging a CLI failure is fine and often necessary; the rule is against substituting `curl` for `lab`, not against understanding what the server does.
2. **Always run `lab <command> --help` before assuming a flag exists.** Don't guess `--provider`, `--gpu`, etc. The CLI's flag surface is small and changes; verify before invoking.
3. **Use `--format json`** when you need to parse output, but be prepared to fall back to pretty output parsing if it doesn't work
4. **`--no-interactive` on `task queue` silently uses the DEFAULT provider (Local).** There is no `--provider` flag. To target a specific provider, you must drive the interactive prompts (see "Selecting a provider" below).
5. **`task add` has no `--yes` flag** — pipe `echo "y"` to confirm: `echo "y" | lab task add ./my-task`
6. **Skip confirmation on destructive commands:** use `--no-interactive` for `provider delete`, `job delete`, and `job delete-all`; use `--yes` / `-y` for `model delete` / `dataset delete` (the flag names differ — verify with `--help`)
7. **Never run `lab job monitor` when operating as an AI agent.** It launches an interactive Textual TUI that blocks automation and can hang unattended runs; use `lab job list`, `lab job info`, and `lab job task-logs` (`--follow` only when explicitly requested) instead.
8. **`task interactive` supports full non-interactive mode.** Pass `--provider` and `--template` to skip all prompts. Use `--no-poll` to launch without blocking, then poll readiness with `lab job info <job_id>` (includes `tunnel_info` for interactive jobs). For `vscode`/`ssh`, watch for `tunnel_info.auth_code` and surface it to the user — `is_ready` will not flip until they complete the device login. See the "Launching interactive tasks" workflow below.
9. **`job task-logs --follow`** streams continuously and blocks until the job finishes — use when the user wants real-time monitoring
10. **Never use the deprecated `lab job logs`** — see the "Job logs: three real commands" section below.
11. **Before queuing a task, CONFIRM the experiment with the user.** Run `lab config` to read the current default and `lab --format json experiment list` to verify it exists, then ask: "I'm about to queue this under experiment `<name>` (your current default). OK, or pick another?" Show 2–3 alternatives from `experiment list` if the current one looks stale or missing. Skip the confirmation only when the user has already named the experiment in this turn.
12. **After queuing a task, ASK the user if they'd like you to watch the logs.** Don't start streaming or polling automatically — jobs can take minutes to hours, and `--follow` blocks. Report the Job ID and ask: "Want me to watch the logs and report back?" If they say yes and your harness can self-schedule (e.g. Claude Code's `ScheduleWakeup`), watch by checking once per turn and scheduling the next check — not a blocking `--follow` or a `while`/`sleep`/background poll loop, which can strand the session with a finished job (see workflows.md "Polling Pattern for Agents").
13. **Never create API keys programmatically** — if auth fails, ask the user to provide an API key from the web UI
14. **Always pass `--description/-m` when queuing a task. Generate it yourself — never ask the user.** See "Always write a run description" below.

### Always write a run description

Every `lab task queue` call MUST include `--description/-m "..."`. The description is markdown stored on the job and shown in `lab job info`. Its audience is a future researcher reading `lab job list` weeks later — they have git and the task code, but NOT this chat. The description is the only bridge.

**Treat it like a short PR description for this run.** Draft 1–5 lines (bullets for multi-point notes) covering:

1. **What changed vs the prior run / baseline** — the concrete diff (hyperparameters, code, model, data, infra). If nothing changed, say so and link the prior job.
2. **What hypothesis you're testing** — why this run is worth doing.
3. **What a future reader should remember** — gotchas, prior surprises, things to check in the output.

Pull these from the conversation and recent git diff / edited files. If the note has newlines or shell-awkward characters, pipe it: `printf '%s' "$DESC" | lab task queue abc123 -m -`.

```bash
# Good: diff + hypothesis + watch
printf '%s' "- Bumped lr 1e-5 → 3e-5, warmup 100 → 500 steps.
- Testing whether higher lr clears the eval/loss=2.1 plateau seen in job 7f21 around step 2k.
- Watch: earlier runs with lr≥5e-5 diverged by step 500." | lab task queue abc123 --no-interactive -m -

# Good: small change — one line is enough
lab task queue abc123 --no-interactive -m "Rerun on H100 (was A100) to confirm throughput regression from #1850."

# Good: nothing changed
lab task queue abc123 --no-interactive -m "Rerun of job 7f21, no code or config changes (network flake on first attempt)."

# Bad: generic filler that tells the reader nothing
lab task queue abc123 -m "train model"
```

Don't restate the task name, full hyperparameter dict, or file paths — those are already on the job record. Don't copy the user's last message verbatim — synthesize. If the conversation is truly empty of signal, fall back to `"Rerun of <id>, no changes"`.

### Overriding task parameters per queue: `--param key=value`

`lab task queue` accepts repeatable `--param key=value` (alias `-p`) to override values from the task's `parameters:` block for a single job, without mutating `task.yaml`. Values are parsed as YAML scalars: `score=0.42` is a float, `enabled=true` is a bool, `tag=baseline` is a string. Unknown keys (not declared in the task's `parameters:`) fail hard so typos are caught at queue time.

```bash
# Sweep the same task with different hyperparameters
for i in $(seq 1 10); do
  lab task queue TASK_ID --no-interactive \
    --param description="iteration $i" \
    --param score=$(python -c "print(0.4 + 0.04*$i)") \
    -m "Iteration $i"
done

# Quoting tip: values may contain '=' (split on first '=' only)
lab task queue TASK_ID --no-interactive --param notes="key=value pairs OK"
```

Use this instead of `lab task edit --from-file` between queue calls — editing the task affects already-queued-but-not-yet-dispatched jobs and is racy.

### Selecting a provider when queuing a task

`lab task queue` has no `--provider` flag. With `--no-interactive` it picks the default (usually Local). To pick a specific provider, drive the interactive prompts via stdin. The flow is:

1. "Use these resource requirements? [Y/n]" → answer `y`
2. "Available Providers: 1. Local  2. skypilot1 ... Select a provider [1]:" → answer the number

```bash
# Pick provider #2 (skypilot1) with default resources
printf "y\n2\n" | lab task queue TASK_ID
```

Run `lab provider list` first to confirm the numbering before piping.

### Job logs: three real commands

`lab job logs` is **deprecated** — do not use it. There are three distinct log commands, each surfacing a different layer:

| Command | What it shows | When to use |
|---|---|---|
| `lab job task-logs JOB_ID` | Task (Lab SDK) output — what `lab.log()` recorded | Default for "what did my task do?" — covers `lab.log`, progress, completion |
| `lab job machine-logs JOB_ID` | Machine/provider stdout+stderr from the remote node | When the task crashed before SDK init, or you need raw process output |
| `lab job request-logs JOB_ID` | Provider request/launch logs (e.g. SkyPilot launch/provisioning) | When the cluster never started, or to debug provisioning failures |

All three accept `--follow` to stream continuously. Start with `task-logs`; escalate to `machine-logs` for crashes outside the SDK, and `request-logs` for cluster/provisioning issues.

### Exporting or publicly sharing the job runs chart

`lab job chart` exports the experiment's job runs chart (the same one shown in the web UI's Jobs Chart view: each run's metric score over time, best-so-far runs highlighted, discarded runs grayed out, with a best-so-far step line) as a PNG image, and/or enables **public sharing** of the live chart. The PNG is rendered server-side, so this requires a server new enough to have the `/experiment/{id}/jobs/chart.png` endpoint — on older servers the CLI reports "This server does not support chart export". Public sharing requires the `/experiment/{id}/share/chart` endpoints — on older servers the CLI reports "This server does not support public sharing".

```bash
# Chart the current experiment's runs (auto-detects the primary metric)
lab job chart -o runs.png

# Pick a specific metric and direction; scope to another experiment
lab job chart -o runs.png --metric eval/loss --lower-is-better -e exp-a

# Enable public sharing and print the public link (no PNG written)
lab job chart --share

# Both: write the PNG and print the public link
lab job chart --share -o runs.png
```

| Option | Description |
|---|---|
| `--output` / `-o <path>` | Path to write the PNG file. Required unless `--share` is given. |
| `--share` | Enable public sharing for the jobs chart and print the public link. Anyone with the link can view the live chart (no login). Reuses the experiment's existing active link if one exists; only mints a new one when sharing is off. Minting asks for confirmation unless `--no-interactive` / `--format json` is set. |
| `--metric <key>` | Metric key to plot. Default: auto-detected primary metric (prefers a key named `score`, else the first metric key found). Only affects the PNG, not the share link. |
| `--lower-is-better` / `--higher-is-better` | Which direction counts as "best" when highlighting best-so-far runs. Default: majority vote over each job's `job_data.lower_is_better`. Only affects the PNG. |
| `--experiment` / `-e <id>` | Per-command experiment override. |

At least one of `-o` or `--share` is required. The command exits non-zero with a clear message when the experiment has no scored jobs (404) or the requested `--metric` doesn't exist in any job's scores (400). With `--format json` it prints `{"saved": "<path>"}` for the PNG and `{"url": ..., "token": ..., "created_at": ...}` for the share link.

## Debugging Failed Jobs

**Job COMPLETE does not mean the task succeeded.** Always check `completion_status` and `completion_details`:

```bash
# CLI: check job info for completion details
lab job info JOB_ID
# Look for: Completion Status (success/failed/N/A) and Completion Details

# CLI: get logs (see "Job logs: three real commands" above)
lab job task-logs JOB_ID      # task/SDK output
lab job machine-logs JOB_ID   # raw process stdout+stderr
lab job request-logs JOB_ID   # provider launch/provisioning logs
```

**Do NOT fall back to the REST API** if a log command returns empty — try the other two log commands first. The three layers surface different things; sparse output from one doesn't mean failure.

**Common failure patterns:**

| Symptom | Cause | Fix |
|---|---|---|
| Status COMPLETE but completion_status is N/A, progress 0% | Task never actually ran (wrong GPU type, cluster not found) | Check cluster status, verify accelerator type exists on provider |
| Status FAILED, "No such file or directory" in logs | Wrong `run` command path | Check where files are placed (see File Mounts section) |
| Status FAILED with a Python traceback | Task code error | Read the full provider logs to see the traceback |
| Status FAILED, no logs available | Cluster failed to provision | Check if the requested accelerator type is available |

### Launching interactive tasks (agent workflow)

Interactive tasks launch long-running services (Jupyter, vLLM, Ollama, etc.) and expose them via URLs. The full non-interactive agent workflow:

```bash
# 1. List available templates
lab --format json task gallery --type interactive

# 2. Launch non-interactively with --no-poll (returns immediately)
lab --format json task interactive \
  --provider local --template jupyter --no-poll
# → {"job_id": "abc-123", "task_id": "def-456", "experiment_id": "alpha"}

# 3. Poll for readiness via job info (includes tunnel_info for interactive jobs)
lab --format json job info JOB_ID
# → {..., "tunnel_info": {"is_ready": false, ...}}   ← not ready yet, poll again
# → {..., "tunnel_info": {"is_ready": true, "tunnel_url": "...", "token": "...", "instructions": [...]}}

# 4. Present connection info to the user (render every block in tunnel_info.instructions)

# 5. When done, stop the session
lab job stop JOB_ID
```

**Rendering `tunnel_info.instructions[]`:** the `instructions` array is the source of truth for what to show the user — iterate it and render each block by its `kind`. Don't hardcode "show tunnel_url only": some templates require the user to *act* on an earlier block before `is_ready` can flip (see "Human-in-the-loop" below).

| `kind` | What to surface |
|---|---|
| `code` | The `value_key` field on the block (e.g. `auth_code`) — a short string the user pastes elsewhere. Include `help_links[]`. |
| `url` | The `value_key` field (e.g. `tunnel_url`, `jupyter_url`) — the link the user opens. |
| `command` | The `value_key` field — a shell command the user runs locally (e.g. `ssh_command`). |
| `kv` | The `items[]` list — labeled key/value pairs (e.g. SSH `domain`/`port`/`username`). |
| `text` | The `template` field, with `{{var}}` substituted from `tunnel_info` values. |

**Human-in-the-loop templates (`vscode`, `ssh`):** `is_ready` will *not* flip until the user completes an out-of-band auth step. Agent flow:

1. Poll `lab job info JOB_ID` after launch. As soon as `tunnel_info.auth_code` (or any `kind: "code"` block's `value_key`) becomes non-null, surface the code to the user along with the `help_links[]` URL (e.g. `https://github.com/login/device` for `vscode`). Mention that the code expires in ~15 min so they should authorize promptly.
2. **Do NOT wait for the user to confirm — keep polling immediately.** Authorization happens in the user's browser, independent of this conversation; the agent sees the result via `tunnel_info.is_ready` flipping to `true` on the next poll (typically within seconds of the user clicking Authorize). Pausing for a "I'm done" message wastes the user's time and conflates the agent's state machine with theirs.
3. While polling, ignore "Startup may have stalled" messages in the UI — that's a timeout heuristic, not a real failure. The underlying `code tunnel` / `sshd` process is alive and waiting on auth. Only treat the job as failed if `status` becomes `FAILED`/`STOPPED`/`COMPLETE`.
4. Once `is_ready` flips, render the remaining `instructions[]` blocks (tunnel URL, etc.). If the user never authorizes and the code expires, the job will eventually fail — stop it (`lab job stop`) and relaunch rather than waiting for `code tunnel` to print a new code.
5. Budget for the human round-trip: when you control the polling loop yourself, allow ~15 min wall time after the code appears. If you're using the CLI's built-in poller (no `--no-poll`), pass `--timeout 900` or higher.

For purely automated templates (`jupyter`, `vllm`, `ollama`, etc.), `tunnel_info` has no `auth_code`/`kind: "code"` block and `is_ready` flips on its own — skip the pause and present `tunnel_url` once ready.

**Key flags for `task interactive`:**
- `--provider <name>` and `--template <id>` — required for non-interactive mode
- `--env KEY=VALUE` — repeatable, sets environment variables (e.g. `--env MODEL_NAME=llama3`)
- `--cpus`, `--memory`, `--disk`, `--accelerators`, `--num-nodes`, `--minutes` — resource overrides for remote providers
- `--no-poll` — launch and exit immediately; poll readiness later with `lab job tunnel-info`
- Without `--no-poll`, the command blocks and polls internally until the service is ready or `--timeout` is hit

**Available templates:** `jupyter`, `vllm`, `ollama`, `ollama_gradio`, `comfy_ui`, `vscode`, `ssh`, `mlx_gradio`, `mlx_audio_tts`. Run `lab --format json task gallery --type interactive` to get the current list with descriptions and required env vars.

**Required `--env` flags by template.** Several templates declare gallery `env_parameters` with `required: true`. In non-interactive mode (`--provider` + `--template`), if you omit the `--env` flag for a required param, the CLI silently substitutes the gallery's *placeholder hint string* as the value (`interactive.py:177`) — e.g. `MODEL_NAME` becomes literally `"e.g. meta-llama/Llama-2-7b-chat-hf"` and the job fails downstream with a confusing model-not-found error. **Always pass real values explicitly for these:**

| Template | Required `--env` |
|---|---|
| `vllm` | `MODEL_NAME=<hf-model-id>`, `TP_SIZE=<int>`, plus `HF_TOKEN={{secret._HF_TOKEN}}` for gated models |
| `ollama` | `MODEL_NAME=<ollama-model-name>` (e.g. `tinyllama`, `llama2`) |
| `ollama_gradio` | `MODEL_NAME=<ollama-model-name>` |
| `mlx_gradio` | `MODEL_NAME=<mlx-compatible-hf-id>` |
| `mlx_audio_tts` | `MODEL_NAME=<mlx-compatible-tts-hf-id>` |
| `jupyter`, `comfy_ui`, `vscode`, `ssh` | none beyond ngrok auto-default |

If the user hasn't given you a model name, **ask** before launching — don't fall back to a placeholder, and don't pick one yourself.

**Remote providers:** Require `NGROK_AUTH_TOKEN` (auto-defaults to `{{secret._NGROK_AUTH_TOKEN}}`). Pass resource flags or accept gallery defaults.

**The team must have `_NGROK_AUTH_TOKEN` set as a special secret on the server**, otherwise the API rejects launches of any ngrok-using template (`jupyter`, `vllm`, `ollama`, `comfy_ui`, `ssh`) with `Missing secrets: ngrok Auth Token. Please define these secrets at the team or user level before launching.` Before launching one of those on a remote provider, run `lab --format json team secret list | jq '.[] | select(.name=="_NGROK_AUTH_TOKEN")'` — if empty, stop and tell the user to set it via **Team Settings → Special Secrets** in the web UI, or `lab team secret set _NGROK_AUTH_TOKEN <token>` from the CLI. (`ollama_gradio` and `mlx_*` templates don't use ngrok and are unaffected.)

**Local providers:** No ngrok needed. Services are accessible on localhost.

### Checking Cluster Status (SkyPilot providers)

Use `lab job info JOB_ID` — it shows `cluster_name` and provisioning state. For more detail use `lab job request-logs JOB_ID` (provider launch logs). If a cluster never provisioned, the request-logs will show why (wrong accelerator type, quota, etc.).

## Do NOT call the REST API as a CLI workaround

The CLI is the supported, sanctioned interface. **Never call the REST API with `curl` because a CLI command appears missing or broken** — that's the rule. If a CLI command seems missing or wrong:

1. Run `lab <command> --help` and `lab <subcommand> --help` to verify
2. Re-read this skill for the right pattern (e.g. interactive prompts via stdin)
3. Tell the user the CLI doesn't support it — don't silently switch to `curl`

This applies to launching jobs, fetching logs, checking cluster status, and everything else.

**Reading the API source code is encouraged.** When debugging *why* a CLI call is failing — wrong response, silent filter, unexpected output — opening files under `api/transformerlab/` (routers, services) is the right move. That's investigation, not a workaround. The rule is against substituting `curl` calls for `lab` calls, not against understanding what the server does.

## Command Overview

| Command | Description | Requires Experiment |
|---|---|---|
| `lab status` | Check server connectivity | No |
| `lab config` | View/set CLI configuration | No |
| `lab login` | Authenticate with API key (sets server, team, user) | No |
| `lab logout` | Remove stored API key | No |
| `lab whoami` | Show current user and team | No |
| `lab version` | Show CLI version | No |
| `lab profile list` | List CLI profiles (server+team+credentials sets); marks the active one and which have credentials | No |
| `lab profile show [name]` | Show a profile's server/team/user/experiment (defaults to the active profile) | No |
| `lab profile delete <name>` | Delete a named profile (`'default'` cannot be deleted; `--yes` to skip prompt) | No |
| `lab experiment list` | List all experiments (current default marked with `*`) | No |
| `lab experiment create <name>` | Create a new experiment (`--set-default` to also switch to it) | No |
| `lab experiment delete <id>` | Delete an experiment (`--no-interactive` to skip prompt) | No |
| `lab experiment set-default <id>` | Set the default experiment (validates server-side, then writes `current_experiment` to `~/.lab/config.json`) | No |
| `lab experiment list --tag <tag>` | Filter experiments by tag; repeat `--tag` to AND multiple tags (client-side) | No |
| `lab experiment tag add <experiment> <tags...>` | Add one or more tags to an experiment (by name or id) | No |
| `lab experiment tag remove <experiment> <tags...>` | Remove one or more tags from an experiment | No |
| `lab experiment tags` | List all distinct tags across experiments you can read | No |
| `lab notes show` | Render the current experiment's shared markdown notes (`--raw` for plain markdown; `--share` enables public sharing and prints the public link instead) | Yes |
| `lab notes edit` | Open the current experiment's notes in `$EDITOR` (defaults to nano) | Yes |
| `lab notes append <text>` | Append a line to the current experiment's notes non-interactively — preferred for agents | Yes |
| `lab task list` | List tasks in current experiment | Yes |
| `lab task info <id>` | Get task details | Yes |
| `lab task init` | Scaffold `task.yaml` + `main.py` in the current directory (`--interactive` to prompt) | No |
| `lab task add [dir]` | Add task from directory or `--from-git` URL (`--no-interactive`, `--dry-run`) | Yes |
| `lab task edit <id>` | Edit an existing task. `--from-file <task.yaml>` for YAML-only; `--from-dir <dir>` to also replace attachments like `main.py` (`--no-interactive`, `--dry-run`, `--timeout`) | Yes |
| `lab task upload <id> <path>` | Upload files/directories into an existing task (`--no-interactive`) | Yes |
| `lab task delete <id>` | Delete a task (`--no-interactive` to skip confirmation) | Yes |
| `lab task queue <id>` | Queue task on compute provider (`-m/--description` for a markdown run note; `-p/--param key=value` to override task parameters per run; required for agents, see "Always write a run description") | Yes |
| `lab task gallery` | Browse/import from task gallery | Yes |
| `lab task interactive` | Launch an interactive task (`--provider`, `--template`, `--no-poll` for agent use) | Yes |
| `lab job list` | List jobs (`--running` for active only) | Yes |
| `lab job info <id>` | Get detailed job information | Yes |
| `lab job task-logs <id>` | Fetch task/SDK output (`--follow` to stream) | Yes |
| `lab job machine-logs <id>` | Fetch raw machine/provider stdout+stderr (`--follow`) | Yes |
| `lab job request-logs <id>` | Fetch provider launch/provisioning logs | Yes |
| `lab job artifacts <id>` | List job artifacts | Yes |
| `lab job download <id>` | Download artifacts (`--file` for glob) | Yes |
| `lab job chart` | Export the experiment's job runs chart as a PNG (`-o <path>`) and/or enable public sharing and print the public link (`--share`); at least one of `-o`/`--share` required (`--metric`, `--lower-is-better`/`--higher-is-better` affect the PNG) | Yes |
| `lab job stop <id>` | Stop a running job | Yes |
| `lab job delete <id>` | Delete a job (`--no-interactive` to skip prompt) | Yes |
| `lab job delete-all` | Delete all jobs in the current experiment (`--no-interactive` to skip prompt) | Yes |
| `lab provider list` | List compute providers | No |
| `lab provider info <id>` | Show provider details | No |
| `lab provider add` | Add a new provider | No |
| `lab provider update <id>` | Update provider config | No |
| `lab provider delete <id>` | Delete a provider (`--no-interactive` to skip prompt) | No |
| `lab provider check <id>` | Check provider health | No |
| `lab provider gpus <id_or_name>` | Show available GPUs on a provider (live where supported, else catalog) | No |
| `lab provider verify-lifecycle <id>` | Verify provider lifecycle via a storage probe (`--no-wait` to launch only; see `--help` for polling options) | No |
| `lab provider enable <id>` | Enable a provider | No |
| `lab provider disable <id>` | Disable a provider | No |
| `lab model list` | List all model groups | No |
| `lab model info <id>` | Show model group details (by group_id or group_name) | No |
| `lab model create <asset_id>` | Create a model group version. New group if `--name` is unused; otherwise appends a new version with auto-incremented `vN` label (or `--version-label` to override). Supports `--description`, `--tag`. | No |
| `lab model edit <id>` | Edit model group name or description | No |
| `lab model delete <id>` | Delete a model group and all versions (`--yes` to skip prompt) | No |
| `lab model upload <id> <path...>` | Upload local files/dirs to a model (creates if needed; `--force` to overwrite) | No |
| `lab model download <id> <dest>` | Download a model's files to `<dest>/<id>/` | No |
| `lab dataset list` | List all dataset groups | No |
| `lab dataset info <id>` | Show dataset group details (by group_id or group_name) | No |
| `lab dataset upload <id> <path...>` | Upload local files/dirs to a dataset (creates if needed; `--force` to overwrite) | No |
| `lab dataset download <id> <dest>` | Download a dataset's files from the server to `<dest>/<id>/` | No |
| `lab dataset edit <id>` | Edit dataset group name or description | No |
| `lab dataset delete <id>` | Delete a dataset group and all versions (`--yes` to skip prompt) | No |
| `lab job publish model <job_id>` | Publish a model from a job to the registry | Yes |
| `lab job publish dataset <job_id>` | Publish a dataset from a job to the registry | Yes |
| `lab server install` | Interactive server setup wizard | No |
| `lab server version` | Show installed server version | No |
| `lab server update` | Update server to latest | No |
| `lab team info` | Show current team: name, your role, member count, quota | No |
| `lab team rename <name>` | Rename the current team (team owners only) | No |
| `lab team setup` | Onboarding wizard: add a provider, set defaults/secrets, health-check | No |
| `lab team secret list` | List secrets (`--user`/`-u` for user-level, `--show-values`) | No |
| `lab team secret set [name] [value]` | Set a secret (`--user`/`-u` for user-level) | No |
| `lab team secret delete <name>` | Delete a secret (`--user`/`-u`, `--no-interactive`) | No |
| `lab team secret keys` | Show platform-recognized secret key names | No |
| `lab team quota show` | Show the current team's monthly quota (minutes; shows hours too) | No |
| `lab team quota set <minutes>` | Set team monthly quota in minutes (team owners only) | No |
| `lab team quota usage` | Per-user quota usage for the team (team owners only) | No |
| `lab team quota set-user <email\|uuid> <minutes>` | Set a per-user quota override (team owners only) | No |
| `lab team quota me` | Show your own quota status in the current team | No |
| `lab team members list` | List members of the current team | No |
| `lab team members invite <email>` | Invite a member by email (`--role member\|owner`, team owners only) | No |
| `lab team members remove <email\|uuid>` | Remove a member (`--no-interactive`; team owners only) | No |
| `lab team members set-role <email\|uuid> <role>` | Change a member's role to `member`/`owner` (team owners only) | No |
| `lab team invitations list` | List pending invitations for the team (team owners only) | No |
| `lab team invitations cancel <invitation_id>` | Cancel a pending invitation (`--no-interactive`; team owners only) | No |

## JSON Output Shapes

**`lab --format json job list`** returns an array:
```json
[{"id": "uuid", "status": "COMPLETE", "progress": 100, "job_data": {...}, "created_at": "..."}]
```

**`lab --format json task list`** returns an array:
```json
[{"id": "uuid", "name": "my-task", "type": "REMOTE", ...}]
```

**Errors** return:
```json
{"error": "error message here"}
```

With non-zero exit code.

## Error Handling

- Commands exit with non-zero status on failure
- With `--format json`, errors return `{"error": "<message>"}`
- "config not set" errors → run `lab login` first
- "current_experiment not set" → run `lab experiment list` to find an existing experiment, then `lab experiment set-default <id>` (or `lab experiment create <name> --set-default` if none exists)
- Connection refused → check server URL with `lab config`, verify server is running
- "No compute providers available" → add a provider in team settings first, or check `provider list`

## When to Use CLI vs Reading API Source vs Browser

| Use CLI for | Read API source for | Use Browser for |
|---|---|---|
| Login, config, status checks | Understanding why a CLI call returned wrong data | Creating experiments |
| Listing tasks and jobs | Tracing what `/model/finalize` etc. actually do on the server | Configuring tasks via forms |
| Streaming job logs (`--follow`) | Confirming whether a CLI failure is client-side or server-side | Visual UI verification |
| Adding tasks from local dirs | Reading a router/service to spot silent filters or unhandled errors | Creating API keys |
| Downloading artifacts | Sanity-checking response shapes before reporting a bug | Managing team settings |

**If a CLI command appears missing, broken, or returns unexpected output:** investigate (run `--help`, re-read this skill, read the relevant router/service under `api/transformerlab/`), then tell the user what you found. **Don't** silently fall back to `curl` against the REST API or `/openapi.json` — that's the workaround pattern this skill explicitly forbids.

## `/lab-autoresearch` — autonomous experiment loop

When the user says **"run autoresearch"**, **"optimize X in a loop"**, **"set up autoresearch for …"**, or types **`/lab-autoresearch …`**, enter the autoresearch workflow. It's an agent-driven optimization loop layered on top of the `lab` CLI: pick an idea → queue it as a job → score via `lab.finish(score=…)` → keep or `lab job discard` → repeat, up to a parallelism budget. For hyperparameter fan-out, prefer the task's `sweeps:` block over manually queuing N jobs.

State lives entirely on Transformer Lab — one **experiment** per session, one **job** per iteration (its `-m/--description` is the iteration note, its `score` dict is the result, `lab job discard` is the keep/discard flag). The session plan (objective, files in scope, constraints, backlog, what's been tried) is written to **experiment notes** via `lab notes` — there is no local `autoresearch.md` file.

Subcommands worth naming: `init <goal>`, `run`, `finalize`. Everything else mid-session (status, keep/discard, sweeps, ideas, stopping running jobs, exiting the loop) is just the agent running the right `lab` call from this skill in response to natural-language requests — no dedicated subcommand needed.

**Read `references/autoresearch.md` before doing any of this.** It has the three subcommand workflows, the during-session natural-language → `lab` mapping, the experiment-notes template, and loop rules (parallelism, fire-and-advance, stale-job sweep, keep/discard policy, run-description discipline).

## Deep-Dive References

- `references/commands.md` — Full command reference with all options
- `references/workflows.md` — End-to-end workflow patterns
- `references/troubleshooting.md` — Error patterns and recovery
- `references/autoresearch.md` — `/lab-autoresearch` autonomous experiment loop spec

## Ready-to-Use Templates

- `templates/setup-and-login.sh` — First-time setup
- `templates/queue-and-monitor.sh` — Queue a task and monitor until completion
- `templates/provider-health-check.sh` — Check health of all providers
