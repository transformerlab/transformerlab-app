# Diffusion LLM Evaluator

## Overview

The Diffusion LLM Evaluator plugin provides evaluation capabilities for text diffusion language models (dLLMs) using the EleutherAI LM Evaluation Harness. This plugin supports three types of diffusion LLM architectures:

- **BERT**: BERT-based diffusion models (e.g., ModernBERT-chat)
- **Dream**: Dream diffusion models
- **LLaDA**: LLaDA (Large Language Diffusion Architecture) models

## Features

- Evaluate diffusion LLMs on standard benchmarks (MMLU, HellaSwag, ARC, etc.)
- Support for multiple model architectures (BERT, Dream, LLaDA)
- Configurable diffusion parameters (steps, block length, CFG scale, etc.)
- Few-shot evaluation support
- Chat template support for instruction-tuned models

## Parameters

### Model Type

Select the diffusion LLM model type:

- `bert`: For BERT-based diffusion models
- `dream`: For Dream models
- `llada`: For LLaDA models

### Tasks

Choose from a wide range of evaluation tasks including:

- **Reasoning**: GSM8K, BBH, Minerva Math
- **Knowledge**: MMLU (and its sub-tasks), TruthfulQA
- **Commonsense**: HellaSwag, PIQA, Winogrande
- **Code**: HumanEval, MBPP
- And many more...

### Diffusion Parameters

#### Common Parameters

- **Steps**: Number of diffusion steps (1-2048, default: 128)
- **Max New Tokens**: Maximum tokens to generate (1-4096, default: 128)
- **MC Num**: Monte Carlo samples for loglikelihood estimation (1-512, default: 1)

#### BERT/LLaDA Specific

- **Block Length**: Length of blocks in diffusion process (1-256, default: 32)
- **CFG Scale**: Classifier-free guidance scale (0.0-10.0, default: 0.0)

#### Dream Specific

- **Temperature**: Sampling temperature (0.0-2.0, default: 0.0)
- **Top P**: Nucleus sampling parameter (0.0-1.0, default: 0.95)

### Evaluation Parameters

- **Limit**: Fraction of samples to evaluate (0.0-1.0, default: 1.0)
- **Num Fewshot**: Number of few-shot examples (0-50, default: 0)
- **Apply Chat Template**: Whether to apply chat template formatting (default: false)

## Usage

1. **Select Model**: Choose your foundation model (must be a diffusion LLM)
2. **Choose Model Type**: Select the appropriate model type (bert, dream, or llada)
3. **Select Task**: Choose the evaluation task(s) you want to run
4. **Configure Parameters**: Adjust diffusion and evaluation parameters as needed
5. **Run Evaluation**: Start the evaluation job

## Examples

### Evaluating a LLaDA Model on MMLU

- Model Type: `llada`
- Task: `mmlu`
- Steps: 256
- Max New Tokens: 256
- Block Length: 256
- CFG Scale: 0.0

### Evaluating a Dream Model on GSM8K

- Model Type: `dream`
- Task: `gsm8k`
- Steps: 512
- Max New Tokens: 512
- Temperature: 0.2
- Top P: 0.95

### Evaluating a BERT Model on HellaSwag

- Model Type: `bert`
- Task: `hellaswag`
- Steps: 128
- Max New Tokens: 128
- Block Length: 32
- CFG Scale: 0.0

## Technical Details

This plugin uses the [dllm](https://github.com/ZHZisZZ/dllm) library's evaluation scripts, which register custom model classes with the EleutherAI LM Evaluation Harness. The evaluation harness then uses these registered models to run evaluations.
