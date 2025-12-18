import asyncio
import json
import os
from typing import Optional, Tuple

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
]

# Centralized set of job types that can trigger workflows on completion
SUPPORTED_WORKFLOW_TRIGGERS = ["TRAIN", "LOAD_MODEL", "EXPORT", "EVAL", "GENERATE", "DOWNLOAD_MODEL"]


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
    # Get HOME_DIR
    try:
        home_dir = lab_dirs.HOME_DIR
    except AttributeError:
        home_dir = os.environ.get("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))

    # Check if context is set correctly already
    from lab.dirs import get_workspace_dir

    workspace_dir = await get_workspace_dir()
    if "/orgs/" in workspace_dir:
        return workspace_dir.split("/orgs/")[-1].split("/")[0]

    # Check all org directories
    orgs_dir = storage.join(home_dir, "orgs")
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

    # Get HOME_DIR
    try:
        home_dir = lab_dirs.HOME_DIR
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


async def jobs_get_next_queued_job():
    return await Job.get_next_queued_job()


async def jobs_get_next_queued_job_across_all_orgs() -> Tuple[Optional[dict], Optional[str]]:
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
    if await storage.exists(orgs_dir) and await storage.isdir(orgs_dir):
        try:
            org_entries = await storage.ls(orgs_dir, detail=False)
            for org_path in org_entries:
                if await storage.isdir(org_path):
                    org_id = org_path.rstrip("/").split("/")[-1]

                    # Set org context to get jobs for this org
                    lab_dirs.set_organization_id(org_id)

                    try:
                        # Get jobs directory for this org
                        jobs_dir = await lab_dirs.get_jobs_dir()
                        if await storage.exists(jobs_dir) and await storage.isdir(jobs_dir):
                            entries = await storage.ls(jobs_dir, detail=False)
                            for job_path in entries:
                                if await storage.isdir(job_path):
                                    job_id_str = job_path.rstrip("/").split("/")[-1]
                                    try:
                                        job_id = int(job_id_str) if job_id_str.isdigit() else 0
                                        job = await Job.get(job_id_str)
                                        job_data = await job.get_json_data(uncached=True)
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


##################################
# ORIGINAL JOB SERVICE FUNCTIONS
# Create to support workflows
##################################


async def _trigger_workflows_on_job_completion(job_id: str):
    """
    Trigger workflows when a job completes if the job type is in supported triggers.
    """
    try:
        # Get the job details
        job = await job_get(job_id)
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
    job_id: str, status: str, experiment_id: Optional[str] = None, error_msg: Optional[str] = None
):
    """
    Update job status and trigger workflows if job is completed.

    Args:
        job_id: The ID of the job to update
        status: The new status to set
        experiment_id: The experiment ID (required for most operations, optional for backward compatibility)
        error_msg: Optional error message to add to job data
    """
    # Update the job status using SDK Job class
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
        job = await Job.get(job_id)
        exp_id = await job.get_experiment_id()
        if experiment_id is not None and exp_id != experiment_id:
            return
        await job.set_type(type)
        await job.update_status(status)
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
        org_id = asyncio.run(_find_org_id_for_job(str(job_id)))

        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = asyncio.run(Job.get(str(job_id)))
            exp_id = asyncio.run(job.get_experiment_id())
            if experiment_id is not None and exp_id != experiment_id:
                return
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
        job = asyncio.run(Job.get(job_id))
        exp_id = asyncio.run(job.get_experiment_id())
        if experiment_id is not None and exp_id != experiment_id:
            return
        asyncio.run(job.update_status(status))
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
        job = asyncio.run(Job.get(job_id))
        exp_id = asyncio.run(job.get_experiment_id())
        if experiment_id is not None and exp_id != experiment_id:
            return
        asyncio.run(job.set_type(job_type))
        asyncio.run(job.update_status(status))

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
        job = asyncio.run(Job.get(job_id))
        job_type = asyncio.run(job.get_type())
        # Get experiment_id from job data to match the type expected by workflow functions
        experiment_id = asyncio.run(job.get_experiment_id())

        if not experiment_id:
            return

        # 2. Check if job type is supported
        supported_triggers = SUPPORTED_WORKFLOW_TRIGGERS
        if job_type not in supported_triggers:
            return

        # 3. Get workflows with matching trigger using async database operations
        # Note: This is a limitation - we can't easily do async operations in a sync context
        # For now, we'll import the async function and call it

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
        org_id = asyncio.run(_find_org_id_for_job(str(job_id)))

        # Set org context before accessing the job
        if org_id:
            lab_dirs.set_organization_id(org_id)

        try:
            job = asyncio.run(Job.get(str(job_id)))
            exp_id = asyncio.run(job.get_experiment_id())
            if experiment_id is not None and exp_id != experiment_id:
                return
            # Only update if currently running
            status = asyncio.run(job.get_status())
            if status == "RUNNING":
                asyncio.run(job.update_status("COMPLETE"))
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
