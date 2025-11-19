# LLM-as-Judge Evaluator Plugin

> Powered by [DeepEval Framework](https://github.com/confident-ai/deepeval)
## Overview

The LLM-as-Judge Evaluator plugin is designed to evaluate the outputs of other Large Language Models (LLMs) by using LLMs as judges. This plugin leverages the capabilities of advanced LLMs to assess various aspects of generated content, such as bias, toxicity, faithfulness, and more.

## Dataset Requirements

A local dataset uploaded to the dataset in Transformer Lab is required. The dataset file must be in CSV format and should compulsorily have the following columns:

- `input`
- `output`
- `expected_output`

## Parameters

### task

- **Title:** Evaluation Metric
- **Type:** string
- **Description:** Select the evaluation metric you want to use. The available options are:
  - **Bias:** Evaluates the presence of bias in the generated content.
  - **Toxicity:** Assesses the level of toxicity in the output.
  - **Faithfulness:** Measures how accurately the output reflects the input.
  - **Hallucination:** Detects any fabricated or incorrect information in the output.
  - **Answer Relevancy:** Evaluates how relevant the answer is to the given question.
  - **Contextual Precision:** Measures the precision of the output in the given context.
  - **Contextual Recall:** Assesses the recall of the output in the given context.
  - **Contextual Relevancy:** Evaluates the overall relevancy of the output in the given context.
  - **Custom (GEval):** Allows you to create custom evaluation metrics using GEval.

### judge_model

- **Title:** LLM-as-Judge Model
- **Type:** string
- **Description:** Choose the model to be used as the judge. The available options are:
  - Claude 3.5 Haiku
  - Claude 3.5 Sonnet
  - OpenAI GPT 4o
  - OpenAI GPT 4o Mini
  - Local (to use the local model running)

### geval_name

- **Title:** Criteria Name (Only for GEval)
- **Type:** string
- **Description:** Specify the name of the criteria to be used for GEval (General Evaluation).

### geval_context

- **Title:** Criteria Description (Only for GEval)
- **Type:** string
- **Description:** Provide a description of the criteria to be used for GEval.

### context_required

- **Title:** Should `context` field be considered in dataset? (Only for GEval)
- **Type:** boolean
- **Default:** false
- **Required:** true
- **Description:** Indicate whether the `context` field should be considered in the dataset. This is only applicable for GEval.

## Usage

1. **Select the Evaluation Metric:** Choose the metric that best fits your evaluation needs from the `task` parameter.
2. **Choose the Judge Model:** Select the LLM model that will act as the judge from the `judge_model` parameter.
3. **Provide the Dataset Path:** Enter the path to your dataset file in the `dataset_path` parameter.
4. **Configure GEval (if applicable):** If you are using GEval, specify the criteria name and description using the `geval_name` and `geval_context` parameters.
5. **Context Consideration (if applicable):** For GEval, decide whether the `context` field should be included in the evaluation by setting the `context_required` parameter.

### Creating Custom Metrics with GEval

GEval allows you to create custom evaluation metrics tailored to your specific needs. To use GEval:

- Set the `task` parameter to "Custom (GEval)".
- Provide a name for your custom criteria in the `geval_name` parameter.
- Describe your custom criteria in the `geval_context` parameter.
- Indicate whether the `context` field should be considered in the dataset using the `context_required` parameter.
