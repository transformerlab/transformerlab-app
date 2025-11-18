# Fine-Tuning Audio Text-to-Speech Models with LoRA using Unsloth

### Introduction

This trainer plugin enables efficient fine-tuning of text-to-speech (TTS) models using the Unsloth library with LoRA. Unsloth provides optimized training routines that significantly reduce memory usage and training time while maintaining high-quality results.


**Dataset Requirements:**
Your dataset should contain paired audio and text data with the following structure:
- **audio**: Audio arrays containing speech samples
- **text**: Corresponding transcriptions or text prompts
- **speaker** (optional): Speaker identification for multi-speaker datasets

**Note:** The column names for audio and text data can be customized in the Plugin Config if your dataset uses different column names.

**Example Datasets:**
- MrDragonFox/Elise
- Any dataset with `audio` and `text` columns in HuggingFace format

**Supported Model Architectures:**
- **Orpheus Models**: `unsloth/orpheus-3b-0.1-ft`, `unsloth/orpheus-3b-0.1-ft-bnb-4bit`
- **CSM Models**: `unsloth/csm-1b`
