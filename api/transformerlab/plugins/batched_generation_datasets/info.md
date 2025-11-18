# Batched Output Generation from Datasets

## Overview

The Batched Output Generation from Datasets plugin is designed to generate outputs for a synthetic dataset using either a local or a commercial LLM. This plugin processes your data in batches and allows you to customize how generation is performed for your data based on the selected model and parameters.

## Parameters

### generation_model

- **Title:** Generation Model (Model to be used for Generation. Select `Local` to use the local model running)
- **Type:** string
- **Description:** Choose the model for output generation. Options include:
  - Local
  - Claude 3.5 Haiku
  - Claude 3.5 Sonnet
  - OpenAI GPT 4o
  - OpenAI GPT 4o Mini

### system_prompt

- **Title:** System Prompt
- **Type:** string
- **Description:** Define the system prompt to guide the model during generation, if needed.

### input_column

- **Title:** Input Column
- **Type:** string
- **Description:** Specify the column in your dataset that contains the input for generation.

### output_column

- **Title:** Output Column
- **Type:** string
- **Description:** Specify the column where the generated outputs should be stored.

### batch_size

- **Title:** Batch Size
- **Type:** integer
- **Default:** 128
- **Description:** Set the number of records to process in each batch.

### temperature

- **Title:** Temperature
- **Type:** number
- **Default:** 0.01
- **Range:** 0.0 to 2.0 (increments of 0.01)
- **Description:** Adjusts the temperature of the generation.

### top_p

- **Title:** Top P
- **Type:** number
- **Default:** 1.0
- **Range:** 0.0 to 1.0 (increments of 0.1)
- **Description:** Controls the diversity of token selection during generation.

### max_tokens

- **Title:** Max Tokens
- **Type:** integer
- **Default:** 1024
- **Range:** 1 to 4096
- **Description:** Sets the maximum number of tokens to be generated.

## Usage

1. **Configure the Plugin Parameters:**

   - Choose the appropriate generation model using the `generation_model` parameter.
   - Provide a custom `system_prompt` to guide the LLM’s behavior.
   - Specify the column names for both input and output using `input_column` and `output_column`.
   - Set the desired `batch_size`, `temperature`, `top_p`, and `max_tokens` to fine-tune the generation process.

2. **Run the Generation Process:**  
   With the parameters set, execute the plugin script (`main.py`) or use the provided setup script (`setup.sh`) to generate outputs for your dataset.

3. **Review and Adjust:**  
   Once the generation is complete, verify the results in your output column. If the outputs require adjustments, you can alter the parameters and run the process again.
