# Root dir is the parent of the parent of this current directory:

import os
import contextvars
from werkzeug.utils import secure_filename
from . import storage
from .storage import _current_tfl_storage_uri

# TFL_HOME_DIR
# Note: This is a temporary sync value for module initialization
# Actual async resolution happens via get functions
if "TFL_HOME_DIR" in os.environ and not (_current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")):
    HOME_DIR = os.environ["TFL_HOME_DIR"]
    if not os.path.exists(HOME_DIR):
        print(f"Error: Home directory {HOME_DIR} does not exist")
        exit(1)
    print(f"Home directory is set to: {HOME_DIR}")
else:
    # For remote storage, this is a placeholder - actual value resolved via async functions
    if _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI"):
        HOME_DIR = os.getenv("TFL_STORAGE_URI", "")
    else:
        HOME_DIR = os.path.join(os.path.expanduser("~"), ".transformerlab")
        os.makedirs(name=HOME_DIR, exist_ok=True)
        print(f"Using default home directory: {HOME_DIR}")

# Context var for organization id (set by host app/session)
_current_org_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("current_org_id", default=None)


def set_organization_id(organization_id: str | None) -> None:
    _current_org_id.set(organization_id)
    if organization_id is not None:
        # If TFL_API_STORAGE_URI is set, use s3://workspace_<team_id> instead of the value itself
        tfl_api_storage_uri = os.getenv("TFL_API_STORAGE_URI")
        if tfl_api_storage_uri:
            # Use s3://workspace_<team_id> format
            _current_tfl_storage_uri.set(f"s3://workspace-{organization_id}")
        else:
            _current_tfl_storage_uri.set(None)
    else:
        _current_tfl_storage_uri.set(None)


async def get_workspace_dir() -> str:
    # Remote SkyPilot workspace override (highest precedence)
    # Only return container workspace path when value is exactly "true"
    if os.getenv("_TFL_REMOTE_SKYPILOT_WORKSPACE") == "true":
        if os.getenv("TFL_STORAGE_URI") is not None:
            return await storage.root_uri()

        return "/workspace"

    # Explicit override wins
    if "TFL_WORKSPACE_DIR" in os.environ and not (
        _current_tfl_storage_uri.get() is not None and os.getenv("TFL_STORAGE_URI") is not None
    ):
        value = os.environ["TFL_WORKSPACE_DIR"]
        if not os.path.exists(value):
            print(f"Error: Workspace directory {value} does not exist")
            exit(1)
        return value

    org_id = _current_org_id.get()

    if org_id:
        # If the storage URI is set, use it for the org workspace
        if _current_tfl_storage_uri.get() is not None:
            return _current_tfl_storage_uri.get()
        path = storage.join(HOME_DIR, "orgs", org_id, "workspace")
        await storage.makedirs(path, exist_ok=True)
        return path

    if os.getenv("TFL_STORAGE_URI"):
        return await storage.root_uri()

    path = storage.join(HOME_DIR, "workspace")
    await storage.makedirs(path, exist_ok=True)
    return path


# Legacy constant for backward compatibility - placeholder value
# Use await get_workspace_dir() in async code
WORKSPACE_DIR = HOME_DIR

"""
TFL_HOME_DIR is the directory that is the parent of the src and workspace directories.
By default, it is set to ~/.transformerlab

TFL_WORKSPACE_DIR is the directory where all the experiments, plugins, and models are stored.
By default, it is set to TFL_HOME_DIR/workspace

TFL_SOURCE_CODE_DIR is the directory where the source code is stored.
By default, it is set to TFL_HOME_DIR/src
This directory stores code but shouldn't store any data because it is erased and replaced
on updates.

You can set any of the above using environment parameters and it will override the defaults.

ROOT_DIR is a legacy variable that we should replace with the above, eventually.
"""

# FASTCHAT LOGDIR
os.environ["LOGDIR"] = os.getenv("TFL_HOME_DIR", os.path.join(str(os.path.expanduser("~")), ".transformerlab"))


async def get_experiments_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "experiments")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_jobs_dir() -> str:
    workspace_dir = await get_workspace_dir()
    path = storage.join(workspace_dir, "jobs")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_global_log_path() -> str:
    workspace = await get_workspace_dir()
    return storage.join(workspace, "transformerlab.log")


