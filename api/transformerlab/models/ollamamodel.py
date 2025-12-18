"""
This package defines OllamaModel which represents a model that is stored
in the Ollama cache and can be imported into Transformer Lab.
"""

from transformerlab.models import basemodel

import os
import json
import errno
from lab import storage
import aiofiles


async def list_models():
    try:
        ollama_model_library = ollama_models_library_dir()
    except FileNotFoundError:
        print("Skipping Ollama models: manifests directory not found")
        return []
    except Exception as e:
        print("Failed to locate Ollama models library:")
        print(str(e))
        return []

    models = []
    with os.scandir(ollama_model_library) as dirlist:
        # Scan the ollama cache repos for cached models
        for entry in dirlist:
            # Each model directory contains subdirectories with variants
            if entry.is_dir():
                for subentry in os.scandir(entry.path):
                    if subentry.is_file():
                        # Users will be familiar with Ollama model name format:
                        # <model_name>:<variant>
                        ollama_id = f"{entry.name}:{subentry.name}"
                        ollama_model = OllamaModel(ollama_id)
                        models.append(ollama_model)

    return models


class OllamaModel(basemodel.BaseModel):
    """
    Wrapper for models imported from Ollama.
    These models are kept in the ollama cache (usually ~/.ollama)

    The passed ID will be in standard ollama model name format:
        <model_name>:<variant>
    Similar to how ollama works, if no ":" is included then the assumption
    will be that the model is using the default "latest"
    (i.e. <model_name>:latest)
    """

    def __init__(self, ollama_id):
        # Split the pass ID into the model name and variant
        # which are separated by a colon
        # If no variant is specified, then ollama assumes "latest"
        if ":" in ollama_id:
            model_name, variant = ollama_id.split(":", 1)
        else:
            model_name = ollama_id
            variant = "latest"

        # Translate from ollama ID into Tranformer Lab model IDs.
        # 1. Transformer Lab GGUF models need to be named <modelname>.gguf
        # This is a FastChat thing where filename and modelname MUST match.
        # Most models in ollama will not have the gguf part.
        # 2. It is important to NOT include the variant if it is ":latest"
        # This is because we don't want every GGUF model from Transformer lab
        # in the format <model>.gguf showing up AGAIN as being importable
        # with a new name "<model>:latest.gguf".
        if variant == "latest":
            import_id = f"{model_name}.gguf"
        else:
            import_id = f"{model_name}:{variant}.gguf"

        super().__init__(import_id)

        self.source = "ollama"
        if variant == "latest":
            self.name = model_name
        else:
            self.name = f"{model_name} {variant}"

        # Make sure the source ID explicitly contains the variant name
        self.source_id_or_path = f"{model_name}:{variant}"

        # The actual modelfile is in the ollama cache
        self.model_filename = self._get_model_blob_filename()

    def _get_model_blob_filename(self):
        """
        This returns just the filename of the blob containing the actual model
        If anything goes wrong along the way this returns None
        """

        # Get the path to the manifest file
        try:
            library_dir = ollama_models_library_dir()
        except Exception:
            self.status = "failed to find ollama library"
            return None

        # Read in the manifest file
        # It is stored in a file with the variant name
        # in a directory named after the model
        model_name, variant = self.source_id_or_path.split(":", 1)
        manifestfile = os.path.join(library_dir, model_name, variant)
        try:
            with open(manifestfile, "r") as f:
                filedata = json.load(f)

        except FileNotFoundError:
            print("ollama manifest file not found:", manifestfile)
            return None

        # The format of v2 schema is that there is a list called "layers"
        # Objects in layers have data on the files in the blobs directory
        # those files can be model, license, template, params
        # we are after the model file
        schemaVersion = filedata.get("schemaVersion", None)
        if schemaVersion == 2:
            layers = filedata.get("layers", [])
            for layer in layers:
                # Each layer has a mediaType field describing what the file contains
                # and a digest field with the name of the file
                if layer.get("mediaType", None) == "application/vnd.ollama.image.model":
                    # Check if the specified file exists or not!
                    digestvalue = layer.get("digest", None)
                    models_dir = ollama_models_dir()
                    blobs_dir = os.path.join(models_dir, "blobs")

                    # ollama lists the file with a ":" that needs to be converted to a "-"
                    modelfile = digestvalue.replace(":", "-")
                    model_path = os.path.join(blobs_dir, modelfile)
                    try:
                        with open(model_path, "r") as f:
                            return model_path
                    except FileNotFoundError:
                        self.status = f"model file does not exist {modelfile}"
                        return None

            # If we get here it means schemaVersion is 2 but there was no listed model
            self.status = "no valid ollama.image.model attribute"

        # schemaVersion is not 2. We only support 2.
        self.status = f"unsupported ollama schemaVersion {schemaVersion}"
        return None

    async def get_json_data(self):
        # inherit json_data from the parent and only update specific fields
        json_data = await super().get_json_data()

        # Assume all models from ollama are GGUF
        json_data["architecture"] = "GGUF"
        json_data["formats"] = ["GGUF"]
        json_data["source_id_or_path"] = self.model_filename

        return json_data

    async def install(self):
        input_model_path = self.model_filename

        # self.id contains an ID we can use in Transformer Lab in the format:
        # <modelname>.gguf
        # (with a variant included in modelname only if not :latest)
        output_model_id = self.id

        # Model filename and model name should be the same
        output_filename = output_model_id

        # Make sure our source file exists
        if not input_model_path:
            raise ValueError(f"No modelfile set for ollama model {self.id}")
        elif not os.path.exists(input_model_path):
            raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), input_model_path)

        # Create a directory for the model. Make sure it doesn't exist already.
        from lab.dirs import get_models_dir

        output_path = await storage.join(await get_models_dir(), output_model_id)
        if await storage.exists(output_path):
            raise FileExistsError(errno.EEXIST, "Directory already exists", output_path)
        await storage.makedirs(output_path, exist_ok=True)

        # Create a link in the directory that points to the source blob
        # Note: symlinks may not work with remote storage, but this is for local filesystem
        # For remote storage, we'd need to copy the file instead
        link_name = await storage.join(output_path, output_filename)
        # For now, we'll create the symlink using os.symlink since it's a local filesystem operation
        # If the storage backend is remote, this will need special handling
        try:
            local_link_path = link_name if not link_name.startswith(("s3://", "gs://", "http://", "https://")) else None
            if local_link_path:
                os.symlink(input_model_path, local_link_path)
        except Exception as e:
            # If symlink fails, we could copy the file instead
            print(f"Warning: Could not create symlink, copying file instead: {e}")
            async with aiofiles.open(link_name, "wb") as out_f:
                with open(input_model_path, "rb") as in_f:
                    await out_f.write(in_f.read())

        # Create an index.json file so this can be read by the system (SDK format)
        model_description = {
            "model_id": output_model_id,
            "model_filename": output_filename,
            "name": f"{self.name} (Ollama)",
            "source": "ollama",
            "json_data": {
                "uniqueID": output_model_id,
                "name": f"{self.name} (Ollama)",
                "model_filename": output_filename,
                "description": f"Link to Ollama model {self.source_id_or_path}",
                "source": "ollama",
                "architecture": "GGUF",
                "huggingface_repo": "",
            },
        }
        model_info_file = await storage.join(output_path, "index.json")
        async with aiofiles.open(model_info_file, "w") as f:
            await f.write(json.dumps(model_description))


#########################
#  DIRECTORY STRUCTURE  #
#########################


def ollama_models_dir():
    try:
        ollama_dir = os.environ["OLLAMA_MODELS"]
    except KeyError:
        ollama_dir = os.path.join(os.path.expanduser("~"), ".ollama", "models")

    # Check that the directory actually exists
    if not os.path.isdir(ollama_dir):
        return None

    return ollama_dir


def ollama_models_library_dir():
    models_dir = ollama_models_dir()

    if not models_dir:
        raise FileNotFoundError(errno.ENOENT, os.strerror(errno.ENOENT), "Ollama models directory")

    library_dir = os.path.join(models_dir, "manifests", "registry.ollama.ai", "library")

    if not os.path.isdir(library_dir):
        raise NotADirectoryError(errno.ENOENT, os.strerror(errno.ENOENT), library_dir)

    return library_dir
