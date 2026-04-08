# Task Creation & Import

Tasks enter TransformerLab through a unified task-create endpoint with three source modes: directory upload, GitHub source, or blank template.

## 1. Direct Upload

**Endpoint:** `POST /task/create` (accepts JSON or multipart/form-data)

The user uploads a ZIP containing `task.yaml` and optional task files.

**Flow:**

1. Frontend/CLI sends `directory_zip` as multipart form data
2. Server extracts ZIP and parses `task.yaml` via `_parse_yaml_to_task_data()` which validates against `TaskYamlSpec`
3. `task_service.add_task()` generates a UUID, writes `index.json` to `{workspace}/task/{task_id}/`
4. Entire uploaded task directory is copied into `{workspace}/task/{task_id}/` and `file_mounts: true` is set so the runner copies files at launch time

### Key source files

| File | Role |
| --- | --- |
| `api/transformerlab/routers/experiment/task.py` | Unified create endpoint, YAML endpoints, gallery import |
| `api/transformerlab/services/task_service.py` | Filesystem CRUD for tasks |
| `api/transformerlab/schemas/task.py` | `TaskYamlSpec` Pydantic model |

---

## 2. GitHub Import (Gallery)

Tasks can be imported from curated galleries — JSON files listing tasks hosted in GitHub repos.

### Gallery types

| Gallery | Source | Description |
| --- | --- | --- |
| **Task Gallery** | `task-gallery.json` synced from `transformerlab/galleries` repo on GitHub | Community/official task examples |
| **Interactive Gallery** | `interactive-gallery.json` (bundled) | Templates for interactive sessions (VS Code, Jupyter, vLLM, Ollama, SSH) |
| **Team Gallery** | `{workspace}/team_specific_tasks.json` | Per-team custom tasks; users export their own tasks here |

### Import flow

**Endpoint:** `POST /task/gallery/import`

```json
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

**Endpoint:** `POST /task/create` with JSON body `{ "source": "blank" }`

Creates a task with a default `task.yaml` template that the user can edit in the Monaco-based YAML editor in the UI.

---

## Frontend components

| Component | Purpose |
| --- | --- |
| `TasksGallery.tsx` | Browse and import from task galleries |
| `NewTeamTaskModal.tsx` | Form for creating team-specific tasks |
| `TeamInteractiveGalleryModal.tsx` | Browse and import interactive templates |

The task editor in the UI uses the Monaco editor to edit `task.yaml` and calls `PUT /task/{task_id}/yaml` to save, which re-syncs `index.json`.
