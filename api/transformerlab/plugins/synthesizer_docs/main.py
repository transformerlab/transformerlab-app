import traceback
import pandas as pd
from typing import List
import asyncio

from deepeval.models import DeepEvalBaseEmbeddingModel
from deepeval.synthesizer import Synthesizer
from deepeval.synthesizer.config import ContextConstructionConfig
from sentence_transformers import SentenceTransformer
from sentence_transformers.util import mine_hard_negatives, paraphrase_mining
from datasets import Dataset
import sys

from transformerlab.sdk.v1.generate import tlab_gen
from lab.dirs import get_workspace_dir
from lab import storage


class CustomEmbeddingModel(DeepEvalBaseEmbeddingModel):
    def __init__(self, model_name: str = "Snowflake/arctic-embed-m"):
        self.model_name = model_name
        self.model = self.load_model()

    def load_model(self):
        print(f"Loading Embedding Model... : {self.model_name.strip()}")
        try:
            return SentenceTransformer(self.model_name.strip(), trust_remote_code=True)
        except Exception as e:
            print(f"An error occurred while loading the embedding model: {e}")
            raise

    def embed_text(self, text: str) -> List[float]:
        return self.model.encode(text, convert_to_numpy=True).tolist()

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        return self.model.encode(texts, convert_to_numpy=True).tolist()

    async def a_embed_text(self, text: str) -> List[float]:
        return self.embed_text(text)

    async def a_embed_texts(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)

    def get_model_name(self):
        return f"Custom HuggingFace Embedding Model ({self.model_name})"


def get_docs_list(docs: str, experiment_name: str) -> List[str]:
    """Get list of document paths from comma-separated string of doc names"""
    docs_list = docs.split(",")
    workspace_dir = asyncio.run(get_workspace_dir())
    documents_dir = storage.join(workspace_dir, "experiments", experiment_name, "documents")

    result_docs = []
    for doc in docs_list:
        doc_path = storage.join(documents_dir, doc)
        if storage.isdir(doc_path):
            print(f"Directory found: {doc_path}. Fetching all files in the directory...")
            # Get only first-level files from the directory
            for file in storage.ls(doc_path):
                file_path = storage.join(doc_path, file)
                if storage.isfile(file_path):
                    result_docs.append(file_path)
        else:
            result_docs.append(doc_path)

    return result_docs


def clean_context(s):
    """
    Converts the input to string and removes only the leading '[' and trailing ']' if present.
    The quotes within the string are preserved.
    """
    return s[0] if isinstance(s, list) else list(s)[0]


def generation_from_docs(docs: list, model, embedding_model_name: str):
    """Generate data from documents using the Synthesizer"""
    try:
        # Initialize embedding model
        embedder = CustomEmbeddingModel(model_name=embedding_model_name)
        print(f"Embedder loaded successfully: {embedding_model_name}")
        tlab_gen.progress_update(10)

        # Create context configuration
        context_config = ContextConstructionConfig(
            embedder=embedder,
            critic_model=model,
            chunk_size=tlab_gen.params.chunk_size,
            max_contexts_per_document=tlab_gen.params.max_contexts_per_document,
            max_context_length=tlab_gen.params.max_context_length
            if not tlab_gen.params.generate_dataset_for_embedding_model
            else 1,
        )
        tlab_gen.progress_update(20)

        # Initialize synthesizer and generate golden examples
        # Set the plugin to use sync mode if on macOS
        # as MLX doesn't support async mode currently
        async_mode = True
        if "local" in tlab_gen.params.get("generation_model", "").lower():
            async_mode = sys.platform != "darwin"
        synthesizer = Synthesizer(model=model, async_mode=async_mode)
        print("Synthesizer initialized successfully")
        tlab_gen.progress_update(30)

        synthesizer.generate_goldens_from_docs(
            document_paths=docs,
            context_construction_config=context_config,
            include_expected_output=True,
            max_goldens_per_context=tlab_gen.params.max_goldens_per_context,
        )
        tlab_gen.progress_update(80)

        # Convert the generated data to a pandas dataframe
        df = synthesizer.to_pandas()

        # Rename the column `actual_output` to `output` for consistency
        if "actual_output" in df.columns:
            df.rename(columns={"actual_output": "output"}, inplace=True)

        return df

    except Exception as e:
        print(f"An error occurred while generating data from docs: {e}")
        traceback.print_exc()
        raise


