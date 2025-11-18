#!/bin/bash
ENV_NAME="transformerlab"
TLAB_DIR="$HOME/.transformerlab"
TLAB_CODE_DIR="${TLAB_DIR}/src"

MINIFORGE_ROOT=${TLAB_DIR}/miniforge3
CONDA_BIN=${MINIFORGE_ROOT}/bin/conda
ENV_DIR=${TLAB_DIR}/envs/${ENV_NAME}

echo "Your shell is $SHELL"
echo "Conda's binary is at ${CONDA_BIN}"
echo "Your current directory is $(pwd)"

err_report() {
  echo "Error in run.sh on line $1"
}

trap 'err_report $LINENO' ERR

if ! command -v ${CONDA_BIN} &> /dev/null; then
    echo "❌ Conda is not installed at ${MINIFORGE_ROOT}. Please install Conda there (and only there) and try again."
else
    echo "✅ Conda is installed."
fi

echo "👏 Enabling conda in shell"

eval "$(${CONDA_BIN} shell.bash hook)"

echo "👏 Activating transformerlab conda environment"
conda activate "${ENV_DIR}"