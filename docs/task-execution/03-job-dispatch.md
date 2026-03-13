# Job Dispatch & Queueing

When a user runs a task, it becomes a **job**. This document covers how tasks are turned into jobs and routed to the appropriate compute provider.

## Trigger

**Endpoint:** `POST /compute_provider/{provider_id}/template/launch`

**Request body** (`ProviderTemplateLaunchRequest`):
- `task_name`, `run`, `setup`, `env_vars`, `parameters`
- Resource requirements: `cpus`, `memory`, `disk_space`, `accelerators`, `num_nodes`
- Provider routing: `provider_id`, `cluster_name`
- Sweep config: `run_sweeps`, `sweep_config`, `sweep_metric`, `lower_is_better`
- Interactive: `subtype`, `interactive_type`, `interactive_gallery_id`

**Source:** `api/transformerlab/routers/compute_provider.py` (~line 1442, `launch_template_on_provider`)

## What happens on launch

```
POST /compute_provider/{provider_id}/template/launch
  │
  ├── 1. Resolve provider (get_provider_instance)
  ├── 2. Check quota (for REMOTE jobs)
  ├── 3. Create a Job on disk
  │      {workspace}/jobs/{job_id}/index.json
  │      Initial status: QUEUED or WAITING
  │
  ├── 4. Build ClusterConfig
  │      ├── Merge env_vars (task + provider + secrets)
  │      ├── Resolve file_mounts (uploaded ZIPs, GitHub repo)
  │      ├── Build setup script (SDK install, credentials, git clone)
  │      └── Wrap run command with tfl-remote-trap (for remote)
  │
  └── 5. Route to provider
         ├── LOCAL ──► enqueue_local_launch() [serialized asyncio queue]
         └── REMOTE ─► provider.launch_cluster() [direct call]
```

## Job storage

Jobs are filesystem-based, like tasks:

```
{workspace}/jobs/{job_id}/
├── index.json          # Job metadata (status, type, job_data, progress)
├── stdout.log          # Standard output (local provider)
├── stderr.log          # Standard error (local provider)
├── pid                 # Process ID (local provider)
└── provider_logs.txt   # Logs written by tfl-remote-trap (remote providers)
```

## Job metadata (index.json)

```json
{
  "id": "job-uuid",
  "experiment_id": "experiment-id",
  "status": "LAUNCHING",
  "type": "REMOTE",
  "progress": 0,
  "job_data": {
    "task_name": "...",
    "run": "python train.py",
    "setup": "pip install ...",
    "cluster_name": "...",
    "provider_id": "...",
    "provider_type": "local",
    "cpus": "2",
    "memory": "4",
    "accelerators": "NVIDIA",
    "env_vars": {},
    "parameters": {},
    "live_status": "started",
    "launch_progress": {
      "phase": "launching_cluster",
      "percent": 50,
      "message": "Installing dependencies...",
      "steps": [...]
    }
  }
}
```

**Job types:** `REMOTE`, `LOCAL`, `TASK`, `TRAIN`, `EVAL`, `SWEEP`

## ClusterConfig

The `ClusterConfig` model (`api/transformerlab/compute_providers/models.py`) is the provider-agnostic specification for what to run:

```python
ClusterConfig(
    cpus="2",
    memory="4",
    accelerators="NVIDIA",
    setup="pip install ...",          # Setup script
    run="python train.py",           # Main command
    env_vars={"KEY": "value"},       # Environment variables
    file_mounts={...},               # Files to mount/copy
    provider_config={...},           # Provider-specific overrides
)
```

For remote providers, the `run` command is automatically wrapped with `tfl-remote-trap`:
```bash
tfl-remote-trap -- python train.py
```

This wrapper reports `live_status` (started/finished/crashed) back to the API and writes logs to `provider_logs.txt`.

## Local provider queueing

The local provider uses a serialized asyncio queue to ensure only one local job runs at a time.

**Source:** `api/transformerlab/services/local_provider_queue.py`

```
enqueue_local_launch(job_id, provider, cluster_config, ...)
  │
  ├── Add item to asyncio.Queue
  └── Lazy-start _local_launch_worker() if not already running
        │
        └── _local_launch_worker() [infinite loop]
              │
              └── _process_launch_item()
                    ├── Transition job: WAITING → LAUNCHING (or INTERACTIVE)
                    ├── get_provider_instance()
                    ├── provider.launch_cluster() [in thread executor]
                    └── Release quota hold on completion
```

## Quota management

For REMOTE jobs, quota is checked and held before launch:

1. `quota_service.check_quota_available()` — reject if insufficient
2. Create `QuotaHold(minutes_requested, status='HELD')` — reserve quota
3. On job completion: convert hold → `QuotaUsage` with actual minutes used

Database tables: `TeamQuota`, `UserQuotaOverride`, `QuotaUsage`, `QuotaHold`

## Key source files

| File | Role |
|------|------|
| `api/transformerlab/routers/compute_provider.py` | Launch endpoint, sweep orchestration |
| `api/transformerlab/services/local_provider_queue.py` | Serialized local job queue |
| `api/transformerlab/services/job_service.py` | Job CRUD (filesystem) |
| `api/transformerlab/compute_providers/models.py` | ClusterConfig, JobConfig models |
| `lab-sdk/src/lab/job.py` | Job filesystem abstraction |
| `lab-sdk/src/lab/job_status.py` | JobStatus enum |
