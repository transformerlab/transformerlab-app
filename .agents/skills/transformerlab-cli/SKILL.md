---
name: transformerlab-cli
description: Transformer Lab CLI for managing ML training tasks, jobs, and compute providers. Use when the user needs to check job status, stream logs, download artifacts, queue training tasks, manage compute providers, or interact with Transformer Lab programmatically. Triggers include "check job status", "download results", "queue a task", "list providers", "stream logs", "what's running", "monitor training", "add a task", "check provider health".
allowed-tools: Bash(lab *), Bash(curl *beta.lab.cloud*), Bash(curl *localhost:8338*)
---

# Transformer Lab CLI

Use the `lab` CLI to interact with Transformer Lab programmatically — managing tasks, jobs, compute providers, and server configuration from the terminal.

## Installation

```bash
uv tool install transformerlab-cli
# or
pip install transformerlab-cli
```

Verify: `lab version`

## First-Time Setup & Authentication

**The CLI only supports API key authentication.** There is no `--email` or `--password` flag. To connect:

```bash
# Step 1: Set the server (if not using default localhost)
lab config set server https://your-server-url

# Step 2: Login with an API key
lab login --api-key YOUR_API_KEY --server https://your-server-url

# Step 3: Set the current experiment
lab config set current_experiment your_experiment_name

# Step 4: Verify connectivity
lab status
```

`login` validates the key and automatically configures `server`, `team_id`, `user_email`, and `team_name`.

**Getting an API key:** API keys are created in the Transformer Lab web UI under team settings, or via the REST API using a JWT token. If the user gives you email/password credentials, get a JWT token first, then use it to create an API key:

```bash
# Get JWT token from email/password
TOKEN=$(curl -s -X POST https://SERVER/auth/jwt/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=EMAIL&password=PASSWORD" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Use the JWT to find team info
curl -s -H "Authorization: Bearer $TOKEN" https://SERVER/users/me/teams
```

Then ask the user to provide or create an API key from the UI.

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
lab task queue TASK_ID --no-interactive

# 4. Monitor the job
lab job list --running
lab job logs JOB_ID --follow

# 5. Download results
lab job artifacts JOB_ID
lab job download JOB_ID --file "*.csv" -o ./results
```

## Agent-Specific Rules

1. **Use `--format json`** when you need to parse output, but be prepared to fall back to pretty output parsing if it doesn't work
2. **Use `--no-interactive`** on `task queue` and `provider add` to avoid blocking prompts
3. **`task add` has no `--yes` flag** — pipe `echo "y"` to confirm: `echo "y" | lab task add ./my-task`
4. **Use `--yes` / `-y`** on destructive commands (`provider delete`) to skip confirmation
5. **Never use `job monitor`** — it launches a TUI that blocks; use `job list` + `job logs` instead
6. **Never use `task interactive`** unless the user specifically requests an interactive session
7. **`job logs --follow`** streams continuously and blocks until the job finishes — use when the user wants real-time monitoring

## Debugging Failed Jobs

**Job COMPLETE does not mean the task succeeded.** Always check `completion_status` and `completion_details`:

```bash
# CLI: check job info for completion details
lab job info JOB_ID
# Look for: Completion Status (success/failed/N/A) and Completion Details

# CLI: get provider execution logs (what the task actually printed)
lab job logs JOB_ID
```

If `lab job logs` fails or returns empty, fall back to the REST API:

```bash
# Get provider logs directly — this is the most reliable way to see task output
curl -s -H "Authorization: Bearer API_KEY" \
  -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/experiment/EXPERIMENT/jobs/JOB_ID/provider_logs" | python3 -m json.tool
# Returns: {"logs": "...actual stdout/stderr from the task..."}
```

**Common failure patterns:**

| Symptom | Cause | Fix |
|---|---|---|
| Status COMPLETE but completion_status is N/A, progress 0% | Task never actually ran (wrong GPU type, cluster not found) | Check cluster status, verify accelerator type exists on provider |
| Status FAILED, "No such file or directory" in logs | Wrong `run` command path | Check where files are placed (see File Mounts section) |
| Status FAILED with a Python traceback | Task code error | Read the full provider logs to see the traceback |
| Status FAILED, no logs available | Cluster failed to provision | Check if the requested accelerator type is available |

### Checking Cluster Status (SkyPilot providers)

```bash
curl -s -H "Authorization: Bearer API_KEY" \
  -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/compute_provider/providers/PROVIDER_ID/clusters/CLUSTER_NAME/status" | python3 -m json.tool
```

The `cluster_name` is in the job info output. If `state` is "unknown" or "Cluster not found", the cluster never provisioned — likely wrong accelerator type or provider issue.

## Launching Jobs via REST API (Fallback)

If `lab task queue` fails (e.g., `provider list` returns 404 on the server), you can launch jobs directly via the REST API. This is the **most reliable method** and bypasses CLI limitations.

**Find the correct endpoint** from the server's OpenAPI spec:
```bash
curl -s https://SERVER/openapi.json | python3 -c "
import sys, json
paths = json.load(sys.stdin).get('paths', {})
for p in sorted(paths):
    if 'launch' in p or 'compute' in p:
        print(list(paths[p].keys()), p)
