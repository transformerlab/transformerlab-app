import asyncio
import json
import os
import re
import psutil
import subprocess
import sys
import threading
import time
import unicodedata
import math
from typing import Any

from anyio import open_process
from anyio.streams.text import TextReceiveStream
from werkzeug.utils import secure_filename
from collections import deque

from transformerlab.services.experiment_service import experiment_get
from transformerlab.services.job_service import job_update_status_sync, job_update_status
import transformerlab.services.job_service as job_service
from lab.dirs import get_global_log_path, get_local_provider_job_dir
from lab import dirs as lab_dirs, Job, Experiment
from lab import storage
from lab.dirs import get_workspace_dir
from transformerlab.shared import dirs
from transformerlab.shared.secret_utils import load_team_secrets
from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.compute_providers.local import LocalProvider


def popen_and_call(onExit, input="", output_file=None, *popenArgs, **popenKWArgs):
    """
    Runs a subprocess.Popen, then calls onExit when it completes.
    """

    # -------- REMOVE EXISTING IO ARGS IMMEDIATELY --------
    # Remove stdin/stdout/stderr BEFORE anything else
    cleanedKW = dict(popenKWArgs)
    for key in ["stdin", "stdout", "stderr"]:
        cleanedKW.pop(key, None)

    def runInThread(onExit, popenArgs, popenKWArgs):
        # -------- HANDLE ENV MERGE --------
        if "env" in popenKWArgs and popenKWArgs["env"]:
            additional_env = popenKWArgs["env"]
            process_env = os.environ.copy()
            process_env.update(additional_env)
            popenKWArgs = {k: v for k, v in popenKWArgs.items() if k != "env"}
            popenKWArgs["env"] = process_env
        elif "env" in popenKWArgs:
            popenKWArgs = {k: v for k, v in popenKWArgs.items() if k != "env"}

        # -------- OUTPUT FILE SETUP --------
        if output_file is not None:
            # For subprocess, we need a regular file handle (not async)
            # Write header using async storage, then open regular file for subprocess
            current_time = time.strftime("%Y-%m-%d %H:%M:%S")

            async def _write_header():
                async with await storage.open(output_file, "a") as f:
                    await f.write(f"\n\n-- RUN {current_time} --\n")
                    await f.flush()

            asyncio.run(_write_header())

            # Open regular file handle for subprocess
            log = open(output_file, "a")
        else:
            log = subprocess.PIPE

        # -------- REMOVE IO AGAIN (SAFETY) --------
        for key in ["stdin", "stdout", "stderr"]:
            popenKWArgs.pop(key, None)

        # -------- SET OUR IO --------
        popenKWArgs["stdin"] = subprocess.PIPE
        popenKWArgs["stdout"] = log
        popenKWArgs["stderr"] = log

        proc = subprocess.Popen(popenArgs, **popenKWArgs)
        proc.communicate(input=input.encode("utf-8"))
        proc.wait()

        onExit()

    # Pass copies into thread
    thread = threading.Thread(target=runInThread, args=(onExit, list(popenArgs), dict(cleanedKW)))
    thread.start()
    return thread


def slugify(value, allow_unicode=False):
    """
    Copied from https://github.com/django/django/blob/master/django/utils/text.py
    Convert to ASCII if 'allow_unicode' is False. Convert spaces or repeated
    dashes to single dashes. Remove characters that aren't alphanumerics,
    underscores, or hyphens. Convert to lowercase. Also strip leading and
    trailing whitespace, dashes, and underscores.
    """
    value = str(value)
    if allow_unicode:
        value = unicodedata.normalize("NFKC", value)
    else:
        value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[-\s]+", "-", value).strip("-_")


async def async_run_python_script_and_update_status(
    python_script: list[str], job_id: str, begin_string: str, env: dict | None = None
):
    """
    Use this script for one time, long running scripts that have a definite end. For example
    downloading a model.

    This function runs a python script and updates the status of the job in the database
    to RUNNING when the python script prints begin_string to stderr

    The FastAPI worker uses stderr, not stdout

    Args:
        python_script: List of command-line arguments for the Python script
        job_id: Job ID for status updates
        begin_string: String to look for in output to mark job as RUNNING
        env: Optional dictionary of environment variables to pass to subprocess.
             These are merged with the current environment and are process-local (won't leak to API).
    """

    print(f"Job {job_id} Running async python script: " + str(python_script))
    # Extract plugin location from the python_script list
    plugin_location = None
    if "--plugin_dir" in python_script:
        for i, arg in enumerate(python_script):
            if arg == "--plugin_dir" and i + 1 < len(python_script):
                plugin_location = python_script[i + 1]
                break

    # Check if plugin has a venv directory
    if plugin_location:
        plugin_location = os.path.normpath(plugin_location)
        from lab.dirs import get_plugin_dir

        plugin_dir_root = await get_plugin_dir()
        if not plugin_location.startswith(plugin_dir_root):
            print(f"Plugin location {plugin_location} is not in {plugin_dir_root}")
            raise Exception(f"Plugin location {plugin_location} is not in {plugin_dir_root}")
        if os.path.exists(os.path.join(plugin_location, "venv")) and os.path.isdir(
            os.path.join(plugin_location, "venv")
        ):
            venv_path = os.path.join(plugin_location, "venv")
            print(f">Plugin has virtual environment, activating venv from {venv_path}")
            venv_python = os.path.join(venv_path, "bin", "python")
            command = [venv_python, *python_script]
        else:
            print(">Using system Python interpreter")
            command = [sys.executable, *python_script]

    else:
        print(">Using system Python interpreter")
        command = [sys.executable, *python_script]  # Skip the original Python interpreter

    # Prepare environment variables for subprocess
    # Start with current environment and merge any provided env vars
    process_env = os.environ.copy()
    if env:
        process_env.update(env)

    process = await open_process(command=command, stderr=subprocess.STDOUT, stdout=subprocess.PIPE, env=process_env)

    # read stderr and print:
    if process.stdout:
        async for text in TextReceiveStream(process.stdout):
            print(">> " + text)
            if begin_string in text:
                print(f"Job {job_id} now in progress!")
                job = await job_service.job_get(job_id)
                experiment_id = job.get("experiment_id") if job else None
                await job_update_status(job_id=job_id, status="RUNNING", experiment_id=experiment_id)

            # Check the job_data column for the stop flag:
            job_row = await job_service.job_get(job_id)
            job_data = job_row.get("job_data", None)
            if job_data and job_data.get("stop", False):
                print(f"Job {job_id}: 'stop' flag detected. Cancelling job.")
                raise asyncio.CancelledError()

    try:
        await process.wait()

        if process.returncode == 0:
            print(f"Job {job_id} completed successfully")
            job = await job_service.job_get(job_id)
            experiment_id = job.get("experiment_id") if job else None
            await job_update_status(job_id=job_id, status="COMPLETE", experiment_id=experiment_id)
        else:
            print(f"ERROR: Job {job_id} failed with exit code {process.returncode}.")
            job = await job_service.job_get(job_id)
            experiment_id = job.get("experiment_id") if job else None
            await job_update_status(job_id=job_id, status="FAILED", experiment_id=experiment_id)

        return process

    except asyncio.CancelledError:
        process.kill()
        await process.wait()

        print(f"Job {job_id} cancelled.")

        raise asyncio.CancelledError()


async def read_process_output(process, job_id, log_handle=None):
    await process.wait()
    returncode = process.returncode
    if returncode == 0:
        print("Worker Process completed successfully")
    elif returncode == -15:
        print("Worker Process stopped by user")
    else:
        print(f"ERROR: Worker Process ended with exit code {returncode}.")

    # Close the log handle if one was passed (from async_run_python_daemon_and_update_status)
    if log_handle:
        try:
            await log_handle.__aexit__(None, None, None)
        except Exception:
            pass

    # Wrap log write in try-except to handle errors gracefully during shutdown
    try:
        async with await storage.open(await get_global_log_path(), "a") as log:
            await log.write(f"Inference Server Terminated with {returncode}.\n")
            await log.flush()
    except Exception:
        # Silently ignore logging errors during shutdown to prevent error bursts
        pass
    # so we should delete the pid file:
    from lab.dirs import get_temp_dir

    pid_file = storage.join(await get_temp_dir(), f"worker_job_{job_id}.pid")
    if await storage.exists(pid_file):
        await storage.rm(pid_file)
    # Clean up resources after process ends
    clear_vram_and_kill_sglang()


