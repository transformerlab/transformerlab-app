#!/usr/bin/env bash
#uv pip install mlx==0.23.0 # Using this version to work around bug: https://github.com/Blaizzy/mlx-audio/issues/207
uv pip install "mlx-audio==v0.2.4"
uv pip install "librosa==0.11.0"
python -m ensurepip --upgrade
uv pip install misaki[ja]
uv pip install misaki[zh]
uv pip install "sounddevice"
