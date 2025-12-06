import argparse
import json
import os
import shutil
import site
import subprocess
import sys
import threading
import time

import torch
from fastchat.constants import TEMP_IMAGE_DIR
from lab import storage
from lab.dirs import get_workspace_dir

try:
    from transformerlab.plugin import get_python_executable, register_process
except ImportError:
    from transformerlab.plugin_sdk.transformerlab.plugin import (
        get_python_executable,
        register_process,
    )


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


inject_ninja_into_path()


parser = argparse.ArgumentParser()
parser.add_argument("--model-path", type=str)
parser.add_argument("--parameters", type=str, default="{}")
args, unknown = parser.parse_known_args()

model = args.model_path

llmlab_root_dir = os.getenv("LLM_LAB_ROOT_PATH")

parameters = args.parameters
parameters = json.loads(parameters)

# Now go through the parameters object and remove the key that is equal to "inferenceEngine":
if "inferenceEngine" in parameters:
    del parameters["inferenceEngine"]

if "inferenceEngineFriendlyName" in parameters:
    del parameters["inferenceEngineFriendlyName"]

# Get plugin directory
real_plugin_dir = os.path.realpath(os.path.dirname(__file__))

# Get Python executable (from venv if available)
python_executable = get_python_executable(real_plugin_dir)

port = int(parameters.get("port", 8000))
max_model_len = str(parameters.get("max_model_len", "0")).strip()
if max_model_len == "":
    max_model_len = 0
pipeline_parallel_size = str(parameters.get("pipeline_parallel_size", "1")).strip()
if pipeline_parallel_size == "":
    pipeline_parallel_size = 1

max_model_len = int(max_model_len)
pipeline_parallel_size = int(pipeline_parallel_size)

if max_model_len <= 0:
    max_model_len = None
else:
    max_model_len = str(max_model_len)
print("Starting vLLM server...", file=sys.stderr)

# Use storage.makedirs for workspace paths (TLAB_TEMP_IMAGE_DIR), os.makedirs for system paths
if TEMP_IMAGE_DIR.startswith(get_workspace_dir()):
    storage.makedirs(TEMP_IMAGE_DIR, exist_ok=True)
else:
    os.makedirs(TEMP_IMAGE_DIR, exist_ok=True)

vllm_args = [
    python_executable,
    "-m",
    "vllm.entrypoints.openai.api_server",
    "--model",
    model,
    "--dtype",
    "float16",
    "--port",
    str(port),
    "--gpu-memory-utilization",
    "0.9",
    "--trust-remote-code",
    "--enforce-eager",
    "--allowed-local-media-path",
    str(TEMP_IMAGE_DIR),
]

# Add max model length if provided
if max_model_len is not None:
    vllm_args.extend(["--max-model-len", max_model_len])


num_gpus = torch.cuda.device_count()

if pipeline_parallel_size <= 0:
    print("[ERROR] pipeline_parallel_size must be greater than 0", file=sys.stderr)
    sys.exit(1)

if num_gpus % pipeline_parallel_size == 0:
    tensor_parallel_size = num_gpus // pipeline_parallel_size
else:
    tensor_parallel_size = num_gpus

# Add tensor parallel size if multiple GPUs are available
if num_gpus > 1:
    vllm_args.extend(
        [
            "--tensor-parallel-size",
            str(tensor_parallel_size),
            "--pipeline-parallel-size",
            str(pipeline_parallel_size),
        ]
    )

# We need to read both STDOUT (to determine when the server is up)
# and STDOUT (to report on errors)
vllm_proc = subprocess.Popen(vllm_args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

# Wait for vLLM server to be ready
# This is a magic string we watch for to know the vllm server has started
watch_string = "init engine"
start_success = False

# Read over stderr and print out any error output
# Break as soon as we detect the server is up (based on watch string)
for line in iter(vllm_proc.stdout.readline, b""):
    decoded = line.decode()
    if watch_string in decoded:
        print("vLLM server started successfully")
        start_success = True
        break

    error_msg = decoded.strip()
    print("[vLLM]", error_msg, file=sys.stderr)

# If we didn't detect the startup string then report the error and exit
if not start_success:
    vllm_proc.wait()
    print("vLLM Startup Failed with exit code", vllm_proc.returncode)
    print(error_msg)
    sys.exit(1)

proxy_args = [
    python_executable,
    "-m",
    "fastchat.serve.openai_api_proxy_worker",
    "--model-path",
    model,
    "--proxy-url",
    f"http://localhost:{port}/v1",
    "--model",
    model,
]

proxy_proc = subprocess.Popen(proxy_args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)

# save both worker process id and vllm process id to file
# this will allow transformer lab to kill both later
register_process([proxy_proc.pid, vllm_proc.pid])


# Read output from both processes (vLLM and proxy) simultaneously
def read_stream(proc, prefix):
    """Read from a process stdout (which includes stderr) and print with prefix"""
    for line in iter(proc.stdout.readline, b""):
        if line:
            print(f"[{prefix}]", line.decode().strip(), file=sys.stderr)


# Create threads to read from both processes
vllm_thread = threading.Thread(target=read_stream, args=(vllm_proc, "vLLM"), daemon=True)
proxy_thread = threading.Thread(target=read_stream, args=(proxy_proc, "Proxy"), daemon=True)

vllm_thread.start()
proxy_thread.start()

# Wait for either process to exit
while vllm_proc.poll() is None and proxy_proc.poll() is None:
    time.sleep(1)

# If one exits, report which one
if vllm_proc.poll() is not None:
    print(f"vLLM process exited with code {vllm_proc.poll()}", file=sys.stderr)
if proxy_proc.poll() is not None:
    print(f"Proxy process exited with code {proxy_proc.poll()}", file=sys.stderr)

print("Vllm worker exited", file=sys.stderr)
