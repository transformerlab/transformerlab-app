#!/usr/bin/env bash
# git clone https://github.com/EleutherAI/lm-evaluation-harness
# cd lm-evaluation-harness
# pip install -e .
uv pip install lm-eval==0.4.7
uv pip install "lm-eval[api]"
uv pip install pandas
