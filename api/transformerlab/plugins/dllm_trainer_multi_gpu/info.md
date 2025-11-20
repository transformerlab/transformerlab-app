# Diffusion LLM Trainer

## Overview

The Diffusion LLM Trainer plugin provides supervised fine-tuning (SFT) capabilities for text diffusion language models (dLLMs) using the dllm library. This plugin supports three types of diffusion LLM architectures and training methods:

- **BERT**: BERT-based diffusion models using MDLM (Masked Diffusion Language Modeling) training
- **Dream**: Dream diffusion models using DreamTrainer with CART loss weighting
- **LLaDA**: LLaDA (Large Language Diffusion Architecture) models using MDLM training

## Features

- Multi-GPU training support with accelerate
- Three training methods: bert, dream, and llada
- LoRA (Low-Rank Adaptation) support for parameter-efficient fine-tuning
- Configurable templates for instruction, input, and output formatting
- Support for both epoch-based and step-based training
- Masked prompt loss option
- 4-bit quantization support
- Weights & Biases logging integration

## Parameters

### Training Method

Select the diffusion LLM training method:

- `bert`: Uses MDLMTrainer for BERT-based diffusion models (e.g., ModernBERT-chat)
- `dream`: Uses DreamTrainer with CART loss weighting for Dream models
- `llada`: Uses MDLMTrainer for LLaDA models

### Training Configuration

- **Training Device**: Device to train on (`cuda`, `cpu`, or `tpu`, default: `cuda`)
- **GPU IDs**: Comma-separated list of GPU IDs or `auto` for all GPUs (default: `auto`)
- **Batch Size**: Number of sequences processed simultaneously (default: 4)
- **Number of Training Epochs**: Number of epochs to train (default: 0, use steps instead)
- **Number of Training Steps**: Total optimizer steps when epochs is 0 (default: 1000)
- **Maximum Sequence Length**: Maximum sequence length, longer sequences will be truncated (default: 1024)

### Learning Rate

- **Learning Rate**: Initial learning rate (default: 2e-5)
- **Learning Rate Schedule**: Scheduler type (`constant`, `linear`, `cosine`, `constant_with_warmup`, default: `cosine`)
- **Warmup Ratio**: Fraction of training steps for warmup (default: 0.1)

### LoRA Configuration

- **Use LoRA**: Enable LoRA for parameter-efficient fine-tuning (default: false)
- **LoRA R**: Rank of update matrices (4-64, multiple of 4, default: 32)
- **LoRA Alpha**: LoRA scaling factor (4-128, multiple of 4, default: 64)
- **LoRA Dropout**: LoRA dropout rate (0.05-0.9, default: 0.05)

### Data Configuration

- **Mask Prompt Loss**: Whether to mask loss on prompt tokens (default: true)
- **Number of Processes**: Number of parallel processes for data processing (default: 8)
- **Truncation Strategy**: How to handle long sequences (`filter` or `right`, default: `right`)
- **Input Template**: Jinja2 template for formatting user messages (optional)
- **Output Template**: Jinja2 template for formatting assistant messages (optional)
- **Instruction Template**: Template string for system messages (optional, used directly, not as Jinja)

### Dream-Specific Parameters

- **Per-batch Cutoff**: Randomly pick a response length from batch and trim others (default: true)
- **Response Cutoff Ratio**: Probability of randomly cutting sequences (0.0-1.0, default: 0.0)
- **Loss Weight Type**: Loss weight type (`cart[geo_p:0.3]` or `scheduler`, default: `cart[geo_p:0.3]`)

### Optimization

- **Gradient Accumulation Steps**: Number of steps to accumulate gradients (default: 1)
- **Data Type**: Model data type (`float32`, `float16`, or `bfloat16`, default: `bfloat16`)
- **Load in 4-bit**: Load model with 4-bit quantization (default: false)

### Logging and Saving

- **Logging Steps**: Log metrics every N steps (default: 10)
- **Evaluation Strategy**: When to evaluate (`no`, `steps`, or `epoch`, default: `steps`)
- **Evaluation Steps**: Fraction of training steps between evaluations (default: 0.25)
- **Save Steps**: Fraction of training steps between saves (default: 0.25)
- **Log to Weights and Biases**: Enable W&B logging (default: true)

### Output

- **Adaptor Name**: Name for the saved adaptor model (default: "adaptor")
- **Output Directory**: Directory to save training outputs (default: "./output")

## Usage

1. **Select Model**: Choose your foundation model (must be a diffusion LLM compatible with selected training method)
2. **Choose Training Method**: Select the appropriate method (bert, dream, or llada)
3. **Select Dataset**: Choose a training dataset
4. **Configure Templates** (optional): Set up instruction, input, and output templates if your dataset doesn't have standard column names
5. **Configure Parameters**: Adjust training parameters as needed
6. **Start Training**: Launch the training job

## Template Formatting

The trainer supports Jinja2 templates for flexible data formatting:

- **Input Template**: Format user messages from dataset rows (e.g., `"{{ instruction }}\n{{ input }}"`)
- **Output Template**: Format assistant messages from dataset rows (e.g., `"{{ output }}"`)
- **Instruction Template**: Direct system message template (not Jinja, used as-is)

If templates are not provided, the trainer will attempt to infer the format from common column names:
- `instruction` + `input` + `output`
- `prompt` + `completion`
- `text` (split by double newline)
- Existing `messages` format (passed through)

## Examples

### Training a BERT Model

- Training Method: `bert`
- Batch Size: `8`
- Learning Rate: `2e-5`
- Number of Training Epochs: `4`

### Training a Dream Model

- Training Method: `dream`
- Batch Size: `4`
- Learning Rate: `1e-5`
- Number of Training Steps: `2000`
- Per-batch Cutoff: `true`
- Loss Weight Type: `cart[geo_p:0.3]`

### Training a LLaDA Model with Custom Templates

- Training Method: `llada`
- Input Template: `"Question: {{ question }}\nAnswer:"`
- Output Template: `"{{ answer }}"`
- Instruction Template: `"You are a helpful assistant."`
- Batch Size: `4`
- Maximum Sequence Length: `2048`

## Technical Details

This plugin uses the [dllm](https://github.com/ZHZisZZ/dllm) library's training scripts and classes:

- **MDLMTrainer**: Used for bert and llada training methods
- **DreamTrainer**: Used for dream training method with CART loss weighting
- **Accelerate**: For multi-GPU distributed training

The plugin supports both full fine-tuning and LoRA-based parameter-efficient fine-tuning. When LoRA is enabled, only the LoRA adaptors are saved. When LoRA is disabled and training completes, the full model is saved to the workspace models directory.

