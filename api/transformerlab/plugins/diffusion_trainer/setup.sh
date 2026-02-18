#!/bin/bash

# Keep plugin deps aligned with the base plugin venv created from api/pyproject.toml.
# This avoids resolver-driven torch/torchvision drift (e.g. missing torchvision::nms).
uv pip install \
    "diffusers" \
    "transformers" \
    "peft>=0.17" \
    diffsynth

# xformers is ABI-sensitive and frequently mismatches the preinstalled torch build.
# Keep it opt-in to avoid import-time crashes (for example undefined C++ symbols).
# To opt in, set TLAB_ENABLE_XFORMERS=1 before running setup.
if [ "${TLAB_ENABLE_XFORMERS:-0}" = "1" ] && ! command -v rocminfo >/dev/null 2>&1; then
    if uv pip install --no-deps xformers; then
        if ! python -c "import xformers" >/dev/null 2>&1; then
            echo "xformers import test failed; uninstalling incompatible wheel and continuing without xformers."
            uv pip uninstall -y xformers || true
        fi
    else
        echo "xformers wheel unavailable for this environment; continuing without it."
    fi
else
    echo "Skipping xformers install (set TLAB_ENABLE_XFORMERS=1 to opt in)."
fi
