# Compute Providers

All providers implement the `ComputeProvider` abstract base class (`api/transformerlab/compute_providers/base.py`). The key method is `launch_cluster(cluster_name, config) → Dict` which provisions resources and starts the job.

## Provider resolution

`provider_service.get_provider_instance()` looks up the provider config from the `TeamComputeProvider` database table and instantiates the correct class based on `provider_type`.

## Local Provider

**Source:** `api/transformerlab/compute_providers/local.py`

Runs jobs on the same machine as the API server using subprocesses.

### Execution steps

```
launch_cluster(cluster_name, config)
  │
  ├── 1. Create per-job workspace
  │      job_dir/workspace/  (becomes HOME for the process)
  │
  ├── 2. Virtual environment setup
  │      ├── Shared base venv: HOME_DIR/local_provider_base_venv
  │      ├── Per-job venv created via: uv venv --python 3.11 --clear
  │      ├── Freeze base requirements, install into job venv
  │      └── Detect GPU (NVIDIA/AMD) → install correct PyTorch index
  │
  ├── 3. Environment setup
  │      ├── PATH → venv/bin
  │      ├── VIRTUAL_ENV, HOME, UV_CACHE_DIR
  │      └── Merge config.env_vars
  │
  ├── 4. Setup script (optional, 10-minute timeout)
  │      ├── Run config.setup in bash
  │      ├── Output → job_dir/stdout.log + stderr.log
  │      └── Failure → RuntimeError → job marked FAILED
  │
  └── 5. Main command
         ├── subprocess.Popen(config.run, start_new_session=True)
         ├── Wrapped with tfl-remote-trap for status tracking
         ├── PID written to job_dir/pid
         └── stdout/stderr → log files
```

### Key details for debugging

- **One job at a time**: the asyncio queue in `local_provider_queue.py` serializes local launches
- **uv for venvs**: uses `uv` (fast pip replacement) for both venv creation and package installs
- **Detached process**: `start_new_session=True` means the job survives if the API restarts
- **GPU detection**: checks for `nvidia-smi` or AMD ROCm to pick the right PyTorch index URL
- **Logs open early**: stdout/stderr files are opened before setup runs, so you can tail them while dependencies install

---

## SLURM Provider

**Source:** `api/transformerlab/compute_providers/slurm.py`

Submits to HPC clusters running the SLURM workload manager. Two modes:

| Mode | Connection | Job submission |
|------|-----------|----------------|
| **SSH** | paramiko SSH connection | Generate SBATCH script, submit via `sbatch` |
| **REST** | SLURM REST API (slurmrestd) | POST to `/slurm/v0.0.40/job/submit` |

### SSH mode flow
1. Connect via SSH (key or password auth)
2. Upload task files via SFTP
3. Generate SBATCH script with resource requests, env vars, setup, and run command
4. Submit with `sbatch`, capture job ID
5. Poll `squeue`/`sacct` for status
6. Fetch logs via `cat` over SSH

---

## SkyPilot Provider

**Source:** `api/transformerlab/compute_providers/skypilot.py`

Uses the [SkyPilot](https://skypilot.readthedocs.io/) SDK to launch on multiple clouds (AWS, GCP, Azure, etc.).

### Features
- Supports spot/preemptible instances
- Auto-stop idle clusters (configurable timeout)
- Cloud credential passthrough
- Multi-cloud resource optimization

### Flow
1. Build SkyPilot task YAML from ClusterConfig
2. Call `sky.launch()` or `sky.exec()` via SDK
3. Status tracked via `sky.status()` and `tfl-remote-trap`

---

## RunPod Provider

**Source:** `api/transformerlab/compute_providers/runpod.py`

Integration with RunPod cloud GPU platform.

### Flow
1. Create pod via RunPod API
2. Wait for pod to be ready
3. SSH into pod for log fetching
4. Logs fetched via SSH tunnel

---

## Provider interface

All providers implement these methods:

```python
class ComputeProvider(ABC):
    def launch_cluster(cluster_name, config) → Dict       # Provision + start
    def stop_cluster(cluster_name) → Dict                  # Stop cluster
    def get_cluster_status(cluster_name) → ClusterStatus   # UP/DOWN/UNKNOWN
    def list_clusters() → List[ClusterStatus]              # All clusters
    def get_clusters_detailed() → List[Dict]               # Detailed info
    def get_cluster_resources(cluster_name) → ResourceInfo # CPU/GPU/mem
    def submit_job(cluster_name, job_config) → Dict        # Submit to existing
    def get_job_logs(cluster_name, job_id, ...) → str      # Fetch logs
    def cancel_job(cluster_name, job_id) → Dict            # Cancel job
    def list_jobs(cluster_name) → List[JobInfo]            # List jobs
    def check() → bool                                     # Health check
```

## Key source files

| File | Role |
|------|------|
| `api/transformerlab/compute_providers/base.py` | Abstract base class |
| `api/transformerlab/compute_providers/models.py` | ClusterConfig, ClusterStatus, etc. |
| `api/transformerlab/compute_providers/local.py` | Local subprocess execution |
| `api/transformerlab/compute_providers/slurm.py` | SLURM SSH/REST integration |
| `api/transformerlab/compute_providers/skypilot.py` | SkyPilot multi-cloud |
| `api/transformerlab/compute_providers/runpod.py` | RunPod cloud GPUs |
| `api/transformerlab/services/provider_service.py` | Provider lookup and instantiation |
