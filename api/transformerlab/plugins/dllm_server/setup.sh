#!/usr/bin/env bash
# Install dllm from GitHub
git clone https://github.com/ZHZisZZ/dllm
cd dllm
uv pip install -e .
uv pip install "transformers>4.57.0"
