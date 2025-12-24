import json
import os
from typing import Optional, Tuple

from lab import Experiment, Job
from lab import dirs as lab_dirs
from lab import storage
from time import time
from datetime import datetime

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

# Centralized set of job types that can trigger workflows on completion
SUPPORTED_WORKFLOW_TRIGGERS = ["TRAIN", "LOAD_MODEL", "EXPORT", "EVAL", "GENERATE", "DOWNLOAD_MODEL"]


def job_create(type, status, experiment_id, job_data="{}"):
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
    job = exp.create_job()
    job.set_type(type)
    job.update_status(status)
    job.set_job_data(job_data)

    return job.id


def jobs_get_all(experiment_id, type="", status=""):
    exp_obj = Experiment(experiment_id)
    return exp_obj.get_jobs(type, status)


def jobs_get_all_by_experiment_and_type(experiment_id, job_type):
    return jobs_get_all(experiment_id, job_type)


def jobs_get_by_experiment(experiment_id):
    """Get all jobs for a specific experiment"""
    return jobs_get_all(experiment_id)


def job_get(job_id):
    try:
        job = Job.get(job_id)
        return job.get_json_data(uncached=True)
    except Exception as e:
        print("Error getting job data", e)
        return None


def job_count_running():
    return Job.count_running_jobs()


def _find_org_id_for_job(job_id: str) -> Optional[str]:
    """
    Find which organization a job belongs to by searching all org directories.
    Returns the org_id if found, None otherwise.
    """
    # Get HOME_DIR
    try:
        home_dir = lab_dirs.HOME_DIR
    except AttributeError:
        home_dir = os.environ.get("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))

    # Check if context is set correctly already
    from lab.dirs import get_workspace_dir

    workspace_dir = get_workspace_dir()
    if "/orgs/" in workspace_dir:
        return workspace_dir.split("/orgs/")[-1].split("/")[0]

    # Check all org directories
    orgs_dir = storage.join(home_dir, "orgs")
    if storage.exists(orgs_dir) and storage.isdir(orgs_dir):
        try:
            org_entries = storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]

                    # Set org context and check if job exists
                    lab_dirs.set_organization_id(org_id)
                    try:
                        jobs_dir = lab_dirs.get_jobs_dir()
                        job_path = storage.join(jobs_dir, job_id)
                        if storage.exists(job_path) and storage.isdir(job_path):
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


def job_count_running_across_all_orgs() -> int:
    """
    Count running jobs across all organizations.
    Returns the total count of jobs with status "RUNNING" across all orgs.
    """
    count = 0

    # Get HOME_DIR
    try:
        home_dir = lab_dirs.HOME_DIR
    except AttributeError:
        home_dir = os.environ.get("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))

    # Check all org directories
    orgs_dir = storage.join(home_dir, "orgs")
    if storage.exists(orgs_dir) and storage.isdir(orgs_dir):
        try:
            org_entries = storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]
                    lab_dirs.set_organization_id(org_id)
                    try:
                        count += Job.count_running_jobs()
                    except Exception:
                        continue
        except Exception:
            pass

    # Clear org context
    lab_dirs.set_organization_id(None)

    return count


def jobs_get_next_queued_job():
    return Job.get_next_queued_job()


def jobs_get_next_queued_job_across_all_orgs() -> Tuple[Optional[dict], Optional[str]]:
    """
    Get the next queued job across all organizations.
    Returns a tuple of (job_data_dict, organization_id) or (None, None) if no queued jobs found.

    Jobs are sorted by job_id (oldest first) to ensure fair queue ordering across all orgs.
    """
    queued_jobs = []  # List of (job_id, job_data, org_id) tuples

    # Get HOME_DIR - need to access it from lab.dirs module
    try:
        # Get HOME_DIR value - it's set at module level
        home_dir = lab_dirs.HOME_DIR
    except AttributeError:
        # Fallback to environment variable or default
        home_dir = os.environ.get("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))

    # List all organization directories
    orgs_dir = storage.join(home_dir, "orgs")

    # Check all org directories
    if storage.exists(orgs_dir) and storage.isdir(orgs_dir):
        try:
            org_entries = storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]

                    # Set org context to get jobs for this org
                    lab_dirs.set_organization_id(org_id)

                    try:
                        # Get jobs directory for this org
                        jobs_dir = lab_dirs.get_jobs_dir()
                        if storage.exists(jobs_dir) and storage.isdir(jobs_dir):
                            entries = storage.ls(jobs_dir, detail=False)
                            for job_path in entries:
                                if storage.isdir(job_path):
                                    job_id_str = job_path.rstrip("/").split("/")[-1]
                                    try:
                                        job_id = int(job_id_str) if job_id_str.isdigit() else 0
                                        job = Job.get(job_id_str)
                                        job_data = job.get_json_data(uncached=True)
                                        if job_data.get("status") == "QUEUED":
                                            queued_jobs.append((job_id, job_data, org_id))
                                    except Exception:
                                        continue
                    except Exception:
                        continue
        except Exception:
            pass

    # Clear org context after scanning
    lab_dirs.set_organization_id(None)

    # Sort by job_id (oldest first) and return the first one
    if queued_jobs:
        queued_jobs.sort(key=lambda x: x[0])
        job_id, job_data, org_id = queued_jobs[0]
        return (job_data, org_id)

    return (None, None)


