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
    local env_files=(
        "${TLAB_DIR}/.env"
        "../.env"
    )

    for env_file in "${env_files[@]}"; do
        if [ -f "$env_file" ]; then
            echo "📄 Loading environment variables from $env_file"
            set -a
            source "$env_file"
            set +a
        fi
    done
}

load_env_files

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

if [ "$CUSTOM_ENV" = true ]; then
    echo "🔧 Using current conda environment, I won't activate for you"
else
    echo "👏 Enabling conda in shell"
    eval "$(${CONDA_BIN} shell.bash hook)"
    echo "👏 Activating transformerlab conda environment"
    conda activate "${ENV_DIR}"
fi

# Check for uvicorn
if ! command -v uvicorn &> /dev/null; then
    echo "❌ Uvicorn is not installed."
    exit 1
fi

# GPU checks
if command -v nvidia-smi &> /dev/null; then
    echo "✅ NVIDIA GPU detected"
    export LD_LIBRARY_PATH=${ENV_DIR}/lib:$LD_LIBRARY_PATH
elif command -v rocminfo &> /dev/null; then
    echo "✅ AMD GPU detected"
    export PATH=$PATH:/opt/rocm/bin:/opt/rocm/rocprofiler/bin:/opt/rocm/opencl/bin
    export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/rocm/lib:/opt/rocm/lib64
fi

# ---------------------------------------------------------
# 🔍 NEW RELIC INTEGRATION START
# ---------------------------------------------------------
RUN_PREFIX=""

# We check if the New Relic config file exists OR if License Key is set in env
if [ -n "$NEW_RELIC_LICENSE_KEY" ] || [ -f "newrelic.ini" ]; then
    # Check if the python package is installed
    if pip show newrelic > /dev/null 2>&1; then
        echo "🚀 New Relic detected. Wrapping application..."

        # If using a file, ensure the env var is set
        if [ -z "$NEW_RELIC_CONFIG_FILE" ] && [ -f "newrelic.ini" ]; then
            export NEW_RELIC_CONFIG_FILE="newrelic.ini"
        fi

        RUN_PREFIX="newrelic-admin run-program"
    else
        echo "⚠️  NEW_RELIC_LICENSE_KEY found, but 'newrelic' python package not installed."
        echo "   Run: pip install newrelic"
    fi
else
    echo "ℹ️  No New Relic configuration found. Running in standard mode."
fi
# ---------------------------------------------------------
# 🔍 NEW RELIC INTEGRATION END
# ---------------------------------------------------------

echo "▶️ Starting the API server:"

if [ "$RELOAD" = true ]; then
    echo "🔁 Reload enabled"
    if [ "$HTTPS" = true ]; then
        # Use the prefix
        $RUN_PREFIX python api.py --https --reload --port ${PORT} --host ${TLABHOST} --timeout-graceful-shutdown 1
    else
        # Use the prefix
        $RUN_PREFIX uvicorn api:app --reload --port ${PORT} --host ${TLABHOST} --timeout-graceful-shutdown 1
    fi
else
    if [ "$HTTPS" = true ]; then
        $RUN_PREFIX python api.py --https --port ${PORT} --host ${TLABHOST}
    else
        # Note: We removed --no-access-log because we want our JSON logger to handle it
        $RUN_PREFIX uvicorn api:app --port ${PORT} --host ${TLABHOST}
    fi
fi
