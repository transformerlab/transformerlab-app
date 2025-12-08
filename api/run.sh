#!/bin/bash
set -e

ENV_NAME="transformerlab"
TLAB_DIR="$HOME/.transformerlab"
TLAB_CODE_DIR="${TLAB_DIR}/src"

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

# echo "Your shell is $SHELL"
# echo "Conda's binary is at ${CONDA_BIN}"
# echo "Your current directory is $(pwd)"

err_report() {
  echo "Error in run.sh on line $1"
}

# trap 'err_report $LINENO' ERR

if ! command -v ${CONDA_BIN} &> /dev/null; then
    echo "❌ Conda is not installed at ${MINIFORGE_ROOT}. Please run ./install.sh and try again."
else
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
    echo "🔧 Using current conda environment, I won't activate for you"
else
    # echo "👏 Using default conda environment: ${ENV_DIR}"
    echo "👏 Enabling conda in shell"

    eval "$(${CONDA_BIN} shell.bash hook)"

    echo "👏 Activating transformerlab conda environment"
    conda activate "${ENV_DIR}"
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
    # Add common NVIDIA library paths
    export LD_LIBRARY_PATH=${ENV_DIR}/lib:$LD_LIBRARY_PATH
elif command -v rocminfo &> /dev/null; then
    echo "✅ AMD GPU detected, adding appropriate libraries to path"
    export PATH=$PATH:/opt/rocm/bin:/opt/rocm/rocprofiler/bin:/opt/rocm/opencl/bin
    export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/rocm/lib:/opt/rocm/lib64
fi

echo "▶️ Starting the API server:"
if [ "$RELOAD" = true ]; then
    echo "🔁 Reload the server on file changes"
    if [ "$HTTPS" = true ]; then
        python api.py --https --reload --port ${PORT} --host ${TLABHOST}
    else
        uvicorn api:app --reload --port ${PORT} --host ${TLABHOST}
    fi
else
    if [ "$HTTPS" = true ]; then
        python api.py --https --port ${PORT} --host ${TLABHOST}
    else
        uvicorn api:app --port ${PORT} --host ${TLABHOST} --no-access-log
    fi
fi
