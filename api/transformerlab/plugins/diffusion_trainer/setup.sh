uv pip install "peft>=0.15.0"

# Only install xformers for non-rocm instances
if ! command -v rocminfo &> /dev/null; then
    uv pip install xformers
fi