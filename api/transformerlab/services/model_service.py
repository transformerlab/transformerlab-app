"""
model_service.py

Service layer for working with models.
"""

import shutil
from huggingface_hub import scan_cache_dir
from transformerlab.models import localmodel


async def list_installed_models(embedding: bool = False) -> list:
    """
    Legacy function for getting a list of models from all sources.
    """
    return await localmodel.LocalModelStore().list_models(embedding)


def delete_model_from_hf_cache(model_id: str, cache_dir: str = None) -> None:
    """
    Delete a model from the Hugging Face cache by scanning the cache to locate
    the model repository and then deleting its folder.

    If cache_dir is provided, it will be used as the cache location; otherwise,
    the default cache directory is used (which respects HF_HOME or HF_HUB_CACHE).

    Args:
        model_id (str): The model ID (e.g. "mlx-community/Qwen2.5-7B-Instruct-4bit").
        cache_dir (str, optional): Custom cache directory.
    """

    # Scan the cache using the provided cache_dir if available.
    hf_cache_info = scan_cache_dir(cache_dir=cache_dir) if cache_dir else scan_cache_dir()

    found = False
    # Iterate over all cached repositories.
    for repo in hf_cache_info.repos:
        # Only consider repos of type "model" and match the repo id.
        if repo.repo_type == "model" and repo.repo_id == model_id:
            shutil.rmtree(repo.repo_path)
            print(f"Deleted model cache folder: {repo.repo_path}")
            found = True
            break

    if not found:
        print(f"Model cache folder not found for: {model_id}")
