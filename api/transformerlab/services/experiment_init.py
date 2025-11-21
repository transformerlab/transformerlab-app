from lab import Experiment, Job
from lab.dirs import get_jobs_dir
from lab import storage

from sqlalchemy import select
from transformerlab.shared.models.user_model import User, AsyncSessionLocal
from transformerlab.models.users import UserManager, UserCreate
from fastapi_users.db import SQLAlchemyUserDatabase


async def seed_default_admin_user():
    """Create a default admin user with credentials admin@example.com / admin123 if one doesn't exist."""
    try:
        async with AsyncSessionLocal() as session:
            # Check if admin user already exists
            stmt = select(User).where(User.email == "admin@example.com")
            result = await session.execute(stmt)
            existing_admin = result.scalar_one_or_none()
            
            if existing_admin:
                # If admin exists but is not verified, verify them
                if not existing_admin.is_verified:
                    existing_admin.is_verified = True
                    session.add(existing_admin)
                    await session.commit()
                    print("✅ Verified existing admin user")
                return
            
            user_db = SQLAlchemyUserDatabase(session, User)
            user_manager = UserManager(user_db)
            
            # Create admin user using UserCreate schema
            user_create = UserCreate(
                email="admin@example.com",
                password="admin123",
                is_active=True,
                is_superuser=True,
            )
            try:
                # Create user with safe=False to skip verification email
                admin_user = await user_manager.create(user_create, safe=False, request=None)
                
                # Refresh the user object to ensure we have the latest state
                await session.refresh(admin_user)
                
                # Mark as verified so login works immediately
                admin_user.is_verified = True
                session.add(admin_user)
                await session.commit()
                
                # Refresh again after commit to ensure state is updated
                await session.refresh(admin_user)
                print(f"✅ Created and verified admin user admin@example.com (is_verified={admin_user.is_verified})")
            except Exception as e:
                print(f"⚠️  Failed to create admin user: {e}")
                import traceback
                traceback.print_exc()
                return
    except Exception as e:
        print(f"⚠️  Error in seed_default_admin_user: {e}")
        return


def seed_default_experiments():
    """Create a few default experiments if they do not exist (filesystem-backed)."""
    # Only seed default experiments if there are no experiments at all
    try:
        existing_experiments = Experiment.get_all()
        if len(existing_experiments) > 0:
            return
    except Exception as e:
        print(f"Error getting existing experiments: {e}, will seed default experiments")
        pass

    for name in ["alpha", "beta", "gamma"]:
        try:
            exp = Experiment(name, create_new=True)
            # Sanity check to make sure nothing went wrong or no Exception was silently passed
            if exp.id != name:
                raise Exception(f"Error creating experiment {name}: {exp.id} != {name}")
        except Exception as e:
            # Best-effort seeding; ignore errors (e.g., partial setups)
            print(f"Error creating experiment {name}: {e}")
            pass


def cancel_in_progress_jobs():
    """On startup, mark any RUNNING jobs as CANCELLED in the filesystem job store."""
    jobs_dir = get_jobs_dir()
    if not storage.exists(jobs_dir):
        return

    try:
        entries = storage.ls(jobs_dir, detail=False)
        for entry_path in entries:
            if storage.isdir(entry_path):
                try:
                    # Extract the job ID from the path
                    job_id = entry_path.rstrip("/").split("/")[-1]
                    job = Job.get(job_id)
                    if job.get_status() == "RUNNING":
                        job.update_status("CANCELLED")
                        print(f"Cancelled running job: {job_id}")
                except Exception:
                    # If we can't access the job, continue to the next one
                    pass
    except Exception:
        pass
