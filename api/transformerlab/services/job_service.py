import json
from typing import Optional

from lab import Experiment, Job


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
        return job.get_json_data()
    except Exception as e:
        print("Error getting job data", e)
        return None


def job_count_running():
    return Job.count_running_jobs()


def jobs_get_next_queued_job():
    return Job.get_next_queued_job()


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
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_status(status)
        if error_msg:
            job.set_error_message(error_msg)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")

        pass

    # Trigger workflows if job status is COMPLETE
    if status == "COMPLETE":
        await _trigger_workflows_on_job_completion(job_id)


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

    # Trigger workflows if job status is COMPLETE
    if status == "COMPLETE":
        await _trigger_workflows_on_job_completion(job_id)


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
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        job.update_status(status)
        if error_msg:
            job.set_error_message(error_msg)
    except Exception as e:
        print(f"Error updating job {job_id}: {e}")
        pass

    # Trigger workflows if job status is COMPLETE
    if status == "COMPLETE":
        _trigger_workflows_on_job_completion_sync(job_id)


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

    # Trigger workflows if job status is COMPLETE
    if status == "COMPLETE":
        _trigger_workflows_on_job_completion_sync(job_id)


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
        if status == "COMPLETE":
            _trigger_workflows_on_job_completion_sync(job_id)
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
        job = Job.get(job_id)
        if experiment_id is not None and job.get_experiment_id() != experiment_id:
            return
        # Only update if currently running
        if job.get_status() == "RUNNING":
            job.update_status("COMPLETE")
            _trigger_workflows_on_job_completion_sync(job_id)
    except Exception as e:
        print(f"Error marking job {job_id} as complete: {e}")
        pass
