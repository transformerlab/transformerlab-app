# Data Synthesizer

## Overview

The Data Synthesizer plugin uses Large Language Models (LLMs) to create synthetic data for various use cases. This plugin supports different generation types and models, allowing users to generate data based on raw reference text.

## Parameters

### Generation Model

- **Type:** string
- **Description:** Select the model to be used for generation. The available options are:
  - **Claude 3.5 Haiku**
  - **Claude 3.5 Sonnet**
  - **OpenAI GPT 4o**
  - **OpenAI GPT 4o Mini**
  - **Local**

### Number of Samples to Generate

- **Type:** integer
- **Minimum:** 1
- **Maximum:** 1000
- **Default:** 10
- **Description:** Specify the number of samples to generate.

### Context

- **Type:** string
- **Description:** Paste all your reference context here for 'context' generation only.

## Usage

1. **Select the Generation Type:** Choose the type of generation that best fits your needs from the `generation_type` parameter.
2. **Specify the Number of Samples:** Enter the number of samples to generate in the `num_goldens` parameter.
3. **Provide Context:** If using 'context' generation, paste your reference context in the `context` parameter.
