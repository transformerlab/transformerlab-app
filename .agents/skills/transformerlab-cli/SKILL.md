---
name: transformerlab-cli
description: Transformer Lab CLI for managing ML training tasks, jobs, compute providers, models, and datasets. Use when the user needs to check job status, stream logs, download artifacts, queue training tasks, upload or edit tasks, manage compute providers, list or create models, upload or download datasets, publish job outputs, or interact with Transformer Lab programmatically. Triggers include "check job status", "download results", "queue a task", "upload a task", "edit a task", "list providers", "add provider", "configure provider", "stream logs", "what's running", "monitor training", "add a task", "check provider health", "list models", "create model", "upload dataset", "download dataset", "publish model", "publish dataset".
allowed-tools: Bash(lab *), Bash(curl *beta.lab.cloud*), Bash(curl *localhost:8338*)
---

# Transformer Lab CLI

Use the `lab` CLI to interact with Transformer Lab programmatically — managing tasks, jobs, compute providers, models, datasets, and server configuration from the terminal.

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

Full docs: https://lab.cloud/for-teams/running-a-task/task-yaml-structure

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
  pip install transformerlab
  pip install -r requirements.txt
run: python main.py                    # Required — main entry point
envs:                                  # Optional environment variables
  HF_TOKEN: "${HF_TOKEN}"
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

### Validation

`lab task add` automatically validates task.yaml against the server schema before creating the task. You can also validate directly with `lab task validate [path/to/task.yaml]` (defaults to `./task.yaml`), including JSON output via `lab --format json task validate`.

To validate without creating, use `lab task add ./my-task --dry-run`.

### Editing task.yaml for an existing task

Use `lab task edit` to update the `task.yaml` for a task that already exists on the server:

```bash
# Interactive editor flow
lab task edit TASK_ID

# Apply a local task.yaml directly
lab task edit TASK_ID --from-file ./task.yaml --no-interactive
```

`lab task edit` expects a `TASK_ID` and supports `--from-file`, `--no-interactive`, and `--timeout`.

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

Tasks use the Lab SDK (`transformerlab` PyPI package). Import pattern:

```python
from lab import lab

lab.init()                                    # Required — connects to the job
lab.log("message")                            # Write to job output log
lab.update_progress(50)                       # Set progress 0-100
config = lab.get_config()                     # Read parameters from task.yaml

lab.finish(message="Done!")                   # Mark job as SUCCESS
lab.error(message="Something went wrong")     # Mark job as FAILED
```

**Common mistakes:**
- `lab.finish()` has NO `status` parameter — just `message`. For failures, use `lab.error()`.
- Always call `lab.init()` before any other SDK call.
- Always call `lab.finish()` or `lab.error()` at the end — otherwise the job stays in RUNNING state.

### Example: Minimal Hello World Task

**task.yaml:**
```yaml
name: hello-world
setup: pip install transformerlab
run: python main.py
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

Use `lab experiment` commands to list, create, delete, and set the default experiment. **Experiments are the container for tasks and jobs** — most `lab task` / `lab job` commands operate against the *current* experiment (the one stored in `~/.lab/config.json` as `current_experiment`).

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

## Managing Models

Use `lab model` commands to list, inspect, create, edit, and delete model groups on the server. Models are organized as **groups** — each group can contain multiple versions (e.g. v1, v2, …).

```bash
# List all model groups
lab --format json model list

# Get details for a specific model (by group_id or group_name)
lab --format json model info GROUP_ID

# Register a new model (e.g. a HuggingFace model ID)
lab --format json model create my-hf-model-id --name "My Fine-tuned Model" --description "SFT on custom data"

# Edit a model group's name or description
lab model edit GROUP_ID --name "New Name" --description "Updated description"

# Delete a model group and all its versions (--yes to skip confirmation)
lab model delete GROUP_ID --yes
```

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

# Upload local files to a dataset (creates it if it doesn't exist)
lab dataset upload my-dataset train.jsonl eval.jsonl

# Download a dataset from HuggingFace Hub to the server
lab dataset download Trelis/touch-rugby-rules
lab dataset download Trelis/touch-rugby-rules --config default

# Edit a dataset group's name or description
lab dataset edit GROUP_ID --name "New Name" --description "Updated description"

# Delete a dataset group and all its versions (--yes to skip confirmation)
lab dataset delete GROUP_ID --yes
```

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

