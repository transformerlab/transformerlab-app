"""
This package defines HuggingFaceModel and functions for interacting with models
in the Hugging Face hub local cache.
"""

import fnmatch
import json
import os
import shutil

import huggingface_hub
from huggingface_hub import scan_cache_dir
from huggingface_hub.hf_api import RepoFile

from transformerlab.models import basemodel


async def list_models():
    """
    NOTE: This is only listing locally cached Hugging Face models.
    """

    # Get a list of repos cached in the hugging face hub
    hf_cache_info = huggingface_hub.scan_cache_dir()
    repos = hf_cache_info.repos

    # Cycle through the hugging face repos and add them to the list
    # if they are valid models
    models = []
    for repo in repos:
        # Filter out anything that isn't a model
        if repo.repo_type != "model":
            continue

        # Filter out anything that hasn't actually been downloaded
        # Minor hack: Check repo size and if it's under 10K it's probably just config
        if repo.size_on_disk < 10000:
            continue

        model = HuggingFaceModel(repo.repo_id)

        # Check if this model is only GGUF files, in which case handle those separately
        # TODO: Need to handle GGUF Repos separately. But DO NOT read in the full JSON
        # for this repo or it will be too slow.
        formats = []
        gguf_only = (len(formats) == 1) and (formats[0] == "GGUF")
        if not gguf_only:
            # Regular (i.e. not GGUF only) model
            models.append(model)

        # If this repo is tagged GGUF then it might contain multiple
        # GGUF files each of which is a potential model to import
        if "GGUF" in formats:
            # TODO: This requires making a new Model class or using LocalGGUFModel
            # Not trivial given how we currently download GGUF in to workspace/models
            print("Skipping GGUF repo", repo.repo_id)
            pass

    return models


class HuggingFaceModel(basemodel.BaseModel):
    def __init__(self, hugging_face_id):
        super().__init__(hugging_face_id)

        self.source = "huggingface"
        self.source_id_or_path = hugging_face_id

    async def get_json_data(self):
        json_data = await super().get_json_data()

        # We need to access the huggingface_hub to figure out more model details
        # We'll get details and merge them with our json_data
        # Calling huggingface_hub functions can throw a number of exceptions
        model_details = {}
        private = False
        gated = False
        try:
            model_details = await get_model_details_from_huggingface(self.id)
            json_data["formats"] = self._detect_model_formats()

        except huggingface_hub.utils.GatedRepoError:
            # Model exists but this user is not on the authorized list
            self.status = "Authentication Required"
            gated = True

        except huggingface_hub.utils.RepositoryNotFoundError:
            # invalid model ID or private repo without access
            self.status = "Model not found"
            gated = True
            private = True

        except huggingface_hub.utils.EntryNotFoundError as e:
            # This model is missing key configuration information
            self.status = "Missing configuration file"
            print(f"WARNING: {self.id} missing configuration")
            print(f"{type(e).__name__}: {e}")

        except Exception as e:
            # Something unexpected happened
            self.status = str(e)
            print(f"{type(e).__name__}: {e}")

        # Use the huggingface details to extend json_data
        if model_details:
            json_data.update(model_details)
        else:
            json_data["uniqueID"] = self.id
            json_data["name"] = self.id
            json_data["private"] = private
            json_data["gated"] = gated

        return json_data

    def _detect_model_formats(self):
        """
        Scans the files in the HuggingFace repo to try to determine the format
        of the model.
        """
        # Get a list of files in this model and iterate over them
        try:
            repo_files = huggingface_hub.list_repo_files(self.id)
        except Exception:
            return []

        detected_formats = []
        for repo_file in repo_files:
            format = basemodel.get_model_file_format(repo_file)

            # If this format isn't in the list already then add it!
            if format and (format not in detected_formats):
                detected_formats.append(format)

        return detected_formats


def _is_gguf_repository(hugging_face_id: str, hf_model_info):
    """
    Determine if a repository is primarily a GGUF repository by checking the repository tags for 'gguf'
    """
    # Check tags - only consider GGUF if it has gguf tag but not safetensors tag
    model_tags = getattr(hf_model_info, "tags", [])
    model_tags_lower = [tag.lower() for tag in model_tags]
    if "gguf" in model_tags_lower and "safetensors" not in model_tags_lower:
        return True
    return False


