"""
File System models are stored on the local file system.

This package defines both
FilesystemModel and FilesystemGGUFModel classes
"""

import os
import json

from transformerlab.models import basemodel


SINGLE_FILE_DIFFUSION_EXTENSIONS = {".ckpt", ".safetensors"}


def _infer_diffusion_architecture_from_filename(filename: str) -> str:
    """Infer diffusion pipeline architecture from filename heuristics."""
    name = filename.lower()

    # SDXL
    if "sdxl" in name or "stable-diffusion-xl" in name or "sd_xl" in name:
        return "StableDiffusionXLPipeline"

    # SD3
    if "sd3" in name or "stable-diffusion-3" in name or "stable-diffusion3" in name:
        return "StableDiffusion3Pipeline"

    # Latent Consistency Models
    if "lcm" in name or "latent-consistency" in name:
        return "LatentConsistencyModelPipeline"

    # Default to SD 1.x style
    return "StableDiffusionPipeline"


async def list_models(path: str):
    """
    This function recursively calls itself to generate a list of models under path.
    First try to determine if this directory is itself a model (and then check
    to see if we can support it). Then search subdirectories for models.
    NOTE: If you pass this a directory with a large tree under it, this can take
    a long time to run!
    """
    if not os.path.isdir(path):
        return []

    # First decide if this directory is a model
    # Trivially decide this based purely on presence of a configuration file.
    config_file = os.path.join(path, "config.json")
    if os.path.isfile(config_file):
        # TODO Verify that this is something we can support
        model = FilesystemModel(path)
        return [model]

    # Otherwise scan this directory for single-file models
    # And then scan subdirectories recursively
    models = []
    with os.scandir(path) as dirlist:
        for entry in dirlist:
            if entry.is_dir():
                models.extend(await list_models(entry.path))

            # Use file extension to decide if this is a GGUF model
            if entry.is_file():
                _, fileext = os.path.splitext(entry.path)
                if fileext.lower() == ".gguf" or fileext.lower() == ".ggml":
                    model = FilesystemGGUFModel(entry.path)
                    models.append(model)
                elif fileext.lower() in SINGLE_FILE_DIFFUSION_EXTENSIONS:
                    model = FilesystemDiffusionSingleFileModel(entry.path)
                    models.append(model)

        dirlist.close()

    return models


class FilesystemModel(basemodel.BaseModel):
    def __init__(self, model_path):
        # The ID for this model will be the directory name without path
        model_id = os.path.basename(model_path)

        super().__init__(model_id)

        # model_path is the key piece of data for local models
        self.source = "local"
        self.source_id_or_path = model_path
        self.model_filename = model_path
        self.model_path = model_path

    async def get_json_data(self):
        json_data = await super().get_json_data()

        # Get model details from configuration file
        config_file = os.path.join(self.model_path, "config.json")
        try:
            with open(config_file, "r") as f:
                filedata = json.load(f)
                f.close()

                architecture_list = filedata.get("architectures", [])
                json_data["architecture"] = architecture_list[0] if architecture_list else ""
                json_data["context_size"] = filedata.get("max_position_embeddings", "")
                json_data["quantization"] = filedata.get("quantization", {})

                # TODO: Check formats to make sure this is a valid model?

        except FileNotFoundError:
            self.status = "Missing configuration file"
            print(f"WARNING: {self.id} missing configuration")

        except json.JSONDecodeError:
            # Invalid JSON means invlalid model
            self.status = "{self.id} has invalid JSON for configuration"
            print(f"ERROR: Invalid config.json in {self.model_path}")

        return json_data


class FilesystemGGUFModel(basemodel.BaseModel):
    def __init__(self, model_path):
        # The ID for this model will be the filename without path
        model_id = os.path.basename(model_path)

        super().__init__(model_id)

        self.model_filename = model_path
        self.source_id_or_path = model_path
        self.source = "local"

    async def get_json_data(self):
        json_data = await super().get_json_data()

        # Get model details from configuration file
        if os.path.isfile(self.source_id_or_path):
            architecture = "GGUF"
            formats = ["GGUF"]
        else:
            self.status = f"Invalid GGUF model: {self.source_id_or_path}"
            architecture = "unknown"
            formats = []

        json_data["architecture"] = architecture
        json_data["formats"] = formats

        return json_data


class FilesystemDiffusionSingleFileModel(basemodel.BaseModel):
    def __init__(self, model_path):
        # The ID for this model will be the filename without path
        model_id = os.path.basename(model_path)

        super().__init__(model_id)

        self.model_filename = os.path.basename(model_path)
        self.source_id_or_path = model_path
        self.source = "local"
        self.model_path = model_path

    async def get_json_data(self):
        json_data = await super().get_json_data()

        # Basic metadata for single-file diffusion models
        json_data["architecture"] = _infer_diffusion_architecture_from_filename(self.model_filename)
        json_data["model_type"] = "diffusion"

        # Detect format from extension
        format_name = basemodel.get_model_file_format(self.model_filename)
        json_data["formats"] = [format_name] if format_name else []

        return json_data
