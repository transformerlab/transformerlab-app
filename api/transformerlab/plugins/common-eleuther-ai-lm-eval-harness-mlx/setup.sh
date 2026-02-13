#!/usr/bin/env bash

# Check if the 'lm-evaluation-harness-mlx' directory exists and remove it if it does
if [ -d "./lm-evaluation-harness-mlx" ]; then
  rm -rf ./lm-evaluation-harness-mlx
fi

# Clone the repository
git clone https://github.com/chimezie/lm-evaluation-harness-mlx || { echo "Git clone failed or repository already exists"; exit 1; }

# Navigate to the directory
cd lm-evaluation-harness-mlx

git checkout mlx

# Install dependencies
uv pip install -e .

uv pip install pandas
uv pip install mlx==0.23.2 --upgrade
uv pip install "mlx-lm==0.22.1" --upgrade
uv pip install "transformers==4.57.3"
