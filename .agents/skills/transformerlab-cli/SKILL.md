---
name: transformerlab-cli
description: Transformer Lab CLI for managing ML training tasks, jobs, and compute providers. Use when the user needs to check job status, stream logs, download artifacts, queue training tasks, manage compute providers, or interact with Transformer Lab programmatically. Triggers include "check job status", "download results", "queue a task", "list providers", "stream logs", "what's running", "monitor training", "add a task", "check provider health".
allowed-tools: Bash(lab *)
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

## First-Time Setup

```bash
lab login --server https://your-server:8338 --api-key YOUR_KEY
lab config set current_experiment your_experiment_name
lab status   # verify connectivity
```

`login` automatically configures `server`, `team_id`, `user_email`, and `team_name`.

## Critical: `--format` Flag Placement

The `--format` flag is a **root-level option** and MUST come immediately after `lab`, before any subcommand:

```bash
# CORRECT
lab --format json job list
lab --format json task info 42

# WRONG — will be ignored or cause an error
lab job list --format json
```

**Always use `--format json` when you need to parse output.** The default `pretty` format uses Rich tables that are not machine-parseable.

## Core Workflow

The standard pattern for working with Transformer Lab:

```bash
# 1. Check server is up
lab status

# 2. List available tasks
lab --format json task list

# 3. Queue a task on a compute provider
lab --format json task queue TASK_ID --no-interactive

# 4. Monitor the job
lab --format json job list --running
lab job logs JOB_ID --follow

# 5. Download results
lab --format json job artifacts JOB_ID
lab job download JOB_ID --file "*.csv" -o ./results
```

## Agent-Specific Rules

1. **Always use `--format json`** for any command whose output you need to parse
2. **Use `--no-interactive`** on `task queue` and `provider add` to avoid blocking prompts
3. **Use `--yes` / `-y`** on destructive commands (`provider delete`) to skip confirmation
4. **Never use `job monitor`** — it launches a TUI that blocks; use `job list` + `job logs` instead
5. **Never use `task interactive`** unless the user specifically requests an interactive session
6. **`job logs --follow`** streams continuously and blocks until the job finishes — use when the user wants real-time monitoring

## Command Overview

| Command | Description | Requires Experiment |
|---|---|---|
| `lab status` | Check server connectivity | No |
| `lab config` | View/set CLI configuration | No |
| `lab login` | Authenticate (sets server, team, user) | No |
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
| `lab job logs <id>` | Fetch logs (`--follow` to stream) | Yes |
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
[{"id": 1, "status": "COMPLETE", "progress": 100, "job_data": {...}, "created_at": "..."}]
```

**`lab --format json task list`** returns an array:
```json
[{"id": 1, "name": "my-task", "type": "TRAINING", ...}]
```

**`lab --format json task queue <id>`** returns the created job:
```json
{"id": 42, "status": "WAITING", ...}
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

## When to Use CLI vs Browser

| Use CLI for | Use Browser for |
|---|---|
| Checking job/task status | Creating experiments |
| Streaming job logs | Configuring tasks via forms |
| Downloading artifacts | Visual UI verification |
| Listing/managing providers | Navigating the app |
| Querying structured data | Anything requiring UI interaction |

Typical flow: use the browser to create and configure a task in the UI, then switch to CLI to queue it, monitor the job, and download results.

## Deep-Dive References

- `references/commands.md` — Full command reference with all options
- `references/workflows.md` — End-to-end workflow patterns
- `references/troubleshooting.md` — Error patterns and recovery

## Ready-to-Use Templates

- `templates/setup-and-login.sh` — First-time setup
- `templates/queue-and-monitor.sh` — Queue a task and monitor until completion
- `templates/provider-health-check.sh` — Check health of all providers
