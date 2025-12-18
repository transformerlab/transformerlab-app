"""
LocalModelStore manages models in both the database and
.transformerlab/workspace/models directory.

There are functions in model_helper to make it easier to work with.
"""

import json
import posixpath
from huggingface_hub import hf_hub_download
from transformerlab.models import modelstore
from werkzeug.utils import secure_filename
from lab import storage


async def is_sentence_transformer_model(
    model_name_or_path: str,
    token: bool | str | None = None,
    cache_folder: str | None = None,
    revision: str | None = None,
    local_files_only: bool = False,
) -> bool:
    """
    Checks if the given model name or path corresponds to a SentenceTransformer model.

    Args:
        model_name_or_path (str): The name or path of the model.
        token (Optional[Union[bool, str]]): The token to be used for authentication. Defaults to None.
        cache_folder (Optional[str]): The folder to cache the model files. Defaults to None.
        revision (Optional[str]): The revision of the model. Defaults to None.
        local_files_only (bool): Whether to only use local files for the model. Defaults to False.

    Returns:
        bool: True if the model is a SentenceTransformer model, False otherwise.
    """
    return bool(
        await load_file_path(
            model_name_or_path,
            "modules.json",
            token=token,
            cache_folder=cache_folder,
            revision=revision,
            local_files_only=local_files_only,
        )
    )


async def load_file_path(
    model_name_or_path: str,
    filename: str,
    token: bool | str | None = None,
    cache_folder: str | None = None,
    revision: str | None = None,
    local_files_only: bool = True,
) -> str | None:
    """
    Loads a file from a local or remote location.

    Args:
        model_name_or_path (str): The model name or path.
        filename (str): The name of the file to load.
        token (Optional[Union[bool, str]]): The token to access the remote file (if applicable).
        cache_folder (Optional[str]): The folder to cache the downloaded file (if applicable).
        revision (Optional[str], optional): The revision of the file (if applicable). Defaults to None.
        local_files_only (bool, optional): Whether to only consider local files. Defaults to False.

    Returns:
        Optional[str]: The path to the loaded file, or None if the file could not be found or loaded.
    """
    # If file is local
    file_path = storage.join(model_name_or_path, filename)
    if await storage.exists(file_path):
        return file_path

    # If file is remote
    try:
        return hf_hub_download(
            model_name_or_path,
            filename=filename,
            revision=revision,
            library_name="sentence-transformers",
            token=token,
            cache_dir=cache_folder,
            local_files_only=local_files_only,
        )
    except Exception:
        return None


