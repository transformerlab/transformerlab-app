# Huggingface Dataset Generator

## Overview

The Huggingface Dataset Generator plugin creates and uploads a dataset to Huggingface based on reference documents. This plugin specializes in generating question-answer pairs for both single-shot and multi-hop scenarios, making it suitable for training and evaluating question answering systems. The plugin:

- Processes reference documents and splits them into configurable chunks
- Generates single-shot questions based on individual chunks
- Creates multi-hop questions that require information from multiple chunks
- Configures sampling strategies for both question types
- Uploads the resulting dataset to Huggingface for easy sharing and use
- Saves the datasets within Transformer Lab for immediate access
- Supports various sampling modes to optimize resource usage

This tool is particularly valuable when you need to create custom datasets for training question answering models, evaluating retrieval systems, or benchmarking language models on reasoning tasks.

## Parameters

### Reference Documents

- **Description:**  
  Provide the reference documents to use as the basis for generating questions. The content of these documents will be processed, chunked, and used to create both single-shot and multi-hop questions.

### Judge Model (generation_model)

- **Type:** string
- **Description:**  
  Select the model to be used for dataset generation. This should be a model with vision capabilities (like GPT-4o) to properly ingest and understand documents, including visual elements if present.

### Maximum concurrent API requests (max_concurrent_requests)

- **Type:** integer
- **Default:** 8
- **Description:**  
  Maximum number of concurrent requests to the model. This setting helps avoid overloading the model provider's API and ensures smooth operation.

### Minimum tokens per chunk (l_min_tokens)

- **Type:** integer
- **Default:** 64
- **Description:**  
  Minimum number of tokens per chunk. This ensures that chunks are not too small and contain enough information for meaningful questions.

### Maximum tokens per chunk (l_max_tokens)

- **Type:** integer
- **Default:** 128
- **Description:**  
  Maximum number of tokens per chunk. This ensures that chunks are not too large and can be processed efficiently.

### Threshold to decide a boundary (tau_threshold)

- **Type:** number
- **Default:** 0.8
- **Description:**  
  Threshold to decide a boundary between chunks. This ensures that chunks are not too similar and contain enough unique information.

### Minimum number of unique chunks to combine (h_min)

- **Type:** integer
- **Default:** 2
- **Description:**  
  Minimum number of unique chunks to combine for multi-hop question generation.

### Maximum number of unique chunks to combine (h_max)

- **Type:** integer
- **Default:** 5
- **Description:**  
  Maximum number of unique chunks to combine for multi-hop question generation.

### Factor for multi-hop generation (num_multihops_factor)

- **Type:** number
- **Default:** 2.0
- **Description:**  
  Higher numbers generate a larger number of multi-hop questions.

### Instructions for single-shot question generation (single_shot_instructions)

- **Type:** string
- **Default:** "Generate questions to test a curious adult"
- **Description:**  
  Prompt instructions for generating single-shot questions.

### Instructions for multi-hop question generation (multi_hop_instructions)

- **Type:** string
- **Default:** "Generate questions to test a curious adult"
- **Description:**  
  Prompt instructions for generating multi-hop questions.

### Sampling settings for single-shot questions

- **Mode (single_shot_sampling_mode):** 
  - **Type:** string
  - **Default:** "count"
  - **Options:** "count", "all", "percentage"
  - **Description:** Sampling mode for single-shot questions. Set to "count" for resource-saving, or "all" to use all samples.

- **Value (single_shot_sampling_value):**
  - **Type:** number
  - **Default:** 5
  - **Description:** Value for sampling if mode is count or percentage.

- **Random Seed (single_shot_random_seed):**
  - **Type:** integer
  - **Default:** 42
  - **Description:** Random seed for consistent sampling results.

### Sampling settings for multi-hop questions

- **Mode (multi_hop_sampling_mode):**
  - **Type:** string
  - **Default:** "percentage"
  - **Options:** "count", "all", "percentage"
  - **Description:** Sampling mode for multi-hop questions. Set to "percentage" for resource-saving, or "all" to use all samples.

- **Value (multi_hop_sampling_value):**
  - **Type:** number
  - **Default:** 0.3
  - **Description:** Value for sampling if mode is count or percentage.

- **Random Seed (multi_hop_random_seed):**
  - **Type:** integer
  - **Default:** 42
  - **Description:** Random seed for consistent sampling results.

## Usage

1. **Select Reference Documents:** Choose the documents that will serve as the foundation for your dataset.

2. **Configure Judge Model:** Select a model with vision capabilities to properly process documents.

3. **Configure Chunking Parameters:** Adjust the token limits and threshold to control how documents are split into chunks.

4. **Configure Multi-hop Settings:** Set the minimum and maximum number of chunks to combine for multi-hop questions.

5. **Set Instructions:** Customize the instructions for question generation to match your desired question style and complexity.

6. **Configure Sampling:** Choose appropriate sampling modes based on your resource constraints and dataset size requirements.

7. **Generate the Dataset:** Run the plugin and the dataset will be generated and uploaded to Huggingface and will be available within Transformer Lab as 6 separate datasets for use.

