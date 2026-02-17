# Use cu130 on DGX Spark, else cu128 for flashinfer-jit-cache
# /etc/dgx-release exists only on DGX systems; DGX_NAME="DGX Spark" identifies Spark
FLASHINFER_CU="cu128"
if [ -r /etc/dgx-release ] && grep -qi 'DGX Spark' /etc/dgx-release 2>/dev/null; then
  FLASHINFER_CU="cu130"
fi

uv pip install "vllm>=0.11.0"
uv pip install "transformers>=4.57.1"
uv pip install qwen-vl-utils==0.0.14
uv pip install flashinfer-python flashinfer-cubin
uv pip install flashinfer-jit-cache --index-url "https://flashinfer.ai/whl/${FLASHINFER_CU}"