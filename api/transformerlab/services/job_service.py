import asyncio
import datetime
import json
from typing import List, Dict, Optional

from lab import Experiment, Job
from lab import dirs as lab_dirs
from lab import storage

# Allowed job types:
ALLOWED_JOB_TYPES = [
    "TRAIN",
    "DOWNLOAD_MODEL",
    "LOAD_MODEL",
    "TASK",
    "EVAL",
    "EXPORT",
    "UNDEFINED",
    "GENERATE",
    "INSTALL_RECIPE_DEPS",
    "DIFFUSION",
    "REMOTE",
    "SWEEP",
]


async def job_create(type, status, experiment_id, job_data="{}"):
    # check if type is allowed
    if type not in ALLOWED_JOB_TYPES:
        raise ValueError(f"Job type {type} is not allowed")

    # Ensure job_data is a dict. If it's a string convert it.
    if isinstance(job_data, str):
        try:
            job_data = json.loads(job_data)
        except Exception:
            job_data = {}

    # Create experiment if it doesn't exist
    exp = Experiment(experiment_id)

    # Create job through experiment
    job = await exp.create_job()
    await job.set_experiment(experiment_id)  # Set the experiment_id on the job
    await job.set_type(type)
    await job.update_status(status)
    await job.set_job_data(job_data)

    return job.id


async def jobs_get_all(experiment_id, type="", status=""):
    exp_obj = Experiment(experiment_id)
    return await exp_obj.get_jobs(type, status)


async def jobs_get_all_by_experiment_and_type(experiment_id, job_type):
    return await jobs_get_all(experiment_id, job_type)


async def jobs_get_by_experiment(experiment_id):
    """Get all jobs for a specific experiment"""
    return await jobs_get_all(experiment_id)


async def job_get(job_id):
    try:
        job = await Job.get(job_id)
        return await job.get_json_data(uncached=True)
    except Exception as e:
        print("Error getting job data", e)
        return None


async def job_count_running():
    return await Job.count_running_jobs()


async def _find_org_id_for_job(job_id: str) -> Optional[str]:
    """
    Find which organization a job belongs to by searching all org directories.
    Returns the org_id if found, None otherwise.
    """
    # Check if context is set correctly already
    from lab.dirs import get_workspace_dir

    workspace_dir = await get_workspace_dir()
    if "/orgs/" in workspace_dir:
        return workspace_dir.split("/orgs/")[-1].split("/")[0]

    # Check all org directories (localfs-aware)
    orgs_dir = lab_dirs.get_orgs_base_dir()
    if await storage.exists(orgs_dir) and await storage.isdir(orgs_dir):
        try:
            org_entries = await storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if await storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]

                    # Set org context and check if job exists
                    lab_dirs.set_organization_id(org_id)
                    try:
                        jobs_dir = await lab_dirs.get_jobs_dir()
                        job_path = storage.join(jobs_dir, job_id)
                        if await storage.exists(job_path) and await storage.isdir(job_path):
                            # Job found in this org
                            lab_dirs.set_organization_id(None)
                            return org_id
                    except Exception:
                        continue
        except Exception:
            pass

    # Clear org context
    lab_dirs.set_organization_id(None)
    return None


async def job_count_running_across_all_orgs() -> int:
    """
    Count running jobs across all organizations.
    Returns the total count of jobs with status "RUNNING" across all orgs.
    """
    count = 0

    # Check all org directories (localfs-aware)
    orgs_dir = lab_dirs.get_orgs_base_dir()
    if await storage.exists(orgs_dir) and await storage.isdir(orgs_dir):
        try:
            org_entries = await storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if await storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]
                    lab_dirs.set_organization_id(org_id)
                    try:
                        count += await Job.count_running_jobs()
                    except Exception:
                        continue
        except Exception:
            pass

    # Clear org context
    lab_dirs.set_organization_id(None)

    return count


async def job_delete_all(experiment_id):
    if experiment_id is not None:
        experiment = Experiment(experiment_id)
        await experiment.delete_all_jobs()


async def job_delete(job_id, experiment_id):
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return
        await job.delete()
    except Exception as e:
        print(f"Error deleting job {job_id}: {e}")


async def job_update_job_data_insert_key_value(job_id, key, value, experiment_id):
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return
        await job.update_job_data_field(key, value)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")


