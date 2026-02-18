#!/bin/bash

# Keep plugin deps aligned with the base plugin venv created from api/pyproject.toml.
# This avoids resolver-driven torch/torchvision drift (e.g. missing torchvision::nms).
uv pip install \
    "diffusers==0.36.0" \
    "transformers==4.57.1" \
    "peft>=0.17" \
    diffsynth

# Only install xformers for non-ROCm instances.
# Use --no-deps so xformers cannot modify the preinstalled torch stack.
if ! command -v rocminfo >/dev/null 2>&1; then
    if ! uv pip install --no-deps xformers; then
        echo "xformers wheel unavailable for this environment; continuing without it."
    fi
fi