async def async_run_python_daemon_and_update_status(
    python_script: list[str], job_id: str, begin_string: str, set_process_id_function=None, env: dict | None = None
):
    """Use this function for daemon processes, for example setting up a model for inference.
    This function is helpful when the start of the daemon process takes a while. So you can
    wait for "begin_string" to be mentioned in stderr in order to let the caller know that
    the daemon is ready to accept input.

    This function runs a python script and updates the status of the job in the database
    to RUNNING when the python script prints begin_string to stderr

    The FastAPI worker uses stderr, not stdout

    Args:
        python_script: List of command-line arguments for the Python script
        job_id: Job ID for status updates
        begin_string: String to look for in output to mark job as RUNNING
        set_process_id_function: Optional function to set process ID
        env: Optional dictionary of environment variables to pass to subprocess.
             These are merged with the current environment and are process-local (won't leak to API).
    """

    print("🏃‍♂️ Running python script: " + str(python_script))

    # Extract plugin location from the python_script list
    plugin_location = None
    for i, arg in enumerate(python_script):
        if arg == "--plugin_dir" and i + 1 < len(python_script):
            plugin_location = python_script[i + 1]
            break

    # Open a file to write the output to:
    # Use context manager to ensure proper cleanup, but we need to keep it open
    # so we'll use a different approach - manually enter the context manager
    log = None
    log_cm = None
    try:
        log_cm = await storage.open(await get_global_log_path(), "a")
        log = await log_cm.__aenter__()

        # Check if plugin has a venv directory
        if plugin_location:
            plugin_location = os.path.normpath(plugin_location)
            from lab.dirs import get_plugin_dir

            plugin_dir_root = await get_plugin_dir()
            if not plugin_location.startswith(plugin_dir_root):
                print(f"Plugin location {plugin_location} is not in {plugin_dir_root}")
                raise Exception(f"Plugin location {plugin_location} is not in {plugin_dir_root}")
            if os.path.exists(os.path.join(plugin_location, "venv")) and os.path.isdir(
                os.path.join(plugin_location, "venv")
            ):
                venv_path = os.path.join(plugin_location, "venv")
                print(f">Plugin has virtual environment, activating venv from {venv_path}")
                venv_python = os.path.join(venv_path, "bin", "python")
                command = [venv_python, *python_script]
            else:
                print(">Using system Python interpreter")
                command = [sys.executable, *python_script]

        else:
            print(">Using system Python interpreter")
            command = [sys.executable, *python_script]  # Skip the original Python interpreter

        # Prepare environment variables for subprocess
        # Start with current environment and merge any provided env vars
        process_env = os.environ.copy()
        if env:
            process_env.update(env)

        process = await asyncio.create_subprocess_exec(
            *command, stdin=None, stderr=subprocess.STDOUT, stdout=subprocess.PIPE, env=process_env
        )

        pid = process.pid
        from lab.dirs import get_temp_dir

        pid_file = storage.join(await get_temp_dir(), f"worker_job_{job_id}.pid")
        async with await storage.open(pid_file, "w") as f:
            await f.write(str(pid))

        # keep a tail of recent lines so we can show them on failure:
        recent_lines = deque(maxlen=10)

        line = await process.stdout.readline()
        error_msg = None
        while line:
            decoded = line.decode()
            recent_lines.append(decoded.strip())

            # If we hit the begin_string then the daemon is started and we can return!
            if begin_string in decoded:
                if set_process_id_function is not None:
                    if set_process_id_function:
                        set_process_id_function(process)
                print(f"Worker job {job_id} started successfully")
                job = await job_service.job_get(job_id)
                experiment_id = job.get("experiment_id") if job else None
                await job_update_status(job_id=job_id, status="COMPLETE", experiment_id=experiment_id)

                # Schedule the read_process_output coroutine in the current event
                # so we can keep watching this process, but return back to the caller
                # so that the REST call can complete
                # Pass the log context manager to read_process_output so it can close it
                # Set log_cm to None so the finally block doesn't close it
                log_handle_to_pass = log_cm
                log_cm = None
                log = None
                asyncio.create_task(read_process_output(process, job_id, log_handle_to_pass))

                return process

            # Watch the output for any errors and store the latest error
            elif ("stderr" in decoded) and ("ERROR" in decoded):
                error_msg = decoded.split("| ")[-1]

            # Wrap log write in try-except to handle errors gracefully during shutdown
            if log:
                try:
                    await log.write(decoded)
                    await log.flush()
                except Exception:
                    # Silently ignore logging errors during shutdown
                    pass
            line = await process.stdout.readline()
    finally:
        # Ensure log file is closed even if there's an error
        if log_cm:
            try:
                await log_cm.__aexit__(None, None, None)
            except Exception:
                pass

    # If we're here then stdout didn't return and we didn't start the daemon
    # Wait on the process and return the error
    await process.wait()
    returncode = process.returncode
    if not error_msg:
        tail = "\n".join(recent_lines) if recent_lines else ""
        error_msg = f"Process terminated prematurely with exit code {returncode}."
        if tail:
            error_msg = f"{error_msg} \nError:\n{tail}"

    print(f"ERROR: Worker job {job_id} failed with exit code {returncode}.")
    print(error_msg)
    job = await job_service.job_get(job_id)
    experiment_id = job.get("experiment_id") if job else None
    await job_update_status(job_id=job_id, status="FAILED", error_msg=error_msg, experiment_id=experiment_id)
    return process


async def _get_org_id_for_subprocess():
    """
    Helper function to get organization_id from various contexts.
    Tries request context first, then lab SDK context.
    Returns None if not found in any context.
    """
    # get from lab dirs workspace path
    from lab.dirs import get_workspace_dir

    workspace_dir = await get_workspace_dir()
    if "/orgs/" in workspace_dir:
        return workspace_dir.split("/orgs/")[-1].split("/")[0]

    return None


def _get_user_id_for_subprocess(job_details: dict = None):
    """
    Helper function to get user_id from job_details if available.
    Checks job_data for user_id or user_info.
    Returns None if not found.
    """
    if not job_details:
        return None

    # Try to get user_id directly from job_data
    job_data = job_details.get("job_data", {})
    if isinstance(job_data, str):
        try:
            import json

            job_data = json.loads(job_data)
        except Exception:
            job_data = {}

    # Check for user_id in job_data
    if isinstance(job_data, dict):
        # Some jobs store user_id directly
        if "user_id" in job_data:
            return job_data["user_id"]
        # Some jobs store user_info with email, we'd need to look up user_id
        # For now, we'll just return None if user_id isn't directly available
        # This can be enhanced later to look up user_id from email if needed

    return None