def job_delete_all(experiment_id):
    if experiment_id is not None:
        experiment = Experiment(experiment_id)
        experiment.delete_all_jobs()


def job_delete(job_id, experiment_id):
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.delete()
    except Exception as e:
        print(f"Error deleting job {job_id}: {e}")


def job_update_job_data_insert_key_value(job_id, key, value, experiment_id):
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_job_data_field(key, value)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")


def job_stop(job_id, experiment_id):
    print("Stopping job: " + str(job_id))
    job_update_job_data_insert_key_value(job_id, "stop", True, experiment_id)


def job_update_progress(job_id, progress, experiment_id):
    """
    Update the percent complete for this job.

    progress: int representing percent complete
    """
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_progress(progress)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")


def job_update_sweep_progress(job_id, value, experiment_id):
    """
    Update the 'sweep_progress' key in the job_data JSON column for a given job.
    """
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_sweep_progress(value)
    except Exception as e:
        print(f"Error updating sweep job {job_id}: {e}")


def jobs_get_sweep_children(parent_job_id, experiment_id=None):
    """
    Get all child jobs that belong to a sweep parent job.
    """
    try:
        parent_job = Job.get(parent_job_id)
        if experiment_id is not None and parent_job.get_experiment_id() != experiment_id:
            return []

        job_data = parent_job.get_job_data()
        if not isinstance(job_data, dict):
            return []

        sweep_job_ids = job_data.get("sweep_job_ids", [])
        if not isinstance(sweep_job_ids, list):
            return []

        # Get all child jobs
        child_jobs = []
        for child_job_id in sweep_job_ids:
            try:
                child_job = Job.get(child_job_id)
                # Get full job data (including type, status, etc.)
                job_json = child_job.get_json_data()
                child_jobs.append(job_json)
            except Exception:
                # Skip if job doesn't exist
                continue

        return child_jobs
    except Exception as e:
        print(f"Error getting sweep children for job {parent_job_id}: {e}")
        return []


def job_get_sweep_parent(child_job_id, experiment_id=None):
    """
    Get the parent sweep job for a child job.
    Returns None if the job is not a sweep child.
    """
    try:
        child_job = Job.get(child_job_id)
        if experiment_id is not None and child_job.get_experiment_id() != experiment_id:
            return None

        job_data = child_job.get_job_data()
        if not isinstance(job_data, dict):
            return None

        parent_job_id = job_data.get("parent_sweep_job_id")
        if not parent_job_id:
            return None

        parent_job = Job.get(parent_job_id)
        return parent_job.get_json_data()
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
        end_time_str = job_data.get("end_time") or time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())

    if not end_time_str:
        end_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())

    # Calculate minutes used
    try:
        if isinstance(start_time_str, str):
            start_dt = datetime.strptime(start_time_str, "%Y-%m-%d %H:%M:%S")
        else:
            start_dt = start_time_str

        if isinstance(end_time_str, str):
            end_dt = datetime.strptime(end_time_str, "%Y-%m-%d %H:%M:%S")
        else:
            end_dt = end_time_str

        duration_seconds = (end_dt - start_dt).total_seconds()
        minutes_used = round(duration_seconds / 60.0, 2)

        if minutes_used < 0:
            return

        # Get user_id from email
        stmt = select(User).where(User.email == user_email)
        result = await session.execute(stmt)
        # unique() is required because User has lazy="joined" relationships (oauth_accounts)
        user = result.unique().scalar_one_or_none()
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


async def _trigger_workflows_on_job_completion(job_id: str):
    """
    Trigger workflows when a job completes if the job type is in supported triggers.
    """
    try:
        # Get the job details
        job = job_get(job_id)
        if not job:
            return

        job_type = job.get("type")
        experiment_id = job.get("experiment_id")

        # Define supported triggers based on centralized configuration
        supported_triggers = SUPPORTED_WORKFLOW_TRIGGERS

        # Check if job type is in supported triggers
        if job_type not in supported_triggers:
            return

        # Import here to avoid circular imports
        from transformerlab.routers.experiment.workflows import workflows_get_by_trigger_type

        # Get workflows that should be triggered
        triggered_workflow_ids = await workflows_get_by_trigger_type(experiment_id, job_type)

        # Start each workflow
        if triggered_workflow_ids:
            from transformerlab.db.workflows import workflow_queue

            for workflow_id in triggered_workflow_ids:
                await workflow_queue(workflow_id)
    except Exception as e:
        print(f"Error triggering workflows for job {job_id}: {e}")


