#!/usr/bin/env python
"""
Pre-server startup tasks for Transformer Lab.

This script runs ONE TIME before the uvicorn server starts.
It handles operations that must happen exactly once, regardless of how many
worker processes will be forked:

  1. Initialize directories
  2. Run Alembic database migrations
  3. Migrate legacy database file location (if needed)
  4. Seed default admin user and experiments
  5. Update gallery cache from remote

By running these tasks OUTSIDE the server process, we eliminate the need for
leader election or inter-process coordination for startup operations.
This is the simplest, most robust approach: no locks, no race conditions,
no special "leader" process — just a sequential script that finishes before
any worker process exists.

Usage:
    python startup_tasks.py          # Run all startup tasks
    python startup_tasks.py --skip-galleries   # Skip gallery cache update (for offline/testing)
"""

import argparse
import asyncio
import os
import shutil
import sys

# Ensure the api/ directory is on sys.path so imports resolve correctly.
# This matters when run.sh invokes us from the api/ working directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

load_dotenv()


async def _initialize_dirs():
    """Create required directories (webapp, etc.)."""
    from transformerlab.shared import dirs as shared_dirs

    await shared_dirs.initialize_dirs()
    print("✅ Directories initialized")


def _migrate_legacy_database():
    """
    Move the database file from the old location (~/.transformerlab/workspace/llmlab.sqlite3)
    to the new location (~/.transformerlab/llmlab.sqlite3) if needed.

    This is extracted from db.session.init() so it runs once before any process
    tries to open the database.
    """
    from transformerlab.db.constants import DATABASE_FILE_NAME
    from lab.dirs import get_workspace_dir

    # get_workspace_dir is async, but we only need the sync fallback path for the legacy check
    from lab import HOME_DIR

    old_db_base = os.path.join(HOME_DIR, "workspace", "llmlab.sqlite3")

    if old_db_base and os.path.exists(old_db_base):
        if not os.path.exists(DATABASE_FILE_NAME):
            for ext in ["", "-wal", "-shm"]:
                old_path = old_db_base + ext
                new_path = DATABASE_FILE_NAME + ext
                if os.path.exists(old_path):
                    shutil.copy2(old_path, new_path)
                    os.remove(old_path)
            print("✅ Migrated database from workspace to parent directory")
        else:
            for ext in ["", "-wal", "-shm"]:
                old_path = old_db_base + ext
                if os.path.exists(old_path):
                    os.remove(old_path)
            print("✅ Old database files removed (new database already exists)")

    # Ensure the database directory exists
    os.makedirs(os.path.dirname(DATABASE_FILE_NAME), exist_ok=True)


def _run_alembic_migrations():
    """
    Run Alembic migrations to create/update the database schema.

    This runs as a subprocess (same as the original code) so it works with
    both SQLite and Postgres.  Running it here, before any worker starts,
    means every worker will connect to an already-migrated database.
    """
    import subprocess

    api_dir = os.path.dirname(os.path.abspath(__file__))
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
        if "Target database is not up to date" not in result.stderr:
            print(f"Migration output: {result.stdout}")
    else:
        print("✅ Database migrations applied")


async def _configure_database_pragmas():
    """
    Set SQLite pragmas (WAL mode, etc.) on the database.
    This only applies to SQLite databases.

    Also performs the legacy workflow_runs schema migration that was
    previously inside db.init().
    """
    import aiosqlite

    from transformerlab.db.constants import DATABASE_FILE_NAME, DATABASE_URL

    if not DATABASE_URL.startswith("sqlite"):
        print("✅ Non-SQLite database — skipping pragma configuration")
        return

    db = await aiosqlite.connect(DATABASE_FILE_NAME)
    try:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=normal")
        await db.execute("PRAGMA busy_timeout = 30000")

        # Legacy migration: ensure workflow_runs has experiment_id column
        cursor = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='workflow_runs'")
        table_exists = await cursor.fetchone()
        await cursor.close()

        if table_exists:
            cursor = await db.execute("PRAGMA table_info(workflow_runs)")
            columns = await cursor.fetchall()
            await cursor.close()
            has_experiment_id = any(column[1] == "experiment_id" for column in columns)

            if not has_experiment_id:
                await db.execute("ALTER TABLE workflow_runs ADD COLUMN experiment_id INTEGER")
                await db.execute("""
                    UPDATE workflow_runs
                    SET experiment_id = (
                        SELECT experiment_id
                        FROM workflows
                        WHERE workflows.id = workflow_runs.workflow_id
                    )
                """)
                await db.commit()
                print("✅ Added experiment_id column to workflow_runs")

        print("✅ Database pragmas configured")
    finally:
        await db.close()


async def _validate_cloud_credentials():
    """Validate cloud credentials early — fail fast if missing."""
    from transformerlab.shared.remote_workspace import validate_cloud_credentials

    validate_cloud_credentials()


async def _seed_data():
    """Seed default admin user and default experiments."""
    from transformerlab.services.experiment_init import (
        seed_default_admin_user,
        seed_default_experiments,
    )

    await seed_default_admin_user()
    await seed_default_experiments()
    print("✅ Seed data applied")


async def _update_galleries():
    """Download and cache gallery files from remote."""
    from transformerlab.shared import galleries

    await galleries.update_gallery_cache()
    print("✅ Gallery cache updated")


async def run_startup_tasks(skip_galleries: bool = False):
    """
    Execute all pre-server startup tasks in order.

    The order matters:
      1. Dirs — must exist before anything writes to them
      2. Cloud credentials — fail fast before touching DB
      3. Legacy DB migration — move file before alembic touches it
      4. Alembic migrations — schema must be current before seeding
      5. SQLite pragmas — set WAL mode, etc.
      6. Seed data — admin user + default experiments
      7. Gallery cache — pull remote gallery files
    """
    print("=" * 60)
    print("🚀 Running pre-server startup tasks")
    print("=" * 60)

    await _initialize_dirs()
    await _validate_cloud_credentials()

    _migrate_legacy_database()
    _run_alembic_migrations()
    await _configure_database_pragmas()

    await _seed_data()

    if not skip_galleries:
        await _update_galleries()
    else:
        print("⏭️  Skipping gallery cache update (--skip-galleries)")

    print("=" * 60)
    print("✅ All startup tasks complete — ready to start server")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Run Transformer Lab pre-server startup tasks.")
    parser.add_argument(
        "--skip-galleries",
        action="store_true",
        help="Skip updating gallery cache files from remote (useful for offline or testing)",
    )
    args = parser.parse_args()

    asyncio.run(run_startup_tasks(skip_galleries=args.skip_galleries))


if __name__ == "__main__":
    main()
