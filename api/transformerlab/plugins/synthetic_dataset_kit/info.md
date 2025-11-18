# Synthetic Dataset Generator (synthetic-data-kit)

## Overview

This plugin integrates Meta's `synthetic-data-kit` with TransformerLab to generate high-quality synthetic datasets for tasks like:

- Question-answering
- Summarization
- Chain-of-thought reasoning

It works by extracting content from input documents (PDF, DOCX, etc.), generating responses using a VLLM-based language model, curating the outputs, and formatting them into `jsonl`, `alpaca`, or `chatml`.

## 🔒 Model Requirements

This plugin requires a model that is:

- ✅ Compatible with **Hugging Face's `transformers` library**
- ✅ Supported by **VLLM** as of v0.3.3 or later
- ✅ In **float16, bf16, or int4 (GPTQ/AWQ)** format

### ✅ Known working architectures:
- `LlamaForCausalLM` (e.g. LLaMA 2/3)
- `QwenForCausalLM` (Qwen1.5+)
- `MistralForCausalLM`
- `GemmaForCausalLM`
- `FalconForCausalLM`
- `InternLMForCausalLM`

For a complete list of supported models see: [text](https://docs.vllm.ai/en/latest/models/supported_models.html#text-generation)

### ❌ Not supported:
- GGUF / GGML models (e.g. for llama.cpp)
- MLX (Apple Silicon) models
- T5-style encoder-decoder models (e.g. `flan-t5-small`)
- Models with unsupported tokenizers or unknown architectures
- Quantized formats not loadable by VLLM

If an unsupported model is selected, the job will fail during generation with a clear error.

## Supported Features

- Document ingestion (PDF, DOCX, TXT, HTML, etc.)
- Generation of QA pairs, summaries, or reasoning chains
- Curation with scoring thresholds
- Output formatting: `jsonl`, `alpaca`, `chatml`
- Run isolation with individual output folders
- Uploading final datasets to TransformerLab

## Parameters

### Model Name

- **Type:** string  
- **Description:** A Hugging Face-compatible model name or local path. The model must be supported by VLLM.

### Generation Task Type

- **Type:** string  
- **Options:** `qa`, `summary`, `cot`, `qa_rating`, `cot_enhancement`  
- **Description:** Defines what type of content to generate.

### Reference Documents (tflabcustomui_docs)

- **Type:** string  
- **Description:** Comma-separated list of documents to use for generation.

### Number of Pairs

- **Type:** integer  
- **Default:** 10  
- **Description:** Total number of QA pairs or generations to produce.

### Curation Threshold

- **Type:** integer (1–10)  
- **Description:** Minimum score required to retain a generated pair.

### Output Format

- **Type:** string  
- **Options:** `jsonl`, `alpaca`, `chatml`  
- **Description:** Output structure for the final dataset.

## Usage

1. Upload your documents.
2. Choose a supported LLM (see model requirements above).
3. Choose generation type and number of examples.
4. Run the plugin.
5. Your dataset will be generated, curated, and uploaded.

## Output Format

Each output format is structured for downstream compatibility:

### JSONL (default)
```json
{"question": "What is AI?", "answer": "Artificial intelligence."}

### Alpaca
```json
{"instruction": "What is AI?", "input": "", "output": "Artificial intelligence."}

### ChatML
```json
{"messages": [{"role": "user", "content": "What is AI?"}, {"role": "assistant", "content": "Artificial intelligence."}]}
