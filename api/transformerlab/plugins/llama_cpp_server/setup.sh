#!/usr/bin/env bash
# If we install llama-cpp-python[server] it will install
# Pydantic2 which will break FastChat which depends on Pydantic1
# So we will install llama-cpp-python only and implement our
# own server using FastAPI

echo "Setting up llama-cpp-python..."

# Detect OS
if [[ "$(uname)" == "Darwin" ]]; then
    # macOS - check for Metal support
    if [[ "$(uname -m)" == "arm64" || "$(sysctl -n machdep.cpu.brand_string)" == *"Apple"* ]]; then
        echo "Detected Mac with Apple Silicon - installing with Metal support"
        CMAKE_ARGS="-DGGML_METAL=on" uv pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
    else
        echo "Detected Mac with Intel CPU - installing with OpenBLAS support"
        CMAKE_ARGS="-DGGML_BLAS=ON -DGGML_BLAS_VENDOR=OpenBLAS" uv pip install llama-cpp-python --upgrade --force-reinstall --no-cache-dir
    fi
elif command -v nvidia-smi &> /dev/null; then
    # Linux/Other with CUDA detected
    echo "CUDA GPU detected. Installing based on CUDA setup using GGML CUDA"
    CMAKE_ARGS="-DGGML_CUDA=on" FORCE_CMAKE=1 uv pip install llama-cpp-python --force-reinstall --no-cache-dir

elif command -v rocminfo &> /dev/null; then
    # Linux/Other with CUDA detected
    echo "AMD GPU detected. Installing based on AMD setup using GGML HIPBLAS"
    CMAKE_ARGS="-DGGML_HIPBLAS=on" FORCE_CMAKE=1  uv pip install llama-cpp-python --force-reinstall --no-cache-dir

else
    # Linux/Other without CUDA - try using OpenBLAS
    echo "No GPU detected - installing with OpenBLAS support"
    uv pip install llama-cpp-python --upgrade --no-cache-dir --force-reinstall
fi

echo "llama-cpp-python installation complete."