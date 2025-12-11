# AGENTS.md

## Build/Lint/Test Commands
- **Frontend dev**: `npm start:cloud` (Node v22, not v23+)
- **Frontend lint**: `npm run lint`
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

## Code Style
- **TypeScript**: ESLint with erb config, Prettier (single quotes), functional components
- **Python**: Ruff (Black-compatible), 120 char line length, 4-space indent
- **Imports**: Use existing patterns in neighboring files; check package.json/pyproject.toml before adding deps
