#!/usr/bin/env bash
# Install dllm from GitHub
git clone https://github.com/deep1401/dllm
cd dllm
uv pip install -e .
uv pip install "transformers>4.57.0"
