"""
Ollama model server

Requires that ollama is installed on your server.

Right now only generate_stream function has gone through much testing.
The generate function probably needs work.
"""

import argparse
import json
import os
import posixpath
import subprocess
import sys
import time
import uuid
from hashlib import sha256
from pathlib import Path

import ollama
import requests
from lab import storage

worker_id = str(uuid.uuid4())[:8]

OLLAMA_STARTUP_TIMEOUT = 180  # seconds

try:
    from transformerlab.plugin import get_python_executable, register_process
except ImportError:
    from transformerlab.plugin_sdk.transformerlab.plugin import (
        get_python_executable,
        register_process,
    )


parser = argparse.ArgumentParser()
parser.add_argument("--model-path", type=str)
parser.add_argument("--parameters", type=str, default="{}")
args, unknown = parser.parse_known_args()

# model_path can be a hugging face ID or a local file in Transformer Lab
# But GGUF is always stored as a local path because
# we are using a specific GGUF file
# TODO: Make sure the path exists before continuing
# Check both storage and os for compatibility (model_path might be workspace or local)
if storage.exists(args.model_path) or os.path.exists(args.model_path):
    model_path = args.model_path
else:
    raise FileNotFoundError(
        f"The specified GGUF model '{args.model_path}' was not found.Please select a valid GGUF model file to proceed."
    )

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

port = int(parameters.get("port", 11434))
env = os.environ.copy()
env["OLLAMA_HOST"] = f"127.0.0.1:{port}"
print("Starting Ollama server...", file=sys.stderr)


ollama_proc = subprocess.Popen(["ollama", "serve"], stdout=None, stderr=subprocess.PIPE)

# Wait for Ollama server to be ready
ollama_url = f"http://localhost:{port}/api/tags"
start_time = time.time()
while True:
    try:
        resp = requests.get(ollama_url, timeout=3)
        if resp.status_code == 200:
            print("Ollama server is ready", file=sys.stderr)
            break
    except Exception:
        pass
    if time.time() - start_time > OLLAMA_STARTUP_TIMEOUT:
        print("Timeout waiting for Ollama server to be ready", file=sys.stderr)
        sys.exit(1)
    time.sleep(1)


# We need to find the ollama cache or else this isn't going to work
# First, check the OLLAMA_MODELS environment variable
# If that isn't set then use the default location:
# ~/.ollama/models
OLLAMA_MODELS_DIR = os.getenv("OLLAMA_MODELS", os.path.join(Path.home(), ".ollama", "models"))
if os.path.isdir(OLLAMA_MODELS_DIR):
    print("Ollama models directory:", OLLAMA_MODELS_DIR)
else:
    raise FileNotFoundError(f"Ollama models directory not found at: {OLLAMA_MODELS_DIR}")


# Load model into Ollama
#
# EXPLANATION:
# Our GGUF models are stored in the transformerlab workspace models directory.
# Ollama lets you import models if you have a correctly formatted Modelfile.
# But, Ollama wants models stored in their proprietary way in ~/.ollama.
# If you try to import a GGUF model outside of Ollama, it will copy the
# entire file into their .ollama cache and waste your disk space.
# However, if there is already a file (or link) with the correct name (SHA blob)
# in the right place (under ~/.ollama/models/blobs) then it won't copy!

# STEP 1: Make an Ollama Modelfile that points to the GGUF you want to run
# Split model_path into the directory and filename
# Use posixpath for consistent path handling with storage paths
model_dir = posixpath.dirname(model_path)
model_filename = posixpath.basename(model_path)

# This is the name that the model will be known by in ollama
# We will use the same name as in Transformer Lab but with .gguf on the end.
#
# Explanation:
# We can call models whatever we want in Ollama, but they will be visible
# to the user. So keeping in mind that we also support importing Ollama models
# we really don't want to create unnecessary duplicate models with the same
# name but with .gguf on the end.
file_name, file_extension = os.path.splitext(model_filename)
if file_extension == ".gguf":
    ollama_model_name = file_name  # i.e. without .gguf
else:
    ollama_model_name = model_filename

# Output a modelfile
modelfile = storage.join(model_dir, "Modelfile")
with storage.open(modelfile, "w") as file:
    file.write(f"FROM {model_path}\n")

# STEP 2: Create a link to our GGUF file in the Ollama cache
# to prevent it from copying the GGUF file.

# 2a. Figure out the SHA filename ollama expects.
# Copied this from ollama SDK
sha256sum = sha256()
with storage.open(model_path, "rb") as r:
    while True:
        chunk = r.read(32 * 1024)
        if not chunk:
            break
        sha256sum.update(chunk)

# 2b. Create a link with the SHA name to the actual GGUF file
OLLAMA_MODEL_BLOBS_CACHE = os.path.join(OLLAMA_MODELS_DIR, "blobs")
sha_filename = os.path.join(OLLAMA_MODEL_BLOBS_CACHE, f"sha256-{sha256sum.hexdigest()}")

# Create the directory if it doesn't exist
os.makedirs(OLLAMA_MODEL_BLOBS_CACHE, exist_ok=True)

# Create a symbolic link if it doesn't already exist
if not os.path.exists(sha_filename):
    print("Creating link to model in Ollama:", sha_filename)
    os.symlink(args.model_path, sha_filename)

# STEP 3: Call ollama and tell it to create the model in its register
# TODO: I think you can do this via the SDK which would be better
# for catching errors
ollama_create_proc = subprocess.run(["ollama", "create", ollama_model_name, "-f", modelfile])

# Openai api proxy needs to know context length to check for context overflow
# You can try pulling this from modelinfo from ollama.show
# As a backup, we will assume ollama default of 4096
context_len = 4096
show_response: ollama.ShowResponse = ollama.show(model=ollama_model_name)
modelinfo = show_response.modelinfo
print(modelinfo)
model_architecture = modelinfo.get("general.architecture", None)
if model_architecture:
    context_key = f"{model_architecture}.context_length"
    if context_key in modelinfo:
        context_len = modelinfo[context_key]


proxy_args = [
    python_executable,
    "-m",
    "fastchat.serve.openai_api_proxy_worker",
    "--model-path",
    model_path,
    "--proxy-url",
    f"http://localhost:{port}/v1",
    "--model",
    ollama_model_name,
    "--context-len",
    str(context_len),
    "--image-payload-encoding",
    "base64",
]

proxy_proc = subprocess.Popen(proxy_args, stdout=None, stderr=subprocess.PIPE)

# save both worker process id and ollama process id to file
# this will allow transformer lab to kill both later
register_process([proxy_proc.pid, ollama_proc.pid])

# read output:
for line in iter(proxy_proc.stderr.readline, b""):
    print(line, file=sys.stderr)

print("Ollama worker exited", file=sys.stderr)
