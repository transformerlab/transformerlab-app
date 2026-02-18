#!/bin/bash

# Keep torch stack from base plugin venv setup to avoid CUDA/NCCL mismatches.
uv pip install diffusers transformers

# Install PEFT and diffsynth
uv pip install "peft>=0.15.0" diffsynth

# Only install xformers for non-rocm instances
if ! command -v rocminfo &> /dev/null; then
    uv pip install xformers
fi
