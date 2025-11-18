# Data Synthesizer

## Overview

The Data Synthesizer plugin uses Large Language Models (LLMs) to create synthetic data for various use cases. This plugin supports different generation types and models, allowing users to generate data from scratch based on a scenario.

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

### Scenario

- **Type:** string
- **Description:** Describe the scenario for which you want to generate data for 'scratch' generation only.

### Task

- **Type:** string
- **Description:** Describe the task for which you want to generate data for 'scratch' generation only.

### Input Format

- **Type:** string
- **Description:** Describe the format of the input data which will be sent to the model for 'scratch' generation only.

### Expected Output Format

- **Type:** string
- **Description:** Describe the format of the output data which will be received from the model for 'scratch' generation only.

## Usage

1. **Select the Generation Model:** Choose the model to be used for generation from the `generation_model` parameter.
2. **Specify the Number of Samples:** Enter the number of samples to generate in the `num_goldens` parameter.
3. **Provide Context:** If using 'context' generation, paste your reference context in the `context` parameter.
4. **Describe the Scenario:** If using 'scratch' generation, describe the scenario in the `scenario` parameter.
5. **Describe the Task:** If using 'scratch' generation, describe the task in the `task` parameter.
6. **Specify the Input Format:** If using 'scratch' generation, describe the input format in the `input_format` parameter.
7. **Specify the Expected Output Format:** If using 'scratch' generation, describe the expected output format in the `expected_output_format` parameter.
