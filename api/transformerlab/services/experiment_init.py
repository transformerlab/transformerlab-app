from lab import Experiment, Job
from lab.dirs import get_jobs_dir
from lab import storage
from lab import HOME_DIR
from lab import dirs as lab_dirs

from sqlalchemy import select
from transformerlab.shared.models.user_model import AsyncSessionLocal, create_personal_team
from transformerlab.shared.models.models import User, UserTeam, TeamRole
from transformerlab.models.users import UserManager, UserCreate
from fastapi_users.db import SQLAlchemyUserDatabase
import os
import shutil
import json


async def seed_default_admin_user():
    """Create a default admin user with credentials admin@example.com / admin123 if one doesn't exist."""
    try:
        async with AsyncSessionLocal() as session:
            # Check if admin user already exists
            stmt = select(User).where(User.email == "admin@example.com")
            result = await session.execute(stmt)
            existing_admin = result.unique().scalar_one_or_none()

            if existing_admin:
                # Ensure admin is verified
                if not existing_admin.is_verified:
                    existing_admin.is_verified = True
                    session.add(existing_admin)
                    await session.commit()
                    print("✅ Verified existing admin user")

                # Admin already exists, but we should still ensure they have a team and migrate workspace
                admin_user_id = existing_admin.id
                admin_user = existing_admin

                # Check if admin user has a team
                stmt = select(UserTeam).where(UserTeam.user_id == str(admin_user_id)).limit(1)
                result = await session.execute(stmt)
                user_team = result.scalar_one_or_none()

                if not user_team:
                    # Create personal team for existing admin user
                    personal_team = await create_personal_team(session, admin_user)
                    user_team = UserTeam(
                        user_id=str(admin_user_id), team_id=personal_team.id, role=TeamRole.OWNER.value
                    )
                    session.add(user_team)
                    await session.commit()
                    await session.refresh(personal_team)
                    team_id = personal_team.id
                    print(f"✅ Created personal team '{personal_team.name}' (id={team_id}) for existing admin user")
                else:
                    # Get the team ID from existing user_team
                    team_id = user_team.team_id

                # Migrate workspace from ~/.transformerlab/workspace to ~/.transformerlab/orgs/<team-id>/workspace
                await migrate_workspace_to_org(team_id)

                return

            user_db = SQLAlchemyUserDatabase(session, User)
            user_manager = UserManager(user_db)

            # Create admin user using UserCreate schema
            user_create = UserCreate(
                email="admin@example.com",
                password="admin123",
                is_active=True,
                is_superuser=True,
                is_verified=True,  # Ensure admin is verified
            )

            # Create user with safe=False to skip verification email
            admin_user = await user_manager.create(user_create, safe=False, request=None)

            # Get the user ID before the object becomes detached
            admin_user_id = admin_user.id

            # Re-fetch the user from the database to get a fresh, attached instance
            stmt = select(User).where(User.id == admin_user_id)
            result = await session.execute(stmt)
            admin_user = result.unique().scalar_one()

            # Mark as verified so login works immediately
            admin_user.is_verified = True
            session.add(admin_user)
            await session.commit()

            # Create personal team for admin user if it doesn't exist
            stmt = select(UserTeam).where(UserTeam.user_id == str(admin_user_id))
            result = await session.execute(stmt)
            user_team = result.scalar_one_or_none()

            if not user_team:
                # Create personal team for admin user
                personal_team = await create_personal_team(session, admin_user)
                user_team = UserTeam(user_id=str(admin_user_id), team_id=personal_team.id, role=TeamRole.OWNER.value)
                session.add(user_team)
                await session.commit()
                await session.refresh(personal_team)
                team_id = personal_team.id
                print(f"✅ Created personal team '{personal_team.name}' (id={team_id}) for admin user")
            else:
                # Get the team ID from existing user_team
                team_id = user_team.team_id
                print(f"✅ Admin user already has team association (team_id={team_id})")

            # Migrate workspace from ~/.transformerlab/workspace to ~/.transformerlab/orgs/<team-id>/workspace
            await migrate_workspace_to_org(team_id)

            print(
                f"✅ Created and verified admin user admin@example.com (id={admin_user_id}, is_verified={admin_user.is_verified})"
            )
    except Exception as e:
        print(f"⚠️  Error in seed_default_admin_user: {e}")
        import traceback

        traceback.print_exc()
        return


