# Experiment Tags — Design

**Status:** Approved (brainstorming)
**Date:** 2026-05-12
**Owner:** deep@lab.cloud

## Goal

Let users label experiments with free-form tags and filter the experiment list by tag from the CLI. Surface tags as read-only chips in the GUI experiment list, with a small inline editor for managing them.

## Non-goals (v1)

- Server-side tag filtering (CLI filters client-side off the existing list response).
- Clickable filter chips or a tag filter bar in the GUI.
- Tag autocomplete in the GUI editor.
- Tag rename / merge / recolor.
- Tag-based permissions.

## Storage

Tags live inside the experiment's `index.json` `config` blob as a JSON array of strings:

```json
{
  "id": "my-exp",
  "name": "my-exp",
  "config": {
    "tags": ["fine-tuning", "llama"]
  }
}
```

No DB table, no migration. Filesystem-only — consistent with the project's bias and works across cluster nodes.

### Normalization (write-side, single helper)

A pure helper `normalize_tags(raw: Iterable[str]) -> list[str]` applied on every write:

1. Strip whitespace.
2. **Lowercase.**
3. Validate charset: `^[a-z0-9._-]{1,32}$`. Reject (HTTP 422) any tag that doesn't match, with a message naming the offending tag.
4. Deduplicate while preserving first-seen order.
5. Cap total tags per experiment at **20**. If `add` would exceed 20, return 422 with the count.

The helper lives in `api/transformerlab/services/experiment_service.py` (or a sibling `experiment_tags.py` if it grows) and is unit-tested directly.

## API

All new endpoints sit under the existing experiment router (`api/transformerlab/routers/experiment/experiment.py`) and reuse `require_permission("experiment", ...)`.

### `POST /experiment/{id}/tags/add`

- Body: `{ "tags": ["foo", "bar"] }`
- Permission: `experiment:write`
- Behavior: union-merges normalized input with existing `config.tags`, writes via `experiment_service.experiment_update_config_field(id, "tags", merged)`, invalidates the `experiments` cache tag.
- Response: `{ "tags": ["..."] }` — the resulting full tag list.

### `POST /experiment/{id}/tags/remove`

- Body: `{ "tags": ["foo"] }`
- Permission: `experiment:write`
- Behavior: set-difference (normalized). Removing a tag that isn't present is a no-op (not an error).
- Response: `{ "tags": ["..."] }`.

### `GET /experiment/tags`

- Permission: same role/permission filtering as `GET /experiment/` — only aggregates tags from experiments the caller can read.
- Response: `{ "tags": ["alpha", "beta", ...] }` — sorted alphabetically, deduped.

The existing `GET /experiment/` already returns `config`, so the unmodified list endpoint will carry `config.tags` to clients with no changes.

### Service additions

In `api/transformerlab/services/experiment_service.py`:

- `normalize_tags(raw) -> list[str]` (pure helper, raises `ValueError` on invalid; router maps to HTTP 422).
- `async experiment_add_tags(id, tags) -> list[str]`
- `async experiment_remove_tags(id, tags) -> list[str]`
- `async experiment_list_all_tags(experiment_dicts) -> list[str]` — takes the already-permission-filtered list and returns the sorted union. Kept as a pure function for testability; the router does the permission filtering, then calls this.

All three respect the existing `cache.invalidate("experiments")` pattern on writes.

## CLI

In `cli/src/transformerlab_cli/commands/experiment.py`:

### `lab experiment list [--tag <t>]...`

- `--tag` is repeatable. Multiple `--tag` flags are combined with **AND** semantics (experiment must have all listed tags).
- Filtering is client-side: fetch `GET /experiment/`, filter on `config.tags`.
- Table gains a `tags` column (comma-joined, dim color). Empty → blank cell.
- JSON output: each experiment carries its `tags` field (passed through from the API).
- Empty result prints `No experiments match tag(s): foo, bar` and exits 0.

### `lab experiment tag add <experiment> <tag>...`

- `<experiment>` resolves by name or id (matches existing `delete` / `set-default` convention).
- `<tag>` is variadic (one or more).
- Calls `POST /experiment/{id}/tags/add`.
- Prints the resulting full tag list.

### `lab experiment tag remove <experiment> <tag>...`

- Symmetric to `add`. Calls `POST /experiment/{id}/tags/remove`.

