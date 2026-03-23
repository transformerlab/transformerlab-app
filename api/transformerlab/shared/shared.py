import asyncio
import os
import re
import subprocess
import sys
import threading
import time
import unicodedata
import math

from anyio import open_process
from anyio.streams.text import TextReceiveStream

from transformerlab.services.job_service import job_update_status
import transformerlab.services.job_service as job_service
from lab import Job
from lab import storage
from lab.job_status import JobStatus


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

    experiment_id = process_env.get("_TFL_EXPERIMENT_ID")
    process = await open_process(command=command, stderr=subprocess.STDOUT, stdout=subprocess.PIPE, env=process_env)

    # read stderr and print:
    if process.stdout:
        async for text in TextReceiveStream(process.stdout):
            print(">> " + text)
            if begin_string in text:
                print(f"Job {job_id} now in progress!")
                await job_update_status(job_id=job_id, status=JobStatus.RUNNING, experiment_id=experiment_id)

            # Check the job_data column for the stop flag:
            job_row = await job_service.job_get(job_id, experiment_id=experiment_id) if experiment_id else None
            job_data = job_row.get("job_data", None) if job_row else None
            if job_data and job_data.get("stop", False):
                print(f"Job {job_id}: 'stop' flag detected. Cancelling job.")
                raise asyncio.CancelledError()

    try:
        await process.wait()

        if process.returncode == 0:
            print(f"Job {job_id} completed successfully")
            await job_update_status(job_id=job_id, status=JobStatus.COMPLETE, experiment_id=experiment_id)
        else:
            print(f"ERROR: Job {job_id} failed with exit code {process.returncode}.")
            await job_update_status(job_id=job_id, status=JobStatus.FAILED, experiment_id=experiment_id)

        return process

    except asyncio.CancelledError:
        process.kill()
        await process.wait()

        print(f"Job {job_id} cancelled.")

        raise asyncio.CancelledError()


async def get_job_output_file_name(job_id: str, plugin_name: str = None, experiment_name: str = None):
    try:
        experiment_id = experiment_name or os.environ.get("_TFL_EXPERIMENT_ID")

        if not experiment_id:
            raise FileNotFoundError(f"Job '{job_id}' not found in any experiment directory")

        job_obj = await Job.get(job_id, experiment_id)
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
