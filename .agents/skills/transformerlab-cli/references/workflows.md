# Transformer Lab CLI — Workflow Patterns

End-to-end workflows with complete command sequences. All examples use `--format json` for machine-parseable output.

---

## 1. First-Time Setup

Install the CLI, authenticate, and configure for use.

```bash
# Install the CLI
uv tool install transformerlab-cli

# Verify installation
lab version

# Login to the server (interactive — prompts for server URL and API key)
lab login --server https://your-server:8338 --api-key YOUR_API_KEY

# Verify authentication
lab --format json whoami

# List experiments to find one to work with
lab --format json config

# Set the current experiment
lab config set current_experiment my_experiment

# Verify everything works
lab status
lab --format json task list
```

---

## 2. Task Lifecycle: Gallery → Import → Queue → Monitor → Download

The most common workflow: find a task in the gallery, import it, run it, and get results.

```bash
# Browse the task gallery
lab --format json task gallery --type all

# Import a specific task from the gallery
lab --format json task gallery --import GALLERY_ID

# List tasks to get the imported task's ID
lab --format json task list

# Queue the task (non-interactive — uses defaults)
lab --format json task queue TASK_ID --no-interactive
# Returns: {"id": JOB_ID, "status": "WAITING", ...}

# Monitor the job — poll until complete
lab --format json job list --running
# Repeat until the job no longer appears in the running list

# Or stream logs in real-time (blocks until job finishes)
lab job logs JOB_ID --follow

# Check final status
lab --format json job info JOB_ID

# List and download artifacts
lab --format json job artifacts JOB_ID
lab job download JOB_ID -o ./results
# Or download specific files
lab job download JOB_ID --file "*.csv" --file "*.json" -o ./results
```

---

## 3. Task from Git Repository

Add a task directly from a GitHub repo.

```bash
# Add task from Git URL
lab --format json task add --from-git https://github.com/user/repo

# Verify it was added
lab --format json task list

# Queue it
lab --format json task queue TASK_ID --no-interactive
```

---

## 4. Task from Local Directory

Add a task from a local directory containing `task.yaml`.

```bash
# Preview first (dry run)
lab --format json task add ./my-task --dry-run

# Add the task
lab --format json task add ./my-task

# Queue it
lab --format json task queue TASK_ID --no-interactive
```

---

## 5. Provider Management

Add, configure, and monitor compute providers. **Always run `lab provider list` first** — most servers ship with a `local` provider already configured, and adding a new one only makes sense when the user explicitly asks or when an existing provider can't satisfy the requested resources.

```bash
# 1. List current providers (defaults to active only)
lab --format json provider list
lab --format json provider list --include-disabled

# 2. Add a new provider (non-interactive — see SKILL.md "Managing Providers"
#    for the per-type config schema). Examples:

# SkyPilot
lab --format json provider add --no-interactive --name my-skypilot --type skypilot \
  --config '{"server_url": "https://sky.example.com", "api_token": "TOKEN"}'

# Slurm over SSH
lab --format json provider add --no-interactive --name my-slurm --type slurm \
  --config '{"mode": "ssh", "ssh_host": "cluster.example.com", "ssh_user": "admin", "ssh_key_path": "~/.ssh/id_rsa", "ssh_port": "22"}'

# RunPod
lab --format json provider add --no-interactive --name my-runpod --type runpod \
  --config '{"api_key": "RUNPOD_KEY", "default_gpu_type": "NVIDIA H100"}'

# 3. Health-check immediately after creating
lab --format json provider check PROVIDER_ID

# 4. Toggle without deleting
lab provider disable PROVIDER_ID
lab provider enable PROVIDER_ID

# 5. Update fields (config is MERGED — pass only changed keys)
lab --format json provider update PROVIDER_ID --config '{"api_token": "NEW_TOKEN"}'

# 6. Delete (note: --no-interactive, NOT --yes)
lab provider delete PROVIDER_ID --no-interactive
```

---

## 6. Job Monitoring Pattern

Poll for job status and stream logs.

```bash
# List only running jobs
lab --format json job list --running

# Get detailed info on a specific job
lab --format json job info JOB_ID

# Stream logs (blocks until job finishes or is stopped)
lab job logs JOB_ID --follow

# Stop a job if needed
lab job stop JOB_ID

# After completion, check for errors
lab --format json job info JOB_ID
# Look at the "status" field: COMPLETE, FAILED, or STOPPED
# Look at the "errors" field for failure details
```

### Polling Pattern for Agents

When monitoring a job programmatically, use this pattern:

```bash
# 1. Queue and capture job ID
JOB_JSON=$(lab --format json task queue TASK_ID --no-interactive)
JOB_ID=$(echo "$JOB_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# 2. Poll until not running
while true; do
  STATUS=$(lab --format json job info "$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  case "$STATUS" in
    COMPLETE) echo "Done!"; break ;;
    FAILED|STOPPED) echo "Job $STATUS"; break ;;
    *) sleep 10 ;;
  esac
done

# 3. Download results
lab job download "$JOB_ID" -o ./results
```

---

## 7. System Health Check

Quick check of server and all providers.

```bash
# Check server
lab status

# Check all providers
lab --format json provider list
# For each provider ID, run:
lab --format json provider check PROVIDER_ID

# List any running jobs
lab --format json job list --running
```

---

## 8. Model Management

List, create, inspect, and delete models on the server.

```bash
# List all model groups
lab --format json model list

# Inspect a specific model
lab --format json model info GROUP_ID

# Create a new model group from a HuggingFace model ID
lab --format json model create meta-llama/Llama-2-7b --name "Llama 2 7B" --description "Base model for fine-tuning"

# Edit model metadata
lab model edit GROUP_ID --name "Updated Name" --description "New description"

# Delete a model group
lab model delete GROUP_ID --yes
```

---

## 9. Dataset Management

Upload, download, and manage datasets.

```bash
# List all datasets
lab --format json dataset list

# Download a dataset from HuggingFace Hub
lab dataset download Trelis/touch-rugby-rules

# Upload local files to a dataset (creates if needed)
lab dataset upload my-eval-set eval.jsonl

# Inspect a dataset
lab --format json dataset info GROUP_ID

# Edit dataset metadata
lab dataset edit GROUP_ID --description "Cleaned eval set v2"

# Delete a dataset group
lab dataset delete GROUP_ID --yes
```

---

## 10. Full Training Lifecycle: Dataset → Task → Job → Publish

End-to-end workflow: prepare data, train, and publish results.

```bash
# 1. Ensure the dataset exists on the server
lab --format json dataset list
# If not present, download or upload it
lab dataset download user/my-dataset
# or: lab dataset upload my-dataset train.jsonl eval.jsonl

# 2. Create or add a task that references the dataset
lab task init
# Edit task.yaml to add dataset_id in parameters, then:
lab --format json task add ./my-training-task

# 3. Queue the task
lab --format json task queue TASK_ID --no-interactive -m "Fine-tuning on my-dataset with lr=3e-5"

# 4. Monitor
lab job task-logs JOB_ID --follow

# 5. Check completion
lab --format json job info JOB_ID

# 6. Publish the trained model to the registry
lab --format json job publish model JOB_ID MODEL_NAME --group "my-model" --mode new --tag latest --description "Fine-tuned on my-dataset"

# 7. Publish any output datasets (e.g. generated eval results)
lab --format json job publish dataset JOB_ID DATASET_NAME --group "my-eval-results" --mode new --tag latest
```
