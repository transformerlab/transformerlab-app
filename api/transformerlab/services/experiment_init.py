from lab import Experiment, Job
from lab.dirs import get_jobs_dir
from lab import storage


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
