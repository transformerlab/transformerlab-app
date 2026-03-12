# AGENTS.md

## Git Workflow

- The `main` branch is protected. **Never commit directly to `main`.**
- Always create a new branch for your work: `git checkout -b <descriptive-branch-name>`
- Use a clear branch naming convention, e.g. `add/short-description`, `fix/short-description`.
- Commit early and often with meaningful commit messages.
- **Never use `git commit --amend`** — it rewrites history and causes divergence with remote branches. Make a new commit instead.
- When work is complete, push the branch and open a pull request: `gh pr create --fill`
- Do not merge PRs yourself — let the reviewer merge.

## Build/Lint/Test Commands

- **Frontend dev**: `npm start` (Node v22, not v23+)
- **Frontend test**: `npm test` (Jest); single test: `npm test -- --testPathPattern="<pattern>"`
- **Frontend lint**: `npm run format`. **Always run `npm run format` on changed frontend files before committing.**
- **Python env (run once per shell)**: `source ~/.transformerlab/miniforge3/bin/activate && conda activate ~/.transformerlab/envs/transformerlab`
- **API install**: `cd api && ./install.sh` or `npm run api:install`
- **API start**: `cd api && ./run.sh` or `npm run api:start`
- **API test**: `cd api && pytest`
- **API single test**: `cd api && pytest test/<file>::<test>`
- **Python lint**: `cd api && ruff check` and `cd api && ruff format api.py` (or whichever files changed). **Always run both `ruff check` and `ruff format` on changed Python files before committing.**
- **DB migrations**: `cd api && alembic upgrade head`
- **Dev (no Docker)**: `python scripts/dev.py` — runs both frontend and API side by side with hot reload. Requires the API conda env and Node v22. Checks ports 8338 (API) and 1212 (frontend) on startup and reports conflicts.
  - `dev.py` calls `api/run.sh` which automatically activates the conda env at `~/.transformerlab/envs/transformerlab`, so you do **not** need to activate conda yourself.
  - The conda env and dependencies must already be installed via `cd api && ./install.sh`. If Python dependencies change, the user needs to re-run `./install.sh` manually.

## Architecture

- **Frontend**: Electron + React (TypeScript) in `src/`
- **Backend**: Python FastAPI in `api/transformerlab/`, entry point: `api/api.py`
- **SDK**: `lab-sdk/` - Python SDK published to PyPI as `transformerlab`
- **Database**: SQLite with Alembic migrations in `api/alembic/`
- **CLI**: Typer-based Python CLI in `cli/`

## Code Style

- **Imports**: Use existing patterns in neighboring files; check package.json/pyproject.toml before adding deps
- **DB Tables**: Use existing patterns and dont create any table with a foreign key.
- **Alembic Migrations**: Use existing patterns and dont create any migration with a foreign key. Try to autogenerate the migration if possible.
- **TypeScript**:
  - **Strict Typing**: Avoid `any`. Define interfaces for all props and API responses to ensure type safety.
  - **Functional Components**: Use React functional components with Hooks. Avoid class components.
  - **State Management**: The app uses `easy-peasy` (Redux wrapper). Use actions for state mutations; avoid prop drilling deep hierarchies.
- **Python**:
  - **Linting**: Ruff (Black-compatible), 120 char line length, 4-space indent
  - **Type Hints**: Mandatory for all function arguments and return types.
  - **Pydantic**: Use Pydantic models (in `schemas/`) for distinct data validation and serialization layers.
  - **Service Pattern**: Business logic goes in `api/transformerlab/services/`, NOT in routers. Routers (`api/transformerlab/routers/`) should only handle HTTP request/response validation and calling services.


## Storing Data

- In general we are biased towards storing data in the filesystem versus storing in a database. This is so that nodes that are all coordinating in an ML cluster can all use the filesystem to synchronize data
- Our database is a SQLlite DB but we also support Postgres (by using sqlalchemy) so avoid DB operations that would only work on one or the other

## Testing

- **Frontend**:
  - **Unit Tests**: Write tests for all utility functions and complex hooks.
  - **Component Tests**: Test components in isolation where possible.
  - **Command**: Use `npm test` to verify changes.
- **Backend**:
  - **Unit Tests**: Write `pytest` tests in `api/test/`.
  - **Mocking**: Mock external interactions (S3, GPU providers, filesystem operations) using `unittest.mock` or `pytest-mock`. Tests should be fast and deterministic.
  - **Service Tests**: Prefer testing the Service layer directly over testing the full API stack when checking business logic constants.
