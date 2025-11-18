# RAG Batched Outputs Generator

## Overview

The RAG Batched Outputs Generator plugin evaluates RAG (Retrieval-Augmented Generation) systems by processing a dataset of queries through your configured RAG pipeline. The plugin:

- Takes existing queries from a dataset and runs them through your RAG system
- Records responses, retrieved context passages, and relevance scores
- Creates a new dataset containing both the original queries and the RAG outputs
- Preserves the full context and scoring information for detailed analysis
- Integrates with TransformerLab experiments for seamless workflow

This tool is particularly valuable for evaluating RAG system performance, comparing different retrieval configurations, assessing the quality of responses with different parameters, and generating examples for further fine-tuning or analysis.

> **Note:** This plugin requires a Transformer Lab workspace with a RAG Plugin. Please install a RAG Plugin before using this tool.

## Parameters

### Run Name

- **Type:** string
- **Default:** "rag_eval_results"
- **Description:**  
  Name prefix for the output dataset that will be created. The final dataset name will be this value followed by the job ID.

### Dataset Name

- **Type:** string
- **Description:**  
  The name of the existing dataset containing queries that you want to evaluate with your RAG system. This dataset must be available in your TransformerLab workspace.

### Experiment Name

- **Type:** string
- **Default:** "test"
- **Description:**  
  Name of the experiment containing your RAG configuration. The plugin will use the RAG engine and settings from this experiment.

### Input Field

- **Type:** string
- **Default:** "input"
- **Description:**  
  The field name in your dataset that contains the queries to be processed by the RAG system.

### Response Mode

- **Type:** string
- **Default:** "compact"
- **Description:**  
  Determines how the RAG system formats its responses. The specific modes depend on your configured RAG engine.

### Number of Search Results

- **Type:** string
- **Default:** "2"
- **Description:**  
  Controls how many documents or passages the retriever will return for each query.

### Temperature

- **Type:** string
- **Default:** "0.7"
- **Description:**  
  Sets the randomness level for the language model generating responses. Higher values (closer to 1.0) create more diverse outputs, while lower values produce more deterministic responses.

### Context Window

- **Type:** string
- **Default:** "4096"
- **Description:**  
  Maximum number of tokens the model can use for context, including the retrieved passages and the query.

### Output Length

- **Type:** string
- **Default:** "256"
- **Description:**  
  Maximum length of the generated response from the RAG system.

### Chunk Size

- **Type:** string
- **Default:** "512"
- **Description:**  
  Size of document chunks used by the RAG system when indexing or retrieving content.

### Chunk Overlap

- **Type:** string
- **Default:** "100"
- **Description:**  
  Number of tokens that overlap between adjacent chunks to maintain context continuity.

### Use Reranker

- **Type:** boolean
- **Default:** false
- **Description:**  
  Whether to apply a reranker after the initial document retrieval to improve result relevance.

### Reranker Model

- **Type:** string
- **Default:** "cross-encoder/ms-marco-MiniLM-L-6-v2"
- **Description:**