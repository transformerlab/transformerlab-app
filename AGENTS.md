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
- **Frontend lint**: `npm run format` (auto-fix) or `npm run format:check` (dry-run). **Always run `npm run format` on changed frontend files before committing.**
- **Python env (run once per shell)**: `source ~/.transformerlab/envs/general-uv/bin/activate`
- **API install**: `cd api && ./install.sh` or `npm run api:install`
- **API start**: `cd api && ./run.sh` or `npm run api:start`
- **API test**: `cd api && pytest`
- **API single test**: `cd api && pytest test/<file>::<test>`
- **CLI test**: `cd cli && python -m pytest tests/ -v`. **Always run CLI tests after modifying code under `cli/src/`.**
- **Python lint**: `cd api && ruff check` and `cd api && ruff format api.py` (or whichever files changed). **Always run both `ruff check` and `ruff format` on changed Python files before committing.**
- **DB migrations**: `cd api && alembic upgrade head`
- **Dev (no Docker)**: `python scripts/dev.py` — runs both frontend and API side by side with hot reload. Requires the API conda env and Node v22. Checks ports 8338 (API) and 1212 (frontend) on startup and reports conflicts.
  - `dev.py` calls `api/run.sh` which automatically activates the conda env at `~/.transformerlab/envs/transformerlab`, so you do **not** need to activate conda yourself.
  - The conda env and dependencies must already be installed via `cd api && ./install.sh`. If Python dependencies change, the user needs to re-run `./install.sh` manually.

## Environment Prerequisites

- **Node v22** (v23+ is not supported)
- **Python**: Managed via conda (`~/.transformerlab/envs/transformerlab`). Install with `cd api && ./install.sh`.
- **npm deps**: `npm install` (includes `dotenv-cli`, `cross-env`, `concurrently` used by scripts)

## Architecture

- **Frontend**: Electron + React (TypeScript) in `src/`. See [Frontend Deep Dives](docs/frontend.md).
- **Backend**: Python FastAPI in `api/transformerlab/`, entry point: `api/api.py`. See [Backend Deep Dives](docs/backend.md).
- **SDK**: `lab-sdk/` - Python SDK published to PyPI as `transformerlab`. The SDK runs on both the API server and on remote compute nodes (via `tfl-remote-trap`).
- **Database**: SQLite with Alembic migrations in `api/alembic/`
- **CLI**: Typer-based Python CLI in `cli/`. See [CLI Deep Dives](docs/cli.md).

### Updating the SDK

If you modify code in `lab-sdk/`, the changes won't take effect until the SDK is reinstalled. For local development:

```bash
cd lab-sdk && pip install -e .
```

Then restart the API server. This is a common gotcha — the API imports the *installed* `lab` package, not the source tree directly.

## Documentation

Detailed internal documentation lives in `docs/` — read these before working on related subsystems.

**When working on frontend code** (`src/`), read:
- **[Task Execution](docs/task-execution/README.md)** — How tasks are created, queued, dispatched to compute providers, and monitored through their lifecycle (5-part guide). Focus on parts 4-5 for understanding job status display and polling.
- **[Frontend Deep Dives](docs/frontend.md)** — Frontend-specific architecture details.

**When working on backend code** (`api/`, `lab-sdk/`), read:
- **[Task Execution](docs/task-execution/README.md)** — Full 5-part guide, especially parts 1-3 for job creation, dispatch, and provider integration.
- **[Authentication](docs/Auth.md)** — JWT auth, sliding-window refresh, registration/invite model, route protection, team access, and OIDC configuration.
- **[Backend Deep Dives](docs/backend.md)** — Context variables, job execution on local providers, and other backend internals.

**When working on CLI code** (`cli/`), read:
- **[CLI Deep Dives](docs/cli.md)** — CLI-specific architecture details.

Agent skills and browser automation references live in `.agents/skills/`.

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
- **CLI**:
  - **Tests**: `pytest` tests in `cli/tests/`.
  - **Run all**: `cd cli && python -m pytest tests/ -v`
  - **Run one**: `cd cli && python -m pytest tests/commands/test_status.py -v`
  - **Always run CLI tests after modifying any code under `cli/src/`.**
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

**IMPORTANT: For visual UI verification, always use the `agent-browser` CLI skill** (see `.agents/skills/agent-browser/`). Do **NOT** run `npx playwright test` or write Playwright test scripts unless the user explicitly asks you to. Playwright tests are only for the automated E2E test suite in `test/playwright/`.

The `agent-browser` CLI is more efficient for navigating pages, taking snapshots, clicking elements, and filling forms. Only fall back to the **Chrome DevTools MCP** when you specifically need lower-level capabilities such as evaluating JavaScript, inspecting network requests, analyzing console messages, or running performance traces.

When requested, verify the result with the following steps:

1. Run `npm run docker-test:up` to ensure the app is running (or use `python scripts/dev.py` for local dev).
2. Use the `agent-browser` CLI to navigate to the page you just changed. Remember that the app usually serves on port 8338 (API) and port 1212 (frontend dev server).
3. If the app requires login, use the default credentials: **email:** `admin@example.com` / **password:** `admin123`.
4. Explore related pages (e.g., if you changed the Header, also check the Dashboard and Login pages).
5. Take screenshots and verify that no layouts are broken.
6. If you see a visual bug in the screenshot, fix it immediately.

## Using curl to Access the API (Authentication)

The API uses `fastapi-users` with JWT cookies and API keys. Most endpoints require auth **and** an `X-Team-Id` header.

```bash
# Login and get a token
TOKEN=$(curl -s -X POST http://localhost:8338/auth/jwt/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin@example.com&password=admin123" | jq -r .access_token)

# Get your team ID
curl -H "Authorization: Bearer $TOKEN" http://localhost:8338/users/me/teams

# Make authenticated requests
curl -H "Authorization: Bearer $TOKEN" -H "X-Team-Id: <team-id>" http://localhost:8338/server/announcements
```

- **Credentials**: `admin@example.com` / `admin123` (seeded on first startup). Tokens expire after 1 hour.
- **X-Team-Id**: Required on all protected endpoints. Get it from `GET /users/me/teams`.
- **Unprotected endpoints**: `auth`, `api_keys`, `quota`, `compute_provider`, and the OpenAI-compatible API.

## Agentic Performance Optimization

- **Context**: When making changes, look at similar existing files (e.g., "Implement the new `ModelService` following the pattern in `api/transformerlab/services/job_service.py`").
- **Small, Atomic Steps**: Break down complex refactors into:
  1. Define types/schemas.
  2. Implement backend service logic.
  3. Expose via API endpoint.
  4. Update frontend client.
  5. Build UI.
- **Read First**: Read relevant files _before_ planning changes to ensure consistency with existing patterns.
