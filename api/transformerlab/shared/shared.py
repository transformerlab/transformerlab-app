import asyncio
import os
import re
import subprocess
import threading
import time
import unicodedata
import math

from lab import Job
from lab import storage


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
