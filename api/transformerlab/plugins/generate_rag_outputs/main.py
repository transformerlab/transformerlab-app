import json
import traceback
from typing import Any

import pandas as pd
import requests
from transformerlab.sdk.v1.generate import tlab_gen

# Add custom arguments
tlab_gen.add_argument(
    "--input_field", default="input", type=str, help="Field in dataset containing queries"
)
tlab_gen.add_argument(
    "--response_mode", default="compact", type=str, help="Response mode for RAG output"
)
tlab_gen.add_argument(
    "--number_of_search_results", default="2", type=str, help="Number of search results to return"
)
tlab_gen.add_argument("--temperature", default="0.7", type=str, help="Temperature for sampling")
tlab_gen.add_argument("--context_window", default="4096", type=str, help="Context window size")
tlab_gen.add_argument("--num_output", default="256", type=str, help="Output Length")
tlab_gen.add_argument("--chunk_size", default="512", type=str, help="Chunk size")
tlab_gen.add_argument("--chunk_overlap", default="100", type=str, help="Chunk overlap")
tlab_gen.add_argument("--use_reranker", default=False, type=bool, help="Use reranker")
tlab_gen.add_argument(
    "--reranker_model",
    default="cross-encoder/ms-marco-MiniLM-L-6-v2",
    type=str,
    help="Reranker model",
)
tlab_gen.add_argument("--reranker_top_n", default="20", type=str, help="Reranker top n")


async def run_rag_query(experiment_id, rag_settings, query: str) -> dict[str, Any]:
    """Run a RAG query using the configured RAG engine"""
    try:
        # Construct the API URL
        api_url = f"http://localhost:8338/experiment/{experiment_id}/rag/query"

        # Prepare parameters
        params = {"experimentId": experiment_id, "query": query, "settings": rag_settings}

        # Make the request
        response = requests.get(api_url, params=params)

        if response.status_code != 200:
            print(f"RAG query failed for query: {query}")
            print(f"Error: {response.text}")
            return {
                "query": query,
                "answer": "Error: RAG query failed",
                "context": [],
                "sources": [],
                "error": response.text,
            }

        # Parse the response
        try:
            result = (
                response.json()
                if response.headers.get("content-type") == "application/json"
                else response.text
            )
        except Exception:
            result = response.text

        # Extract relevant information (format may vary by RAG engine)
        if isinstance(result, dict):
            context_list = []
            scores_list = []
            for context in result.get("context", []):
                context_list.append(context.split("Text: ")[1].split("\nScore")[0].strip())
                scores_list.append(context.split("Score: ")[1].split("\n")[0].strip())
            return {
                "query": query,
                "answer": result.get("response", ""),
                "context": context_list,
                "scores": scores_list,
                "raw_response": result,
                "prompt": result.get("template", ""),
            }
        else:
            return {
                "query": query,
                "answer": result,
                "context": [],
                "sources": [],
                "raw_response": result,
            }

    except Exception as e:
        print(f"Error running RAG query: {e!s}")
        return {
            "query": query,
            "answer": f"Error: {e!s}",
            "context": [],
            "sources": [],
            "error": str(e),
        }


def check_local_server():
    """Check if the local model server is running"""
    response = requests.get("http://localhost:8338/server/worker_healthz")
    if (
        response.status_code != 200
        or not isinstance(response.json(), list)
        or len(response.json()) == 0
    ):
        raise RuntimeError(
            "Local Model Server is not running. Please start it before running the evaluation."
        )


async def process_dataset(experiment_id, rag_settings, dataset_df) -> list[dict[str, Any]]:
    """Process each item in the dataset with RAG"""
    results = []

    print(f"Processing {len(dataset_df)} queries with RAG...")

    for i, row in dataset_df.iterrows():
        # Update progress
        progress = int(10 + (i / len(dataset_df)) * 80)
        tlab_gen.progress_update(progress)

        # Extract the query from the specified field
        query = row[tlab_gen.params.input_field]
        if not query:
            print(
                f"Warning: No query found in item {i} using field '{tlab_gen.params.input_field}'"
            )
            query = ""
            continue

        # Run RAG on the query
        rag_result = await run_rag_query(experiment_id, rag_settings, query)

        # Combine original item with RAG results
        combined_result = row.to_dict()
        combined_result.update(
            {
                "output": rag_result["answer"],
                "context": rag_result.get("context", []),
                "rag_scores": rag_result.get("scores", []),
                "rag_prompt": rag_result.get("prompt", ""),
                "rag_raw_response": rag_result.get("raw_response", ""),
            }
        )

        results.append(combined_result)

    return results


@tlab_gen.async_job_wrapper()
async def run_evaluation():
    """Run RAG evaluation on the specified dataset"""
    try:
        # Check if the local server is running
        check_local_server()

        # Validate required arguments
        if not tlab_gen.params.dataset_name:
            raise ValueError("Dataset name is required")

        # Configure experiment with the specified RAG engine
        experiment_config, experiment_id = tlab_gen.get_experiment_config(
            tlab_gen.params.experiment_name
        )

        if experiment_config:
            plugin = experiment_config.get("rag_engine")
            if plugin is None or plugin == "":
                raise ValueError(
                    "No RAG engine has been assigned to this experiment. Please install a RAG plugin from the Plugins Tab and set it by going to the Interact tab."
                )

            # Set up RAG settings
            rag_settings = {
                "response_mode": tlab_gen.params.response_mode,
                "number_of_search_results": tlab_gen.params.number_of_search_results,
                "temperature": tlab_gen.params.temperature,
                "context_window": tlab_gen.params.context_window,
                "num_output": tlab_gen.params.num_output,
                "chunk_size": tlab_gen.params.chunk_size,
                "chunk_overlap": tlab_gen.params.chunk_overlap,
                "use_reranker": tlab_gen.params.use_reranker,
                "reranker_model": tlab_gen.params.reranker_model,
                "reranker_top_n": tlab_gen.params.reranker_top_n,
            }
            print(f"RAG settings: {rag_settings}")
            rag_settings_json = json.dumps(rag_settings)

        # Load the dataset using tlab_gen's dataset loading capabilities
        print(f"Loading dataset '{tlab_gen.params.dataset_name}'...")
        datasets = tlab_gen.load_dataset(dataset_types=["train"])
        dataset_df = datasets["train"].to_pandas()
        tlab_gen.progress_update(10)

        # Process the dataset
        print("Processing dataset with RAG...")
        results = await process_dataset(experiment_id, rag_settings_json, dataset_df)
        tlab_gen.progress_update(90)

        # Convert results to DataFrame for saving
        results_df = pd.DataFrame(results)

        # Save using tlab_gen's dataset saving functionality
        additional_metadata = {
            "rag_engine": plugin,
            "rag_settings": rag_settings,
            "input_field": tlab_gen.params.input_field,
            "original_dataset": tlab_gen.params.dataset_name,
            "record_count": len(results),
        }

        custom_name = tlab_gen.params.get("output_dataset_name")
        output_file, dataset_name = tlab_gen.save_generated_dataset(
            results_df, additional_metadata=additional_metadata, dataset_id=custom_name
        )

        print(f"RAG evaluation completed successfully. Results saved as dataset '{dataset_name}'.")
        return output_file

    except Exception as e:
        traceback.print_exc()
        raise RuntimeError(f"An error occurred during evaluation: {e!s}")


print("Running RAG evaluation...")
run_evaluation()
