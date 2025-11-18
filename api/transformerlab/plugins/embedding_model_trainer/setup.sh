#!/usr/bin/env bash

# Install Python packages needed to train with Sentence Transformers v3:
# uv pip install --upgrade \
#   torch \
#   transformers==4.41.2 \
#   "sentence-transformers>=3" \
#   datasets==2.19.1 \
#   huggingface_hub

# (Optional) Add any other libraries you need, e.g. wandb, to track experiments
# uv pip install wandb
uv pip install sentence-transformers