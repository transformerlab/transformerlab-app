#!/bin/bash
# Install dllm and dependencies

# Install base dependencies
uv pip install transformers accelerate peft datasets bitsandbytes

# Clone and install dllm
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DLLM_DIR="$SCRIPT_DIR/dllm"

if [ ! -d "$DLLM_DIR" ]; then
    echo "Cloning dllm from https://github.com/deep1401/dllm"
    cd "$SCRIPT_DIR"
    git clone https://github.com/deep1401/dllm
fi

if [ -d "$DLLM_DIR" ]; then
    echo "Installing dllm from $DLLM_DIR"
    cd "$DLLM_DIR"
    uv pip install -e .
else
    echo "Error: Could not clone or find dllm directory"
    exit 1
fi
