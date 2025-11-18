# Objective Metrics

> Powered by [DeepEval Framework](https://github.com/confident-ai/deepeval)

## Overview

The Objective Metrics plugin is designed to evaluate the outputs of Large Language Models (LLMs) using objective metrics. This plugin provides a set of predefined metrics to assess various aspects of generated content.


## Dataset Requirements

A local dataset uploaded to the dataset in Transformer Lab is required. The dataset file must be in CSV format and should compulsorily have the following columns:

- `input`
- `output`
- `expected_output`

## Parameters

### Evaluation Metric

- **Type:** string
- **Description:** Select the evaluation metric you want to use. The available options are:
  - **Rouge:** Measures the overlap of n-grams between the generated output and the expected output.
  - **BLEU:** Evaluates the precision of n-grams in the generated output compared to the expected output.
  - **Exact Match:** Checks if the generated output exactly matches the expected output.
  - **Quasi Exact Match:** Allows for minor variations while checking for an exact match.
  - **Quasi Contains:** Checks if the generated output contains the expected output with minor variations.
  - **BERT Score:** Uses BERT embeddings to evaluate the similarity between the generated output and the expected output.

### Dataset Split
- **Type:** string
- **Description:** Specify the dataset split to be used for evaluation. The options are:
  - **train:** Use the training split of the dataset.
  - **valid:** Use the validation split of the dataset.
  - **test:** Use the test split of the dataset.

### Fraction of samples
- **Type:** number
- **Description:** Set the fraction of samples to evaluate. This is useful for limiting the evaluation to a specific proportion of samples from the dataset.
- **Default:** 1.0
- **Maximum:** 1.0
- **Multiple Of:** 0.1

## Usage

1. **Select the Evaluation Metric:** Choose the metric that best fits your evaluation needs from the `metrics` parameter.
2. **Provide the Output Path:** Enter the path where you want to save the evaluation results in the `output_path` parameter.
3. **Specify the Dataset:** Enter the dataset to be used for evaluation in the `dataset` parameter.