async def job_stop(job_id, experiment_id):
    print("Stopping job: " + str(job_id))
    await job_update_job_data_insert_key_value(job_id, "stop", True, experiment_id)


async def job_update_progress(job_id, progress, experiment_id):
    """
    Update the percent complete for this job.

    progress: int representing percent complete
    """
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return
        await job.update_progress(progress)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")


async def job_update_sweep_progress(job_id, value, experiment_id):
    """
    Update the 'sweep_progress' key in the job_data JSON column for a given job.
    """
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return
        await job.update_sweep_progress(value)
    except Exception as e:
        print(f"Error updating sweep job {job_id}: {e}")


async def jobs_get_sweep_children(parent_job_id, experiment_id=None):
    """
    Get all child jobs that belong to a sweep parent job.
    """
    try:
        parent_job = await Job.get(parent_job_id)
        if experiment_id is not None:
            exp_id = await parent_job.get_experiment_id()
            if exp_id != experiment_id:
                return []

        job_data = await parent_job.get_job_data()
        if not isinstance(job_data, dict):
            return []

        sweep_job_ids = job_data.get("sweep_job_ids", [])
        if not isinstance(sweep_job_ids, list):
            return []

        # Get all child jobs
        child_jobs = []
        for child_job_id in sweep_job_ids:
            try:
                child_job = await Job.get(child_job_id)
                # Get full job data (including type, status, etc.)
                job_json = await child_job.get_json_data()
                child_jobs.append(job_json)
            except Exception:
                # Skip if job doesn't exist
                continue

        return child_jobs
    except Exception as e:
        print(f"Error getting sweep children for job {parent_job_id}: {e}")
        return []


async def job_get_sweep_parent(child_job_id, experiment_id=None):
    """
    Get the parent sweep job for a child job.
    Returns None if the job is not a sweep child.
    """
    try:
        child_job = await Job.get(child_job_id)
        if experiment_id is not None:
            exp_id = await child_job.get_experiment_id()
            if exp_id != experiment_id:
                return None

        job_data = await child_job.get_job_data()
        if not isinstance(job_data, dict):
            return None

        parent_job_id = job_data.get("parent_sweep_job_id")
        if not parent_job_id:
            return None

        parent_job = await Job.get(parent_job_id)
        return await parent_job.get_json_data()
    except Exception as e:
        print(f"Error getting sweep parent for job {child_job_id}: {e}")
        return None


##################################
# ORIGINAL JOB SERVICE FUNCTIONS
# Create to support workflows
##################################


async def _track_quota_for_job_status_change(
    job_id: str, job_dict: dict, final_status: str, experiment_id: Optional[str], session: Optional[object]
):
    """
    Track quota usage for a REMOTE job when it transitions to a terminal state.
    This is called as a background task so it doesn't block job status updates.
    """
    try:
        from transformerlab.db.session import async_session

        # Use provided session or create a new one
        if session:
            await _record_quota_usage_internal(session, job_id, job_dict, final_status, experiment_id)
        else:
            # Create a new session for quota tracking
            async with async_session() as new_session:
                await _record_quota_usage_internal(new_session, job_id, job_dict, final_status, experiment_id)
    except Exception as e:
        print(f"Error in quota tracking background task for job {job_id}: {e}")


