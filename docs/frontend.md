# Frontend Deep Dives

This document covers architecture and conventions in the frontend (`src/`) to help agents work effectively.

## Overview

The app is a **React 18 + TypeScript web app** served via webpack. It was originally an Electron app but Electron has been fully removed — there is no Electron code, no main process, and no IPC. Do not add Electron dependencies or patterns.

The dev server runs on port **1212**; the API runs on port **8338**.

## UI Framework: MUI Joy (Not MUI Material)

The UI is built with **MUI Joy UI** (`@mui/joy`), not MUI Material (`@mui/material`). These are different component libraries with different APIs.

- **Always import from `@mui/joy`**, never from `@mui/material`.
- Joy UI components: `Button`, `Input`, `Select`, `Modal`, `Sheet`, `Typography`, `FormControl`, `FormLabel`, etc.
- Styling uses the `sx` prop (Emotion CSS-in-JS under the hood).
- Theming uses `CssVarsProvider` with `extendTheme()` — supports light/dark mode via CSS variables.
- Icons come from `lucide-react`, not MUI icons.

## Data Fetching: SWR + fetchWithAuth

All API calls go through a custom `fetchWithAuth()` wrapper that handles:
- JWT cookie injection (`credentials: 'include'`)
- Team context headers (`X-Team-Id`, `X-Team-Name`)
- Automatic token refresh on 401 responses

For read operations, use the `useSWRWithAuth` hook with endpoint helpers:

```tsx
import useSWRWithAuth from '../lib/swr';
import * as chatAPI from '../lib/transformerlab-api-sdk';

const { data, error, isLoading, mutate } = useSWRWithAuth(
  chatAPI.Endpoints.Experiment.Get(experimentId)
);
```

For mutations (POST, PUT, DELETE), use `fetchWithAuth` directly:

```tsx
import { fetchWithAuth } from '../lib/api-client/functions';

const response = await fetchWithAuth(Endpoints.MyEntity.Create(), {
  method: 'POST',
  body: JSON.stringify(payload),
});
```

Endpoint URLs are defined as methods in `src/renderer/lib/api-client/endpoints.ts`.

## Routing

Uses `react-router-dom` v6 with `HashRouter` (hash-based URLs like `/#/experiment/alpha/tasks`). Routes are defined in `MainAppPanel.tsx`.

Key route patterns:
- `/` — Welcome page
- `/experiment/:experimentName/tasks` — Tasks page
- `/experiment/:experimentName/interactive` — Interactive jobs
- `/model-zoo`, `/data`, `/compute`, `/settings` — Top-level pages

## State Management

- **Easy-peasy** (Redux wrapper) — store defined in `src/renderer/store.js`, minimal usage currently.
- **React Context** for cross-cutting concerns:
  - `AuthContext` — user, login/logout, team selection, token refresh
  - `ExperimentInfoContext` — current experiment, persisted to localStorage
  - `NotificationProvider` — toast notifications
- **Component-local `useState`** for form inputs, modal visibility, loading states.

## Component Conventions

### Standard component structure

```tsx
interface MyComponentProps {
  experimentId: string;
  onClose: () => void;
}

export default function MyComponent({ experimentId, onClose }: MyComponentProps) {
  const [loading, setLoading] = useState(false);
  const { data } = useSWRWithAuth(Endpoints.Something.Get(experimentId));

  return (
    <Sheet sx={{ p: 2 }}>
      <Typography level="h4">Title</Typography>
      {/* content */}
    </Sheet>
  );
}
```

### Modal pattern

Modals follow a consistent structure throughout the app:

```tsx
<Modal open={open} onClose={onClose}>
  <ModalDialog>
    <ModalClose />
    <DialogTitle>Title</DialogTitle>
    <DialogContent>
      <FormControl>
        <FormLabel>Field</FormLabel>
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </FormControl>
    </DialogContent>
    <DialogActions>
      <Button variant="plain" onClick={onClose}>Cancel</Button>
      <Button onClick={handleSubmit}>Submit</Button>
    </DialogActions>
  </ModalDialog>
</Modal>
```

### Forms

Use Joy UI's `FormControl` + `FormLabel` + `Input`/`Select`/`Textarea`. For dynamic JSON-schema-driven forms, the app uses `@rjsf/core` (React JSON Schema Form).

## Authentication Flow

Cookie-based JWT auth managed by `AuthContext` (`src/renderer/lib/authContext.ts`):

1. Login sets JWT cookies on the server.
2. All fetch requests include `credentials: 'include'` for cookie transport.
3. On 401, `fetchWithAuth` automatically refreshes the token and retries.
4. Team context is stored in localStorage and sent as `X-Team-Id` header.
5. Team change triggers a full page reload to reset app state.

## Key Libraries

| Library | Purpose |
|---------|---------|
| `@mui/joy` | UI components (NOT `@mui/material`) |
| `swr` | Data fetching with caching/revalidation |
| `react-router-dom` | Hash-based routing |
| `easy-peasy` | Redux-based state management |
| `lucide-react` | SVG icon library |
| `@monaco-editor/react` | Code editor |
| `@xterm/xterm` | Terminal output display |
| `@nivo/*` | Charts (bar, line, radar) |
| `react-markdown` | Markdown rendering |
| `@rjsf/core` | JSON Schema forms |
| `react-dropzone` | File upload drag-and-drop |

## Common Mistakes to Avoid

- **Do not import from `@mui/material`** — the project uses `@mui/joy`. They have different component APIs.
- **Do not add Electron code** — this is a pure web app.
- **Do not use MUI Icons** — use `lucide-react` for icons.
- **Do not bypass `fetchWithAuth`** for API calls — it handles auth, team context, and token refresh.
- **Do not use `@mui/material` icons package** — it's not installed.