async def _launch_plugin_job_via_local_provider(
    job_id: str,
    experiment_name: str,
    plugin_name: str,
    plugin_location: str,
    command_args: list[str],
    org_id: str | None,
    user_id: str | None,
    job_type: str = "plugin",
) -> dict[str, Any]:
    """
    Helper to launch a plugin job via LocalProvider using ClusterConfig.

    This function handles plugin setup (setup.sh, pyproject.toml, requirements.txt)
    and ensures plugin dependencies are installed in the job's venv before running.

    Args:
        job_id: Job ID
        experiment_name: Experiment name/ID
        plugin_name: Plugin name
        plugin_location: Path to plugin directory
        command_args: List of command-line arguments to pass to plugin's main.py
        org_id: Organization ID (optional)
        user_id: User ID (optional)
        job_type: Job type label for logging (e.g., "EVAL", "GENERATE", "LoRA")

    Returns:
        Result dict from LocalProvider.launch_cluster, or error dict on failure.
    """
    import shlex

    # Get job directory for LocalProvider
    job_dir = await get_local_provider_job_dir(job_id, experiment_name)
    await storage.makedirs(job_dir, exist_ok=True)

    # Build setup script for plugin dependencies
    setup_commands = []

    # Check for plugin setup.sh (from index.json or directly)
    setup_script_path = None
    index_json_path = os.path.join(plugin_location, "index.json")
    if os.path.exists(index_json_path):
        try:
            with open(index_json_path, "r") as f:
                index_data = json.load(f)
            setup_script_name = index_data.get("setup-script", "setup.sh")
            setup_script_path = os.path.join(plugin_location, setup_script_name)
        except Exception as e:
            print(f"[{job_type}] Warning: Could not read plugin index.json: {e}")

    # Fallback to setup.sh if index.json doesn't specify
    if not setup_script_path or not os.path.exists(setup_script_path):
        setup_script_path = os.path.join(plugin_location, "setup.sh")

    if os.path.exists(setup_script_path):
        # Normalize line endings (CRLF -> LF) like the plugin installer does
        try:
            with open(setup_script_path, "rb") as f:
                data = f.read()
            if b"\r" in data:
                normalized = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
                with open(setup_script_path, "wb") as f:
                    f.write(normalized)
                # Ensure executable
                try:
                    os.chmod(setup_script_path, os.stat(setup_script_path).st_mode | 0o111)
                except Exception:
                    pass
        except Exception as e:
            print(f"[{job_type}] Warning: Could not normalize setup.sh line endings: {e}")

        # Run setup.sh from plugin directory (use script name, not full path, since we cd there)
        # LocalProvider sets PATH to include venv/bin, so uv/pip will use the venv
        setup_script_name = os.path.basename(setup_script_path)
        escaped_setup_script_name = shlex.quote(setup_script_name)
        escaped_plugin_dir = shlex.quote(plugin_location)
        setup_commands.append(f"cd {escaped_plugin_dir} && bash {escaped_setup_script_name}")

    # Also check for pyproject.toml or requirements.txt (only if no setup.sh found)
    if not setup_commands:
        pyproject_path = os.path.join(plugin_location, "pyproject.toml")
        requirements_path = os.path.join(plugin_location, "requirements.txt")

        escaped_plugin_dir = shlex.quote(plugin_location)
        if os.path.exists(pyproject_path):
            # Install in editable mode from plugin directory
            setup_commands.append(f"cd {escaped_plugin_dir} && uv pip install -e .")
        elif os.path.exists(requirements_path):
            # Install from requirements.txt in plugin directory
            setup_commands.append(f"cd {escaped_plugin_dir} && uv pip install -r requirements.txt")

    setup_script = " && ".join(setup_commands) if setup_commands else None

    # Build command: cd to plugin_dir and run main.py with args
    escaped_plugin_dir = shlex.quote(plugin_location)
    escaped_args = " ".join(shlex.quote(str(arg)) for arg in command_args)
    command = f"cd {escaped_plugin_dir} && python main.py {escaped_args}"

    # Build env vars with secrets
    env_vars = await _build_plugin_job_env_vars(org_id, user_id, job_id, experiment_name)

    # Build ClusterConfig
    cluster_config = ClusterConfig(
        cluster_name=job_id,
        provider_name="local",
        command=command,
        setup=setup_script,
        env_vars=env_vars,
        provider_config={"workspace_dir": job_dir},
    )

    # Launch via LocalProvider
    print(f"[{job_type}] Launching via LocalProvider: {command}")
    try:
        provider = LocalProvider()
        result = provider.launch_cluster(job_id, cluster_config)
        print(f"[{job_type}] Job {job_id} launched: {result}")
        return {"status": "running", "job_id": job_id, "result": result}
    except Exception as e:
        await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
        print(f"[{job_type}] Job {job_id} launch error: {e}")
        import traceback

        traceback.print_exc()
        return {"status": "error", "job_id": job_id, "message": str(e)}


async def _build_plugin_job_env_vars(
    org_id: str | None, user_id: str | None, job_id: str, experiment_name: str
) -> dict[str, str]:
    """
    Build environment variables for a plugin job, including:
    - TransformerLab context (_TFL_JOB_ID, _TFL_EXPERIMENT_ID, _TFL_ORG_ID, _TFL_USER_ID, _TFL_SOURCE_CODE_DIR)
    - Provider/API secrets (HF_TOKEN, WANDB_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)

    Args:
        org_id: Organization/team ID
        user_id: User ID (optional)
        job_id: Job ID
        experiment_name: Experiment name/ID

    Returns:
        Dictionary of environment variable names to values.
    """
    env_vars: dict[str, str] = {}

    # TransformerLab context
    env_vars["_TFL_JOB_ID"] = str(job_id)
    env_vars["_TFL_EXPERIMENT_ID"] = str(experiment_name)
    if org_id:
        env_vars["_TFL_ORG_ID"] = str(org_id)
    if user_id:
        env_vars["_TFL_USER_ID"] = str(user_id)

    # Set _TFL_SOURCE_CODE_DIR to the api directory (where pyproject.toml lives)
    # This is needed for LocalProvider to sync the venv
    source_code_dir = os.environ.get("_TFL_SOURCE_CODE_DIR") or dirs.TFL_SOURCE_CODE_DIR
    env_vars["_TFL_SOURCE_CODE_DIR"] = source_code_dir

    # Load secrets from team/user secrets files
    secrets = await load_team_secrets(user_id=user_id)

    # Map secret names to environment variable names (matching what plugin_harness used to do)
    secret_to_env_map = {
        "HuggingfaceUserAccessToken": "HF_TOKEN",
        "WANDB_API_KEY": "WANDB_API_KEY",
        "OPENAI_API_KEY": "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY": "ANTHROPIC_API_KEY",
        "CUSTOM_MODEL_API_KEY": "CUSTOM_MODEL_API_KEY",
        "AZURE_OPENAI_DETAILS": "AZURE_OPENAI_DETAILS",
    }

    for secret_name, env_var_name in secret_to_env_map.items():
        if secret_name in secrets and secrets[secret_name]:
            env_vars[env_var_name] = str(secrets[secret_name])

    return env_vars