def _create_gguf_repo_config(
    hugging_face_id: str, hf_model_info, model_card_data, pipeline_tag: str
):
    """
    Create a model config for GGUF repositories that don't have config.json.
    Returns a special config that indicates available GGUF files for selection.
    """
    model_tags = getattr(hf_model_info, "tags", [])

    # Get list of GGUF files in the repository
    gguf_files = []
    try:
        repo_files = huggingface_hub.list_repo_files(hugging_face_id)
        gguf_files = [f for f in repo_files if f.endswith(".gguf")]
    except Exception:
        pass

    # Calculate total repository size
    try:
        model_size = get_huggingface_download_size(hugging_face_id) / (1024 * 1024)
    except Exception:
        model_size = 0

    config = {
        "uniqueID": hugging_face_id,
        "name": getattr(hf_model_info, "modelId", hugging_face_id),
        "private": getattr(hf_model_info, "private", False),
        "gated": getattr(hf_model_info, "gated", False),
        "architecture": "GGUF",
        "huggingface_repo": hugging_face_id,
        "model_type": "gguf_repository",
        "size_of_model_in_mb": model_size,
        "library_name": "gguf",
        "tags": model_tags,
        "license": model_card_data.get("license", ""),
        "available_gguf_files": gguf_files,
        "requires_file_selection": True,  # Flag to indicate this needs file selection
        "context": "",  # Will be determined when specific file is selected
        "pipeline_tag": pipeline_tag,
    }

    return config


