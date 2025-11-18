git clone https://github.com/huggingface/nanotron
cd nanotron
uv pip install -e .

uv pip install numba datatrove
uv pip install ninja
uv pip install https://github.com/Dao-AILab/flash-attention/releases/download/v2.7.4.post1/flash_attn-2.7.4.post1+cu12torch2.6cxx11abiTRUE-cp311-cp311-linux_x86_64.whl