async def run_job(job_id: str, job_config, experiment_name: str = "default", job_details: dict = None):
    # This runs a specified job number defined
    # by template_id
    print("Running job: " + str(job_id))

    print("Job Config: " + str(job_config))
    print("Job Details: " + str(job_details))
    master_job_type = job_details["type"]
    print(master_job_type)

    # Get organization_id and user_id for passing to plugin jobs
    org_id = await _get_org_id_for_subprocess()
    # user_id will be extracted per-job-type as needed

    # Handle TASK jobs separately - they are simple and don't need the common setup
    if master_job_type == "TASK":
        """we define a TASK job as a job where we just ask
        the worker to run the related python script, passing in the parameters
        that are defined in job_config"""
        # plugin = job_config["plugin"]
        # update task to be marked as COMPLETE:
        await job_update_status(job_id, "COMPLETE", experiment_id=experiment_name)
        # implement rest later
        return {"status": "complete", "job_id": job_id, "message": "Task job completed successfully"}

    # Common setup using SDK classes
    job_obj = await Job.get(job_id)
    exp_obj = await Experiment.create_or_get(experiment_name)
    output_temp_file_dir = await job_obj.get_dir()

    experiment_details = await experiment_get(experiment_name)

    # Extract plugin name consistently across all job types
    plugin_name = None
    if master_job_type in ["EVAL", "GENERATE", "DIFFUSION"]:
        plugin_name = job_config["plugin"]
    else:
        # For other job types (LoRA, pretraining, embedding, export), get from nested config
        template_config = job_config["config"]
        plugin_name = str(template_config["plugin_name"])

    # Common plugin location check for job types that use plugins
    if plugin_name:
        plugin_location = await lab_dirs.plugin_dir_by_name(plugin_name)
        if not os.path.exists(plugin_location):
            await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
            error_msg = f"{master_job_type} job failed: No plugin found"
            return {"status": "error", "job_id": job_id, "message": error_msg}

    # Handle different master job types
    if master_job_type == "EVAL":
        eval_name = job_config.get("evaluator", "")
        await job_update_status(job_id, "RUNNING", experiment_id=experiment_name)
        print("Running evaluation script")

        # Get eval_config from job_data
        job_row = await job_service.job_get(job_id)
        job_data_raw = job_row.get("job_data", {}) if job_row else {}
        if isinstance(job_data_raw, str):
            try:
                job_data = json.loads(job_data_raw)
            except Exception:
                job_data = {}
        else:
            job_data = job_data_raw

        eval_config = job_data.get("config", {})
        template_config = eval_config.get("script_parameters", {})

        # Extract model info from experiment_details
        exp_config = (
            experiment_details["config"]
            if isinstance(experiment_details["config"], dict)
            else json.loads(experiment_details["config"] or "{}")
        )

        model_name = exp_config.get("foundation", "")
        if "model_name" in eval_config:
            model_name = eval_config["model_name"]

        model_file_path = exp_config.get("foundation_filename", "") or ""
        model_type = exp_config.get("foundation_model_architecture", "")
        if "model_architecture" in eval_config:
            model_type = eval_config["model_architecture"]

        model_adapter = exp_config.get("model_adapter", "")
        if "model_adapter" in eval_config:
            model_adapter = eval_config["model_adapter"]

        # Create input file
        from lab.dirs import get_temp_dir

        temp_dir = await get_temp_dir()
        input_file = storage.join(temp_dir, f"plugin_input_{secure_filename(str(plugin_name))}.json")

        # Normalize experiment_details config for input file
        exp_details_for_input = dict(experiment_details)
        if "config" in exp_details_for_input:
            exp_details_for_input["config"] = (
                exp_details_for_input["config"]
                if isinstance(exp_details_for_input["config"], dict)
                else json.loads(exp_details_for_input["config"] or "{}")
            )
            if "inferenceParams" in exp_details_for_input["config"]:
                if isinstance(exp_details_for_input["config"]["inferenceParams"], str):
                    exp_details_for_input["config"]["inferenceParams"] = json.loads(
                        exp_details_for_input["config"]["inferenceParams"]
                    )
            if "evaluations" in exp_details_for_input["config"]:
                if isinstance(exp_details_for_input["config"]["evaluations"], str):
                    exp_details_for_input["config"]["evaluations"] = json.loads(
                        exp_details_for_input["config"]["evaluations"]
                    )

        input_contents = {"experiment": exp_details_for_input, "config": template_config}
        async with await storage.open(input_file, "w") as outfile:
            await outfile.write(json.dumps(input_contents, indent=4))

        # Build command args (without --plugin_dir since we'll cd into plugin_dir)
        command_args = []
        for key in template_config:
            command_args.append(f"--{key}")
            if isinstance(template_config[key], list):
                command_args.append(json.dumps(template_config[key]))
            else:
                command_args.append(str(template_config[key]))

        command_args.extend(
            [
                "--experiment_name",
                experiment_name,
                "--eval_name",
                eval_name,
                "--input_file",
                input_file,
                "--model_name",
                model_name,
                "--model_path",
                model_file_path,
                "--model_architecture",
                model_type,
                "--model_adapter",
                model_adapter,
                "--job_id",
                str(job_id),
            ]
        )

        # Launch via LocalProvider
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        result = await _launch_plugin_job_via_local_provider(
            job_id=job_id,
            experiment_name=experiment_name,
            plugin_name=plugin_name,
            plugin_location=plugin_location,
            command_args=command_args,
            org_id=org_id,
            user_id=user_id_from_job,
            job_type="EVAL",
        )

        if result.get("status") == "error":
            return {
                "status": "error",
                "job_id": job_id,
                "message": result.get("message", "Evaluation job launch failed"),
            }

        # Note: Job status will be updated by polling the process status (handled elsewhere).
        # The old synchronous status checking logic is replaced by async status polling.
        return {"status": "running", "job_id": job_id, "message": "Evaluation job launched successfully"}

    elif master_job_type == "GENERATE":
        generation_name = job_config.get("generator", "")
        await job_update_status(job_id, "RUNNING", experiment_id=experiment_name)
        print("Running generation script")

        # Get generation_config from job_data
        job_row = await job_service.job_get(job_id)
        job_data_raw = job_row.get("job_data", {}) if job_row else {}
        if isinstance(job_data_raw, str):
            try:
                job_data = json.loads(job_data_raw)
            except Exception:
                job_data = {}
        else:
            job_data = job_data_raw

        generation_config = job_data.get("config", {})
        template_config = generation_config.get("script_parameters", {})

        # Extract model info from experiment_details
        exp_config = (
            experiment_details["config"]
            if isinstance(experiment_details["config"], dict)
            else json.loads(experiment_details["config"] or "{}")
        )

        model_name = exp_config.get("foundation", "")
        if "model_name" in generation_config:
            model_name = generation_config["model_name"]

        model_file_path = exp_config.get("foundation_filename", "") or ""
        model_type = exp_config.get("foundation_model_architecture", "")
        if "model_architecture" in generation_config:
            model_type = generation_config["model_architecture"]

        model_adapter = exp_config.get("model_adapter", "")
        if "model_adapter" in generation_config:
            model_adapter = generation_config["model_adapter"]

        # Create input file
        from lab.dirs import get_temp_dir

        temp_dir = await get_temp_dir()
        input_file = storage.join(temp_dir, f"plugin_input_{secure_filename(str(plugin_name))}.json")

        # Normalize experiment_details config for input file
        exp_details_for_input = dict(experiment_details)
        if "config" in exp_details_for_input:
            exp_details_for_input["config"] = (
                exp_details_for_input["config"]
                if isinstance(exp_details_for_input["config"], dict)
                else json.loads(exp_details_for_input["config"] or "{}")
            )
            if "inferenceParams" in exp_details_for_input["config"]:
                if isinstance(exp_details_for_input["config"]["inferenceParams"], str):
                    exp_details_for_input["config"]["inferenceParams"] = json.loads(
                        exp_details_for_input["config"]["inferenceParams"]
                    )

        input_contents = {"experiment": exp_details_for_input, "config": template_config}
        async with await storage.open(input_file, "w") as outfile:
            await outfile.write(json.dumps(input_contents, indent=4))

        # Build command args (without --plugin_dir since we'll cd into plugin_dir)
        command_args = []
        for key in template_config:
            command_args.append(f"--{key}")
            if isinstance(template_config[key], list):
                command_args.append(json.dumps(template_config[key]))
            else:
                command_args.append(str(template_config[key]))

        command_args.extend(
            [
                "--experiment_name",
                experiment_name,
                "--generation_name",
                generation_name,
                "--input_file",
                input_file,
                "--model_name",
                model_name,
                "--model_path",
                model_file_path,
                "--model_architecture",
                model_type,
                "--model_adapter",
                model_adapter,
                "--job_id",
                str(job_id),
            ]
        )

        # Launch via LocalProvider
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        result = await _launch_plugin_job_via_local_provider(
            job_id=job_id,
            experiment_name=experiment_name,
            plugin_name=plugin_name,
            plugin_location=plugin_location,
            command_args=command_args,
            org_id=org_id,
            user_id=user_id_from_job,
            job_type="GENERATE",
        )

        if result.get("status") == "error":
            return {
                "status": "error",
                "job_id": job_id,
                "message": result.get("message", "Generation job launch failed"),
            }

        # Note: Job status will be updated by polling the process status (handled elsewhere).
        # The old synchronous status checking logic is replaced by async status polling.
        return {"status": "running", "job_id": job_id, "message": "Generation job launched successfully"}

    elif master_job_type == "EXPORT":
        await job_update_status(job_id, "RUNNING", experiment_id=experiment_name)
        print("Running export script")

        config = job_config["config"]
        # Determine plugin architecture from plugin name
        if "gguf" in plugin_name.lower():
            plugin_architecture = "GGUF"
        elif "mlx" in plugin_name.lower():
            plugin_architecture = "MLX"
        elif "llamafile" in plugin_name.lower():
            plugin_architecture = "LLAMAFILE"
        else:
            plugin_architecture = "OTHER"

        params = config.get("params", {})

        # Extract model info from experiment_details
        exp_config = (
            experiment_details["config"]
            if isinstance(experiment_details["config"], dict)
            else json.loads(experiment_details["config"] or "{}")
        )

        input_model_id = exp_config.get("foundation", "")
        input_model_id_without_author = input_model_id.split("/")[-1] if "/" in input_model_id else input_model_id
        input_model_architecture = exp_config.get("foundation_model_architecture", "")
        input_model_path = exp_config.get("foundation_filename", "") or input_model_id

        # Generate output model details
        import time

        conversion_time = int(time.time())
        output_model_architecture = plugin_architecture
        q_type = params.get("outtype", "") or (str(params["q_bits"]) + "bit" if params.get("q_bits") else "")

        if output_model_architecture == "GGUF":
            output_model_id = f"{input_model_id_without_author}-{conversion_time}.gguf"
            if q_type:
                output_model_id = f"{input_model_id_without_author}-{conversion_time}-{q_type}.gguf"
        else:
            output_model_id = f"{output_model_architecture}-{input_model_id_without_author}-{conversion_time}"
            if q_type:
                output_model_id = f"{output_model_id}-{q_type}"

        output_model_id = secure_filename(output_model_id)

        from lab.dirs import get_models_dir

        models_dir = await get_models_dir()
        output_path = storage.join(models_dir, output_model_id)

        # Build command args (without --plugin_dir since we'll cd into plugin_dir)
        command_args = [
            "--job_id",
            str(job_id),
            "--model_name",
            input_model_id,
            "--model_path",
            input_model_path,
            "--model_architecture",
            input_model_architecture,
            "--output_dir",
            output_path,
            "--output_model_id",
            output_model_id,
        ]

        # Add plugin-specific parameters
        for key in params:
            command_args.append(f"--{key}")
            command_args.append(str(params[key]))

        # Launch via LocalProvider
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        result = await _launch_plugin_job_via_local_provider(
            job_id=job_id,
            experiment_name=experiment_name,
            plugin_name=plugin_name,
            plugin_location=plugin_location,
            command_args=command_args,
            org_id=org_id,
            user_id=user_id_from_job,
            job_type="EXPORT",
        )

        if result.get("status") == "error":
            return {"status": "error", "job_id": job_id, "message": result.get("message", "Export job launch failed")}

        # Note: Job status will be updated by polling the process status (handled elsewhere).
        return {"status": "running", "job_id": job_id, "message": "Export job launched successfully"}

    elif master_job_type == "DIFFUSION":
        plugin_name = job_config["plugin"]

        await job_service.job_update_status(job_id, "RUNNING", experiment_id=experiment_name)

        # Use existing job object and output directory
        plugin_dir = await lab_dirs.plugin_dir_by_name(plugin_name)

        # Flatten job_config["config"] into CLI args
        config = job_config.get("config", {})

        # Convert base64 images to files and update config
        base64_fields = {
            "input_image": "input_image_path",
            "mask_image": "mask_image_path",
        }

        # Track which base64 fields were removed
        removed_base64_keys = []
        for base64_key, file_arg in base64_fields.items():
            if base64_key in config and config[base64_key]:
                try:
                    import base64

                    decoded = base64.b64decode(config[base64_key])
                    file_path = storage.join(output_temp_file_dir, f"{file_arg}.png")
                    async with await storage.open(file_path, "wb") as f:
                        await f.write(decoded)

                    config[file_arg] = file_path
                    del config[base64_key]
                    removed_base64_keys.append(base64_key)

                except Exception as e:
                    print(f"[DIFFUSION] Failed to decode or write {base64_key}: {e}")

        # Remove input_image and mask_image from job_data['config'] in db if they were present
        if removed_base64_keys:
            job_row = await job_service.job_get(job_id)
            job_data = job_row.get("job_data", {}) if job_row else {}
            # Handle job_data as str or dict
            if isinstance(job_data, str):
                try:
                    job_data = json.loads(job_data)
                except Exception as e:
                    print(f"[DIFFUSION] Could not decode job_data: {e}")
                    job_data = {}
            config_in_db = job_data.get("config", {})
            double_encoded = False
            # Handle config_in_db as str or dict
            if isinstance(config_in_db, str):
                try:
                    config_in_db = json.loads(config_in_db)
                    # Handle double encoded json
                    if isinstance(config_in_db, str):
                        config_in_db = json.loads(config_in_db)
                        double_encoded = True

                except Exception as e:
                    print(f"[DIFFUSION] Could not decode config from job_data: {e}")
                    config_in_db = {}

            if not isinstance(config_in_db, dict):
                config_in_db = {}
            updated = False
            for key in removed_base64_keys:
                if key in config_in_db:
                    print("Deleting key from config_in_db:", key)
                    del config_in_db[key]
                    updated = True
            if updated:
                if double_encoded:
                    config_in_db = json.dumps(config_in_db)
                await job_service.job_update_job_data_insert_key_value(
                    job_id, "config", config_in_db, experiment_id=experiment_name
                )

        # Now safely convert remaining config to CLI args
        config_args = []
        for k, v in config.items():
            if k != "plugin":
                config_args.append(f"--{k}")
                config_args.append(str(v))

        # Build command: cd to plugin_dir and run main.py directly
        # Note: plugins should use lab.init() to set org context instead of relying on plugin_harness
        all_args = config_args + [
            "--job_id",
            str(job_id),
            "--experiment_name",
            experiment_name,
            "--run_name",
            job_config.get("run_name", "diffused"),
        ]
        # Escape plugin_dir and args for shell
        import shlex

        escaped_plugin_dir = shlex.quote(plugin_dir)
        escaped_args = " ".join(shlex.quote(str(arg)) for arg in all_args)
        command = f"cd {escaped_plugin_dir} && python main.py {escaped_args}"

        # Get job directory for LocalProvider
        job_dir = await get_local_provider_job_dir(job_id, experiment_name)
        await storage.makedirs(job_dir, exist_ok=True)

        # Build env vars with secrets
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

        # Build ClusterConfig
        cluster_config = ClusterConfig(
            cluster_name=job_id,
            provider_name="local",
            command=command,
            env_vars=env_vars,
            provider_config={"workspace_dir": job_dir},
        )

        # Launch via LocalProvider
        print(f"[DIFFUSION] Launching via LocalProvider: {command}")
        try:
            provider = LocalProvider()
            result = provider.launch_cluster(job_id, cluster_config)
            print(f"[DIFFUSION] Job {job_id} launched: {result}")
            # Note: LocalProvider.launch_cluster returns immediately. Job status will be updated
            # by polling the process status (handled elsewhere in the codebase).
            return {
                "status": "running",
                "job_id": job_id,
                "message": "Diffusion job launched successfully",
            }
        except Exception as e:
            await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
            print(f"[DIFFUSION] Job {job_id} launch error: {e}")
            import traceback

            traceback.print_exc()
            return {"status": "error", "job_id": job_id, "message": f"Diffusion job launch failed: {e}"}

    job_type = job_config["config"].get("type", "")

    # Use experiment details and SDK objects for path management
    print("Experiment Details: ", experiment_details)
    experiment_dir = await exp_obj.get_dir()

    # Use Job SDK for output file path
    output_file = await job_obj.get_log_path()

    def on_train_complete():
        print("Training Job: The process has finished")
        # Safely mark COMPLETE only if still RUNNING and trigger workflows via service
        try:
            from transformerlab.services.job_service import job_mark_as_complete_if_running

            job_mark_as_complete_if_running(job_id, org_id)
        except Exception:
            print(f"Failed to mark job ${job_id} as complete.")
            pass

    def on_job_complete():
        job_update_status_sync(job_id, org_id, "COMPLETE")

    if job_type == "LoRA":
        template_config = job_config["config"]  # Get the config for this job type
        model_name = template_config["model_name"]
        model_name = secure_filename(model_name)
        adaptor_name = template_config.get("adaptor_name", "adaptor")
        template_config["job_id"] = job_id
        # Resolve org-aware workspace dir if multitenant via job_data (org_id may be persisted by caller)
        workspace_dir = await get_workspace_dir()
        template_config["adaptor_output_dir"] = storage.join(workspace_dir, "adaptors", model_name, adaptor_name)
        template_config["output_dir"] = storage.join(
            experiment_dir,
            "tensorboards",
            template_config["template_name"],
        )
        await job_update_status(job_id, "RUNNING", experiment_id=experiment_name)

        tempdir = storage.join(workspace_dir, "temp")
        if not await storage.exists(tempdir):
            await storage.makedirs(tempdir, exist_ok=True)
        # Check if hyperparameter sweep is requested
        run_sweeps = template_config.get("run_sweeps", False)
        # if run_sweeps in ["on", "true", "yes"]:
        if run_sweeps:
            print(f"Hyperparameter sweep requested for job {job_id}")

            # Get sweep configuration
            sweep_config = template_config.get("sweep_config", {})
            if isinstance(sweep_config, str):
                try:
                    sweep_config = json.loads(sweep_config)
                except json.JSONDecodeError:
                    print(f"Error decoding sweep config JSON: {sweep_config}. Using default sweep configuration.")
                    sweep_config = {
                        "learning_rate": ["1e-5", "3e-5", "5e-5"],
                        "lora_rank": ["8", "16", "32"],
                        "lora_alpha": ["16", "32", "64"],
                        "batch_size": ["4", "8"],
                    }

            if not sweep_config:
                print("No sweep configuration provided. Using default sweep parameters.")
                sweep_config = {
                    "learning_rate": ["1e-5", "3e-5", "5e-5"],
                    # "lora_rank": ["8", "16", "32"],
                    # "lora_alpha": ["16", "32", "64"],
                    # "batch_size": ["4", "8"],
                }

            print(f"Sweep configuration: {json.dumps(sweep_config, indent=2)}")

            # Create sweep directory to store results
            sweep_dir = storage.join(template_config["output_dir"], f"sweep_{job_id}")
            await storage.makedirs(sweep_dir, exist_ok=True)

            # Generate all configurations
            from itertools import product

            # Get all parameter names and their possible values
            param_names = list(sweep_config.keys())
            param_values = [sweep_config[name] for name in param_names]

            # Generate all combinations using product
            configs = []
            for values in product(*param_values):
                config = dict(zip(param_names, values))
                configs.append(config)

            total_configs = len(configs)
            print(f"Generated {total_configs} configurations for sweep")

            # Initialize sweep tracking
            await job_service.job_update_job_data_insert_key_value(
                job_id, "sweep_total", str(total_configs), experiment_name
            )
            await job_service.job_update_job_data_insert_key_value(job_id, "sweep_current", "0", experiment_name)

            # Get metrics configuration
            metric_name = template_config.get("sweep_metric", "eval/loss")
            lower_is_better = template_config.get("lower_is_better", "true").lower() in ["true", "yes", "on"]
            best_metric = float("inf") if lower_is_better else float("-inf")
            best_config = None

            # Store results for each run
            results = []

            # Run each configuration sequentially
            for i, config_params in enumerate(configs):
                print(f"\n--- Running configuration {i + 1}/{total_configs} ---")
                print(f"Parameters: {json.dumps(config_params, indent=2)}")

                # Create a unique run directory
                run_dir = storage.join(sweep_dir, f"run_{i + 1}")
                await storage.makedirs(run_dir, exist_ok=True)

                # Create a unique adaptor directory for this run
                run_adaptor_dir = storage.join(
                    workspace_dir, "adaptors", secure_filename(model_name), f"{adaptor_name}_sweep_{i + 1}"
                )
                await storage.makedirs(run_adaptor_dir, exist_ok=True)

                # Create a copy of the template config for this run
                run_config = template_config.copy()

                # Update with the specific parameter values for this run
                for param_name, param_value in config_params.items():
                    run_config[param_name] = param_value

                # Set unique directories for this run
                run_config["output_dir"] = run_dir
                run_config["adaptor_output_dir"] = run_adaptor_dir

                # Create input file for this run
                run_input_file = storage.join(tempdir, f"plugin_input_{job_id}_run_{i + 1}.json")
                run_input_contents = {"experiment": experiment_details, "config": run_config}
                async with await storage.open(run_input_file, "w") as outfile:
                    await outfile.write(json.dumps(run_input_contents, indent=4))

                # Update job progress
                await job_service.job_update_sweep_progress(job_id, int((i / total_configs) * 100), experiment_name)
                await job_service.job_update_job_data_insert_key_value(
                    job_id, "sweep_current", str(i + 1), experiment_name
                )
                await job_service.job_update_job_data_insert_key_value(
                    job_id, "sweep_running_config", json.dumps(config_params), experiment_name
                )

                # Run the training job with this configuration
                run_output_file = storage.join(sweep_dir, f"output_sweep_{job_id}.txt")
                await job_service.job_update_job_data_insert_key_value(
                    job_id, "sweep_output_file", storage.join(sweep_dir, f"output_sweep_{job_id}.txt"), experiment_name
                )

                # Build command: cd to plugin_dir and run main.py with --input_file
                # Note: For sweeps, we run sequentially and wait for each to complete
                import shlex

                escaped_plugin_dir = shlex.quote(plugin_location)
                escaped_input_file = shlex.quote(run_input_file)
                escaped_experiment_name = shlex.quote(experiment_name)
                command = f"cd {escaped_plugin_dir} && python main.py --input_file {escaped_input_file} --experiment_name {escaped_experiment_name}"

                # Get job directory for this sweep run
                sweep_job_dir = await get_local_provider_job_dir(f"{job_id}_sweep_run_{i + 1}", experiment_name)
                await storage.makedirs(sweep_job_dir, exist_ok=True)

                # Build env vars with secrets
                user_id_from_job = _get_user_id_for_subprocess(job_details)
                env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

                # Build ClusterConfig
                cluster_config = ClusterConfig(
                    cluster_name=f"{job_id}_sweep_run_{i + 1}",
                    provider_name="local",
                    command=command,
                    env_vars=env_vars,
                    provider_config={"workspace_dir": sweep_job_dir},
                )

                # Launch via LocalProvider and wait for completion
                print(f"[LoRA Sweep Run {i + 1}/{total_configs}] Launching via LocalProvider: {command}")
                try:
                    provider = LocalProvider()
                    launch_result = provider.launch_cluster(f"{job_id}_sweep_run_{i + 1}", cluster_config)
                    pid = launch_result.get("pid")

                    if pid:
                        # Wait for process to complete by polling
                        import psutil

                        try:
                            process = psutil.Process(pid)
                            # Read stdout/stderr from job directory logs
                            stdout_log = os.path.join(sweep_job_dir, "stdout.log")
                            stderr_log = os.path.join(sweep_job_dir, "stderr.log")

                            # Wait for process to complete
                            process.wait(timeout=None)  # Wait indefinitely

                            # Copy logs to sweep output file
                            if os.path.exists(stdout_log):
                                async with await storage.open(run_output_file, "a") as f:
                                    async with await storage.open(stdout_log, "r") as log:
                                        async for line in log:
                                            await f.write(f"\n[Run {i + 1}/{total_configs}]: {line}")
                            if os.path.exists(stderr_log) and os.path.getsize(stderr_log) > 0:
                                async with await storage.open(run_output_file, "a") as f:
                                    async with await storage.open(stderr_log, "r") as log:
                                        async for line in log:
                                            await f.write(f"\n[Run {i + 1}/{total_configs} ERROR]: {line}")

                            returncode = process.returncode
                        except psutil.NoSuchProcess:
                            print(f"[LoRA Sweep Run {i + 1}] Process {pid} not found")
                            returncode = -1
                        except Exception as e:
                            print(f"[LoRA Sweep Run {i + 1}] Error waiting for process: {e}")
                            returncode = -1
                    else:
                        print(f"[LoRA Sweep Run {i + 1}] No PID returned from launch")
                        returncode = -1

                    if returncode != 0:
                        print(f"[LoRA Sweep Run {i + 1}] Failed with return code {returncode}")

                except Exception as e:
                    print(f"[LoRA Sweep Run {i + 1}] Launch error: {e}")
                    import traceback

                    traceback.print_exc()
                    # Continue to next run even if this one failed

                # Delete the output adaptor directory if it exists
                if await storage.exists(run_adaptor_dir) and await storage.isdir(run_adaptor_dir):
                    print(f"Deleting adaptor directory: {run_adaptor_dir}")
                    await storage.rm_tree(run_adaptor_dir)

                # Check job data for training metrics
                try:
                    # Get latest metrics from job_data (assuming plugin saved metrics there)
                    metrics_path = storage.join(run_dir, "metrics.json")
                    if await storage.exists(metrics_path):
                        async with await storage.open(metrics_path, "r") as f:
                            run_metrics = json.loads(await f.read())
                    else:
                        # Fallback to a default metric value if no metrics found
                        run_metrics = {metric_name: 0.0}

                    # Track results
                    results.append(
                        {
                            "config": config_params,
                            "metrics": run_metrics,
                            "run_dir": run_dir,
                            "adaptor_dir": run_adaptor_dir,
                        }
                    )

                    # Check if this is the best result so far
                    if metric_name in run_metrics:
                        metric_value = run_metrics[metric_name]
                        is_better = (lower_is_better and metric_value < best_metric) or (
                            not lower_is_better and metric_value > best_metric
                        )

                        if best_config is None or is_better:
                            best_metric = metric_value
                            best_config = config_params.copy()

                            # Update job data with current best
                            await job_service.job_update_job_data_insert_key_value(
                                job_id, "sweep_best_config", json.dumps(best_config), experiment_name
                            )
                            await job_service.job_update_job_data_insert_key_value(
                                job_id, "sweep_best_metric", json.dumps({metric_name: best_metric}), experiment_name
                            )
                except Exception as e:
                    print(f"Error processing metrics for run {i + 1}: {str(e)}")
                    results.append(
                        {"config": config_params, "error": str(e), "run_dir": run_dir, "adaptor_dir": run_adaptor_dir}
                    )

            # Save all results
            sweep_results = {
                "sweep_config": sweep_config,
                "results": results,
                "best_config": best_config,
                "best_metric": {metric_name: best_metric},
                "metric_name": metric_name,
                "lower_is_better": lower_is_better,
            }

            sweep_results_file = storage.join(sweep_dir, "sweep_results.json")
            async with await storage.open(sweep_results_file, "w") as f:
                await f.write(json.dumps(sweep_results, indent=2))

            await job_service.job_update_job_data_insert_key_value(
                job_id, "sweep_results_file", sweep_results_file, experiment_name
            )

            print("\n--- Sweep completed ---")
            print(f"Best configuration: {json.dumps(best_config, indent=2)}")
            print(f"Best {metric_name}: {best_metric}")
            await job_service.job_update_sweep_progress(job_id, 100, experiment_name)

            # Optionally train final model with best configuration
            train_final_model = template_config.get("train_final_model", True)
            if train_final_model and best_config:
                print("\n--- Training final model with best configuration ---")

                # Use the original output and adaptor directories for the final model
                final_config = template_config.copy()

                # Update with best parameters
                for param_name, param_value in best_config.items():
                    final_config[param_name] = param_value

                # Create input file for final run
                final_input_file = storage.join(tempdir, f"plugin_input_{job_id}_final.json")
                final_input_contents = {"experiment": experiment_details, "config": final_config}
                async with await storage.open(final_input_file, "w") as outfile:
                    await outfile.write(json.dumps(final_input_contents, indent=4))

                # Build command for final training: cd to plugin_dir and run main.py
                import shlex

                escaped_plugin_dir = shlex.quote(plugin_location)
                escaped_final_input_file = shlex.quote(final_input_file)
                escaped_experiment_name = shlex.quote(experiment_name)
                final_command_str = f"cd {escaped_plugin_dir} && python main.py --input_file {escaped_final_input_file} --experiment_name {escaped_experiment_name}"

                # Get job directory for final training
                final_job_dir = await get_local_provider_job_dir(f"{job_id}_final", experiment_name)
                await storage.makedirs(final_job_dir, exist_ok=True)

                # Build env vars with secrets
                user_id_from_job = _get_user_id_for_subprocess(job_details)
                env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

                # Build ClusterConfig
                final_cluster_config = ClusterConfig(
                    cluster_name=f"{job_id}_final",
                    provider_name="local",
                    command=final_command_str,
                    env_vars=env_vars,
                    provider_config={"workspace_dir": final_job_dir},
                )

                # Launch via LocalProvider
                print(f"[LoRA Final Training] Launching via LocalProvider: {final_command_str}")
                try:
                    provider = LocalProvider()
                    result = provider.launch_cluster(f"{job_id}_final", final_cluster_config)
                    print(f"[LoRA Final Training] Job launched: {result}")
                    # Note: Job status will be updated by polling the process status (handled elsewhere).
                except Exception as e:
                    await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
                    print(f"[LoRA Final Training] Launch error: {e}")
                    import traceback

                    traceback.print_exc()
                return

            return

        else:
            # Create a file in the temp directory to store the inputs:
            tempdir = storage.join(workspace_dir, "temp")
            if not await storage.exists(tempdir):
                await storage.makedirs(tempdir, exist_ok=True)
            input_file = storage.join(tempdir, f"plugin_input_{job_id}.json")
            # The following two ifs convert nested JSON strings to JSON objects -- this is a hack
            # and should be done in the API itself
            if "config" in experiment_details:
                experiment_details["config"] = (
                    experiment_details["config"]
                    if isinstance(experiment_details["config"], dict)
                    else json.loads(experiment_details["config"] or "{}")
                )
                if "inferenceParams" in experiment_details["config"]:
                    experiment_details["config"]["inferenceParams"] = json.loads(
                        experiment_details["config"]["inferenceParams"]
                    )
            input_contents = {"experiment": experiment_details, "config": template_config}
            async with await storage.open(input_file, "w") as outfile:
                await outfile.write(json.dumps(input_contents, indent=4))

            start_time = time.strftime("%Y-%m-%d %H:%M:%S")
            await job_service.job_update_job_data_insert_key_value(job_id, "start_time", start_time, experiment_name)

            # Build command: cd to plugin_dir and run main.py with --input_file
            # Note: plugins should use lab.init() to set org context instead of relying on plugin_harness
            import shlex

            escaped_plugin_dir = shlex.quote(plugin_location)
            escaped_input_file = shlex.quote(input_file)
            escaped_experiment_name = shlex.quote(experiment_name)
            command = f"cd {escaped_plugin_dir} && python main.py --input_file {escaped_input_file} --experiment_name {escaped_experiment_name}"

            # Get job directory for LocalProvider
            job_dir = await get_local_provider_job_dir(job_id, experiment_name)
            await storage.makedirs(job_dir, exist_ok=True)

            # Build env vars with secrets
            user_id_from_job = _get_user_id_for_subprocess(job_details)
            env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

            # Build ClusterConfig
            cluster_config = ClusterConfig(
                cluster_name=job_id,
                provider_name="local",
                command=command,
                env_vars=env_vars,
                provider_config={"workspace_dir": job_dir},
            )

            # Launch via LocalProvider
            print(f"[LoRA] Launching via LocalProvider: {command}")
            try:
                provider = LocalProvider()
                result = provider.launch_cluster(job_id, cluster_config)
                print(f"[LoRA] Job {job_id} launched: {result}")
                # Note: Job status will be updated by polling the process status (handled elsewhere).
                # The on_train_complete callback is replaced by status polling.
            except Exception as e:
                await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
                print(f"[LoRA] Job {job_id} launch error: {e}")
                import traceback

                traceback.print_exc()
                return

    elif job_type == "pretraining":
        template_config = job_config["config"]
        template_config["job_id"] = job_id
        template_config["output_dir"] = storage.join(
            experiment_dir,
            "tensorboards",
            template_config["template_name"],
        )

        # Create a file in the temp directory to store the inputs:
        tempdir = storage.join(workspace_dir, "temp")
        if not await storage.exists(tempdir):
            await storage.makedirs(tempdir, exist_ok=True)
        input_file = storage.join(tempdir, f"plugin_input_{job_id}.json")
        # The following two ifs convert nested JSON strings to JSON objects -- this is a hack
        # and should be done in the API itself
        if "config" in experiment_details:
            experiment_details["config"] = json.loads(experiment_details["config"])
            if "inferenceParams" in experiment_details["config"]:
                experiment_details["config"]["inferenceParams"] = json.loads(
                    experiment_details["config"]["inferenceParams"]
                )
        input_contents = {"experiment": experiment_details, "config": template_config}
        async with await storage.open(input_file, "w") as outfile:
            await outfile.write(json.dumps(input_contents, indent=4))

        start_time = time.strftime("%Y-%m-%d %H:%M:%S")
        await job_service.job_update_job_data_insert_key_value(job_id, "start_time", start_time, experiment_name)

        # Build command: cd to plugin_dir and run main.py with --input_file
        import shlex

        escaped_plugin_dir = shlex.quote(plugin_location)
        escaped_input_file = shlex.quote(input_file)
        escaped_experiment_name = shlex.quote(experiment_name)
        command = f"cd {escaped_plugin_dir} && python main.py --input_file {escaped_input_file} --experiment_name {escaped_experiment_name}"

        # Get job directory for LocalProvider
        job_dir = await get_local_provider_job_dir(job_id, experiment_name)
        await storage.makedirs(job_dir, exist_ok=True)

        # Build env vars with secrets
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

        # Build ClusterConfig
        cluster_config = ClusterConfig(
            cluster_name=job_id,
            provider_name="local",
            command=command,
            env_vars=env_vars,
            provider_config={"workspace_dir": job_dir},
        )

        # Launch via LocalProvider
        print(f"[pretraining] Launching via LocalProvider: {command}")
        try:
            provider = LocalProvider()
            result = provider.launch_cluster(job_id, cluster_config)
            print(f"[pretraining] Job {job_id} launched: {result}")
            # Note: Job status will be updated by polling the process status (handled elsewhere).
            # The on_train_complete callback is replaced by status polling.
        except Exception as e:
            await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
            print(f"[pretraining] Job {job_id} launch error: {e}")
            import traceback

            traceback.print_exc()
            return

    elif job_type == "embedding":
        template_config = job_config["config"]
        template_config["job_id"] = job_id
        template_config["output_dir"] = storage.join(
            experiment_dir,
            "tensorboards",
            template_config["template_name"],
        )

        if not await storage.exists(output_file):
            async with await storage.open(output_file, "w") as f:
                await f.write("")

        # Create a file in the temp directory to store the inputs:
        tempdir = storage.join(await get_workspace_dir(), "temp")
        if not await storage.exists(tempdir):
            await storage.makedirs(tempdir, exist_ok=True)
        input_file = storage.join(tempdir, f"plugin_input_{job_id}.json")
        # The following two ifs convert nested JSON strings to JSON objects -- this is a hack
        # and should be done in the API itself
        if "config" in experiment_details:
            experiment_details["config"] = json.loads(experiment_details["config"])
            if "inferenceParams" in experiment_details["config"]:
                experiment_details["config"]["inferenceParams"] = json.loads(
                    experiment_details["config"]["inferenceParams"]
                )
        input_contents = {"experiment": experiment_details, "config": template_config}
        async with await storage.open(input_file, "w") as outfile:
            await outfile.write(json.dumps(input_contents, indent=4))

        start_time = time.strftime("%Y-%m-%d %H:%M:%S")
        await job_service.job_update_job_data_insert_key_value(job_id, "start_time", start_time, experiment_name)

        # Build command: cd to plugin_dir and run main.py with --input_file
        import shlex

        escaped_plugin_dir = shlex.quote(plugin_location)
        escaped_input_file = shlex.quote(input_file)
        escaped_experiment_name = shlex.quote(experiment_name)
        command = f"cd {escaped_plugin_dir} && python main.py --input_file {escaped_input_file} --experiment_name {escaped_experiment_name}"

        # Get job directory for LocalProvider
        job_dir = await get_local_provider_job_dir(job_id, experiment_name)
        await storage.makedirs(job_dir, exist_ok=True)

        # Build env vars with secrets
        user_id_from_job = _get_user_id_for_subprocess(job_details)
        env_vars = await _build_plugin_job_env_vars(org_id, user_id_from_job, job_id, experiment_name)

        # Build ClusterConfig
        cluster_config = ClusterConfig(
            cluster_name=job_id,
            provider_name="local",
            command=command,
            env_vars=env_vars,
            provider_config={"workspace_dir": job_dir},
        )

        # Launch via LocalProvider
        print(f"[embedding] Launching via LocalProvider: {command}")
        try:
            provider = LocalProvider()
            result = provider.launch_cluster(job_id, cluster_config)
            print(f"[embedding] Job {job_id} launched: {result}")
            # Note: Job status will be updated by polling the process status (handled elsewhere).
            # The on_train_complete callback is replaced by status polling.
        except Exception as e:
            await job_service.job_update_status(job_id, "FAILED", experiment_id=experiment_name)
            print(f"[embedding] Job {job_id} launch error: {e}")
            import traceback

            traceback.print_exc()
            return

    else:
        print("I don't know what to do with this job type: " + job_type)
        on_job_complete()

    await job_update_status(job_id, "RUNNING", experiment_id=experiment_name)
    return


