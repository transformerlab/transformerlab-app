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
    # Look for .env files in current directory only
    local env_files=(
        ".env"
        ".env.local"
        ".env.production"
        ".env.development"
    )
    
    for env_file in "${env_files[@]}"; do
        # Check in current directory only
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

# Check if multitenant mode is enabled
if [ "$TFL_MULTITENANT" = "true" ]; then
    echo "🏢 Multitenant mode detected, setting up remote workspace"
    
    # # Create remote workspace directory if it doesn't exist
    # REMOTE_WORKSPACE_DIR="$HOME/.transformerlab/orgs/org_1/workspace"
    # if [ ! -d "$REMOTE_WORKSPACE_DIR" ]; then
    #     echo "📁 Creating remote workspace directory: $REMOTE_WORKSPACE_DIR"
    #     mkdir -p "$REMOTE_WORKSPACE_DIR"
    # fi
    
    # Setup AWS credentials in ~/.aws directory
    if [ -n "$AWS_ACCESS_KEY_ID" ] && [ -n "$AWS_SECRET_ACCESS_KEY" ]; then
        echo "🔐 Setting up AWS credentials in ~/.aws directory"
        
        # Create .aws directory if it doesn't exist
        AWS_DIR="$HOME/.aws"
        if [ ! -d "$AWS_DIR" ]; then
            mkdir -p "$AWS_DIR"
            chmod 700 "$AWS_DIR"
        fi
        
        # Update credentials file - preserve existing profiles
        CREDENTIALS_FILE="$AWS_DIR/credentials"
        if [ -f "$CREDENTIALS_FILE" ]; then
            echo "📝 Updating existing credentials file, preserving other profiles"
            # Remove existing transformerlab-s3 profile if it exists
            awk 'BEGIN{in_profile=0} /^\[transformerlab-s3\]/{in_profile=1; next} /^\[/ && !/^\[transformerlab-s3\]/{in_profile=0} !in_profile{print}' "$CREDENTIALS_FILE" > "$CREDENTIALS_FILE.tmp"
            mv "$CREDENTIALS_FILE.tmp" "$CREDENTIALS_FILE"
        else
            echo "📝 Creating new credentials file"
        fi
        
        # Append transformerlab-s3 profile
        cat >> "$CREDENTIALS_FILE" << EOF
[transformerlab-s3]
aws_access_key_id=$AWS_ACCESS_KEY_ID
aws_secret_access_key=$AWS_SECRET_ACCESS_KEY
EOF
        chmod 600 "$CREDENTIALS_FILE"
        
        # Update config file - preserve existing profiles
        CONFIG_FILE="$AWS_DIR/config"
        if [ -f "$CONFIG_FILE" ]; then
            echo "📝 Updating existing config file, preserving other profiles"
            # Remove existing transformerlab-s3 profile if it exists
            awk 'BEGIN{in_profile=0} /^\[profile transformerlab-s3\]/{in_profile=1; next} /^\[/ && !/^\[profile transformerlab-s3\]/{in_profile=0} !in_profile{print}' "$CONFIG_FILE" > "$CONFIG_FILE.tmp"
            mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
        else
            echo "📝 Creating new config file"
        fi
        
        # Append transformerlab-s3 profile
        if [ -n "$AWS_DEFAULT_REGION" ]; then
            cat >> "$CONFIG_FILE" << EOF
[profile transformerlab-s3]
region=$AWS_DEFAULT_REGION
output=json
EOF
        else
            cat >> "$CONFIG_FILE" << EOF
[profile transformerlab-s3]
region=us-east-1
output=json
EOF
        fi
        chmod 600 "$CONFIG_FILE"
        
        echo "✅ AWS credentials configured in ~/.aws (transformerlab-s3 profile)"
    else
        echo "⚠️ AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY not set, skipping AWS setup"
    fi
    
fi

echo "▶️ Starting the API server:"
if [ "$RELOAD" = true ]; then
    echo "🔁 Reload the server on file changes"
    if [ "$HTTPS" = true ]; then
        uv run -v python api.py --https --reload --port ${PORT} --host ${TLABHOST}
    else
        uv run -v uvicorn api:app --reload --port ${PORT} --host ${TLABHOST}
    fi
else
    if [ "$HTTPS" = true ]; then
        uv run -v python api.py --https --port ${PORT} --host ${TLABHOST}
    else
        uv run -v uvicorn api:app --port ${PORT} --host ${TLABHOST} --no-access-log
    fi
fi