`tag` is a Typer sub-app under `experiment` (i.e. `app.add_typer(tag_app, name="tag")`), to keep `add` / `remove` discoverable via `--help`.

### `lab experiment tags`

- Plural, separate command under `experiment` (not under the `tag` sub-app — avoids collision with `lab experiment tag …`).
- Calls `GET /experiment/tags`.
- Renders a single-column table; JSON output is `{ "tags": [...] }`.

## GUI

File: `src/renderer/components/Experiment/ExperimentsManagerModal.tsx`.

### Display

- For each experiment row, render `config.tags` as a horizontal row of `<Chip size="sm" variant="soft" color="neutral">` elements directly under the existing chips area.
- If `tags` is empty/missing, render nothing (no empty row, no placeholder).
- No truncation in v1 — long tag lists wrap. (If this gets ugly we can clip to first N + "…" later.)

### Edit affordance

- A small pencil icon-button at the end of the tag row (visible on hover of the experiment row to keep things calm).
- Clicking opens a Joy UI `Popover` (or `Dropdown` — pick whichever is already in use in this file) anchored to the button containing:
  - The current tags as removable chips (`onDelete` on each chip → call `/tags/remove`, optimistic update via SWR `mutate`).
  - An `Input` accepting comma- or Enter-separated tags. On submit: normalize client-side (lowercase + trim only — server is source of truth for validation), call `/tags/add`, clear the input. Validation errors from the server display inline below the input.
- Closing the popover triggers a final `mutate(chatAPI.Endpoints.Experiment.GetAll())` to make sure other views reflect the change.
- No new modal, no new route.

### API client wiring

Add `Tags.Add(experimentId)` and `Tags.Remove(experimentId)` endpoint constants alongside the existing `Experiment.*` endpoints (wherever `chatAPI.Endpoints.Experiment.*` is defined — likely `src/renderer/lib/transformerlab-api-sdk.ts` or similar; locate during implementation).

## Testing

### API (`api/test/`)

- `test_experiment_tags_service.py` (new):
  - `normalize_tags` — trims, lowercases, dedupes, rejects bad charset, rejects > 32 chars, preserves order.
  - `experiment_add_tags` — adds new, merges with existing, idempotent on duplicate add.
  - `experiment_remove_tags` — removes present, no-op on absent.
  - 20-tag cap enforced on add.
- Router-level: extend `test_experiment_service.py` or add a thin router test for the new endpoints — 200 happy paths, 422 on bad tag, permission denial path.

### CLI (`cli/tests/commands/test_experiment.py`)

- Mock `api.get` / `api.post` and assert:
  - `lab experiment list --tag foo --tag bar` only shows experiments having both tags.
  - `tags` column appears in non-JSON output; JSON output includes `tags`.
  - `lab experiment tag add` and `tag remove` call the right URLs with normalized bodies.
  - `lab experiment tags` renders the global tag list.
- Run `python -m pytest tests/ -v` per repo convention.

### GUI

- A Jest unit test for the popover's input parser (`"foo, bar\nbaz"` → `["foo","bar","baz"]`, lowercased & trimmed).
- Manual visual check via `agent-browser` against the experiments manager modal after the feature lands.

## File touch-list (estimate)

- `api/transformerlab/services/experiment_service.py` — add 3 service functions + `normalize_tags`.
- `api/transformerlab/routers/experiment/experiment.py` — 3 new routes.
- `api/test/test_experiment_tags_service.py` — new.
- `cli/src/transformerlab_cli/commands/experiment.py` — `--tag` option on `list`, `tag` sub-app with `add`/`remove`, `tags` command.
- `cli/tests/commands/test_experiment.py` — extend.
- `src/renderer/components/Experiment/ExperimentsManagerModal.tsx` — chip rendering + edit popover.
- `src/renderer/lib/transformerlab-api-sdk.ts` (or wherever `Endpoints.Experiment` lives) — add tag endpoints.

## Open considerations (informational, not blocking)

- If the experiments list ever grows past a few hundred, client-side filtering on the CLI will still be fine (it's already paged through one HTTP call). Server-side `?tag=` can be added without changing the storage model.
- `GET /experiment/tags` walks every permitted experiment's `config.tags`. Same cost as the list endpoint that already exists. No new perf concern.
