#!/usr/bin/env bash
#pip install "datasets==2.9.0" "accelerate==0.21.0" "evaluate==0.4.0" loralib
# if we're NOT on AMD/ROCm, install bitsandbytes for quantization support
if ! command -v rocminfo &> /dev/null; then
    uv pip install bitsandbytes
    uv pip install git+https://github.com/triton-lang/triton.git@main#subdirectory=python/triton_kernels
    uv pip install "triton==3.4.0"
fi

uv pip install "kernels>=0.9.0" "peft>=0.17.0" "trl>=0.21.0" "trackio"