# 2. If not, download from HuggingFace or upload local files
lab dataset download user/my-dataset
# or
lab dataset upload my-dataset train.jsonl eval.jsonl

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

# Toggle availability without deleting
lab provider enable PROVIDER_ID
lab provider disable PROVIDER_ID

# Update fields (config is MERGED with existing — pass only the keys you change)
lab provider update PROVIDER_ID --name "new-name"
lab provider update PROVIDER_ID --config '{"api_token": "new-token"}'
lab provider update PROVIDER_ID --enabled        # or --disabled
lab provider update PROVIDER_ID --default        # mark as the team default (or --no-default to clear)

# Delete (use --no-interactive to skip the confirm prompt)
lab provider delete PROVIDER_ID --no-interactive
```

### When to add a provider

**Default to listing first.** Before adding anything, run `lab provider list` to see what already exists. Most servers ship with a `local` provider already configured. Only add a new provider when:

1. The user **explicitly asks** to add/configure a specific backend (Slurm, SkyPilot, RunPod).
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
```

`provider add` automatically runs a health check after creation, so a successful `add` already confirms connectivity. **Re-run `lab provider check PROVIDER_ID` before queuing if you're using an existing provider** (credentials may have rotated, the backend may be down) or after a `provider update` that changed config. If a check fails, fix the config with `lab provider update` rather than deleting and re-adding.

### Don't ask the user for credentials in chat

Provider configs (`api_token`, `api_key`, `ssh_key_path`) contain secrets. If the user has not provided them already, ask them to either run `lab provider add` interactively themselves (the CLI prompts for each field privately) or to paste the values from a secure source. Don't request the user paste raw keys into a multi-message conversation.

## Agent-Specific Rules