"
```

**Launch a task:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer API_KEY" \
  -H "X-Team-Id: TEAM_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "experiment_id": "EXPERIMENT_NAME",
    "task_id": "TASK_UUID",
    "task_name": "my-task",
    "run": "python ~/my-task/main.py",
    "accelerators": "RTX3090:1",
    "setup": "pip install ...",
    "env_vars": {"KEY": "VALUE"},
    "file_mounts": true,
    "parameters": {...},
    "config": {...},
    "provider_name": "ProviderName"
  }' \
  "https://SERVER/compute_provider/providers/PROVIDER_ID/launch/"
```

**Important:** The trailing slash on `/launch/` is required. The CLI uses an outdated endpoint path (`/compute_provider/{id}/task/launch`) — always use `/compute_provider/providers/{id}/launch/` when calling the API directly.

**Auth for REST API calls:** Use `Authorization: Bearer API_KEY` (not `x-api-key`). Always include `X-Team-Id` header. The API key works the same as the CLI's stored key.

## Getting Job Details via REST API

```bash
# Full job details including job_data, completion status, launch progress
curl -s -H "Authorization: Bearer API_KEY" \
  -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/experiment/EXPERIMENT/jobs/JOB_ID" | python3 -m json.tool

# Provider execution logs (stdout/stderr from the actual task)
curl -s -H "Authorization: Bearer API_KEY" \
  -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/experiment/EXPERIMENT/jobs/JOB_ID/provider_logs" | python3 -m json.tool
```

The `provider_logs` endpoint is the single best debugging tool — it returns what the task actually printed to stdout/stderr on the remote node.

## Command Overview

| Command | Description | Requires Experiment |
|---|---|---|
| `lab status` | Check server connectivity | No |
| `lab config` | View/set CLI configuration | No |
| `lab login` | Authenticate with API key (sets server, team, user) | No |
| `lab logout` | Remove stored API key | No |
| `lab whoami` | Show current user and team | No |
| `lab version` | Show CLI version | No |
| `lab task list` | List tasks in current experiment | Yes |
| `lab task info <id>` | Get task details | Yes |
| `lab task add [dir]` | Add task from directory or `--from-git` URL | Yes |
| `lab task delete <id>` | Delete a task | Yes |
| `lab task queue <id>` | Queue task on compute provider | Yes |
| `lab task gallery` | Browse/import from task gallery | Yes |
| `lab job list` | List jobs (`--running` for active only) | Yes |
| `lab job info <id>` | Get detailed job information | Yes |
| `lab job logs <id>` | Fetch provider logs (`--follow` to stream) | Yes |
| `lab job artifacts <id>` | List job artifacts | Yes |
| `lab job download <id>` | Download artifacts (`--file` for glob) | Yes |
| `lab job stop <id>` | Stop a running job | Yes |
| `lab provider list` | List compute providers | No |
| `lab provider info <id>` | Show provider details | No |
| `lab provider add` | Add a new provider | No |
| `lab provider update <id>` | Update provider config | No |
| `lab provider delete <id>` | Delete a provider (`--yes` to skip prompt) | No |
| `lab provider check <id>` | Check provider health | No |
| `lab provider enable <id>` | Enable a provider | No |
| `lab provider disable <id>` | Disable a provider | No |
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
- "current_experiment not set" → run `lab config set current_experiment <id>`
- Connection refused → check server URL with `lab config`, verify server is running
- "No compute providers available" → add a provider in team settings first, or check `provider list`

## When to Use CLI vs REST API vs Browser

| Use CLI for | Use REST API for | Use Browser for |
|---|---|---|
| Login, config, status checks | Launching jobs when CLI fails | Creating experiments |
| Listing tasks and jobs | Getting provider logs | Configuring tasks via forms |
| Streaming job logs (`--follow`) | Checking cluster status | Visual UI verification |
| Adding tasks from local dirs | Any operation where CLI returns errors | Creating API keys |
| Downloading artifacts | Debugging failed jobs | Managing team settings |

**When to fall back to REST API:** If any CLI command returns "Not Found", "Method Not Allowed", or "No compute providers available", the server API may have changed. Use the OpenAPI spec (`/openapi.json`) to find correct endpoints and call them directly with `curl`.

## Deep-Dive References

- `references/commands.md` — Full command reference with all options
- `references/workflows.md` — End-to-end workflow patterns
- `references/troubleshooting.md` — Error patterns and recovery

## Ready-to-Use Templates

- `templates/setup-and-login.sh` — First-time setup
- `templates/queue-and-monitor.sh` — Queue a task and monitor until completion
- `templates/provider-health-check.sh` — Check health of all providers
