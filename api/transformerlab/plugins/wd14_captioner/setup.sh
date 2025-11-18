#!/bin/bash
set -e
mkdir -p sd-caption-wd14
cd sd-caption-wd14
if [ ! -d "sd-scripts" ]; then
  git clone https://github.com/kohya-ss/sd-scripts.git
fi
uv pip install \
    Pillow==10.3.0 \
    tqdm==4.66.4 \
    onnxruntime \
    opencv-python \
    toml \
    imagesize \
    onnx \
