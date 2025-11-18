# Common EleutherAI LM Eval Harness

## Overview

The Eleuther AI LM Evaluation Harness plugin is designed to benchmark language models on some of the most commonly used tasks and all their variants available in the EleutherAI Harness suite. This plugin provides a comprehensive set of tasks to evaluate different aspects of language models.

## Supported Tasks

- **MMLU (Massive Multitask Language Understanding):**  
  This comprehensive benchmark is open access and widely used for evaluating models across various academic subjects.

- **ARC (AI2 Reasoning Challenge):**  
  Both ARC Easy and ARC Challenge are open access tasks that evaluate a model's ability to answer grade-school science questions.

- **HellaSwag:**  
  This open access task assesses common sense reasoning and situational understanding.

- **WinoGrande:**  
  An open access benchmark for testing commonsense reasoning and coreference resolution.

- **PIQA (Physical Interaction Question Answering):**  
  This open access task evaluates physical commonsense reasoning.

- **BIG-Bench Hard (BBH):**  
  A suite of 23 challenging tasks from the broader BIG-Bench collection, which is open access.

## Parameters

### task

- **Title:** Task
- **Type:** string
- **Description:** Select the task you want to use for benchmarking. The available options cover a wide range of evaluation metrics related to reasoning, language understanding, etc.

### limit

- **Title:** Limit
- **Type:** number
- **Description:** A fraction of samples to run for evaluation. Enter `1` or leave it as the default to use all samples. This parameter allows you to control the number of samples used for evaluation, which can be useful for quicker tests or limited resources.

## Usage

1. **Select the Task:** Choose the task that best fits your benchmarking needs from the `task` parameter.
2. **Set the Limit (if needed):** Enter a fraction of samples to run for evaluation in the `limit` parameter. Use `1` or leave it as the default to evaluate all samples.