#!/bin/bash
# Install dllm and dependencies

# Install base dependencies
uv pip install accelerate peft datasets bitsandbytes pandas

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

    # Initialize and update git submodules (for lm-evaluation-harness)
    echo "Initializing git submodules..."
    git submodule update --init --recursive

    # Install dllm package
    uv pip install -e .

    # Install lm-evaluation-harness from submodule with IFEval & Math dependencies
    if [ -d "lm-evaluation-harness" ]; then
        echo "Installing lm-evaluation-harness from submodule..."
        cd lm-evaluation-harness
        uv pip install -e ".[ifeval,math]"
    else
        echo "Warning: lm-evaluation-harness submodule not found"
    fi
else
    echo "Error: Could not clone or find dllm directory"
    exit 1
fi

uv pip install "transformers>4.57.0"