async def get_job_output_file_name(job_id: str, plugin_name: str = None, experiment_name: str = None):
    try:
        job_obj = await Job.get(job_id)
        output_file = await job_obj.get_log_path()
        return output_file
    except Exception as e:
        raise e


reset = "\033[0m"


def print_in_rainbow(text):
    # Generate rainbow colors for the text
    rainbow_colors = generate_rainbow_colors(text, time_step=0.1)
    for i, line in enumerate(text.split("\n")):
        for j, char in enumerate(line):
            if char.isspace():
                print(" ", end="")
            else:
                print(rainbow_colors[i][j], end="")
                print(char, end="")
                print(reset, end="")
        print("", flush=True)


def generate_rainbow_colors(text: str, time_step: float) -> list[str]:
    """
    Generates a list of ANSI color codes for a rainbow effect.

    Args:
      text (str): The input ASCII art.
      time_step (float): A time-based value to animate the colors.

    Returns:
      list[str]: A list of ANSI color codes corresponding to the rainbow effect.
    """
    rainbow_colors = []
    lines = text.splitlines()

    # Iterate over each character in the ASCII art
    for y, line in enumerate(lines):
        line_colors = []
        for x, char in enumerate(line):
            # Skip spaces to maintain the shape of the logo
            if char.isspace():
                line_colors.append("")
                continue

            # --- Rainbow Color Calculation ---
            # We use sine waves to generate smooth, cycling RGB color values.
            frequency = 0.1
            red = int((math.sin(frequency * x + time_step) + 1) / 2 * 5)
            green = int((math.sin(frequency * x + time_step + 2 * math.pi / 3) + 1) / 2 * 5)
            blue = int((math.sin(frequency * x + time_step + 4 * math.pi / 3) + 1) / 2 * 5)

            # Calculate the ANSI color code (216-color cube: 16 + 36*r + 6*g + b)
            ansi_color_code = 16 + 36 * red + 6 * green + blue
            line_colors.append(f"\033[38;5;{ansi_color_code}m")

        rainbow_colors.append(line_colors)

    return rainbow_colors


def kill_sglang_subprocesses():
    current_pid = os.getpid()
    for proc in psutil.process_iter(attrs=["pid", "name", "cmdline"]):
        try:
            if proc.pid == current_pid:
                continue  # Skip self

            cmdline_list = proc.info.get("cmdline")
            if not cmdline_list:  # Handles None or empty list
                continue

            cmdline = " ".join(cmdline_list)
            if "sglang" in cmdline or "sglang::scheduler" in cmdline:
                proc.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue


def clear_vram_and_kill_sglang():
    kill_sglang_subprocesses()
    """Clean up pipeline to free VRAM"""
    try:
        import gc
        import torch

        # Force garbage collection multiple times
        gc.collect()
        gc.collect()  # Second call often helps

        if torch.cuda.is_available():
            # Clear CUDA cache and synchronize multiple times for better cleanup
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            torch.cuda.ipc_collect()  # Clean up inter-process communication
            torch.cuda.empty_cache()  # Second empty_cache call

    except Exception as e:
        print(f"Error clearing torch cache: {e}")
