#!/bin/bash
set -e

TLAB_DIR="$HOME/.transformerlab"
MINIFORGE_ROOT="${TLAB_DIR}/miniforge3"
CONDA_BIN="${MINIFORGE_ROOT}/bin/conda"
ENV_DIR="${TLAB_DIR}/envs/transformerlab"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_PROVIDER_PYPROJECT="localprovider_pyproject.toml"

abort() {
  printf "%s\n" "$@" >&2
  exit 1
}

install_conda_if_needed() {
  if [ -x "${CONDA_BIN}" ]; then
    return
  fi

  OS="$(uname -s)"
  ARCH="$(uname -m)"
  if [ "$OS" == "Darwin" ]; then
    OS="MacOSX"
  fi

  MINIFORGE_URL="https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-${OS}-${ARCH}.sh"
  mkdir -p "${TLAB_DIR}"
  cd "${TLAB_DIR}"
  rm -rf "${MINIFORGE_ROOT}"
  curl -L -o miniforge_installer.sh "${MINIFORGE_URL}"
  bash miniforge_installer.sh -b -p "${MINIFORGE_ROOT}"
  rm -f miniforge_installer.sh
}

create_conda_env_if_needed() {
  eval "$("${CONDA_BIN}" shell.bash hook)"
  if ! conda env list | awk '{print $1}' | rg -Fq "${ENV_DIR}"; then
    conda create -y -k --prefix "${ENV_DIR}" python=3.11
  fi
}

install_local_provider_dependencies() {
  eval "$("${CONDA_BIN}" shell.bash hook)"
  conda activate "${ENV_DIR}"
  # Ensure we do not accidentally install into an already-active uv venv.
  unset VIRTUAL_ENV
  unset UV_PROJECT_ENVIRONMENT

  if ! "${CONDA_BIN}" run --prefix "${ENV_DIR}" uv --version >/dev/null 2>&1; then
    "${CONDA_BIN}" run --prefix "${ENV_DIR}" python -m pip install uv
  fi

  HAS_NVIDIA=false
  HAS_AMD=false
  if command -v nvidia-smi >/dev/null 2>&1; then
    GPU_INFO=$(nvidia-smi --query-gpu=name --format=csv,noheader,nounits || true)
    if [ -n "${GPU_INFO}" ]; then
      HAS_NVIDIA=true
    fi
  elif command -v rocminfo >/dev/null 2>&1; then
    HAS_AMD=true
  fi

  if [ ! -f "${SCRIPT_DIR}/${LOCAL_PROVIDER_PYPROJECT}" ]; then
    abort "❌ ${LOCAL_PROVIDER_PYPROJECT} not found in ${SCRIPT_DIR}"
  fi

  TMP_PROJECT_DIR="$(mktemp -d "${TLAB_DIR}/localprovider-project.XXXXXX")"
  cp "${SCRIPT_DIR}/${LOCAL_PROVIDER_PYPROJECT}" "${TMP_PROJECT_DIR}/pyproject.toml"
  cp -R "${SCRIPT_DIR}/tlab_package_init" "${TMP_PROJECT_DIR}/tlab_package_init"

  LAB_SDK_DIR="$(cd "$(dirname "${SCRIPT_DIR}")" && pwd)/lab-sdk"
  INSTALL_EDITABLE_LAB_SDK=false
  if [ -f "${LAB_SDK_DIR}/pyproject.toml" ]; then
    sed -i.bak '/^  "transformerlab==/d' "${TMP_PROJECT_DIR}/pyproject.toml"
    INSTALL_EDITABLE_LAB_SDK=true
    echo "Using local lab-sdk at ${LAB_SDK_DIR} (PyPI transformerlab pin removed)."
  else
    echo "Warning: No lab-sdk at ${LAB_SDK_DIR}; transformerlab will be installed from PyPI."
  fi

  cd "${TMP_PROJECT_DIR}"

  # Satisfy the `transformerlab` distribution from disk before resolving .[cpu]/etc.
  # Otherwise the first install can pull PyPI transformerlab or fail resolution when the pin is stripped.
  if [ "${INSTALL_EDITABLE_LAB_SDK}" = true ]; then
    "${CONDA_BIN}" run --prefix "${ENV_DIR}" uv pip install --python "${ENV_DIR}/bin/python" -e "${LAB_SDK_DIR}"
    echo "Installed transformerlab (lab-sdk) in editable mode from ${LAB_SDK_DIR}"
  fi

  PIP_WHEEL_FLAGS=""
  if [ "${HAS_NVIDIA}" = true ]; then
    CUDA_INDEX="cu128"
    if [ "${TLAB_FORCE_CUDA13:-}" = "1" ] || [ "${TLAB_FORCE_CUDA13:-}" = "true" ]; then
      CUDA_INDEX="cu130"
    elif [ -r /etc/dgx-release ] && rg -iq 'DGX Spark' /etc/dgx-release; then
      CUDA_INDEX="cu130"
    fi

    if [ "${CUDA_INDEX}" = "cu130" ]; then
      conda install -y cuda==13.0.0 --force-reinstall -c nvidia/label/cuda-13.0.0
      PIP_WHEEL_FLAGS="--index https://download.pytorch.org/whl/${CUDA_INDEX} --index-strategy unsafe-best-match"
    else
      conda install -y cuda==12.8.1 --force-reinstall -c nvidia/label/cuda-12.8.1
    fi
    install_cmd=("${CONDA_BIN}" run --prefix "${ENV_DIR}" uv pip install --python "${ENV_DIR}/bin/python")
    if [ -n "${PIP_WHEEL_FLAGS}" ]; then
      # shellcheck disable=SC2206
      extra_flags=( ${PIP_WHEEL_FLAGS} )
      install_cmd+=("${extra_flags[@]}")
    fi
    install_cmd+=(".[nvidia]")
    "${install_cmd[@]}"
  elif [ "${HAS_AMD}" = true ]; then
    PIP_WHEEL_FLAGS="--index https://download.pytorch.org/whl/rocm6.4 --index-strategy unsafe-best-match"
    install_cmd=("${CONDA_BIN}" run --prefix "${ENV_DIR}" uv pip install --python "${ENV_DIR}/bin/python")
    if [ -n "${PIP_WHEEL_FLAGS}" ]; then
      # shellcheck disable=SC2206
      extra_flags=( ${PIP_WHEEL_FLAGS} )
      install_cmd+=("${extra_flags[@]}")
    fi
    install_cmd+=(".[rocm]")
    "${install_cmd[@]}"
  else
    if [ "$(uname -s)" != "Darwin" ]; then
      PIP_WHEEL_FLAGS="--index https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match"
    fi
    install_cmd=("${CONDA_BIN}" run --prefix "${ENV_DIR}" uv pip install --python "${ENV_DIR}/bin/python")
    if [ -n "${PIP_WHEEL_FLAGS}" ]; then
      # shellcheck disable=SC2206
      extra_flags=( ${PIP_WHEEL_FLAGS} )
      install_cmd+=("${extra_flags[@]}")
    fi
    install_cmd+=(".[cpu]")
    "${install_cmd[@]}"
  fi

  rm -rf "${TMP_PROJECT_DIR}"
}

install_conda_if_needed
create_conda_env_if_needed
install_local_provider_dependencies
