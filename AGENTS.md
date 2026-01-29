# AGENTS.md

## Build/Lint/Test Commands

- **Frontend dev**: `npm run dev` or `npm start` (Vite dev server, Node v22+)
- **Frontend build**: `npm run build` (Vite production build to `release/cloud/`)
- **Frontend preview**: `npm run preview` (preview production build)
- **Frontend test**: `npm test` (Jest); single test: `npm test -- --testPathPattern="<pattern>"`
- **Frontend format**: `npm run format` (Prettier, single quotes)
- **API install**: `cd api && ./install.sh` or `npm run api:install`
- **API start**: `cd api && ./run.sh` or `npm run api:start`
- **API test**: `cd api && pytest`; single test: `pytest test/<file>::<test>`
- **Python lint**: `ruff check api/` (line-length=120, indent=4)
- **DB migrations**: `cd api && alembic upgrade head`

## Architecture

- **Frontend**: Electron + React (TypeScript) in `src/` (renderer + main process)
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

## Testing

- **Frontend**:
  - **Unit Tests**: Write tests for all utility functions and complex hooks.
  - **Component Tests**: Test components in isolation where possible.
  - **Command**: Use `npm test` to verify changes.
- **Backend**:
  - **Unit Tests**: Write `pytest` tests in `api/test/`.
  - **Mocking**: Mock external interactions (S3, GPU providers, filesystem operations) using `unittest.mock` or `pytest-mock`. Tests should be fast and deterministic.
  - **Service Tests**: Prefer testing the Service layer directly over testing the full API stack when checking business logic constants.

## Agentic Performance Optimization

- **Context**: When making changes, look at similar existing files (e.g., "Implement the new `ModelService` following the pattern in `api/transformerlab/services/job_service.py`").
- **Small, Atomic Steps**: Break down complex refactors into:
  1. Define types/schemas.
  2. Implement backend service logic.
  3. Expose via API endpoint.
  4. Update frontend client.
  5. Build UI.
- **Read First**: Read relevant files _before_ planning changes to ensure consistency with existing patterns.