- **Playwright (E2E)**:
  - **Location**: Tests live in `test/playwright/`. Config is in `playwright.config.ts` (base URL `http://localhost:8338`).
  - **Run all**: `npx playwright test` (requires the Docker test container).
  - **Run one**: `npx playwright test <file-name>` (e.g. `npx playwright test hello-world-task`).
  - **Full cycle**: `npm run docker-test:playwright` (starts container, runs tests, tears down).
  - **Docker container**: `npm run docker-test:up` starts the app; `npm run docker-test:down` stops it. Wait for the healthcheck before running tests.
  - **Auth**: Log in via UI with `admin@example.com` / `admin123`. Import the shared `login()` and `selectFirstExperiment()` helpers from `test/playwright/helpers.ts`.
  - **Debugging**: When debugging Playwright test failures (e.g. wrong elements being clicked, selectors not matching), use browser tools to navigate to the app, inspect the live DOM structure, and verify selectors before updating tests. Two browser tools are available:
    - **Vercel agent-browser** (default): More efficient and should be used by default for inspecting pages, taking snapshots, and verifying selectors.
    - **Chrome DevTools MCP**: Gives direct access to the browser (DevTools protocol). Use when you need lower-level control such as evaluating scripts, inspecting network requests, or performance tracing.
  - **Selectors**: Prefer `getByRole`, `getByText({ exact: true })`, and `getByPlaceholder`. Use `.first()` when prior test runs may leave duplicate elements (e.g. multiple tasks or jobs).
  - **xterm.js content**: Terminal output rendered by xterm is not in the DOM. Verify it by polling the corresponding API endpoint (e.g. `/experiment/{id}/jobs/{jobId}/provider_logs`) via `page.request.get()` and `expect.poll()`.
  - **Idempotency**: Tests must pass on repeated runs against the same container. Don't assume a clean DB; handle existing data gracefully with `.first()` or by checking for pre-existing state.
  - **Timeouts**: Set `test.setTimeout(120_000)` for tests that queue jobs (local provider launch + execution can take time). Use generous `toBeVisible({ timeout: 60000 })` for status transitions like LAUNCHING → COMPLETE.

### Visual UI Verification

When verifying UI changes in the browser, **always prefer the Vercel agent-browser** (the default browser tool). It is more efficient for navigating pages, taking snapshots, clicking elements, and filling forms. Only fall back to the **Chrome DevTools MCP** when you specifically need lower-level capabilities such as evaluating JavaScript, inspecting network requests, analyzing console messages, or running performance traces.

When requested, verify the result with the following steps:

1. Run `npm run docker-test:up` to ensure the app is running (or use `python scripts/dev.py` for local dev).
2. Use the browser tool to navigate to the page you just changed. Remember that the app usually serves on port 8338 (API) and port 1212 (frontend dev server).
3. If the app requires login, use the default credentials: **email:** `admin@example.com` / **password:** `admin123`.
4. Explore related pages (e.g., if you changed the Header, also check the Dashboard and Login pages).
5. Take screenshots and verify that no layouts are broken.
6. If you see a visual bug in the screenshot, fix it immediately.

## Architecture Deep Dives

This section documents complex flows in the codebase to help agents quickly understand how things work.

### Job Execution on Local Providers

When a job is queued for a local provider, it flows through several layers:

1. **Queueing** (`api/transformerlab/routers/compute_provider.py`, ~line 1727): The router builds a `ClusterConfig` and calls `enqueue_local_launch()`, returning immediately with `WAITING` status. For remote (non-local) providers, the command is wrapped with `tfl-remote-trap` to track `live_status` (`started`/`finished`/`crashed`).

2. **Serialized worker** (`api/transformerlab/services/local_provider_queue.py`): A background `asyncio` worker (`_local_launch_worker`) pulls items from the queue one at a time. It resolves the provider via `get_provider_instance()`, transitions the job to `LAUNCHING`/`INTERACTIVE`, then calls `provider_instance.launch_cluster()` inside a `try/except` block that catches errors, releases quota holds, and marks the job `FAILED`.

3. **Local execution** (`api/transformerlab/compute_providers/local.py`, `LocalProvider.launch_cluster()`): Creates a per-job `uv` virtual environment, runs any setup commands, then launches the job command via `subprocess.Popen` in a detached session with stdout/stderr written to log files in the job directory.

4. **Error handling**: Local providers rely on the queue worker's `try/except` for error capture. Remote providers use the `tfl-remote-trap` SDK helper (`lab-sdk/src/lab/remote_trap.py`) which wraps the command and sets `job_data.live_status` on success or failure.

5. **Plugin harness** (`api/transformerlab/plugin_sdk/plugin_harness.py`): For plugin-based jobs (training, eval), the subprocess entry point that loads and executes plugin logic with its own error/traceback handling.

## Agentic Performance Optimization

- **Context**: When making changes, look at similar existing files (e.g., "Implement the new `ModelService` following the pattern in `api/transformerlab/services/job_service.py`").
- **Small, Atomic Steps**: Break down complex refactors into:
  1. Define types/schemas.
  2. Implement backend service logic.
  3. Expose via API endpoint.
  4. Update frontend client.
  5. Build UI.
- **Read First**: Read relevant files _before_ planning changes to ensure consistency with existing patterns.