async def migrate_workspace_to_org(team_id: str):
    """
    Migrate existing workspace from ~/.transformerlab/workspace to
    ~/.transformerlab/orgs/<team-id>/workspace.

    This function:
    1. Creates the new workspace directory at ~/.transformerlab/orgs/<team-id>/workspace
    2. Moves any existing content from ~/.transformerlab/workspace to the new location
    3. Only performs the migration if the old workspace exists and has content
    """
    try:
        # Get the home directory
        home_dir = HOME_DIR
        if not home_dir:
            home_dir = os.path.join(os.path.expanduser("~"), ".transformerlab")

        old_workspace = os.path.join(home_dir, "workspace")
        new_workspace = os.path.join(home_dir, "orgs", team_id, "workspace")

        # Check if old workspace exists and has content
        if not os.path.exists(old_workspace):
            print(f"ℹ️  Old workspace directory does not exist: {old_workspace}")
            # Still create the new workspace directory structure
            os.makedirs(new_workspace, exist_ok=True)
            return

        # Check if old workspace has any content
        try:
            contents = os.listdir(old_workspace)
            if not contents:
                print(f"ℹ️  Old workspace directory is empty: {old_workspace}")
                # Still create the new workspace directory structure
                os.makedirs(new_workspace, exist_ok=True)
                return
        except OSError:
            print(f"⚠️  Could not list contents of old workspace: {old_workspace}")
            return

        # Check if old workspace has a migration.txt file
        if os.path.exists(os.path.join(old_workspace, "migration.txt")):
            print(f"ℹ️  Old workspace has already been migrated: {old_workspace}")
            return

        # Check if new workspace already exists and has content
        if os.path.exists(new_workspace):
            try:
                new_contents = os.listdir(new_workspace)
                if new_contents:
                    print(f"ℹ️  New workspace already exists with content: {new_workspace}")
                    print("   Skipping migration to avoid overwriting existing data")
                    return
            except OSError:
                pass

        # Create the new workspace directory structure
        os.makedirs(new_workspace, exist_ok=True)

        # Move all contents from old workspace to new workspace
        print(f"🔄 Migrating workspace from {old_workspace} to {new_workspace}")
        for item in contents:
            old_path = os.path.join(old_workspace, item)
            new_path = os.path.join(new_workspace, item)

            try:
                if os.path.isdir(old_path):
                    # For directories, use shutil.move which handles the entire tree
                    if os.path.exists(new_path):
                        # If destination exists, merge contents
                        print(f"   Merging directory: {item}")
                        for root, dirs, files in os.walk(old_path):
                            rel_root = os.path.relpath(root, old_path)
                            dest_root = os.path.join(new_path, rel_root) if rel_root != "." else new_path
                            os.makedirs(dest_root, exist_ok=True)
                            for file in files:
                                src_file = os.path.join(root, file)
                                dest_file = os.path.join(dest_root, file)
                                if not os.path.exists(dest_file):
                                    shutil.move(src_file, dest_file)
                        # Remove empty source directory
                        try:
                            os.rmdir(old_path)
                        except OSError:
                            pass  # Directory not empty, leave it
                    else:
                        shutil.move(old_path, new_path)
                else:
                    # For files, just move them
                    if not os.path.exists(new_path):
                        shutil.move(old_path, new_path)
                    else:
                        print(f"   Skipping existing file: {item}")
            except Exception as e:
                print(f"⚠️  Error moving {item}: {e}")
                continue

        # Try to remove the old workspace directory if it's now empty
        try:
            remaining = os.listdir(old_workspace)
            if not remaining:
                os.rmdir(old_workspace)
                print(f"✅ Removed empty old workspace directory: {old_workspace}")
        except OSError:
            # Directory not empty or other error, leave it
            pass

        # Recreate workspace directory (default sdk behaviour is to create this directory again when auth isnt done -- which will happen at startup)
        if not storage.exists(old_workspace):
            storage.makedirs(old_workspace, exist_ok=True)

        # Add a text file in the old workspace saying where the migration happened
        with open(os.path.join(old_workspace, "migration.txt"), "w") as f:
            f.write(f"Migration happened from {old_workspace} to {new_workspace}")

        print(f"✅ Successfully migrated workspace to: {new_workspace}")

        # Update image paths in diffusion history.json files after migration
        update_diffusion_history_paths(old_workspace, new_workspace)

    except Exception as e:
        print(f"⚠️  Error migrating workspace: {e}")
        import traceback

        traceback.print_exc()