def run_embedding_dataset_generation(df, embedding_model_name, dataset_type):
    """Generate embedding dataset from the synthesized data"""
    print(f"Generating Embedding dataset for dataset type: {dataset_type}")

    # Preprocess: create a DataFrame with 'anchor' from 'input' and 'positive' from 'context'
    processed_df = pd.DataFrame()
    processed_df["anchor"] = df["input"]
    processed_df["positive"] = df["context"].apply(clean_context)

    if dataset_type == "sentence_A | sentence_B | score":
        # Use paraphrase mining on the positive sentences only
        sentences = processed_df["positive"].tolist()
        model = SentenceTransformer(embedding_model_name, trust_remote_code=True)
        paraphrase_results = paraphrase_mining(model, sentences, show_progress_bar=True)
        results = []
        for score, id1, id2 in paraphrase_results:
            results.append({"sentence_A": sentences[id1], "sentence_B": sentences[id2], "score": score})
        return pd.DataFrame(results)

    elif dataset_type == "anchor | positive":
        # No negatives; simply return the processed DataFrame
        return processed_df

    elif dataset_type == "id | anchor | positive":
        # Add an 'id' column with incrementing numbers starting from 1
        processed_df.insert(0, "id", range(1, len(processed_df) + 1))
        return processed_df

    elif dataset_type == "anchor | positive | negative":
        # For one negative per (anchor, positive) pair
        as_triplets = True
    elif dataset_type == "anchor | positive | negative_1 | negative_2 | ... | negative_n":
        # For multiple negatives per (anchor, positive) pair
        as_triplets = False
    else:
        raise ValueError(f"Unknown dataset type: {dataset_type}")

    # For negative dataset types, perform hard negative mining
    dataset = Dataset.from_pandas(processed_df)
    model = SentenceTransformer(embedding_model_name, trust_remote_code=True)

    mined_dataset = mine_hard_negatives(
        dataset=dataset,
        model=model,
        anchor_column_name="anchor",
        positive_column_name="positive",
        cross_encoder=None,
        range_min=10,
        range_max=50,
        max_score=0.8,
        margin=0.1,
        num_negatives=3,
        sampling_strategy="top",
        as_triplets=as_triplets,
        batch_size=32,
        verbose=True,
    )

    return mined_dataset.to_pandas()


@tlab_gen.job_wrapper()
def run_generation():
    """Main function to run the synthesizer docs plugin"""
    print(f"Generation type: {tlab_gen.params.generation_type}")
    print(f"Model Name: {tlab_gen.params.generation_model}")

    # Type casting
    tlab_gen.params.chunk_size = int(tlab_gen.params.chunk_size)
    tlab_gen.params.max_contexts_per_document = int(tlab_gen.params.max_contexts_per_document)
    tlab_gen.params.max_context_length = int(tlab_gen.params.max_context_length)
    tlab_gen.params.max_goldens_per_context = int(tlab_gen.params.max_goldens_per_context)
    tlab_gen.params.generate_dataset_for_embedding_model = bool(
        tlab_gen.params.get("generate_dataset_for_embedding_model", False)
    )

    # Check for docs
    if not tlab_gen.params.docs:
        print("Docs must be provided for document-based generation.")
        raise ValueError("Docs must be provided for document-based generation.")

    docs = get_docs_list(tlab_gen.params.docs, tlab_gen.params.experiment_name)
    if len(docs) == 0:
        print("No valid documents found.")
        raise ValueError("No valid documents found.")

    print(f"Generating data from {len(docs)} documents: {docs}")

    # Load the model for generation using tlab_gen helper
    trlab_model = tlab_gen.load_evaluation_model()
    print("Model loaded successfully")

    # Generate data from docs
    df = generation_from_docs(
        docs=docs,
        model=trlab_model,
        embedding_model_name=tlab_gen.params.get("embedding_model", "Snowflake/arctic-embed-m"),
    )

    # Generate embedding dataset if requested
    embedding_df = None
    if tlab_gen.params.get("generate_dataset_for_embedding_model", False):
        tlab_gen.progress_update(85)
        embedding_df = run_embedding_dataset_generation(
            df=df,
            embedding_model_name=tlab_gen.params.get("embedding_model", "Snowflake/arctic-embed-m"),
            dataset_type=tlab_gen.params.get("embedding_dataset_type", "anchor | positive | negative"),
        )

    # Save main dataset using tlab_gen helper
    metadata = {
        "generation_method": "docs",
        "embedding_model": tlab_gen.params.get("embedding_model", "Snowflake/arctic-embed-m"),
        "chunk_size": tlab_gen.params.get("chunk_size", 256),
        "max_contexts_per_document": tlab_gen.params.get("max_contexts_per_document", 10),
        "max_context_length": tlab_gen.params.get("max_context_length", 3),
        "max_goldens_per_context": tlab_gen.params.get("max_goldens_per_context", 1),
    }

    tlab_gen.progress_update(95)

    # Save embedding dataset if generated
    if embedding_df is not None and len(embedding_df) > 0:
        custom_name_embeddings = tlab_gen.params.get("output_dataset_name")
        if custom_name_embeddings:
            custom_name_embeddings = f"{custom_name_embeddings}_embedding"
        embedding_output_file, _ = tlab_gen.save_generated_dataset(
            embedding_df,
            {**metadata, "dataset_type": tlab_gen.params.get("embedding_dataset_type", "anchor | positive | negative")},
            dataset_id=custom_name_embeddings,
        )
        print(f"Embedding dataset saved to {embedding_output_file}")
    else:
        # Save the generated outputs as a dataset
        custom_name = tlab_gen.params.get("output_dataset_name")
        output_file, dataset_name = tlab_gen.save_generated_dataset(df, metadata, dataset_id=custom_name)
        print(f"Data generated successfully as dataset {dataset_name}")

    tlab_gen.progress_update(95)

    # print(f"Data generated successfully as dataset {dataset_name}")
    # print(f"Saved to {output_file}")
    print("Generation completed successfully.")

    return True


run_generation()
