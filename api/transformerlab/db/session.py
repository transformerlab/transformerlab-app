import os
import shutil
import aiosqlite
import subprocess
import sys
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from transformerlab.db.constants import DATABASE_FILE_NAME, DATABASE_URL, DATABASE_TYPE
from lab.dirs import get_workspace_dir


# --- SQLAlchemy Async Engine ---
# This engine is the core entry point to the database.
# It is created once and can be imported elsewhere.
async_engine = create_async_engine(DATABASE_URL, echo=False)

# --- SQLAlchemy Async Session Factory ---
# This is a factory that creates new AsyncSession objects.
# You will import this into other files to get a session.
async_session = sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def run_alembic_migrations():
    """
    Run Alembic migrations to create/update database schema.
    This replaces the previous create_all() approach.
    """
    try:
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
            print(f"⚠️  Alembic migration warning: {result.stderr}")
            # Don't fail completely - the database might already be up to date
            # or there might be a minor issue
            if "Target database is not up to date" not in result.stderr:
                print(f"Migration output: {result.stdout}")
        else:
            print("✅ Database migrations applied")
    except Exception as e:
        print(f"⚠️  Error running Alembic migrations: {e}")
        print("Continuing with startup - database may need manual migration")
        # Don't raise - allow the app to continue
        # The database might already be in the correct state


async def init():
    """
    Create the database, tables, and workspace folder if they don't exist.
    """
    global db

    if DATABASE_TYPE == "sqlite":
        # SQLite-specific initialization
        # Migrate database from old location if necessary
        old_db_base = os.path.join(await get_workspace_dir(), "llmlab.sqlite3")
        if os.path.exists(old_db_base):
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

    # await init_sql_model()

    return


async def close():
    if DATABASE_TYPE == "sqlite" and db is not None:
        await db.close()
    await async_engine.dispose()
    print("✅ Database closed")
    return
