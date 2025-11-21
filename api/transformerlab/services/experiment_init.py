from lab import Experiment, Job
from lab.dirs import get_jobs_dir
from lab import storage
import asyncio

from sqlalchemy import select
from transformerlab.shared.models.user_model import User, AsyncSessionLocal, create_personal_team
from transformerlab.models.users import get_user_manager


async def seed_default_admin_user():
    """Create a default admin user with credentials admin/admin123 if one doesn't exist."""
    try:
        
        async with AsyncSessionLocal() as session:
            # Check if admin user already exists
            stmt = select(User).where(User.email == "admin@localhost")
            result = await session.execute(stmt)
            existing_admin = result.scalar_one_or_none()
            
            if existing_admin:
                print("✅ Default admin user already exists")
                return
            
            # Create admin user
            user_manager = get_user_manager(session)
            admin_user = await user_manager.create(
                {
                    "email": "admin@localhost",
                    "password": "admin123",
                    "is_active": True,
                    "is_verified": True,
                    "is_superuser": True,
                }
            )
            
            # Create personal team for admin
            await create_personal_team(session, admin_user)
            
            print("✅ Created default admin user: admin@localhost / admin123")
            
    except Exception as e:
        print(f"⚠️  Error seeding default admin user: {e}")
        pass


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