class LocalModelStore(modelstore.ModelStore):
    def __init__(self):
        super().__init__()

    async def filter_embedding_models(self, models, embedding=False):
        """
        Filter out models based on whether they are embedding models or not.
        """

        embedding_models = []
        non_embedding_models = []

        for model in models:
            if model.get("model_id", None):
                if (
                    model["json_data"].get("model_filename", None)
                    and model["json_data"]["model_filename"].strip() != ""
                ):
                    model_id = model["json_data"]["model_filename"]
                elif model.get("local_path", None) and model["local_path"].strip() != "":
                    model_id = model["local_path"]
                else:
                    model_id = model["model_id"]
            else:
                print("Model ID not found in model data.")
                print(model)
                continue

            if await is_sentence_transformer_model(model_id):
                embedding_models.append(model)
            else:
                non_embedding_models.append(model)

        return embedding_models if embedding else non_embedding_models

    async def list_models(self, embedding=False):
        """
        Check both the filesystem and workspace for models.
        """

        # Use SDK to get all models from the filesystem
        from lab.model import Model as ModelService

        models = await ModelService.list_all()

        # Add additional metadata to each model
        from lab.dirs import get_models_dir

        models_dir = await get_models_dir()
        for model in models:
            if model == {} or model is None or model == "":
                print("Model entry not found, skipping")
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

        # Filter out models based on whether they are embedding models or not
        models = await self.filter_embedding_models(models, embedding)

        return models

    def compute_output_model(self, input_model, adaptor_name):
        """
        Compute the output model name by taking the last part of the input model
        (in case it is a full path) and appending an underscore and the adaptor name.

        For example:
            input_model: "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
            adaptor_name: "ml-qa"
            returns: "TinyLlama-1.1B-Chat-v1.0_ml-qa"
        """
        base_model = input_model.split("/")[-1]
        return f"{base_model}_{adaptor_name}"

    async def build_provenance(self):
        """
        Build a mapping from model names to their provenance data by reading _tlab_provenance.json files
        in each model directory.
        """
        provenance = {}
        from lab.dirs import get_models_dir

        models_dir = await get_models_dir()

        # Load the tlab_complete_provenance.json file if it exists
        complete_provenance_file = storage.join(models_dir, "_tlab_complete_provenance.json")
        if await storage.exists(complete_provenance_file):
            async with await storage.open(complete_provenance_file, "r") as f:
                try:
                    provenance = json.loads(await f.read())
                except json.JSONDecodeError:
                    print(f"Error loading {complete_provenance_file}: Invalid JSON format.")
                    provenance = {}
                except Exception as e:
                    print(f"Error loading {complete_provenance_file}: {str(e)}")
                    provenance = {}
            # Check if the provenance for any local models was missed
            provenance, local_added_count = await self.check_provenance_for_local_models(provenance)
            if local_added_count != 0:
                # Save new provenance mapping
                async with await storage.open(complete_provenance_file, "w") as f:
                    await f.write(json.dumps(provenance))
            # Check if the provenance mapping is up to date
            # The -1 here indicates that we are not counting the _tlab_complete_provenance.json file in models_dir
            try:
                entries = await storage.ls(models_dir, detail=False)
                dir_count = sum(1 for entry in entries if await storage.isdir(entry))
            except Exception:
                dir_count = 0
            if len(provenance) > 0 and dir_count + local_added_count - 1 == len(provenance):
                return provenance, False

        # If the provenance mapping is not built or models_dir has changed, we need to rebuild it
        # Scan all model directories
        try:
            entries = await storage.ls(models_dir, detail=False)
            for entry_path in entries:
                if await storage.isdir(entry_path):
                    # Extract entry name from path
                    entry_name = entry_path.rstrip("/").split("/")[-1]
                    # Look for provenance file
                    provenance_file = storage.join(models_dir, entry_name, "_tlab_provenance.json")
                    try:
                        if await storage.exists(provenance_file):
                            async with await storage.open(provenance_file, "r") as f:
                                prov_data = json.loads(await f.read())
                                if "md5_checksums" in prov_data:
                                    prov_data["parameters"]["md5_checksums"] = prov_data["md5_checksums"]

                                # Compute output model name if needed
                                output_model = prov_data.get("model_name")
                                if not output_model and prov_data.get("input_model") and prov_data.get("adaptor_name"):
                                    output_model = self.compute_output_model(
                                        prov_data["input_model"], prov_data["adaptor_name"]
                                    )
                                prov_data["output_model"] = output_model

                                # Add to provenance mapping
                                provenance[output_model] = prov_data

                    except Exception as e:
                        print(f"Error loading provenance for {entry_name}: {str(e)}")
        except Exception:
            pass

        # Import from local_models too when building from scratch
        provenance, _ = await self.check_provenance_for_local_models(provenance)

        return provenance, True

    async def check_provenance_for_local_models(self, provenance):
        # Get the list of all local models
        from lab.model import Model as ModelService

        models = await ModelService.list_all()
        models_added_to_provenance = 0
        # Iterate through models and check if they have provenance data and if they exist already in provenance
        for model_dict in models:
            if (
                model_dict.get("model_id", "") not in provenance.keys()
                or model_dict.get("model_name", "") not in provenance.keys()
            ):
                # Check if the model_source is local
                source_path = model_dict.get("json_data", {}).get("source_id_or_path", "")
                if model_dict.get("json_data", {}).get("source", "") == "local" and await storage.exists(source_path):
                    # Check if the model has a _tlab_provenance.json file
                    provenance_file = storage.join(source_path, "_tlab_provenance.json")
                    if await storage.exists(provenance_file):
                        # Load the provenance file
                        async with await storage.open(provenance_file, "r") as f:
                            prov_data = json.loads(await f.read())
                            if "md5_checksums" in prov_data:
                                prov_data["parameters"]["md5_checksums"] = prov_data["md5_checksums"]

                            # Compute output model name if needed
                            output_model = prov_data.get("model_name")
                            if not output_model and prov_data.get("input_model") and prov_data.get("adaptor_name"):
                                output_model = self.compute_output_model(
                                    prov_data["input_model"], prov_data["adaptor_name"]
                                )
                            prov_data["output_model"] = output_model

                            # Add to provenance mapping
                            provenance[output_model] = prov_data
                            models_added_to_provenance += 1

        return provenance, models_added_to_provenance

    async def trace_provenance(self, latest_model, provenance_mapping):
        """
        Trace back the chain of training jobs from the final model using provenance files.
        """
        chain = []
        current_model = latest_model.split("/")[-1]

        while current_model in provenance_mapping:
            job_details = provenance_mapping[current_model]
            chain.insert(0, job_details)

            # Get parent model from provenance
            parent_model = job_details.get("input_model")
            if not parent_model or parent_model == current_model:
                break

            # Normalize the parent model by taking the last part if it is a path
            parent_model = parent_model.split("/")[-1]
            current_model = parent_model

        return chain

    async def get_evals_by_model(self, model_id):
        """
        Retrieve evaluation data from the _tlab_provenance.json file.
        """
        from lab.dirs import get_models_dir

        models_dir = await get_models_dir()
        evaluations_by_model = {}

        # Extract just the model name if model_id contains a path
        search_model_id = model_id
        if "/" in model_id:
            search_model_id = model_id.split("/")[-1]

        # Sanitize the search_model_id to prevent directory traversal attacks
        search_model_id = secure_filename(search_model_id)

        # Look for the model directory - prioritize exact matches
        model_dir = None
        try:
            entries = await storage.ls(models_dir, detail=False)
            for entry_path in entries:
                if await storage.isdir(entry_path):
                    entry = entry_path.rstrip("/").split("/")[-1]
                    # Exact match first, then check for suffixes
                    if entry == search_model_id:
                        model_dir = entry_path
                        break
                    elif entry.endswith(f"_{search_model_id}"):
                        model_dir = entry_path
                        break
        except Exception:
            pass

        if model_dir and await storage.exists(model_dir):
            provenance_file = storage.join(model_dir, "_tlab_provenance.json")
            if await storage.exists(provenance_file):
                try:
                    async with await storage.open(provenance_file, "r") as f:
                        provenance_data = json.loads(await f.read())

                        # Get evaluations from the same file
                        evaluations = provenance_data.get("evaluations", [])

                        # Convert to the format expected by the API
                        converted_evaluations = []
                        for eval_data in evaluations:
                            # Format scores for frontend display - convert metrics_summary to score format
                            metrics_summary = eval_data.get("metrics_summary", {})
                            score_array = []
                            for metric_name, score_value in metrics_summary.items():
                                score_array.append({"type": metric_name, "score": score_value})

                            converted_eval = {
                                "job_id": eval_data.get("job_id"),
                                "model_name": eval_data.get("model_name"),
                                "evaluation_type": eval_data.get("evaluation_type"),
                                "parameters": eval_data.get("parameters", {}),
                                "metrics_summary": eval_data.get("metrics_summary", {}),
                                "score": json.dumps(score_array),  # Frontend expects this format
                                "total_test_cases": eval_data.get("total_test_cases"),
                                "start_time": eval_data.get("start_time"),
                                "end_time": eval_data.get("end_time"),
                            }
                            converted_evaluations.append(converted_eval)

                        model_name = provenance_data.get("model_name", model_id)
                        evaluations_by_model[model_name] = converted_evaluations

                except Exception as e:
                    print(f"Error loading provenance for {model_id}: {str(e)}")

        return evaluations_by_model

    async def list_model_provenance(self, model_id):
        """
        List model provenance by reading from _tlab_provenance.json files.
        """
        # Build a mapping from model names to their provenance data
        provenance_mapping, provenance_updated = await self.build_provenance()

        if provenance_updated:
            # Save the provenance mapping as a json file
            from lab.dirs import get_models_dir

            provenance_file = storage.join(await get_models_dir(), "_tlab_complete_provenance.json")
            async with await storage.open(provenance_file, "w") as f:
                await f.write(json.dumps(provenance_mapping))

        # Trace the provenance chain leading to the given model
        chain = await self.trace_provenance(model_id, provenance_mapping)

        # Retrieve evaluation data from files
        evals_by_model = await self.get_evals_by_model(model_id)

        if len(chain) == 0:
            item = {
                "input_model": model_id,
                "output_model": model_id,
                "dataset": None,
                "parameters": {},
                "start_time": None,
                "end_time": None,
            }
            item["evals"] = evals_by_model.get(model_id, [])
            return {"final_model": model_id, "provenance_chain": [item]}

        # For every training job in the provenance chain, attach evaluations
        for item in chain:
            output_model = item.get("output_model") or item.get("model_name")
            item["evals"] = evals_by_model.get(output_model, [])

        # Create the final provenance dictionary
        output = {"final_model": model_id, "provenance_chain": chain}

        return output
