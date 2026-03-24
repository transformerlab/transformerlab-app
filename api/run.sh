#!/bin/bash
set -e

ENV_NAME="transformerlab"
TLAB_DIR="$HOME/.transformerlab"
TLAB_CODE_DIR="${TLAB_DIR}/src"
GENERAL_UV_ENV_DIR="${TLAB_DIR}/envs/general-uv"

MINIFORGE_ROOT=${TLAB_DIR}/miniforge3
CONDA_BIN=${MINIFORGE_ROOT}/bin/conda
ENV_DIR=${TLAB_DIR}/envs/${ENV_NAME}
CUSTOM_ENV=false

TLABHOST="0.0.0.0"
PORT="8338"

RELOAD=false
HTTPS=false

# Load environment variables from .env files
load_env_files() {
    # Load .env files in order of priority (later files override earlier ones)
    # First: base config from TLAB_DIR (lowest priority)
    # Then: local .env files (higher priority, can override base)
    local env_files=(
        "${TLAB_DIR}/.env"
        "../.env"
    )

    for env_file in "${env_files[@]}"; do
        if [ -f "$env_file" ]; then
            echo "📄 Loading environment variables from $env_file"
            # Export variables from .env file, ignoring comments and empty lines
            set -a  # automatically export all variables
            source "$env_file"
            set +a  # stop automatically exporting
        fi
    done
}

# Load environment variables
load_env_files

# Override env variables (if TFL_API_STORAGE_URI is set and TFL_REMOTE_STORAGE_ENABLED is not set)
if [ -n "${TFL_API_STORAGE_URI}" ] && [ -z "${TFL_REMOTE_STORAGE_ENABLED}" ]; then
    export TFL_REMOTE_STORAGE_ENABLED=True
fi

# echo "Your shell is $SHELL"
# echo "Conda's binary is at ${CONDA_BIN}"
# echo "Your current directory is $(pwd)"

err_report() {
  echo "Error in run.sh on line $1"
}

# trap 'err_report $LINENO' ERR

CONDA_AVAILABLE=false
if command -v ${CONDA_BIN} &> /dev/null; then
    CONDA_AVAILABLE=true
    echo "✅ Conda is installed."
fi

while getopts crsp:h: flag
do
    case "${flag}" in
        c) CUSTOM_ENV=true;;
        r) RELOAD=true;;
        s) HTTPS=true;;
        p) PORT=${OPTARG};;
        h) TLABHOST=${OPTARG};;
    esac
done

# Print out everything that was discovered above
# echo "👏 Using host: ${HOST}
# 👏 Using port: ${PORT}
# 👏 Using reload: ${RELOAD}
# 👏 Using custom environment: ${CUSTOM_ENV}"

if [ "$CUSTOM_ENV" = true ]; then
    echo "🔧 Using currently active environment; run.sh will not activate one for you"
else
    if [ -x "${GENERAL_UV_ENV_DIR}/bin/python" ]; then
        echo "👏 Using general uv environment"
        export PATH="${GENERAL_UV_ENV_DIR}/bin:$PATH"
        export VIRTUAL_ENV="${GENERAL_UV_ENV_DIR}"
    elif [ "$CONDA_AVAILABLE" = true ]; then
        # Fallback for full installs/local-provider-heavy environments.
        echo "👏 General uv env not found, falling back to transformerlab conda environment"
        eval "$(${CONDA_BIN} shell.bash hook)"
        conda activate "${ENV_DIR}"
    else
        echo "❌ Neither conda env nor general uv env is available."
        echo "Run ./install.sh for full install or ./install.sh multiuser_setup for general install."
        exit 1
    fi
fi

# Check if the uvicorn command works:
if ! command -v uvicorn &> /dev/null; then
    echo "❌ Uvicorn is not installed. This usually means that the installation of dependencies failed. Run ./install.sh to install the dependencies."
    exit 1
else
    echo -n ""
    # echo "✅ Uvicorn is installed."
fi

# Check if NVIDIA GPU is available and add necessary paths
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected, adding CUDA libraries to path"
    # If conda env is active, include its libs. uv-only installs rely on system CUDA paths.
    if [ -n "${CONDA_PREFIX}" ]; then
        export LD_LIBRARY_PATH=${CONDA_PREFIX}/lib:$LD_LIBRARY_PATH
    fi
elif command -v rocminfo &> /dev/null; then
    echo "✅ AMD GPU detected, adding appropriate libraries to path"
    export PATH=$PATH:/opt/rocm/bin:/opt/rocm/rocprofiler/bin:/opt/rocm/opencl/bin
    export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/rocm/lib:/opt/rocm/lib64
fi

# Temporary: Turn off python buffering or debug output made by print() may not show up in logs
export PYTHONUNBUFFERED=1

echo "▶️ Starting the API server:"
if [ "$RELOAD" = true ]; then
    echo "🔁 Reload the server on file changes"
    if [ "$HTTPS" = true ]; then
        python api.py --https --reload --port ${PORT} --host ${TLABHOST} --timeout-graceful-shutdown 1
    else
        uvicorn api:app --reload --port ${PORT} --host ${TLABHOST} --timeout-graceful-shutdown 1
    fi
else
    if [ "$HTTPS" = true ]; then
        python api.py --https --port ${PORT} --host ${TLABHOST}
    else
        uvicorn api:app --port ${PORT} --host ${TLABHOST} --no-access-log
    fi
fi
