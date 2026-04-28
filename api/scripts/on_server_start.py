"""
Run one-time API startup tasks before worker processes start.
"""

import asyncio
import os

from transformerlab.db.session import async_session
from transformerlab.db.session import run_alembic_migrations
from transformerlab.services.experiment_init import seed_default_admin_user, seed_default_experiments
from transformerlab.shared.remote_workspace import create_buckets_for_all_teams, get_default_aws_profile
from transformerlab.shared import dirs, galleries


async def main() -> None:
    # api.py normally sets this internal env var at process startup.
    # prestart_once runs standalone (e.g. in Docker build), so set it here too.
    os.environ["_TFL_SOURCE_CODE_DIR"] = dirs.TFL_SOURCE_CODE_DIR

    # Ensure expected directory structure exists before other startup steps.
    await dirs.initialize_dirs()

    print("✅ Running one-time startup tasks")
    await run_alembic_migrations()
    await seed_default_admin_user()
    await galleries.update_gallery_cache()

    # Buckets/containers/local workspace dirs must exist before seed_default_experiments(),
    # which writes experiment metadata to remote storage (e.g. Azure block upload).
    tfl_remote_storage_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    if tfl_remote_storage_enabled or (os.getenv("TFL_STORAGE_PROVIDER") == "localfs" and os.getenv("TFL_STORAGE_URI")):
        print("✅ CHECKING STORAGE FOR EXISTING TEAMS")
        try:
            async with async_session() as session:
                success_count, failure_count, error_messages = await create_buckets_for_all_teams(
                    session, profile_name=get_default_aws_profile()
                )
                if success_count > 0:
                    print(f"✅ Created/verified storage for {success_count} team(s)")
                if failure_count > 0:
                    print(f"⚠️  Failed to create storage for {failure_count} team(s)")
                    for error in error_messages:
                        print(f"   - {error}")
        except Exception as e:
            print(f"⚠️  Error creating storage for existing teams: {e}")

    await seed_default_experiments()

    print("✅ One-time startup tasks complete")


if __name__ == "__main__":
    asyncio.run(main())