1. **NEVER call the REST API as a workaround for the CLI.** The CLI is the supported interface — don't reach for `curl` because a CLI command appears missing or broken. Run `lab <command> --help` first and check this skill. *Reading* the API source under `api/transformerlab/` (routers, services) when debugging a CLI failure is fine and often necessary; the rule is against substituting `curl` for `lab`, not against understanding what the server does.
2. **Always run `lab <command> --help` before assuming a flag exists.** Don't guess `--provider`, `--gpu`, etc. The CLI's flag surface is small and changes; verify before invoking.
3. **Use `--format json`** when you need to parse output, but be prepared to fall back to pretty output parsing if it doesn't work
4. **`--no-interactive` on `task queue` silently uses the DEFAULT provider (Local).** There is no `--provider` flag. To target a specific provider, you must drive the interactive prompts (see "Selecting a provider" below).
5. **`task add` has no `--yes` flag** — pipe `echo "y"` to confirm: `echo "y" | lab task add ./my-task`
6. **Skip confirmation on destructive commands:** use `--no-interactive` for `provider delete`, `job delete`, and `job delete-all`; use `--yes` / `-y` for `model delete` / `dataset delete` (the flag names differ — verify with `--help`)
7. **Never use `job monitor`** — it launches a TUI that blocks; use `job list` + `job task-logs` instead
8. **Never use `task interactive`** unless the user specifically requests an interactive session
9. **`job task-logs --follow`** streams continuously and blocks until the job finishes — use when the user wants real-time monitoring
10. **Never use the deprecated `lab job logs`** — see the "Job logs: three real commands" section below.
11. **After queuing a task, ASK the user if they'd like you to watch the logs.** Don't start streaming or polling automatically — jobs can take minutes to hours, and `--follow` blocks. Report the Job ID and ask: "Want me to watch the logs and report back?"
12. **Never create API keys programmatically** — if auth fails, ask the user to provide an API key from the web UI
13. **Always pass `--description/-m` when queuing a task. Generate it yourself — never ask the user.** See "Always write a run description" below.

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
| `lab experiment list` | List all experiments (current default marked with `*`) | No |
| `lab experiment create <name>` | Create a new experiment (`--set-default` to also switch to it) | No |
| `lab experiment delete <id>` | Delete an experiment (`--no-interactive` to skip prompt) | No |
| `lab experiment set-default <id>` | Set the default experiment (validates server-side, then writes `current_experiment` to `~/.lab/config.json`) | No |
| `lab task list` | List tasks in current experiment | Yes |
| `lab task info <id>` | Get task details | Yes |
| `lab task init` | Scaffold `task.yaml` + `main.py` in the current directory (`--interactive` to prompt) | No |
| `lab task add [dir]` | Add task from directory or `--from-git` URL (`--no-interactive`, `--dry-run`) | Yes |
| `lab task edit <id>` | Edit an existing task's `task.yaml` (`--from-file`, `--no-interactive`, `--timeout`) | Yes |
| `lab task upload <id> <path>` | Upload files/directories into an existing task (`--no-interactive`) | Yes |
| `lab task delete <id>` | Delete a task (`--no-interactive` to skip confirmation) | Yes |
| `lab task queue <id>` | Queue task on compute provider (`-m/--description` for a markdown run note; `-p/--param key=value` to override task parameters per run; required for agents, see "Always write a run description") | Yes |
| `lab task gallery` | Browse/import from task gallery | Yes |
| `lab job list` | List jobs (`--running` for active only) | Yes |
| `lab job info <id>` | Get detailed job information | Yes |
| `lab job task-logs <id>` | Fetch task/SDK output (`--follow` to stream) | Yes |
| `lab job machine-logs <id>` | Fetch raw machine/provider stdout+stderr (`--follow`) | Yes |
| `lab job request-logs <id>` | Fetch provider launch/provisioning logs | Yes |
| `lab job artifacts <id>` | List job artifacts | Yes |
| `lab job download <id>` | Download artifacts (`--file` for glob) | Yes |
| `lab job stop <id>` | Stop a running job | Yes |
| `lab job delete <id>` | Delete a job (`--no-interactive` to skip prompt) | Yes |
| `lab job delete-all` | Delete all jobs in the current experiment (`--no-interactive` to skip prompt) | Yes |
| `lab provider list` | List compute providers | No |
| `lab provider info <id>` | Show provider details | No |
| `lab provider add` | Add a new provider | No |
| `lab provider update <id>` | Update provider config | No |
| `lab provider delete <id>` | Delete a provider (`--no-interactive` to skip prompt) | No |
| `lab provider check <id>` | Check provider health | No |
| `lab provider enable <id>` | Enable a provider | No |
| `lab provider disable <id>` | Disable a provider | No |
| `lab model list` | List all model groups | No |
| `lab model info <id>` | Show model group details (by group_id or group_name) | No |
| `lab model create <asset_id>` | Create a new model group + first version (`--name`, `--description`, `--tag`) | No |
| `lab model edit <id>` | Edit model group name or description | No |
| `lab model delete <id>` | Delete a model group and all versions (`--yes` to skip prompt) | No |
| `lab model upload <id> <path...>` | Upload local files/dirs to a model (creates if needed; `--force` to overwrite) | No |
| `lab model download <id> <dest>` | Download a model's files to `<dest>/<id>/` | No |
| `lab dataset list` | List all dataset groups | No |
| `lab dataset info <id>` | Show dataset group details (by group_id or group_name) | No |
| `lab dataset upload <id> <files...>` | Upload local files to a dataset (creates if needed) | No |
| `lab dataset download <id>` | Download a dataset from HuggingFace Hub (`--config` for subset) | No |
| `lab dataset edit <id>` | Edit dataset group name or description | No |
| `lab dataset delete <id>` | Delete a dataset group and all versions (`--yes` to skip prompt) | No |
| `lab job publish model <job_id>` | Publish a model from a job to the registry | Yes |
| `lab job publish dataset <job_id>` | Publish a dataset from a job to the registry | Yes |
| `lab server install` | Interactive server setup wizard | No |
| `lab server version` | Show installed server version | No |
| `lab server update` | Update server to latest | No |

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

## Deep-Dive References

- `references/commands.md` — Full command reference with all options
- `references/workflows.md` — End-to-end workflow patterns
- `references/troubleshooting.md` — Error patterns and recovery

## Ready-to-Use Templates

- `templates/setup-and-login.sh` — First-time setup
- `templates/queue-and-monitor.sh` — Queue a task and monitor until completion
- `templates/provider-health-check.sh` — Check health of all providers
