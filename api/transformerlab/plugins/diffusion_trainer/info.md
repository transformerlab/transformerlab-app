# Diffusion Trainer

## Introduction

The Diffusion Trainer plugin enables fine-tuning of Stable Diffusion models using LoRA adapters. This trainer is designed for efficient and scalable customization of diffusion models on your own datasets.

## Features

- Fine-tune multiple diffusion model architectures (Stable Diffusion, SDXL, SD3, Flux) with LoRA adapters
- Comprehensive data preprocessing and augmentation options (color jitter, random rotation, interpolation modes)
- Advanced training techniques (gradient checkpointing, mixed precision, EMA)
- Flexible loss functions (L2, Huber) and prediction types (epsilon, v-prediction)
- SNR-based loss weighting and noise offset support
- Evaluation image generation during training
- Integrated logging with Weights & Biases (W&B)

## Supported Model Architectures

- **StableDiffusionPipeline**: Standard Stable Diffusion v1.x models
- **StableDiffusionXLPipeline**: Stable Diffusion XL models  
- **StableDiffusion3Pipeline**: Stable Diffusion 3.x models
- **FluxPipeline**: Flux diffusion models

## Parameters

### Core Training Parameters

- **Adaptor Name**: Name for the LoRA adaptor that will be created and saved (required)
- **Trigger Word**: Optional trigger word to prepend to all captions during training (e.g., 'sks person' or 'ohwx style')
- **Number of Training Epochs**: Number of training epochs (default: 100)
- **Train Batch Size**: Number of images per batch (default: 1)
- **Gradient Accumulation Steps**: Steps to accumulate gradients before updating weights (default: 1)

### Dataset Configuration

- **Caption Column**: Name of the column containing image captions (default: "text")
- **Image Column**: Name of the column containing images (default: "image")
- **Caption Dropout Rate**: Probability of dropping captions during training (default: 0.0)

### Image Processing

- **Image Resolution**: Image resolution for training (default: 512)
- **Center Crop**: Use center crop instead of random crop (default: false)
- **Image Interpolation Mode**: Interpolation method for resizing (default: "lanczos")
- **Random Horizontal Flip**: Apply random horizontal flip (default: false)

### Data Augmentation

- **Enable Color Jitter**: Enable color jitter augmentation (default: false)
- **Color Jitter Brightness**: Brightness variation amount (default: 0.1)
- **Color Jitter Contrast**: Contrast variation amount (default: 0.1) 
- **Color Jitter Saturation**: Saturation variation amount (default: 0.1)
- **Color Jitter Hue**: Hue variation amount (default: 0.05)
- **Enable Random Rotation**: Enable random rotation (default: false)
- **Random Rotation Degrees**: Maximum rotation degrees (default: 5)
- **Random Rotation Probability**: Probability of applying rotation (default: 0.3)

### LoRA Configuration

- **LoRA Rank (r)**: LoRA rank - higher values = more parameters but better quality (default: 8)
- **LoRA Alpha**: LoRA scaling factor (default: 16)

### Optimizer Settings

- **Learning Rate**: Learning rate for optimizer (default: 1e-4)
- **LR Scheduler**: Learning rate schedule type (default: "constant")
- **LR Warmup Steps**: Steps to gradually increase learning rate (default: 50)
- **Adam Beta 1**: Adam optimizer beta1 parameter (default: 0.9)
- **Adam Beta 2**: Adam optimizer beta2 parameter (default: 0.999)
- **Adam Weight Decay**: Weight decay for regularization (default: 0.01)
- **Adam Epsilon**: Adam epsilon for numerical stability (default: 1e-8)
- **Max Grad Norm**: Maximum gradient norm for clipping (default: 1.0)

### Advanced Training Options

- **Loss Type**: Loss function type - "l2" or "huber" (default: "l2")
- **Huber Loss Beta**: Beta parameter for Huber loss (default: 0.1)
- **Prediction Type**: Prediction type - "epsilon" or "v_prediction" (default: "epsilon")
- **SNR Gamma**: Signal-to-noise ratio gamma for loss weighting (default: 0)
- **Min-SNR Gamma**: Minimum SNR gamma value (default: 0)
- **Noise Offset**: Offset added to noise for training (default: 0)

### Performance Optimization

- **Mixed Precision**: Enable mixed precision training - "no", "fp16", or "bf16" (default: "no")
- **Enable xFormers Memory Efficient Attention**: Use xFormers for memory efficiency (default: false)
- **Enable Gradient Checkpointing**: Trade compute for memory (default: false)
- **Use EMA (Exponential Moving Average)**: Use Exponential Moving Average of weights (default: false)
- **EMA Decay Rate**: EMA decay rate (default: 0.9999)

### Evaluation

- **Evaluation Prompt**: Text prompt for generating evaluation images (default: "")
- **Evaluation Steps**: Generate evaluation images every N epochs (default: 1)
- **Evaluation Inference Steps**: Denoising steps for evaluation images (default: 50)
- **Evaluation Guidance Scale**: Guidance scale for evaluation generation (default: 7.5)

### Logging

- **Log to Weights and Biases**: Log training metrics to Weights & Biases (default: true)

## Usage

1. Prepare your dataset with image and caption columns (default column names are "image" and "text").
2. Configure the plugin parameters as needed:
   - Set the adaptor name and optional trigger word
   - Adjust training parameters (epochs, batch size, learning rate)
   - Configure LoRA settings (rank and alpha)
   - Enable data augmentation options if desired
   - Set up evaluation prompts for monitoring progress
3. Launch training via the Transformer Lab interface.
4. Monitor training progress through W&B logging (if enabled) and evaluation images.
5. After training, LoRA adapter weights will be saved for use with diffusion pipelines.

## Output

- LoRA adapter weights saved to the specified output directory
- Training logs and metrics (via Tensorboard and W&B)
- Evaluation images generated during training (if eval_prompt is provided)