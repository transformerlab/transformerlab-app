# Model Registry Redesign

**Status:** Proposed
**Date:** 2026-05-01
**Scope:** Frontend (`src/renderer/components/ModelZoo/`)

## Problem

The current `/zoo/registry` page renders model groups as an accordion list. Each group expands inline to show its versions in a nested table. The result is misaligned (the search/filter top bar uses `&nbsp;` labels to fake vertical alignment), visually busy, and conflates two concepts: browsing the catalog and inspecting one model. Two of three filters in the top bar are disabled, adding to the unfinished feel.

## Goals

- Make the registry page a clean, browsable catalog of model groups.
- Give each group its own detail page with room to grow (model card, versions, future raw-file browsing).
- Fix the alignment issues in the top bar.

## Non-goals

- Implementing license/architecture filtering (they remain disabled placeholders).
- Browsing raw files of a version (planned, not part of this change).
- Server-side changes — this is purely a frontend refactor over existing endpoints.

## Routing

Two routes, both handled by `ModelZoo`:

- `/zoo/registry` — list of model groups (existing route, redesigned).
- `/zoo/registry/:groupId` — new detail page for one group.

`MainAppPanel.tsx` gets one new `Route` entry. `ModelZoo.tsx` reads `useParams()` to decide whether to render the list or the detail component.

`groupId` is used (not `groupName`) so renames don't break links.

## List view (`/zoo/registry`)

### Top bar
Same controls as today — search input, license filter, architecture filter, refresh button — but the layout is rebuilt so all four sit on a single aligned row. Drop the `&nbsp;` `FormLabel` hack; align controls by their input boxes, not by faked label rows. License and architecture stay disabled (existing behavior).

### Card grid
Below the top bar, a responsive CSS grid: `repeat(auto-fill, minmax(280px, 1fr))`, ~12px gap. Renders one **tiny card** per group.

### Tiny card layout (two rows)
- **Row 1:** `PackageIcon` + bold group name + "N versions" chip + latest tag chip (if `latest_tag` set).
- **Row 2:** group description, single line with ellipsis. If no description, omit the row and let the card be one row tall.
- **Hover affordances** (top-right of card): pencil (opens `EditGroupModal`) and trash (delete with confirm). Hidden until card hover; `e.stopPropagation()` so they don't trigger card navigation.
- **Click anywhere else on the card:** `navigate('/zoo/registry/<groupId>')`.

### States
- **Loading:** existing skeleton, but rendered as a grid of card-shaped skeletons instead of stacked rectangles.
- **Empty:** existing empty-state copy (`PackageIcon`, "No model groups yet."), unchanged.
- **Error:** existing error message, unchanged.

## Detail page (`/zoo/registry/:groupId`)

New component `ModelGroupDetail.tsx`.

### Header
- Back button (chevron-left + "Registry") that navigates to `/zoo/registry`.
- Large group name.
- Right-aligned cluster: latest tag chip, "N versions" chip, "Updated <relative>" text, pencil (edit), trash (delete).
- Description below the title.
- Metadata pill row (small chips): architecture, parameters, license. Pulled from the latest version's `metadata`. Hide individual pills when their field is missing; hide the whole row if all are missing.

### Tabs
Joy `Tabs`, value-controlled in component state (no URL sync in this iteration).

#### 1. Model Card
- Renders `long_description` if present, else `description`, as markdown using the existing markdown renderer used elsewhere in the app (to be located during implementation).
- If neither exists: stub "No model card yet" with a hint pointing to the edit action.

#### 2. Versions
The existing versions table from `GroupVersionsTable`, trimmed and lifted out of the accordion:

| Column | Notes |
|---|---|
| Version | Monospace, primary identifier on this page |
| Tag | Existing chip + select control |
| Architecture | From `metadata.architecture` |
| Params | From `metadata.parameters` |
| Model ID | Tooltip-only or shown on hover (de-emphasized; not a primary column) |
| Job | Existing chip |
| Created | Relative time |
| Actions | Delete |

The "Name" column is dropped — it repeats the group title on every row.

Each row is structurally clickable for future raw-file browsing, but in this iteration the click is a no-op.

### Data fetching
- `Endpoints.AssetVersions.ListGroups('model')` to find the group summary by `groupId`. (If a single-group endpoint exists, use it instead — verify during implementation.)
- `Endpoints.AssetVersions.ListVersions('model', groupId)` for the versions tab.
- Mutations (`SetTag`, `ClearTag`, `DeleteVersion`, `UpdateGroup`, `DeleteGroup`) reuse the existing endpoints.

## File changes

### New
- `src/renderer/components/ModelZoo/ModelRegistryGrid.tsx` — list page (top bar + card grid + skeleton/empty/error states).
- `src/renderer/components/ModelZoo/ModelGroupCard.tsx` — single tiny card, hover actions, click navigation.
- `src/renderer/components/ModelZoo/ModelGroupDetail.tsx` — detail page (header + tabs).

### Modified
- `src/renderer/components/MainAppPanel.tsx` — add `<Route path="/zoo/registry/:groupId" element={<ModelZoo tab="registry" />} />`.
- `src/renderer/components/ModelZoo/ModelZoo.tsx` — read `useParams()`; render `ModelRegistryGrid` when there's no `groupId`, `ModelGroupDetail` when there is.
- `src/renderer/components/ModelZoo/ModelRegistry.tsx` — replaced. Reusable parts (`EditGroupModal`, the version table logic) move to whichever new component owns them; the accordion is deleted.

## Component boundaries

- **`ModelRegistryGrid`** — owns search/filter state, fetches groups, renders the grid.
- **`ModelGroupCard`** — pure presentational; receives `group`, `onEdit`, `onDelete`, `onOpen`.
- **`ModelGroupDetail`** — owns tab state, fetches the group summary and its versions, renders header + tabs.
- **`EditGroupModal`** — unchanged; imported by both list (for hover edit) and detail (for header edit).
- **`GroupVersionsTable`** — moves into `ModelGroupDetail.tsx` (or stays as a sibling file if reused). The "Name" column is removed.

Each component is reasonable to read end-to-end without expanding its dependencies.

## Out of scope (follow-ups)

- Wiring license/architecture filters to real data.
- Per-version raw-file browser (clicking a version row).
- Syncing the active tab to the URL (`?tab=versions`).
- A "create new group" affordance on the list page.

## Testing

- Manual visual verification using `agent-browser` after implementation: list page alignment, card hover, navigation to detail, both tabs render, edit/delete from both surfaces, back-button returns to list.
- No new automated tests required; existing API endpoints are unchanged.