def update_diffusion_history_paths(old_workspace: str, new_workspace: str):
    """
    Update image paths in all diffusion history.json files after workspace migration.

    This function:
    1. Finds all history.json files in the new workspace (experiment-specific and legacy)
    2. Updates all path fields (image_path, input_image_path, mask_image_path, processed_image)
       to replace the old workspace path with the new one
    """
    try:
        # Path fields that may contain workspace paths
        path_fields = ["image_path", "input_image_path", "mask_image_path", "processed_image"]

        # Find all history.json files in the new workspace
        history_files = []

        # Check for legacy global history.json
        legacy_history = os.path.join(new_workspace, "diffusion", "history.json")
        if os.path.exists(legacy_history):
            history_files.append(legacy_history)

        # Check for experiment-specific history.json files
        experiments_dir = os.path.join(new_workspace, "experiments")
        if os.path.exists(experiments_dir):
            for exp_name in os.listdir(experiments_dir):
                exp_path = os.path.join(experiments_dir, exp_name)
                if os.path.isdir(exp_path):
                    exp_history = os.path.join(exp_path, "diffusion", "history.json")
                    if os.path.exists(exp_history):
                        history_files.append(exp_history)

        # Update each history.json file
        updated_count = 0
        for history_file in history_files:
            try:
                with open(history_file, "r") as f:
                    history_data = json.load(f)

                # Check if this is a list of items
                if not isinstance(history_data, list):
                    continue

                updated = False
                for item in history_data:
                    if not isinstance(item, dict):
                        continue

                    # Update each path field
                    for field in path_fields:
                        if field in item and item[field]:
                            old_path = item[field]
                            # Only update if the path starts with the old workspace
                            # Use os.path.normpath to handle path separators correctly
                            normalized_old_path = os.path.normpath(old_path)
                            normalized_old_workspace = os.path.normpath(old_workspace)
                            normalized_new_workspace = os.path.normpath(new_workspace)

                            # Check if path starts with old workspace (with path separator)
                            if (
                                normalized_old_path.startswith(normalized_old_workspace + os.sep)
                                or normalized_old_path == normalized_old_workspace
                            ):
                                # Replace old workspace path with new one
                                new_path = (
                                    normalized_new_workspace + normalized_old_path[len(normalized_old_workspace) :]
                                )
                                item[field] = new_path
                                updated = True

                # Write back if any updates were made
                if updated:
                    with open(history_file, "w") as f:
                        json.dump(history_data, f, indent=2)
                    updated_count += 1
                    print(f"   Updated paths in: {history_file}")

            except (json.JSONDecodeError, IOError) as e:
                print(f"⚠️  Error updating history file {history_file}: {e}")
                continue

        if updated_count > 0:
            print(f"✅ Updated image paths in {updated_count} history.json file(s)")
        else:
            print("ℹ️  No history.json files found or no paths needed updating")

    except Exception as e:
        print(f"⚠️  Error updating diffusion history paths: {e}")
        import traceback

        traceback.print_exc()


async def seed_default_experiments():
    """Create a few default experiments if they do not exist (filesystem-backed)."""
    # Only seed default experiments if there are no experiments at all
    try:
        existing_experiments = await Experiment.get_all()
        if len(existing_experiments) > 0:
            return
    except Exception as e:
        print(f"Error getting existing experiments: {e}, will seed default experiments")
        pass

    for name in ["alpha", "beta", "gamma"]:
        try:
            exp = await Experiment.create_or_get(name, create_new=True)
            # Sanity check to make sure nothing went wrong or no Exception was silently passed
            if exp.id != name:
                raise Exception(f"Error creating experiment {name}: {exp.id} != {name}")
        except Exception as e:
            # Best-effort seeding; ignore errors (e.g., partial setups)
            print(f"Error creating experiment {name}: {e}")
            pass


async def cancel_in_progress_jobs():
    """On startup, mark any RUNNING jobs as CANCELLED in the filesystem job store across all organizations."""
    # Get HOME_DIR
    try:
        home_dir = HOME_DIR
    except AttributeError:
        home_dir = os.environ.get("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))

    # Check all org directories
    orgs_dir = storage.join(home_dir, "orgs")
    if await storage.exists(orgs_dir) and await storage.isdir(orgs_dir):
        try:
            org_entries = await storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if await storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]

                    # Set org context to check jobs for this org
                    lab_dirs.set_organization_id(org_id)

                    try:
                        jobs_dir = await get_jobs_dir()
                        if await storage.exists(jobs_dir):
                            entries = await storage.ls(jobs_dir, detail=False)
                            for entry_path in entries:
                                if await storage.isdir(entry_path):
                                    try:
                                        # Extract the job ID from the path
                                        job_id = entry_path.rstrip("/").split("/")[-1]
                                        job = await Job.get(job_id)
                                        if await job.get_status() == "RUNNING":
                                            await job.update_status("CANCELLED")
                                            print(f"Cancelled running job: {job_id} (org: {org_id})")
                                    except Exception:
                                        # If we can't access the job, continue to the next one
                                        pass
                    except Exception:
                        continue
        except Exception:
            pass

    # Clear org context
    lab_dirs.set_organization_id(None)
