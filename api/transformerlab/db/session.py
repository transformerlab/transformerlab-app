import os
import shutil
import aiosqlite
import subprocess
import sys
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from transformerlab.db.constants import DATABASE_FILE_NAME, DATABASE_URL, DATABASE_TYPE
from lab.dirs import get_workspace_dir


# --- SQLAlchemy Async Engine ---
# This engine is the core entry point to the database.
# It is created once and can be imported elsewhere.
# Use NullPool for SQLite (pooling provides no benefit since SQLite serializes writes).
# Use higher pool limits for Postgres to handle concurrent connections.
# Auto-detect pytest and force NullPool there: pytest-asyncio creates a fresh event
# loop per module, and pooled asyncpg connections bound to a previous loop become
# invalid (raising "Future attached to a different loop" or "another operation is
# in progress"). NullPool sidesteps this by opening a new connection per checkout.
# Production (single long-lived uvicorn loop) keeps the sized pool for connection reuse.
_pg_pool_size = int(os.getenv("TFL_DB_POOL_SIZE", "20"))
_pg_max_overflow = int(os.getenv("TFL_DB_MAX_OVERFLOW", "40"))
_pg_pool_timeout = int(os.getenv("TFL_DB_POOL_TIMEOUT", "60"))
_under_pytest = "pytest" in sys.modules

if DATABASE_URL.startswith("sqlite") or _under_pytest:
    async_engine = create_async_engine(DATABASE_URL, echo=False, poolclass=NullPool)
else:
    async_engine = create_async_engine(
        DATABASE_URL,
        echo=False,
        pool_size=_pg_pool_size,
        max_overflow=_pg_max_overflow,
        pool_timeout=_pg_pool_timeout,
    )

# --- SQLAlchemy Async Session Factory ---
# This is a factory that creates new AsyncSession objects.
# You will import this into other files to get a session.
async_session = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """Canonical FastAPI session dependency. Yields an AsyncSession."""
    async with async_session() as session:
        yield session


async def run_alembic_migrations():
    """
    Run Alembic migrations to create/update database schema.
    This replaces the previous create_all() approach.

    Raises RuntimeError on migration failure. Callers should let this propagate:
    starting the app against a half-migrated database produces confusing downstream
    errors (e.g. cascading "relation does not exist") that are much harder to debug
    than a clear migration failure at startup.
    """
    # Get the directory containing this file (transformerlab/db)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    # Go up to api directory where alembic.ini is located
    api_dir = os.path.dirname(os.path.dirname(current_dir))

    # Run alembic upgrade head
    # Pass environment variables to ensure DATABASE_URL is available in subprocess
    env = os.environ.copy()
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=api_dir,
        capture_output=True,
        text=True,
        check=False,
        env=env,
    )

    if result.returncode != 0:
        print(f"❌ Alembic migration failed (returncode={result.returncode})")
        if result.stdout:
            print(f"stdout:\n{result.stdout}")
        if result.stderr:
            print(f"stderr:\n{result.stderr}")
        raise RuntimeError(f"Alembic migration failed with returncode {result.returncode}. See stderr above.")

    print("✅ Database migrations applied")


async def init():
    """
    Initialize the process-local DB connection and apply runtime PRAGMAs.
    """
    global db

    if DATABASE_TYPE == "sqlite":
        # SQLite-specific initialization
        try:
            # Migrate database from old location if necessary
            old_db_base = os.path.join(await get_workspace_dir(), "llmlab.sqlite3")
        except RuntimeError:
            # Assume we are in one of the cloud modes and migration is not needed
            old_db_base = None
        if old_db_base and os.path.exists(old_db_base):
            if not os.path.exists(DATABASE_FILE_NAME):
                for ext in ["", "-wal", "-shm"]:
                    old_path = old_db_base + ext
                    new_path = DATABASE_FILE_NAME + ext
                    if os.path.exists(old_path):
                        shutil.copy2(old_path, new_path)
                        os.remove(old_path)
                print("Migrated database from workspace to parent directory")
            else:
                for ext in ["", "-wal", "-shm"]:
                    old_path = old_db_base + ext
                    if os.path.exists(old_path):
                        os.remove(old_path)
                print("Old database files removed (new database already exists)")
        os.makedirs(os.path.dirname(DATABASE_FILE_NAME), exist_ok=True)
        db = await aiosqlite.connect(DATABASE_FILE_NAME)
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=normal")
        await db.execute("PRAGMA busy_timeout = 30000")
    else:
        # PostgreSQL doesn't need aiosqlite connection or PRAGMA statements
        db = None
        print("Using PostgreSQL database")

    # Run Alembic migrations to create/update tables
    # This replaces the previous create_all() call
    await run_alembic_migrations()

    if DATABASE_TYPE == "sqlite":
        # SQLite-specific: Check if workflow_runs table exists before checking/modifying columns
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_runs'")
        table_exists = await cursor.fetchone()
        await cursor.close()

        if table_exists:
            # Check if experiment_id column exists in workflow_runs table
            cursor = await db.execute("PRAGMA table_info(workflow_runs)")
            columns = await cursor.fetchall()
            await cursor.close()
            has_experiment_id = any(column[1] == "experiment_id" for column in columns)

            if not has_experiment_id:
                # Add experiment_id column
                await db.execute("ALTER TABLE workflow_runs ADD COLUMN experiment_id INTEGER")

                # Update existing workflow runs with experiment_id from their workflows
                await db.execute("""
                    UPDATE workflow_runs
                    SET experiment_id = (
                        SELECT experiment_id
                        FROM workflows
                        WHERE workflows.id = workflow_runs.workflow_id
                    )
                """)
                await db.commit()

    print("✅ Database initialized")

    return


async def close():
    if DATABASE_TYPE == "sqlite" and db is not None:
        await db.close()
    await async_engine.dispose()
    print("✅ Database closed")
    return
