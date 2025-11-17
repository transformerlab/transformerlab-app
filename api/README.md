<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://transformerlab.ai"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo_Reverse.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg">
    <img alt="transformer lab logo" src="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg" style="max-width: 650px">
  </picture></a>

  <h1 align="center" style="color: rgb(68, 73, 80); letter-spacing: -1px">Transformer Lab API</h1>

  <p align="center">
    API for <a href="http://github.com/transformerlab/transformerlab-app">Transformer Lab App</a>.
    <br />
    <a href="https://transformerlab.ai/docs"><strong>Explore the docs »</strong></a>
  </p>
</div>

[![Pytest](https://github.com/transformerlab/transformerlab-api/actions/workflows/pytest.yml/badge.svg)](https://github.com/transformerlab/transformerlab-api/actions/workflows/pytest.yml)

# API for Transformer Lab

This is the API for the [Transformer Lab App](https://github.com/transformerlab/transformerlab-app) which is the main repo for this project. Please go the Transformer Lab App repository to learn more and access documentation.

Use the instructions below if you are installing and running the API on a server, manually.

# Requirements

- An NVIDIA/AMD GPU + Linux or Windows with WSL2 support
- or MacOS with Apple Silicon
- If you do not have a GPU, the API will run but will only be able to do inference, but not things like training

# Automatic Installation

You can use the install script to get the application running:

```bash
./install.sh
```

This will install [mamba](https://mamba.readthedocs.io/en/latest/user_guide/mamba.html#mamba) if it's not installed, and then use `conda` and `uv pip` to install the rest of the application requirements. (The installer only uses mamba/conda to install Python and CUDA drivers, all Python dependencies are installed using `uv`)

# Manual Installation

If you prefer to install the API without using the install script you can follow the steps on this page:

[https://transformerlab.ai/docs/install/advanced-install](https://transformerlab.ai/docs/install/advanced-install)

# Run

Once conda and dependencies are installed, run the following:

```bash
./run.sh
```

# Developers:

## Updating Requirements

Dependencies are managed with uv (installed separately). Add new requirements to `requirements.in` and to `requirements-rocm.in` (if you want to enable support for AMD GPUs as well) and regenerate their corresponding `requirements-uv.txt` variations by running the following commands:

```bash
# GPU enabled requirements for CUDA
uv pip compile requirements.in -o requirements-uv.txt

# GPU enabled requirements for ROCm
uv pip compile requirements-rocm.in -o requirements-rocm-uv.txt --index=https://download.pytorch.org/whl/rocm6.4 --index-strategy unsafe-best-match
sed -i 's/\+rocm6\.4//g' requirements-rocm-uv.txt

# On a Linux or Windows (non-Mac) system without GPU support (CPU only), run:
uv pip compile requirements.in -o requirements-no-gpu-uv.txt --index=https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match
sed -i 's/\+cpu//g' requirements-no-gpu-uv.txt

# On a MacOS system (Apple Silicon), run:
uv pip compile requirements.in -o requirements-no-gpu-uv.txt
```

### NOTES:

1. If the command that generates `requirements-rocm-uv.txt` adds the `nvidia-ml-py` library then you should remove that.

2. the `sed` commands are to remove the suffixes on pytorch libraries that get added but break the install

# Windows Notes

https://transformerlab.ai/docs/install/#install-on-windows
