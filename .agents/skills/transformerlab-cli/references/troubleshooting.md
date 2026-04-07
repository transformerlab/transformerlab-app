# Transformer Lab CLI — Troubleshooting

Common errors and how to resolve them.

---

## "config not set" or Missing Configuration

**Symptom:** Commands fail with errors about missing `server`, `team_id`, or `user_email`.

**Fix:** Run `lab login` to configure all required settings at once:
```bash
lab login --server https://your-server:8338 --api-key YOUR_KEY
```

To check current config:
```bash
lab config
```

---

## "current_experiment not set"

**Symptom:** Task and job commands fail because no experiment is selected.

**Fix:**
```bash
# Find available experiments via the API or ask the user
lab config set current_experiment EXPERIMENT_NAME
```

---

## Connection Refused / Cannot Connect

**Symptom:** `lab status` fails or commands time out.

**Possible causes:**
1. Server is not running
2. Wrong server URL configured
3. Network/firewall issue

**Fix:**
```bash
# Check configured server URL
lab config server

# Update if wrong
lab config set server http://correct-host:8338

# Verify
lab status
```

---

## Authentication Errors (401/403)

**Symptom:** Commands return authentication or permission errors.

**Fix:**
```bash
# Re-authenticate
lab logout
lab login --server https://your-server:8338 --api-key YOUR_NEW_KEY

# Verify
lab whoami
```

API keys may have expired or been revoked. Get a new one from the Transformer Lab UI.

---

## "No Compute Providers Available"

**Symptom:** `task queue` fails because no providers are configured or enabled.

**Fix:**
```bash
# Check existing providers
lab --format json provider list --include-disabled

# If none exist, add one
lab --format json provider add --name local --type local --no-interactive

# If disabled, enable it
lab provider enable PROVIDER_ID

# Verify health
lab --format json provider check PROVIDER_ID
```

---

## Job Shows COMPLETE But Task Never Ran

**Symptom:** Job status is COMPLETE, but `completion_status` is N/A, progress is 0%, and there are no artifacts or logs.

**Cause:** The cluster failed to provision (e.g., requested GPU type doesn't exist on the provider) but the job was marked complete by the orchestrator.

**Diagnosis:**
```bash
# Check cluster status
curl -s -H "Authorization: Bearer API_KEY" -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/compute_provider/providers/PROVIDER_ID/clusters/CLUSTER_NAME/status"
# If state is "unknown" or "Cluster not found" — the cluster never started

# Check provider logs — may be empty if cluster never ran
curl -s -H "Authorization: Bearer API_KEY" -H "X-Team-Id: TEAM_ID" \
  "https://SERVER/experiment/EXPERIMENT/jobs/JOB_ID/provider_logs"
```

**Fix:** Verify the accelerator type matches what's available on the provider. E.g., if you request `A100:1` but the provider only has `RTX3090`, the cluster will fail silently.

---

## Command Hangs / Blocks

**Symptom:** A command seems to hang and waits for input.

**Cause:** Interactive commands block when they need user input.

**Fix:** Use non-interactive flags:
- `task queue` → add `--no-interactive`
- `provider add` → add `--no-interactive` with `--name`, `--type`, `--config`
- `provider delete` → add `--yes`
- `task gallery` → use `--import GALLERY_ID` instead of browsing

**Never use these commands in automated contexts:**
- `job monitor` (launches TUI)
- `task interactive` (blocks for interactive session)

---

## `--format json` Not Working

**Symptom:** Output is still pretty-printed despite using `--format json`.

**Cause:** The `--format` flag must come before the subcommand.

**Fix:**
```bash
# WRONG
lab task list --format json

# CORRECT
lab --format json task list
```

---

## Job Stuck in WAITING or LAUNCHING

**Symptom:** Job status doesn't progress past WAITING or LAUNCHING.

**Diagnosis:**
```bash
# Check job details
lab --format json job info JOB_ID

# Check provider health
lab --format json provider check PROVIDER_ID

# Check provider logs
lab job logs JOB_ID
```

**Common causes:**
- Provider is offline or unhealthy
- Provider queue is full
- Resource requirements exceed provider capacity

---

## Exit Codes

| Exit Code | Meaning |
|---|---|
| 0 | Success |
| 1 | General error (check stderr or JSON `{"error": "..."}`) |
| 2 | Invalid arguments or missing required options |

With `--format json`, errors always return:
```json
{"error": "descriptive error message"}
```
