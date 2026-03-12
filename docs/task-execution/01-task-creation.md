# Task Creation & Import

Tasks enter TransformerLab through three paths: direct upload, GitHub import via the gallery, or creating a blank task from the UI.

## 1. Direct Upload

**Endpoint:** `POST /task/new_task` (accepts multipart/form-data)

The user provides a YAML or JSON task definition and optionally a ZIP file containing task code.

**Flow:**

1. Frontend sends `yaml` (or `json`) field + optional `zip_file`
2. Server parses YAML via `_parse_yaml_to_task_data()` which validates against the `TaskYamlSpec` Pydantic schema
3. `task_service.add_task()` generates a UUID, writes `index.json` to `{workspace}/task/{task_id}/`
4. If a ZIP was provided, it's stored to `{workspace}/uploads/task/{task_id}/` and `file_mounts: true` is set on the task — the runner will extract the ZIP to `~/src` at job launch time

**Alternative endpoint:** `POST /task2/from_directory` handles ZIPs that contain a `task.yaml` at the root. The entire directory is extracted and copied into the task's workspace directory.

### Key source files

| File | Role |
|------|------|
| `api/transformerlab/routers/experiment/task.py` | Upload endpoints, YAML parsing |
| `api/transformerlab/routers/experiment/tasks2.py` | `from_directory` and `blank` endpoints |
| `api/transformerlab/services/task_service.py` | Filesystem CRUD for tasks |
| `api/transformerlab/schemas/task.py` | `TaskYamlSpec` Pydantic model |

---

## 2. GitHub Import (Gallery)

Tasks can be imported from curated galleries — JSON files listing tasks hosted in GitHub repos.

### Gallery types

| Gallery | Source | Description |
|---------|--------|-------------|
| **Task Gallery** | `task-gallery.json` synced from `transformerlab/galleries` repo on GitHub | Community/official task examples |
| **Interactive Gallery** | `interactive-gallery.json` (bundled) | Templates for interactive sessions (VS Code, Jupyter, vLLM, Ollama, SSH) |
| **Team Gallery** | `{workspace}/team_specific_tasks.json` | Per-team custom tasks; users export their own tasks here |

### Import flow

**Endpoint:** `POST /task/gallery/import`

```
Body: { "gallery_id": "0", "experiment_id": "alpha", "is_interactive": false }
```

1. Server looks up the gallery entry by index or ID
2. Fetches `task.yaml` from the GitHub repo via `fetch_task_yaml_from_github()` (supports GitHub PAT for private repos)
3. Parses YAML → `task_data`
4. Creates task via `task_service.add_task()`
5. Stores `task.yaml` in `{workspace}/task/{task_id}/task.yaml`

### Interactive task import

Same flow, but the task also gets:
- `subtype: "interactive"`
- `interactive_type`: e.g. `vscode`, `jupyter`, `ssh`
- `interactive_gallery_id`: reference to the interactive gallery entry used at launch time

### Exporting to team gallery

**Endpoint:** `POST /task/gallery/team/export`

Reads the task's metadata, builds a gallery entry, and upserts it into `team_specific_tasks.json`.

---

## 3. Create Blank Task

**Endpoint:** `POST /task2/blank`

Creates a task with a default `task.yaml` template that the user can edit in the Monaco-based YAML editor in the UI.

---

## Frontend components

| Component | Purpose |
|-----------|---------|
| `TasksGallery.tsx` | Browse and import from task galleries |
| `NewTeamTaskModal.tsx` | Form for creating team-specific tasks |
| `TeamInteractiveGalleryModal.tsx` | Browse and import interactive templates |

The task editor in the UI uses the Monaco editor to edit `task.yaml` and calls `PUT /task2/{task_id}/yaml` to save, which re-syncs `index.json`.