async def get_model_details_from_huggingface(hugging_face_id: str):
    """
    Gets model config details from huggingface_hub
    and return in the format of BaseModel's json_data.
    This is just a helper function for the constructor to make things more readable.

    This function can raise several Exceptions from HuggingFace
    """

    # Get model info for metadata and license details
    # Similar to hf_hub_download this can throw exceptions
    # Some models don't have a model card (mostly models that have been deprecated)
    # In that case just set model_card_data to an empty object
    hf_model_info = huggingface_hub.model_info(hugging_face_id)
    try:
        model_card = hf_model_info.card_data
        model_card_data = model_card.to_dict()
    except AttributeError:
        model_card_data = {}

    # Get pipeline tag
    pipeline_tag = getattr(hf_model_info, "pipeline_tag", "")

    # Detect SD model by tags or by presence of model_index.json
    model_tags = getattr(hf_model_info, "tags", [])
    is_sd = False
    if any("stable-diffusion" in t or "diffusers" in t for t in model_tags):
        is_sd = True
    try:
        repo_files = huggingface_hub.list_repo_files(hugging_face_id)
        if any(f.endswith("model_index.json") for f in repo_files):
            is_sd = True
    except Exception:
        repo_files = []

    sd_patterns = [
        "*.ckpt",
        "*.safetensors",
        "*.pt",
        "*.bin",
        "config.json",
        "model_index.json",
        "vocab.json",
        "merges.txt",
        "tokenizer.json",
        "*.yaml",
        "*.yml",
    ]

    if is_sd:
        # Try to read model_index.json for metadata, else just return minimal config
        model_index_path = os.path.join(hugging_face_id, "model_index.json")
        fs = huggingface_hub.HfFileSystem()
        model_index = None

        try:
            with fs.open(model_index_path) as f:
                model_index = json.load(f)
                class_name = model_index.get("_class_name", "")
                if class_name == "":
                    config = getattr(model_index, "config", {})
                    diffusers_config = config.get("diffusers", {})
                    architectures = diffusers_config.get("_class_name", "")
                    if isinstance(architectures, str):
                        architectures = [architectures]
                else:
                    if isinstance(class_name, str):
                        architectures = [class_name]
                    else:
                        architectures = class_name
        except huggingface_hub.utils.GatedRepoError:
            print(f"Model {hugging_face_id} is gated.")
            raise
        except Exception as e:
            print(f"Error reading model_index.json for {hugging_face_id}: {e}")
            raise
        config = {
            "uniqueID": hugging_face_id,
            "name": getattr(hf_model_info, "modelId", hugging_face_id),
            "private": getattr(hf_model_info, "private", False),
            "gated": getattr(hf_model_info, "gated", False),
            "architecture": architectures[0],
            "huggingface_repo": hugging_face_id,
            "model_type": "diffusion",
            "size_of_model_in_mb": get_huggingface_download_size(hugging_face_id, sd_patterns)
            / (1024 * 1024),
            "tags": model_tags,
            "license": model_card_data.get("license", ""),
            "allow_patterns": sd_patterns,
            "pipeline_tag": pipeline_tag,
        }
        if model_index:
            config["model_index"] = model_index
        return config

    # Check if this is a GGUF repository first, before processing config.json
    is_gguf_repo = _is_gguf_repository(hugging_face_id, hf_model_info)
    if is_gguf_repo:
        return _create_gguf_repo_config(
            hugging_face_id, hf_model_info, model_card_data, pipeline_tag
        )
    # Non-SD models: require config.json
    try:
        # First try to download the config.json file to local cache
        local_config_path = huggingface_hub.hf_hub_download(
            repo_id=hugging_face_id, filename="config.json"
        )

        # Read from the local downloaded file
        with open(local_config_path) as f:
            filedata = json.load(f)
    except Exception:
        try:
            # Fallback to HfFileSystem approach
            fs = huggingface_hub.HfFileSystem()
            filename = os.path.join(hugging_face_id, "config.json")
            with fs.open(filename) as f:
                filedata = json.load(f)
        except huggingface_hub.utils.GatedRepoError:
            print(f"Model {hugging_face_id} is gated.")
            raise
        except Exception as e:
            # If we can't read the config.json file, return None
            print(f"Error reading config.json for {hugging_face_id}: {e}")
            return None

    try:
        # config.json stores a list of architectures but we only store one so just take the first!
        architecture_list = filedata.get("architectures", [])
        architecture = architecture_list[0] if architecture_list else ""

        # Oh except we list GGUF and MLX as architectures, but HuggingFace sometimes doesn't
        # It is usually stored in library, or sometimes in tags
        library_name = getattr(hf_model_info, "library_name", "")
        if library_name:
            if library_name.lower() == "mlx":
                architecture = "MLX"
            if library_name.lower() == "gguf":
                architecture = "GGUF"

        # And sometimes it is stored in the tags for the repo
        model_tags = getattr(hf_model_info, "tags", [])
        if "mlx" in model_tags:
            architecture = "MLX"

        # calculate model size
        model_size = get_huggingface_download_size(hugging_face_id) / (1024 * 1024)

        # TODO: Context length definition seems to vary by architecture. May need conditional logic here.
        context_size = filedata.get("max_position_embeddings", "")

        # --- Stable Diffusion detection and allow_patterns logic ---
        sd_patterns = [
            "*.ckpt",
            "*.safetensors",
            "*.pt",
            "*.bin",
            "config.json",
            "model_index.json",
            "vocab.json",
            "merges.txt",
            "tokenizer.json",
            "*.yaml",
            "*.yml",
        ]
        is_sd = False
        # Heuristic: check tags or config for 'stable-diffusion' or 'diffusers' or common SD files
        if any("stable-diffusion" in t or "diffusers" in t for t in model_tags):
            is_sd = True
        # Or check for model_index.json in repo files
        try:
            repo_files = huggingface_hub.list_repo_files(hugging_face_id)
            if any(f.endswith("model_index.json") for f in repo_files):
                is_sd = True
        except Exception:
            pass

        # TODO: Figure out description, paramters, model size
        newmodel = basemodel.BaseModel(hugging_face_id)
        config = await newmodel.get_json_data()
        config = {
            "uniqueID": hugging_face_id,
            "name": filedata.get("name", hugging_face_id),
            "context": context_size,
            "private": getattr(hf_model_info, "private", False),
            "gated": getattr(hf_model_info, "gated", False),
            "architecture": architecture,
            "huggingface_repo": hugging_face_id,
            "model_type": filedata.get("model_type", ""),
            "size_of_model_in_mb": model_size,
            "library_name": library_name,
            "tags": model_tags,
            "transformers_version": filedata.get("transformers_version", ""),
            "quantization": filedata.get("quantization", ""),
            "license": model_card_data.get("license", ""),
            "pipeline_tag": pipeline_tag,
        }
        return config
    except huggingface_hub.utils.EntryNotFoundError as e:
        print(f"ERROR: config.json not found for {hugging_face_id}: {e}")
        raise
    except huggingface_hub.utils.GatedRepoError as e:
        print(f"ERROR: Model {hugging_face_id} is gated and requires authentication: {e}")
        raise
    except huggingface_hub.utils.RepositoryNotFoundError as e:
        print(f"ERROR: Repository {hugging_face_id} not found: {e}")
        raise
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in config.json for {hugging_face_id}: {e}")
        raise
    except Exception as e:
        print(f"ERROR: Unexpected error processing {hugging_face_id}: {type(e).__name__}: {e}")
        raise

    # Something did not go to plan
    return None


def get_huggingface_download_size(model_id: str, allow_patterns: list = []):
    """
    Get the size in bytes of all files to be downloaded from Hugging Face.

    Raises: RepositoryNotFoundError if model_id doesn't exist on huggingface (or can't be accessed)
    """

    # This can throw Exceptions: RepositoryNotFoundError
    hf_model_info = huggingface_hub.list_repo_tree(model_id, recursive=True)

    # Iterate over files in the model repo and add up size if they are included in download
    download_size = 0
    total_size = 0
    for file in hf_model_info:
        if isinstance(file, RepoFile):
            total_size += file.size

            # if there are no allow_patterns to filter on then add every file
            if len(allow_patterns) == 0:
                download_size += file.size

            # If there is an array of allow_patterns then only add this file
            # if it matches one of the allow_patterns
            else:
                for pattern in allow_patterns:
                    if fnmatch.fnmatch(file.path, pattern):
                        download_size += file.size
                        break

    return download_size


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
