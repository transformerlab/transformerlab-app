# Eleuther AI LM Evaluation Harness (MLX)

## Overview

The Eleuther AI LM Evaluation Harness plugin is designed to benchmark language models on various benchmarks available in the EleutherAI Harness suite. This plugin provides a comprehensive set of tasks to evaluate different aspects of language models.
This plugin is specially designed for the MLX platform, which allows you to run the evaluation harness on Mac devices.

## Parameters

### task
- **Title:** Task
- **Type:** string
- **Description:** Select the task you want to use for benchmarking. The available options cover a wide range of evaluation metrics related to advanced AI risk, coordination, corrigibility, self-awareness, and more.

### limit
- **Title:** Limit
- **Type:** number
- **Description:** A fraction of samples to run for evaluation. Enter `1` or leave it as the default to use all samples. This parameter allows you to control the number of samples used for evaluation, which can be useful for quicker tests or limited resources.

## Usage

1. **Select the Task:** Choose the task that best fits your benchmarking needs from the `task` parameter.
2. **Set the Limit (if needed):** Enter a fraction of samples to run for evaluation in the `limit` parameter. Use `1` or leave it as the default to evaluate all samples.