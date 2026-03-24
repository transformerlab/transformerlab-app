"""
model_service.py

Service layer for working with models.
"""

import shutil
import posixpath
import logging
from werkzeug.utils import secure_filename
from huggingface_hub import scan_cache_dir

from lab import storage
from lab.model import Model as ModelService
from lab.dirs import get_models_dir

logger = logging.getLogger(__name__)


async def list_installed_models() -> list:
    """
    TODO: Clean this up to remove legacy code.

    Legacy function for getting a list of models from all sources.

    Check both the filesystem and workspace for models.
    """

    # Use SDK to get all models from the filesystem
    models = await ModelService.list_all()

    # Add additional metadata to each model
    models_dir = await get_models_dir()
    for model in models:
        if model == {} or model is None or model == "":
            logger.debug("Model entry not found, skipping")
            # Remove model from models list
            models.remove(model)
            continue
        # Only set model["stored_in_filesystem"] to True if the model is a local model and not a Hugging Face model
        # model_filename can be:
        # - A filename (e.g., "model.gguf") for file-based models
        # - "." for directory-based models (indicates the directory itself)
        # - Empty string for legacy models (should be treated as directory-based)
        model_filename = model.get("json_data", {}).get("model_filename", "")
        is_huggingface = model.get("json_data", {}).get("source", "") == "huggingface"
        has_model_filename = model_filename != ""

        # Determine the potential model directory path
        # This applies to both HuggingFace models stored locally and local models
        model_id = model.get("model_id", "")
        potential_path = storage.join(models_dir, secure_filename(model_id))
        # Check if local path exists
        if not await storage.exists(potential_path):
            # Remove the Starting TransformerLab/ prefix to handle the save_transformerlab_model function
            potential_path = storage.join(models_dir, secure_filename("/".join(model_id.split("/")[1:])))

        # Check if model should be considered local:
        # 1. If it has a model_filename set (and is not a HuggingFace model, OR is a HuggingFace model stored locally), OR
        # 2. If the directory exists and has files other than index.json
        is_local_model = False
        if not is_huggingface:
            # For non-HuggingFace models, check if it has model_filename or files in directory
            if has_model_filename:
                is_local_model = True
            elif await storage.exists(potential_path) and await storage.isdir(potential_path):
                # Check if directory has files other than index.json
                try:
                    files = await storage.ls(potential_path, detail=False)
                    # Extract basenames from full paths returned by storage.ls()
                    file_basenames = [posixpath.basename(f.rstrip("/")) for f in files]
                    # Filter out index.json and other metadata files
                    model_files = [f for f in file_basenames if f not in ["index.json", "_tlab_provenance.json"]]
                    if model_files:
                        is_local_model = True
                except (OSError, PermissionError):
                    # If we can't read the directory, skip it
                    pass
        elif is_huggingface and has_model_filename:
            # For HuggingFace models, if they have a model_filename and the file/directory exists locally,
            # treat them as stored locally (e.g., downloaded GGUF files)
            if await storage.exists(potential_path):
                is_local_model = True

        if is_local_model:
            # tells the app this model was loaded from workspace directory
            model["stored_in_filesystem"] = True
            model["local_path"] = potential_path

            # Handle different model_filename cases
            if model_filename == ".":
                # Directory-based model - path is already in storage format
                model["local_path"] = model["local_path"]
            elif model_filename and model_filename.endswith(".gguf"):
                # GGUF file - append the filename to the model directory
                # This ensures we get the full path like: /path/to/models/dir/model.gguf
                base_path = model["local_path"]
                model_path = storage.join(base_path, model_filename)
                if await storage.exists(model_path):
                    if await storage.isdir(model_path):
                        # List all files in the directory ending with .gguf
                        files = await storage.ls(model_path, detail=False)
                        gguf_files = [
                            posixpath.basename(f.rstrip("/"))
                            for f in files
                            if posixpath.basename(f.rstrip("/")).endswith(".gguf")
                        ]
                        if gguf_files:
                            model_path = storage.join(model_path, gguf_files[0])
                else:
                    # Search for files ending with .gguf in the directory
                    files = await storage.ls(model["local_path"], detail=False)
                    gguf_files = [
                        posixpath.basename(f.rstrip("/"))
                        for f in files
                        if posixpath.basename(f.rstrip("/")).endswith(".gguf")
                    ]
                    if gguf_files:
                        gguf_file = gguf_files[0]
                        model_path = storage.join(base_path, gguf_file)
                        if await storage.isdir(model_path):
                            files = await storage.ls(model_path, detail=False)
                            gguf_files = [
                                posixpath.basename(f.rstrip("/"))
                                for f in files
                                if posixpath.basename(f.rstrip("/")).endswith(".gguf")
                            ]
                            if gguf_files:
                                model_path = storage.join(model_path, gguf_files[0])

                model["local_path"] = model_path
            elif model_filename:
                # Other file-based models - append the filename
                model["local_path"] = storage.join(model["local_path"], model_filename)
            else:
                # Legacy model without model_filename but with files - use directory path
                model["local_path"] = model["local_path"]

    return models


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
            logger.info(f"Deleted model cache folder: {repo.repo_path}")
            found = True
            break

    if not found:
        logger.debug(f"Model cache folder not found for: {model_id}")
