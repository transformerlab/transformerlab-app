# Task Data Model

Tasks are stored entirely on the filesystem — there are no database tables for tasks. This is a deliberate choice so that nodes in an ML cluster can synchronize via the shared filesystem.

## Storage layout

```
{workspace}/
├── task/
│   ├── {task_id}/
│   │   ├── index.json        # Canonical metadata (flat JSON)
│   │   └── task.yaml         # Human-editable YAML (when present)
│   └── {another_task_id}/
├── uploads/task/
│   └── {task_id}/
│       └── {filename}.zip    # Uploaded ZIP files
└── team_specific_tasks.json  # Team gallery entries
```

Where `{workspace}` resolves to `~/.transformerlab/orgs/{org_id}/workspace` (or cloud storage if configured).

## index.json

The canonical source of truth for a task. Flat structure — all fields at the top level.

```json
{
  "id": "aafd8c86-821e-4bd0-ba65-7badb57de1d1",
  "name": "my-training-task",
  "type": "REMOTE",
  "plugin": "remote_orchestrator",
  "experiment_id": "alpha",
  "created_at": "2026-03-02T19:20:02.710273",
  "updated_at": "2026-03-02T19:20:02.711472",

  "run": "python train.py",
  "setup": "pip install -r requirements.txt",
  "command": "python train.py",

  "subtype": "interactive",
  "interactive_type": "vscode",
  "interactive_gallery_id": "gallery-entry-id",

  "cluster_name": "my-cluster",
  "provider_id": "provider-uuid",
  "provider_name": "Local",

  "env_vars": { "LEARNING_RATE": "0.001" },
  "parameters": {},

  "cpus": "2",
  "memory": "4",
  "disk_space": "10",
  "accelerators": "NVIDIA",
  "num_nodes": 1,

  "file_mounts": true,

  "github_repo_url": "https://github.com/org/repo",
  "github_repo_dir": "subdir",
  "github_repo_branch": "main",

  "sweep_config": {},
  "sweep_metric": "eval/loss",
  "lower_is_better": true,
  "run_sweeps": true
}
```

**Notes:**
- `command` is a legacy field; `run` is the modern entrypoint. Both may be present.
- `file_mounts: true` means uploaded files exist in `uploads/task/{id}/` and will be extracted to `~/src` at launch.
- `type` is typically `"REMOTE"` for tasks sent to compute providers.
- `plugin` is typically `"remote_orchestrator"`.

## task.yaml

The human-editable format. Validated by the `TaskYamlSpec` Pydantic schema in `api/transformerlab/schemas/task.py`.

```yaml
name: my-training-task

resources:
  compute_provider: provider-name   # Matched against team's providers
  cpus: 2
  memory: 4                         # GB
  disk_space: 10
  accelerators: "NVIDIA"            # NVIDIA | AMD | cpu
  num_nodes: 1

envs:
  LEARNING_RATE: "0.001"

setup: |
  pip install -r requirements.txt

run: |
  python train.py

github_repo_url: https://github.com/org/repo
github_repo_dir: subdir
github_repo_branch: main

parameters:
  learning_rate: 0.001

sweeps:
  sweep_config:
    learning_rate: [0.001, 0.01, 0.1]
  sweep_metric: eval/loss
  lower_is_better: true

minutes_requested: 60               # Quota request (minutes)
```

When saved via `PUT /task2/{task_id}/yaml`, the YAML is parsed and `index.json` is updated to stay in sync.

## TaskTemplate class (lab-sdk)

The `TaskTemplate` class in `lab-sdk/src/lab/task_template.py` wraps the filesystem operations:

- `get_dir()` — returns `{workspace}/task/{task_id}/`
- `set_metadata()` / `get_metadata()` — reads/writes `index.json`
- `list_all()` / `list_by_type()` — enumerates task directories

## API endpoints for task CRUD

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/task/list` | List all tasks |
| GET | `/task/{task_id}/get` | Get task by ID |
| PUT | `/task/{task_id}/update` | Update task metadata |
| GET | `/task/{task_id}/delete` | Delete task |
| GET | `/task2/{task_id}/yaml` | Get task.yaml for editing |
| PUT | `/task2/{task_id}/yaml` | Save updated task.yaml |
| POST | `/task2/validate` | Validate YAML without saving |
| GET | `/task/{task_id}/files` | List files (GitHub or uploaded) |
