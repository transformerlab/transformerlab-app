# RAG Evaluation Dataset Generator

## Overview

The RAG Evaluation Dataset Generator plugin creates synthetic question-answer pairs from reference documents. This plugin is designed specifically for evaluating Retrieval-Augmented Generation (RAG) systems by generating high-quality factoid questions that can be answered using the provided document corpus. The plugin:

- Creates natural-sounding factoid questions based on document content
- Generates concise, accurate answers extracted from the source material
- Processes various document formats including text files and PDFs
- Supports multiple LLM backends (OpenAI, Anthropic Claude, or local models)
- Integrates with Transformer Lab to make the dataset immediately available for evaluation

This tool is particularly valuable when you need to test RAG system performance, benchmark different retrieval strategies, or evaluate model accuracy on domain-specific content without manually creating test questions.

## Parameters

### Generation Model

- **Type:** string
- **Description:**  
  Select the model to be used for generating question-answer pairs. This parameter supports various models including:
  - **Claude 3.5 Haiku**
  - **Claude 3.5 Sonnet**
  - **OpenAI GPT 4o**
  - **OpenAI GPT 4o Mini**
  - **Local**  
  The chosen model will generate factoid questions and answers. If you select "Local," ensure your local model server is running.

### Reference Documents (tflabcustomui_docs)

- **Type:** string
- **Description:**  
  Provide a comma-separated list of document paths to use as the reference corpus. These documents will be processed and chunked to generate questions from their content. The paths are resolved relative to the documents directory within your Transformer Lab workspace. The plugin supports text files and PDFs.

### Chunk Size

- **Type:** integer
- **Default:** 256
- **Minimum:** 64
- **Description:**  
  Controls the size of document chunks in characters. Larger chunks provide more context for generating meaningful questions but may lead to longer processing times. Finding the right balance depends on your document complexity and model capabilities.

### Chunk Overlap

- **Type:** integer
- **Default:** 200
- **Minimum:** 0
- **Maximum:** 1000
- **Description:**  
  Specifies how many characters should overlap between consecutive chunks. Overlap helps maintain context continuity between chunks and prevents information loss at chunk boundaries. This is particularly useful for longer documents with connected ideas spanning multiple chunks.

### Number of QA Pairs

- **Type:** integer
- **Default:** 10
- **Minimum:** 1
- **Maximum:** 500
- **Description:**  
  Sets the number of question-answer pairs to generate. The actual number may be lower if there aren't enough document chunks available. Each question-answer pair is generated from a randomly selected document chunk.

## Usage

1. **Select the Generation Model:** Choose the LLM that will generate your QA pairs. For high-quality results, larger models like Claude 3.5 Sonnet or GPT-4o are recommended.

2. **Provide Reference Documents:** Select the documents in the document tab that will serve as your reference corpus. These should be relevant to the domain you want to evaluate your RAG system on.

3. **Configure Chunking Parameters:** Adjust the chunk size and overlap based on your document complexity. For technical content with many interconnected concepts, consider using larger chunks and more overlap.

4. **Specify Number of QA Pairs:** Determine how many question-answer pairs you need for your evaluation. For statistically significant results, at least 10-20 pairs are recommended.

5. **Generate the Dataset:** Run the plugin and wait for completion. The generated dataset will include factoid questions, answers, and the source context from which each question was derived.


## Output Format

The generated dataset follows this JSON structure:

```json
[
  {
    "context": "Text from the document chunk",
    "input": "Generated factoid question",
    "expected_output": "Generated answer",
    "source_doc": "Filename of the source document"
  },
]
```