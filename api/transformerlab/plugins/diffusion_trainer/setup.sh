#!/bin/bash

# Install compatible torch and torchvision first to avoid version conflicts
uv pip install torch torchvision diffusers transformers --extra-index-url https://download.pytorch.org/whl/cu118

# Install PEFT and diffsynth
uv pip install "peft>=0.15.0" diffsynth

# Only install xformers for non-rocm instances
if ! command -v rocminfo &> /dev/null; then
    uv pip install xformers
fi