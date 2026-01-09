import os
import random
from typing import List
import pandas as pd
import asyncio

import fitz
from langchain.docstore.document import Document as LangchainDocument
from langchain.text_splitter import RecursiveCharacterTextSplitter
from tqdm.auto import tqdm

from transformerlab.sdk.v1.generate import tlab_gen
from lab.dirs import get_workspace_dir
from lab import storage


def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF files using PyMuPDF"""
    try:
        doc = fitz.open(pdf_path)
        text = ""
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text += page.get_text()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF {pdf_path}: {e}")
        return ""


def get_docs_list(docs: str) -> List[dict]:
    """
    Convert document paths to a list of document data suitable for LangChain
    Supports text files, PDFs, and other document formats
    """
    docs_list = docs.split(",")
    workspace_dir = asyncio.run(get_workspace_dir())

    documents_dir = storage.join(workspace_dir, "experiments", tlab_gen.params.experiment_name, "documents")
    # Use the markdown files if they exist
    markitdown_dir = storage.join(documents_dir, ".tlab_markitdown")
    if storage.exists(markitdown_dir):
        documents_dir = markitdown_dir

    result_docs = []

    for doc in docs_list:
        doc_path = storage.join(documents_dir, doc)

        if storage.isdir(doc_path):
            print(f"Directory found: {doc_path}. Fetching all files in the directory...")
            for file in storage.ls(doc_path):
                file_full_path = storage.join(doc_path, file)
                if storage.isfile(file_full_path):
                    try:
                        # Process based on file extension
                        if file_full_path.lower().endswith(".pdf"):
                            content = extract_text_from_pdf(file_full_path)
                            result_docs.append({"text": content, "source": file})
                        else:
                            with storage.open(file_full_path, "r", encoding="utf-8") as f:
                                content = f.read()
                                result_docs.append({"text": content, "source": file})
                    except Exception as e:
                        print(f"Error reading file {file_full_path}: {e}")
        else:
            full_path = storage.join(documents_dir, doc)
            # Replace ending extension with .md if .tlab_markitdown is in the full_path somewhere
            if ".tlab_markitdown" in full_path:
                base, ext = os.path.splitext(full_path)
                full_path = base + ".md"
            try:
                if full_path.lower().endswith(".pdf"):
                    content = extract_text_from_pdf(full_path)
                    result_docs.append({"text": content, "source": doc})
                else:
                    with storage.open(full_path, "r", encoding="utf-8") as f:
                        content = f.read()
                        result_docs.append({"text": content, "source": doc})
            except Exception as e:
                print(f"Error reading file {full_path}: {e}")

    return result_docs


@tlab_gen.job_wrapper(progress_start=0, progress_end=100)
def run_generation():
    """Generate synthetic QA pairs for RAG evaluation"""
    if not tlab_gen.params.docs:
        raise ValueError("Docs must be provided for generating QA pairs.")

    tlab_gen.params.chunk_size = int(tlab_gen.params.chunk_size)
    tlab_gen.params.chunk_overlap = int(tlab_gen.params.chunk_overlap)
    tlab_gen.params.n_generations = int(tlab_gen.params.n_generations)

    # Load model using tlab_gen's built-in functionality
    model = tlab_gen.load_evaluation_model(field_name="generation_model")
    print("Model loaded successfully")
    tlab_gen.progress_update(25)

    # Load and process documents
    doc_data = get_docs_list(tlab_gen.params.docs)
    if len(doc_data) == 0:
        raise ValueError("No valid documents found.")

    print(f"Processing {len(doc_data)} documents")

    # Convert to LangChain documents
    langchain_docs = [
        LangchainDocument(page_content=doc["text"], metadata={"source": doc["source"]}) for doc in doc_data
    ]

    # Split documents
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=tlab_gen.params.chunk_size,
        chunk_overlap=tlab_gen.params.chunk_overlap,
        add_start_index=True,
        separators=["\n\n", "\n", ".", " ", ""],
    )

    docs_processed = []
    for doc in langchain_docs:
        docs_processed += text_splitter.split_documents([doc])

    tlab_gen.progress_update(50)
    print(f"Split into {len(docs_processed)} chunks. Generating QA pairs...")

    # QA generation prompt
    QA_generation_prompt = """
    Your task is to write a factoid question and an answer given a context.
    Your factoid question should be answerable with a specific, concise piece of factual information from the context.
    Your factoid question should be formulated in the same style as questions users could ask in a search engine.
    This means that your factoid question MUST NOT mention something like "according to the passage" or "context".

    Provide your answer as follows:

    Output:::
    Factoid question: (your factoid question)
    Answer: (your answer to the factoid question)

    Now here is the context.

    Context: {context}
    Output:::"""

    # Set the number of generations
    n_samples = min(tlab_gen.params.n_generations, len(docs_processed))

    outputs = []
    for i, sampled_context in enumerate(tqdm(random.sample(docs_processed, n_samples))):
        try:
            # Generate QA couple
            output_QA_couple = model.generate(QA_generation_prompt.format(context=sampled_context.page_content))

            question = output_QA_couple.split("Factoid question: ")[-1].split("Answer: ")[0].strip()
            answer = output_QA_couple.split("Answer: ")[-1].strip()

            assert len(answer) < 300, "Answer is too long"

            outputs.append(
                {
                    "context": sampled_context.page_content,
                    "input": question,
                    "expected_output": answer,
                    "source_doc": sampled_context.metadata["source"],
                }
            )

            # Update progress
            progress = 50 + (i + 1) / n_samples * 40
            tlab_gen.progress_update(int(progress))

        except Exception as e:
            print(f"Error processing chunk: {e}")
            continue

    # Convert to pandas DataFrame for tlab_gen.save_generated_dataset
    df = pd.DataFrame(outputs)

    # Save the generated data and upload to TransformerLab
    additional_metadata = {
        "document_count": len(doc_data),
        "chunk_count": len(docs_processed),
        "chunk_size": tlab_gen.params.chunk_size,
        "chunk_overlap": tlab_gen.params.chunk_overlap,
    }

    # Save the generated outputs as a dataset
    custom_name = tlab_gen.params.get("output_dataset_name")
    output_file, dataset_name = tlab_gen.save_generated_dataset(
        df, additional_metadata=additional_metadata, dataset_id=custom_name
    )

    print(f"QA dataset generated successfully as dataset {dataset_name}")
    return output_file


print("Starting RAG evaluation dataset generation...")
run_generation()