async def job_update_status(
    job_id: str,
    status: str,
    experiment_id: Optional[str] = None,
    error_msg: Optional[str] = None,
    session: Optional[object] = None,  # AsyncSession type but using object to avoid circular imports
):
    """
    Update job status and trigger workflows if job is completed.
    Also handles quota tracking for REMOTE jobs.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
        error_msg: Optional error message to add to job data
        session: Optional database session for quota tracking. If not provided, quota tracking will use a background task.
    """
    # Update the job status using SDK Job class
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_status(status)
        if error_msg:
            job.set_error_message(error_msg)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")

        pass

    # Track quota for REMOTE jobs when they transition to terminal states
    if status in ("COMPLETE", "STOPPED", "FAILED", "DELETED"):
        try:
            job_dict = job.get_json_data() if job else {}
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

    # # Trigger workflows if job status is COMPLETE
    # if status == "COMPLETE":
    #     await _trigger_workflows_on_job_completion(job_id)


async def job_update(job_id: str, type: str, status: str, experiment_id: Optional[str] = None):
    """
    Update job type and status and trigger workflows if job is completed.

    Args:
        job_id: The ID of the job to update
        type: The new type to set
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
    """
    # Update the job in the database using SDK Job class
    try:
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.set_type(type)
        job.update_status(status)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass

    # # Trigger workflows if job status is COMPLETE
    # if status == "COMPLETE":
    #     await _trigger_workflows_on_job_completion(job_id)


def job_update_status_sync(
    job_id: str, status: str, experiment_id: Optional[str] = None, error_msg: Optional[str] = None
):
    """
    Synchronous version of job status update.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
        error_msg: Optional error message to add to job data
    """
    # Update the job status using SDK Job class
    try:
        # Find which org this job belongs to (in case we're called from a callback without org context)
        org_id = _find_org_id_for_job(str(job_id))

        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = Job.get(str(job_id))
            if experiment_id is not None and job.get_experiment_id() != experiment_id:
                return
            job.update_status(status)
            if error_msg:
                job.set_error_message(error_msg)
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

    # # Trigger workflows if job status is COMPLETE
    # if status == "COMPLETE":
    #     _trigger_workflows_on_job_completion_sync(job_id)


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
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_status(status)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass

    # # Trigger workflows if job status is COMPLETE
    # if status == "COMPLETE":
    #     _trigger_workflows_on_job_completion_sync(job_id)


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
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.set_type(job_type)
        job.update_status(status)

        # Trigger workflows if job status is COMPLETE
        # if status == "COMPLETE":
        # _trigger_workflows_on_job_completion_sync(job_id)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass


def _trigger_workflows_on_job_completion_sync(job_id: str):
    """
    Sync version of workflow triggering for use in sync contexts
    Note: This function cannot be truly sync since it needs to use async database operations.
    It should be called from an async context or we should use a sync database session.
    For now, we'll leave it as-is but it may need to be refactored.
    """
    try:
        # 1. Get job details using SDK
        job = Job.get(job_id)
        job_type = job.get_type()
        # Get experiment_id from job data to match the type expected by workflow functions
        experiment_id = job.get_experiment_id()

        if not experiment_id:
            return

        # 2. Check if job type is supported
        supported_triggers = SUPPORTED_WORKFLOW_TRIGGERS
        if job_type not in supported_triggers:
            return

        # 3. Get workflows with matching trigger using async database operations
        # Note: This is a limitation - we can't easily do async operations in a sync context
        # For now, we'll import the async function and call it

        # This is not ideal but necessary for now
        import asyncio

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're already in an async context, create a task
                asyncio.create_task(_trigger_workflows_async(job_id, job_type, experiment_id))
            else:
                # We're not in an async context, run it
                asyncio.run(_trigger_workflows_async(job_id, job_type, experiment_id))
        except RuntimeError:
            # No event loop, create one
            asyncio.run(_trigger_workflows_async(job_id, job_type, experiment_id))

    except Exception as e:
        print(f"Error triggering workflows for job {job_id}: {e}")


async def _trigger_workflows_async(job_id: str, job_type: str, experiment_id: str):
    """Helper async function to trigger workflows"""
    try:
        from transformerlab.routers.experiment.workflows import workflows_get_by_trigger_type

        # Get workflows with matching trigger
        triggered_workflow_ids = await workflows_get_by_trigger_type(experiment_id, job_type)

        # Queue workflows
        if triggered_workflow_ids:
            from transformerlab.db.workflows import workflow_queue

            for workflow_id in triggered_workflow_ids:
                await workflow_queue(workflow_id)
    except Exception as e:
        print(f"Error in async workflow triggering for job {job_id}: {e}")


def job_mark_as_complete_if_running(job_id: int, experiment_id: int) -> None:
    """Service wrapper: mark job as complete if running and then trigger workflows."""
    try:
        # Find which org this job belongs to
        org_id = _find_org_id_for_job(str(job_id))

        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = Job.get(str(job_id))
            if experiment_id is not None and job.get_experiment_id() != experiment_id:
                return
            # Only update if currently running
            if job.get_status() == "RUNNING":
                job.update_status("COMPLETE")
                # _trigger_workflows_on_job_completion_sync(job_id)
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