async def _record_quota_usage_internal(
    session: object, job_id: str, job_dict: dict, final_status: str, experiment_id: Optional[str]
):
    """
    Internal helper to record quota usage. Assumes session is already provided.
    """
    from transformerlab.services import quota_service
    from transformerlab.shared.models.models import User
    from sqlalchemy import select

    job_type = job_dict.get("type")
    if job_type != "REMOTE":
        return

    job_data = job_dict.get("job_data") or {}
    user_info = job_data.get("user_info") or {}
    user_email = user_info.get("email")
    if not user_email:
        return

    # Get team_id from job_data or experiment
    team_id = job_data.get("team_id")
    if not team_id:
        # Try to get from experiment context if available
        # For now, skip if we can't determine team_id
        print(f"Job {job_id} missing team_id, skipping quota tracking")
        return

    # Check if job had start_time (entered LAUNCHING state)
    start_time_str = job_data.get("start_time")
    if not start_time_str:
        # Job never entered LAUNCHING state, release quota hold if exists
        await quota_service.release_quota_hold(session, job_id=job_id)
        await session.commit()
        return

    # Get end time based on status
    end_time_str = None
    if final_status == "COMPLETE":
        end_time_str = job_data.get("end_time")
    elif final_status == "STOPPED":
        end_time_str = job_data.get("stop_time") or job_data.get("end_time")
    elif final_status in ("FAILED", "DELETED"):
        end_time_str = job_data.get("end_time") or datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    if not end_time_str:
        end_time_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    # Calculate minutes used
    try:
        if isinstance(start_time_str, str):
            start_dt = datetime.datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        elif isinstance(start_time_str, datetime.datetime):
            start_dt = start_time_str
        else:
            print(f"Invalid start_time_str type: {type(start_time_str)}, value: {start_time_str}")
            return

        if isinstance(end_time_str, str):
            end_dt = datetime.datetime.strptime(end_time_str, "%Y-%m-%d %H:%M:%S")
        elif isinstance(end_time_str, datetime.datetime):
            end_dt = end_time_str
        else:
            print(f"Invalid end_time_str type: {type(end_time_str)}, value: {end_time_str}")
            return

        duration_seconds = (end_dt - start_dt).total_seconds()
        minutes_used = round(duration_seconds / 60.0, 2)

        if minutes_used < 0:
            return

        # Get user_id from email
        stmt = select(User).where(User.email == user_email)
        result = await session.execute(stmt)
        user = result.scalar_one_or_none()
        if not user:
            return

        user_id_str = str(user.id)

        # Record quota usage
        await quota_service.record_quota_usage(
            session=session,
            user_id=user_id_str,
            team_id=team_id,
            job_id=job_id,
            experiment_id=experiment_id or "",
            minutes_used=minutes_used,
        )

        # Convert quota hold to CONVERTED status
        await quota_service.convert_quota_hold(session, job_id)

        await session.commit()
        print(f"Recorded quota usage: {minutes_used:.2f} minutes for job {job_id}")

    except Exception as e:
        print(f"Error recording quota usage for job {job_id}: {e}")
        await session.rollback()


async def job_update_status(
    job_id: str,
    status: str,
    experiment_id: Optional[str] = None,
    error_msg: Optional[str] = None,
    session: Optional[object] = None,  # AsyncSession type but using object to avoid circular imports
):
    """
    Update job status.
    Also handles quota tracking for REMOTE jobs.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
        error_msg: Optional error message to add to job data
        session: Optional database session for quota tracking. If not provided, quota tracking will use a background task.
    """
    # Get old status before updating for queue management
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return

        await job.update_status(status)
        if error_msg:
            await job.set_error_message(error_msg)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass

    # Track quota for REMOTE jobs when they transition to terminal states
    if status in ("COMPLETE", "STOPPED", "FAILED", "DELETED"):
        try:
            job_dict = await job.get_json_data() if job else {}
            if job_dict.get("type") == "REMOTE":
                # If session is provided, await quota tracking in the same transaction
                # Otherwise, run it as a background task
                import asyncio

                if session:
                    # Await quota tracking when session is provided to ensure it's part of the same transaction
                    await _track_quota_for_job_status_change(job_id, job_dict, status, experiment_id, session)
                else:
                    # Trigger quota tracking as background task (async, won't block)
                    asyncio.create_task(
                        _track_quota_for_job_status_change(job_id, job_dict, status, experiment_id, session)
                    )
        except Exception as e:
            print(f"Error initiating quota tracking for job {job_id}: {e}")


async def job_update(job_id: str, type: str, status: str, experiment_id: Optional[str] = None):
    """
    Update job type and status.

    Args:
        job_id: The ID of the job to update
        type: The new type to set
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
    """
    try:
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return

        await job.set_type(type)
        await job.update_status(status)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass


def job_update_status_sync(job_id: str, org_id: str, status: str, error_msg: Optional[str] = None):
    """
    Synchronous version of job status update.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        error_msg: Optional error message to add to job data
    """
    # Update the job status using SDK Job class
    try:
        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = asyncio.run(Job.get(str(job_id)))
            asyncio.run(job.update_status(status))
            if error_msg:
                asyncio.run(job.set_error_message(error_msg))
        finally:
            # Clear org context
            if org_id:
                lab_dirs.set_organization_id(None)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        # Ensure org context is cleared even on error
        try:
            lab_dirs.set_organization_id(None)
        except Exception:
            pass
        pass


