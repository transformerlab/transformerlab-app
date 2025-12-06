import argparse
import json
import os
import shutil
import signal
import site
import subprocess
import sys
import threading

import psutil
import torch

shutdown_event = threading.Event()

try:
    from transformerlab.plugin import get_python_executable, register_process
except ImportError:
    from transformerlab.plugin_sdk.transformerlab.plugin import (
        get_python_executable,
        register_process,
    )


def kill_sglang_subprocesses():
    print(">>> [main] Checking for lingering sglang scheduler subprocesses...", file=sys.stderr)
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


def inject_ninja_into_path():
    venv_bin = os.path.join(sys.prefix, "bin")
    user_bin = os.path.join(site.USER_BASE, "bin")

    candidate_paths = [
        os.path.join(venv_bin, "ninja"),
        os.path.join(user_bin, "ninja"),
        shutil.which("ninja"),
    ]

    for path in candidate_paths:
        if path and os.path.isfile(path):
            ninja_dir = os.path.dirname(path)
            os.environ["PATH"] = ninja_dir + os.pathsep + os.environ["PATH"]
            print(f"[bootstrap] Injected ninja into PATH: {ninja_dir}")
            return

    print("[bootstrap] ERROR: ninja binary not found in venv or user path", file=sys.stderr)


def isnum(s):
    return s.strip().isdigit()


# Register signal handler
def handle_sigterm(signum, frame):
    print(">>> [main] Received SIGTERM — setting shutdown_event...", file=sys.stderr)
    shutdown_event.set()


inject_ninja_into_path()

signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)

# Get all arguments provided to this script using argparse
parser = argparse.ArgumentParser()
parser.add_argument("--model-path", type=str)
parser.add_argument("--adaptor-path", type=str)
parser.add_argument("--parameters", type=str, default="{}")
parser.add_argument("--plugin_dir", type=str)

args, unknown = parser.parse_known_args()

llmlab_root_dir = os.getenv("LLM_LAB_ROOT_PATH")
print(f"LLMLAB ROOT: {llmlab_root_dir}", file=sys.stderr)
print("Starting SGLang Worker", file=sys.stderr)
print(f">>> [main] PID of this process: {os.getpid()}", file=sys.stderr)

model = args.model_path
adaptor = args.adaptor_path

if adaptor != "":
    model = adaptor

parameters = args.parameters
parameters = json.loads(parameters)

eight_bit = False
four_bit = False
if parameters.get("load_compressed", "None") != "None":
    if parameters.get("load_compressed", "None") == "8-bit":
        eight_bit = True
        four_bit = False
    elif parameters.get("load_compressed", "None") == "4-bit":
        eight_bit = False
        four_bit = True


gpu_ids = parameters.get("gpu_ids", "")
if gpu_ids is not None and gpu_ids != "":
    gpu_ids_formatted = gpu_ids.split(",")
    if len(gpu_ids_formatted) > 1:
        num_gpus = len(gpu_ids_formatted)
        # To remove any spacing issues which may arise
        gpu_ids = ",".join([gpu_id.strip() for gpu_id in gpu_ids_formatted])
        # If gpu_ids is not formatted correctly then use all GPUs by default
        if num_gpus == 0 or not isnum(gpu_ids_formatted[0]):
            num_gpus = torch.cuda.device_count()
            gpu_ids = ""
    else:
        num_gpus = 1
        gpu_ids = gpu_ids_formatted[0]
else:
    num_gpus = torch.cuda.device_count()

if gpu_ids is None:
    gpu_ids = ""

# Auto detect backend if device not specified
device = parameters.get("device", None)
if device is None or device == "":
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
        num_gpus = 0


PLUGIN_DIR = args.plugin_dir

# Get plugin directory
real_plugin_dir = os.path.realpath(os.path.dirname(__file__))

# Get Python executable (from venv if available)
python_executable = get_python_executable(real_plugin_dir)

popen_args = [
    python_executable,
    "-m",
    "fastchat.serve.sglang_worker",
    "--model-path",
    model,
    "--device",
    device,
]

model_dtype = parameters.get("model_dtype")
# Set model dtype if provided
if model_dtype is not None and model_dtype != "" and model_dtype != "auto":
    popen_args.extend(["--dtype", model_dtype])
if num_gpus:
    popen_args.extend(["--gpus", gpu_ids])
    popen_args.extend(["--num-gpus", str(num_gpus)])
if eight_bit:
    popen_args.append("--load-8bit")
if four_bit:
    popen_args.append("--load-4bit")

free_mem = torch.cuda.mem_get_info()[0] / (1024**2)  # in MiB
print(f">>> [main] Free GPU memory: {free_mem:.2f} MiB", file=sys.stderr)
if free_mem < 1000:
    print("⚠️ Warning: Less than 1 GB GPU memory free before starting model. Might fail with OOM.")

proc = subprocess.Popen(popen_args, stderr=subprocess.PIPE, stdout=None)

# save worker process id to file
# this will allow transformer lab to kill it later
register_process(proc.pid)

# Simple loop to block on stderr
try:
    for line in proc.stderr:
        decoded = line.decode("utf-8", errors="replace")
        print(decoded, file=sys.stderr)
        if "torch.cuda.OutOfMemoryError" in decoded:
            print("CUDA Out of memory error", file=sys.stderr)
            kill_sglang_subprocesses()
            sys.exit(99)
finally:
    print(">>> [main] model_worker exited. Cleaning up...", file=sys.stderr)
    kill_sglang_subprocesses()
    print(">>> [main] Cleanup done.", file=sys.stderr)
    sys.exit(1)


print("SGLang Worker exited", file=sys.stderr)
