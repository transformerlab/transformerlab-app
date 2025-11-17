#!/bin/bash
set -e

# Step 0: Install common dependencies (excluding torch/torchvision/torchao)
uv pip install zmq orjson uvloop sgl-kernel compressed_tensors msgspec partial_json_parser xgrammar ninja 'flashinfer-python>=0.2.6.post1'

# Step 1: Manually install torchao from PyPI BEFORE sglang[all]
echo "[setup] Installing torchao==0.9.0 from PyPI"
uv pip install torchao==0.9.0

# Step 2: Install sglang[all] from custom torch index (torchao is already satisfied)
echo "[setup] Installing sglang[all] with custom torch index"
if command -v rocminfo &>/dev/null; then
    echo "[setup] ROCm detected."
    BACKEND="rocm"
    TORCH_INDEX_URL="https://download.pytorch.org/whl/rocm6.4"
    uv pip install "sglang[all]==0.4.8.post1" --index "$TORCH_INDEX_URL"

else
    echo "[setup] ROCm not detected. Assuming CUDA."
    BACKEND="cuda"
    uv pip install "sglang[all]==0.4.8.post1"
fi

# Step 3: Conditionally install bitsandbytes
if [ "$BACKEND" != "rocm" ]; then
    echo "[setup] Installing bitsandbytes"
    uv pip install bitsandbytes
else
    echo "[setup] Skipping bitsandbytes for ROCm."
fi
