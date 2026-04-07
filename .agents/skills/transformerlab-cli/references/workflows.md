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

Add, configure, and monitor compute providers.

```bash
# List current providers
lab --format json provider list

# Add a new provider (non-interactive)
lab --format json provider add --name my-slurm --type slurm --config '{"host": "cluster.example.com", "user": "admin"}' --no-interactive

# Check provider health
lab --format json provider check PROVIDER_ID

# Disable a provider temporarily
lab provider disable PROVIDER_ID

# Re-enable it
lab provider enable PROVIDER_ID

# Update provider config (merges with existing)
lab --format json provider update PROVIDER_ID --config '{"partition": "gpu"}'

# Delete a provider
lab provider delete PROVIDER_ID --yes
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
