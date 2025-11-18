#!/usr/bin/env bash
if ! command -v rocminfo &> /dev/null; then
    uv pip install bitsandbytes
    uv pip install git+https://github.com/triton-lang/triton.git@main#subdirectory=python/triton_kernels
    uv pip install "triton==3.4.0"
fi

# For GPT OSS
uv pip install "kernels>=0.9.0" "peft>=0.17.0" "trl>=0.21.0" "trackio"

uv pip install "timm==1.0.20"