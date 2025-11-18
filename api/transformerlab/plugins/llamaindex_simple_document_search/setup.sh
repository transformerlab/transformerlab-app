#!/bin/bash
uv pip install llama-index==0.12.38
uv pip install llama-index-llms-openai-like==0.4.0
uv pip install openai==1.82.1
uv pip install llama-index-embeddings-huggingface==0.5.4
uv pip install cryptography==44.0.2 # needed to read PDFs
# uv pip install xformers