async def get_logs_dir() -> str:
    path = storage.join(HOME_DIR, "logs")
    await storage.makedirs(path, exist_ok=True)
    return path


# TODO: Move this to Experiment
async def experiment_dir_by_name(experiment_name: str) -> str:
    experiments_dir = await get_experiments_dir()
    return storage.join(experiments_dir, experiment_name)


async def get_plugin_dir() -> str:
    workspace = await get_workspace_dir()
    return storage.join(workspace, "plugins")


async def plugin_dir_by_name(plugin_name: str) -> str:
    plugin_name = secure_filename(plugin_name)
    plugin_dir = await get_plugin_dir()
    return storage.join(plugin_dir, plugin_name)


async def get_models_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "models")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_datasets_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "datasets")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_tasks_dir() -> str:
    tfl_storage_uri = _current_tfl_storage_uri.get()
    if tfl_storage_uri is not None:
        return storage.join(tfl_storage_uri, "tasks")

    workspace = await get_workspace_dir()
    path = storage.join(workspace, "tasks")
    await storage.makedirs(path, exist_ok=True)
    return path


async def dataset_dir_by_id(dataset_id: str) -> str:
    datasets_dir = await get_datasets_dir()
    return storage.join(datasets_dir, dataset_id)


async def get_temp_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "temp")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_prompt_templates_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "prompt_templates")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_tools_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "tools")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_batched_prompts_dir() -> str:
    workspace = await get_workspace_dir()
    path = storage.join(workspace, "batched_prompts")
    await storage.makedirs(path, exist_ok=True)
    return path


def get_galleries_cache_dir() -> str:
    path = storage.join(HOME_DIR, "galleries")
    # Using os here since this would always be on local filesystem
    os.makedirs(path, exist_ok=True)
    return path


async def get_job_dir(job_id: str | int) -> str:
    """
    Return the filesystem directory for a specific job id under the jobs root.
    Mirrors `Job.get_dir()` but provided here for convenience where a `Job`
    instance is not readily available.
    """
    job_id_safe = secure_filename(str(job_id))
    jobs_dir = await get_jobs_dir()
    return storage.join(jobs_dir, job_id_safe)


async def get_job_artifacts_dir(job_id: str | int) -> str:
    """
    Return the artifacts directory for a specific job, creating it if needed.
    Example: ~/.transformerlab/workspace/jobs/<job_id>/artifacts
    """
    job_dir = await get_job_dir(job_id)
    path = storage.join(job_dir, "artifacts")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_job_checkpoints_dir(job_id: str | int) -> str:
    """
    Return the checkpoints directory for a specific job, creating it if needed.
    Example: ~/.transformerlab/workspace/jobs/<job_id>/checkpoints
    """
    job_dir = await get_job_dir(job_id)
    path = storage.join(job_dir, "checkpoints")
    await storage.makedirs(path, exist_ok=True)
    return path


async def get_job_eval_results_dir(job_id: str | int) -> str:
    """
    Return the eval_results directory for a specific job, creating it if needed.
    Example: ~/.transformerlab/workspace/jobs/<job_id>/eval_results
    """
    job_dir = await get_job_dir(job_id)
    path = storage.join(job_dir, "eval_results")
    await storage.makedirs(path, exist_ok=True)
    return path


# Evals output file:
# TODO: These should probably be in the plugin subclasses


async def eval_output_file(experiment_name: str, eval_name: str) -> str:
    experiment_dir = await experiment_dir_by_name(experiment_name)
    eval_name = secure_filename(eval_name)
    p = storage.join(experiment_dir, "evals", eval_name)
    await storage.makedirs(p, exist_ok=True)
    return storage.join(p, "output.txt")


async def generation_output_file(experiment_name: str, generation_name: str) -> str:
    experiment_dir = await experiment_dir_by_name(experiment_name)
    generation_name = secure_filename(generation_name)
    p = storage.join(experiment_dir, "generations", generation_name)
    await storage.makedirs(p, exist_ok=True)
    return storage.join(p, "output.txt")
