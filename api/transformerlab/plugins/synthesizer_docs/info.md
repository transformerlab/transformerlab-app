# Data Synthesizer from Documents

## Overview

The Data Synthesizer plugin uses Large Language Models (LLMs) to generate synthetic data from reference documents. It supports multiple generation types and models, allowing users to create datasets for various use cases—from augmenting training data to fine-tuning embedding models. The plugin is designed to:

- Generate synthetic outputs using commercial models (e.g., OpenAI GPT, Anthropic Claude) or local models.
- Process and chunk input documents to construct meaningful contexts.
- Optionally generate an embedding dataset using techniques like hard negative mining and paraphrase mining.
- Integrate with the Transformer Lab workspace by uploading the generated datasets.

This versatile tool is particularly useful when you need to create synthetic data based on the content of your documents, whether for testing, evaluation, or further training purposes.

## Parameters

### Generation Model

- **Type:** string
- **Description:**  
  Select the model to be used for generation. This parameter supports a range of models including:
  - **Claude 3.5 Haiku**
  - **Claude 3.5 Sonnet**
  - **OpenAI GPT 4o**
  - **OpenAI GPT 4o Mini**
  - **Local**  
  The chosen model will be used to generate synthetic data. If you select "Local," ensure that your local model server is running.

### Reference Documents (tflabcustomui_docs)

- **Type:** string
- **Description:**  
  Provide a comma-separated list of document paths. These documents act as the reference material from which synthetic data will be generated. The paths are resolved relative to the documents directory within your Transformer Lab workspace.

### Embedding Model

- **Type:** string
- **Default:** "Snowflake/arctic-embed-m"
- **Description:**  
  Specify the name of the embedding model from Huggingface or its local path. This model is used to compute text embeddings during document processing and is essential when generating a dataset for fine-tuning embedding models.

### Chunk Size

- **Type:** integer
- **Default:** 256
- **Minimum:** 1
- **Maximum:** 2048
- **Description:**  
  Determines the size of text chunks when parsing your documents. A proper chunk size helps in controlling the granularity of the context extracted from each document.

### Max Contexts Per Document

- **Type:** integer
- **Default:** 10
- **Minimum:** 1
- **Maximum:** 1000
- **Description:**  
  Sets the maximum number of contexts that can be generated per document. This number, multiplied by the "Max Goldens Per Context," defines the upper limit of synthetic data points per document. Must be > 100 if generating embedding model datasets while mining negatives (Dataset types: **anchor | positive | negative:** and **anchor | positive | negative_1 | negative_2 | ... | negative_n**)

### Max Context Length

- **Type:** integer
- **Default:** 3
- **Minimum:** 1
- **Maximum:** 2048
- **Description:**  
  Specifies the maximum number of text chunks to include in each context. When generating an embedding dataset, this value may be overridden (typically set to 1) to ensure consistency.

### Max Goldens Per Context

- **Type:** integer
- **Default:** 2
- **Minimum:** 1
- **Maximum:** 1000
- **Description:**  
  Determines the maximum number of synthetic data points (goldens) to be generated per context.

### Generate Dataset for Embedding Model

- **Type:** boolean
- **Default:** false
- **Description:**  
  Enable this option to create an additional dataset formatted for fine-tuning embedding models. When activated, the plugin performs extra processing steps to generate this dataset alongside the synthetic data.

### Embedding Dataset Type (Only needed if the above checkbox is checked)

- **Type:** string
- **Default:** "anchor | positive | negative"
- **Options:**
  - "anchor | positive"
  - "anchor | positive | negative"
  - "sentence_A | sentence_B | score"
  - "anchor | positive | negative_1 | negative_2 | ... | negative_n"
  - "id | anchor | positive"
- **Description:**  
  Choose the format for the embedding dataset:
  - **anchor | positive:** Generates pairs with the original (anchor) and the generated context (positive). 
  - **anchor | positive | negative:** Adds one negative example per pair. (Max Context per document must be > 100)
  - **Multiple negatives:** Supports multiple negative examples. (Max Context per document must be > 200)
  - **sentence_A | sentence_B | score:** Uses paraphrase mining to generate sentence pairs with a similarity score. This uses the earlier selected embedding model (Not the model you want to train, but a good embedding model) to provide scores. This is used for distillation.
  - **id | anchor | positive:** Includes an incremental ID for each data point, that is needed for evaluating embedding models.

## Usage

1. **Select the Generation Model:** Choose the model to be used for generation.
2. **Provide Reference Documents:** Select the documents in the document tab for reference after provigin plugin config details.
3. **Specify the Embedding Model:** Provide the name or path of the embedding model that will be used to create the sythetic data.
4. **Provide chunk size and other context configs:** Provide details about desired chunk size, length of context and other params.
5. **(Optional) Generate Embedding Dataset:** Generate additional dataset for finetuning embedding models too using the base dataset created by this plugin. 

