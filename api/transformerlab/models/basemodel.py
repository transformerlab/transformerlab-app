import os


class BaseModel:
    """
    A basic representation of a Model in Transformer Lab.

    The base object contains minimal information about the model
    so you can display a list of available models at low cost.
    If you want full model details in the format returned by the API
    (which maps to the structure of the database and model gallery)
    then you should call get_json_data().

    -- Creating additional Model sources --

    To add a new model source, you will typically create new classes
    that inherit from ModelStore and BaseModel.

    The key functions to override in your subclass are:
    - get_model_path:
    - get_json_data: to map model details to our standard json structure
    - install: ONLY if there is custom install actions required to run the model

    Then in your subclass' constructor call super, and then set any additional
    fields you want to store in the model's JSON.

    Properties:
    id:             Unique Transformer Lab model identifier
    name:           Printable name for the model (how it appears in the app)
    status:         A text string that is either "OK" or contains and error message

    """

    def __init__(self, id):
        """
        The constructor takes an ID that is unique to the model source.
        It is possible for multiple sources to have models with the same ID.
        """

        self.id = id
        self.name = id
        self.status = "OK"
        self.source = "unknown"
        self.source_id_or_path = self.id
        self.model_filename = None

    def __str__(self):
        # For debug output
        return str(self.__class__) + ": " + str(self.__dict__)

    async def get_json_data(self):
        """
        Returns full model details in the format returned by the API.
        This format maps to the structure of the database and matches the format used
        by the model gallery.

        Although this data is completely flexible, there are certain fields
        that are expected to be present on functioning models including:

        source:         Where the model is stored ("huggingface", "local", etc.)
        source_id_or_path:
                        The id of this model in it source (or path for local files)
        model_filename: With source_id_or_path, a specific filename for this model.
                        For example, GGUF repos have several files representing
                        different versions of teh model.
        architecture:   A string describing the model architecture used to determine
                        support for the model and how to run
        formats:        A array of strings describing the file format used to store model
                        weights. This can be "safetensors", "bin", "gguf", "mlx".

        """
        # While json_data is unstructured and flexible
        # These are the fields that the app generally expects to exist
        return {
            "uniqueID": self.id,
            "model_filename": self.model_filename if self.model_filename else "",
            "name": self.id,
            "description": "",
            "architecture": "unknown",
            "formats": [],
            "source": self.source,
            "source_id_or_path": self.source_id_or_path,
            "huggingface_repo": "",
            "parameters": "",
            "context": "",
            "license": "",
            "logo": "",
            # The following are from huggingface_hu.hf_api.ModelInfo
            # and used by our app
            "private": False,
            "gated": False,  # Literal["auto", "manual", False]
            "model_type": "",
            "library_name": "",
            "transformers_version": "",
        }

    async def install(self):
        json_data = await self.get_json_data()
        from lab.model import Model as ModelService

        try:
            model_service = await ModelService.create(self.id)
        except FileExistsError:
            model_service = await ModelService.get(self.id)
        await model_service.set_metadata(model_id=self.id, name=self.name, json_data=json_data)


# MODEL UTILITY FUNCTIONS


def get_model_file_format(filename: str):
    """
    Helper method available to subclasses to detect format of contained model weight files.
    Returns None if the file doesn't match any of the known types.
    """
    formats = {
        ".safetensors": "Safetensors",
        ".bin": "PyTorch",
        ".pt": "PyTorch",
        ".pth": "PyTorch",
        ".pkl": "Pickle",
        ".gguf": "GGUF",
        ".ggml": "GGUF",
        ".keras": "Keras",
        ".npz": "NPZ",
        ".llamafile": "Llamafile",
        ".onnx": "ONNX",
        ".ckpt": "TensorFlow CHeckpoint",
    }
    _, file_ext = os.path.splitext(filename)

    # If the extension doesn't exist then return None
    return formats.get(file_ext, None)