def job_update_sync(job_id: str, status: str, experiment_id: Optional[str] = None):
    """
    Synchronous version of job update.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
    """
    # Update the job in the database using SDK Job class
    try:
        job = asyncio.run(Job.get(job_id))
        exp_id = asyncio.run(job.get_experiment_id())
        if experiment_id is not None and exp_id != experiment_id:
            return
        asyncio.run(job.update_status(status))
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass


def job_update_type_and_status_sync(job_id: str, job_type: str, status: str, experiment_id: Optional[str] = None):
    """
    Synchronous version of job update for both type and status.

    Args:
        job_id: The ID of the job to update
        job_type: The new type to set
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
    """
    try:
        job = asyncio.run(Job.get(job_id))
        exp_id = asyncio.run(job.get_experiment_id())
        if experiment_id is not None and exp_id != experiment_id:
            return
        asyncio.run(job.set_type(job_type))
        asyncio.run(job.update_status(status))
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass


def job_mark_as_complete_if_running(job_id: int, org_id: str) -> None:
    """Service wrapper: mark job as complete if running."""
    try:
        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = asyncio.run(Job.get(str(job_id)))

            # Only update if currently running
            status = asyncio.run(job.get_status())
            if status == "RUNNING":
                asyncio.run(job.update_status("COMPLETE"))
        finally:
            # Clear org context
            if org_id:
                lab_dirs.set_organization_id(None)
    except Exception as e:
        print(f"Error marking job {job_id} as complete: {e}")
        # Ensure org context is cleared even on error
        try:
            lab_dirs.set_organization_id(None)
        except Exception:
            pass


async def format_artifact(file_path: str, storage) -> Optional[Dict[str, any]]:
    """
    Format a single artifact file into the response structure.
    Returns None if the artifact can't be processed.
    """
    try:
        filename = file_path.split("/")[-1] if "/" in file_path else file_path
        artifact = {"filename": filename, "full_path": file_path}
        return artifact
    except Exception as e:
        print(f"Error formatting artifact {file_path}: {e}")
        return None


async def get_artifacts_from_sdk(job_id: str, storage) -> Optional[List[Dict]]:
    """
    Get artifacts using the SDK method.
    Returns list of artifacts or None if SDK method fails.
    """
    try:
        from lab.job import Job

        sdk_job = Job(job_id)
        artifact_paths = sdk_job.get_artifact_paths()

        if not artifact_paths:
            return None

        artifacts = []
        for artifact_path in artifact_paths:
            artifact = await format_artifact(artifact_path, storage)
            if artifact:
                artifacts.append(artifact)

        return artifacts
    except Exception as e:
        print(f"SDK artifact method failed for job {job_id}: {e}")
        return None


async def get_artifacts_from_directory(artifacts_dir: str, storage) -> List[Dict]:
    """
    Get artifacts by listing files in the artifacts directory.
    Returns list of artifacts (empty if directory can't be read).
    """
    if not artifacts_dir:
        return []

    # Check if directory exists before trying to list it
    try:
        if not await storage.exists(artifacts_dir):
            return []
    except Exception:
        # If exists() fails, try to list anyway (some storage backends may not support exists)
        pass

    artifacts = []
    try:
        items = await storage.ls(artifacts_dir, detail=False)

        for item in items:
            # Handle both string paths and dict responses from storage.ls
            if isinstance(item, dict):
                # Extract path from dict (some storage backends return dicts even with detail=False)
                file_path = item.get("name") or item.get("path") or str(item)
                # Skip if it's a directory
                if item.get("type") == "directory":
                    continue
            else:
                file_path = str(item)

            if item:
                artifact = await format_artifact(file_path, storage)
                artifacts.append(artifact)
    except Exception as e:
        print(f"Error reading artifacts directory {artifacts_dir}: {e}")

    return artifacts


