#!/bin/bash

echo "Installing dependencies for 3D Generation Plugin..."

echo "Installing Hunyuan3D-2.1 dependencies..."
git clone --depth 1 https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1.git hunyuan3d_temp

mv hunyuan3d_temp/hy3dshape .
mv hunyuan3d_temp/hy3dpaint .
rm -rf hunyuan3d_temp

cd hy3dpaint/custom_rasterizer
pip install -e .
cd ../..

cd hy3dpaint/DifferentiableRenderer
bash compile_mesh_painter.sh
cd ../..

wget -q https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth -P hy3dpaint/ckpt || echo "Warning: Failed to download Real-ESRGAN model"

cd ../..

echo "Installing Python dependencies..."
pip install torch==2.5.1 torchvision==0.20.1 --index-url https://download.pytorch.org/whl/cu124
pip install diffusers transformers accelerate opencv-python pillow trimesh numpy
pip install gradio flask

echo "3D Generation plugin dependencies installed successfully!"