async def get_all_artifact_paths(job_id: str, storage) -> List[str]:
    """
    Get all artifact file paths for a job.
    Uses get_artifacts_from_sdk and get_artifacts_from_directory to retrieve paths.
    """
    # 1. Try SDK method
    sdk_artifacts = await get_artifacts_from_sdk(job_id, storage)
    if sdk_artifacts:
        return [a.get("full_path") for a in sdk_artifacts if a.get("full_path")]

    # 2. Fallback to artifacts directory
    job = await job_get(job_id)
    if job:
        job_data = job.get("job_data", {})
        artifacts_dir = job_data.get("artifacts_dir")

        if not artifacts_dir:
            try:
                from lab.dirs import get_job_artifacts_dir

                artifacts_dir = await get_job_artifacts_dir(job_id)
            except Exception:
                pass

        if artifacts_dir:
            dir_artifacts = await get_artifacts_from_directory(artifacts_dir, storage)
            if dir_artifacts:
                return [a.get("full_path") for a in dir_artifacts if a.get("full_path")]

    return []


async def get_datasets_from_directory(datasets_dir: str, storage) -> List[Dict]:
    """
    Get datasets by listing both directories and files in the datasets directory.
    Datasets can be either directories (containing multiple files) or single files (.hdf, .npy, etc.)
    Returns list of datasets (empty if directory can't be read).
    """
    if not datasets_dir:
        return []

    # Check if directory exists before trying to list it
    try:
        if not await storage.exists(datasets_dir):
            return []
    except Exception:
        # If exists() fails, try to list anyway (some storage backends may not support exists)
        pass

    datasets = []
    try:
        items = await storage.ls(datasets_dir, detail=False)

        for item in items:
            # Handle both string paths and dict responses from storage.ls
            if isinstance(item, dict):
                # Extract path from dict (some storage backends return dicts even with detail=False)
                item_path = item.get("name") or item.get("path") or str(item)
                # Process both directories and files
                dataset = await format_dataset(item_path, storage)
                if dataset:
                    datasets.append(dataset)
            else:
                # For string responses, process both files and directories
                item_path = str(item)
                dataset = await format_dataset(item_path, storage)
                if dataset:
                    datasets.append(dataset)
    except Exception as e:
        print(f"Error reading datasets directory {datasets_dir}: {e}")

    return datasets


async def get_models_from_directory(models_dir: str, storage) -> List[Dict]:
    """
    Get models by listing both directories and files in the models directory.
    Models can be either directories (containing multiple files) or single files (.pt, .safetensors, etc.)
    Returns list of models (empty if directory can't be read).
    """
    if not models_dir:
        return []

    # Check if directory exists before trying to list it
    try:
        if not await storage.exists(models_dir):
            return []
    except Exception:
        # If exists() fails, try to list anyway (some storage backends may not support exists)
        pass

    models = []
    try:
        items = await storage.ls(models_dir, detail=False)

        for item in items:
            # Handle both string paths and dict responses from storage.ls
            if isinstance(item, dict):
                # Extract path from dict (some storage backends return dicts even with detail=False)
                item_path = item.get("name") or item.get("path") or str(item)
                # Accept both directories and files (models can be either)
                model = await format_model(item_path, storage)
                if model:
                    models.append(model)
            else:
                # For string responses, process all items
                item_path = str(item)
                model = await format_model(item_path, storage)
                if model:
                    models.append(model)
    except Exception as e:
        print(f"Error reading models directory {models_dir}: {e}")

    return models


async def format_dataset(dir_path: str, storage) -> Optional[Dict[str, any]]:
    """
    Format a single dataset directory into the response structure.
    Returns None if the dataset can't be processed.
    """
    try:
        dataset_name = dir_path.split("/")[-1] if "/" in dir_path else dir_path

        dataset = {
            "name": dataset_name,
            "full_path": dir_path,
        }
        return dataset
    except Exception as e:
        print(f"Error formatting dataset {dir_path}: {e}")
        return None


async def format_model(dir_path: str, storage) -> Optional[Dict[str, any]]:
    """
    Format a single model directory into the response structure.
    Returns None if the model can't be processed.
    """
    try:
        model_name = dir_path.split("/")[-1] if "/" in dir_path else dir_path

        model = {
            "name": model_name,
            "full_path": dir_path,
        }
        return model
    except Exception as e:
        print(f"Error formatting model {dir_path}: {e}")
        return None
