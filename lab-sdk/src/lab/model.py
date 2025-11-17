import json
from werkzeug.utils import secure_filename
import time

from .dirs import get_models_dir
from .labresource import BaseLabResource
from . import storage


class Model(BaseLabResource):
    def get_dir(self):
        """Abstract method on BaseLabResource"""
        model_id_safe = secure_filename(str(self.id))
        return storage.join(get_models_dir(), model_id_safe)

    def _default_json(self):
        # Default metadata modeled after API model table fields
        return {
            "model_id": self.id,
            "name": self.id,
            "json_data": {},
        }

    def set_metadata(self, *, model_id: str | None = None, name: str | None = None, json_data: dict | None = None):
        """Set model metadata, similar to dataset service"""
        data = self.get_json_data()
        if model_id is not None:
            data["model_id"] = model_id
        if name is not None:
            data["name"] = name
        if json_data is not None:
            # merge (shallow) to maintain parity and avoid dropping keys
            current = data.get("json_data", {})
            if not isinstance(current, dict):
                current = {}
            current.update(json_data)
            data["json_data"] = current
        self._set_json_data(data)

    def get_metadata(self):
        """Get model metadata"""
        return self.get_json_data()

    @staticmethod
    def list_all():
        """List all models in the filesystem, similar to dataset service"""
        results = []
        models_dir = get_models_dir()
        if not storage.isdir(models_dir):
            return results
        try:
            entries = storage.ls(models_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if not storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                model = Model(entry)
                results.append(model.get_metadata())
            except Exception:
                continue
        return results

    def import_model(self, model_name, model_path):
        """
        Given a model name and path, create a new model that can be used in the workspace.
        """
        self.generate_model_json(model_name, model_path)

    def detect_architecture(self, model_path: str) -> str:
        """
        Detect the model architecture from a model directory's config.json.
        
        Args:
            model_path: Path to the model directory or file
            
        Returns:
            The model architecture (e.g., 'LlamaForCausalLM') or 'Unknown' if not found
        """
        architecture = "Unknown"
        
        if storage.isdir(model_path):
            config_path = storage.join(model_path, "config.json")
            if storage.exists(config_path):
                try:
                    with storage.open(config_path, 'r') as f:
                        config = json.load(f)
                        architectures = config.get("architectures", [])
                        if architectures:
                            architecture = architectures[0]
                except Exception:
                    pass
        
        return architecture

    def fetch_pipeline_tag(self, parent_model: str) -> str | None:
        """
        Fetch the pipeline tag from a parent model on HuggingFace.
        
        Args:
            parent_model: The HuggingFace model ID to fetch the pipeline tag from
            
        Returns:
            The pipeline tag string if found, None otherwise
        """
        try:
            from huggingface_hub import HfApi
            api = HfApi()
            model_info = api.model_info(parent_model)
            return model_info.pipeline_tag
        except Exception as e:
            print(f"Could not fetch pipeline tag from parent model '{parent_model}': {type(e).__name__}: {e}")
            return None

    def create_md5_checksums(self, model_path: str) -> list:
        """
        Create MD5 checksums for all files in the model directory.
        
        Args:
            model_path: Path to the model directory
            
        Returns:
            List of dicts with 'file_path' and 'md5_hash' keys
        """
        import hashlib
        
        def compute_md5(file_path):
            md5 = hashlib.md5()
            with storage.open(file_path, "rb") as f:
                while chunk := f.read(8192):
                    md5.update(chunk)
            return md5.hexdigest()

        md5_objects = []

        if not storage.isdir(model_path):
            print(f"Model path '{model_path}' is not a directory, skipping MD5 checksum creation")
            return md5_objects

        # Use fsspec's walk equivalent for directory traversal
        try:
            files = storage.find(model_path)
            for file_path in files:
                try:
                    md5_hash = compute_md5(file_path)
                    md5_objects.append({"file_path": file_path, "md5_hash": md5_hash})
                except Exception as e:
                    print(f"Warning: Could not compute MD5 for {file_path}: {str(e)}")
        except Exception:
            # Fallback: if find doesn't work, try listing the directory
            try:
                entries = storage.ls(model_path, detail=False)
                for entry in entries:
                    if storage.isfile(entry):
                        try:
                            md5_hash = compute_md5(entry)
                            md5_objects.append({"file_path": entry, "md5_hash": md5_hash})
                        except Exception as e:
                            print(f"Warning: Could not compute MD5 for {entry}: {str(e)}")
            except Exception:
                pass

        return md5_objects

    def create_provenance_file(self, model_path: str, model_name: str = None, model_architecture: str = None,
                               md5_objects: list = None, provenance_data: dict = None) -> str:
        """
        Create a _tlab_provenance.json file containing model provenance data.
        
        Args:
            model_path: Path to the model directory
            model_name: Name of the model
            model_architecture: Architecture of the model
            md5_objects: List of MD5 checksums from create_md5_checksums()
            provenance_data: Optional dict with additional provenance data. Expected keys include:
                - job_id: ID of the job that created this model
                - input_model: Name of the base/parent model used
                - dataset: Name of the dataset used for training
                - adaptor_name: Name of the adapter if applicable
                - parameters: Training configuration parameters
                - start_time: When training/processing started
            
        Returns:
            Path to the created provenance file
        """
        
        # Start with base provenance data matching the structure from train.py
        final_provenance = {
            "model_name": model_name,
            "model_architecture": model_architecture,
            "job_id": None,
            "input_model": None,
            "dataset": None,
            "adaptor_name": None,
            "parameters": None,
            "start_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "end_time": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()),
            "md5_checksums": md5_objects,
        }
        
        # Merge in any additional provenance data provided
        if provenance_data and isinstance(provenance_data, dict):
            final_provenance.update(provenance_data)

        # Write provenance to file
        provenance_path = storage.join(model_path, "_tlab_provenance.json")
        with storage.open(provenance_path, "w") as f:
            json.dump(final_provenance, f, indent=2)

        return provenance_path

    def generate_model_json(
        self,
        architecture: str,
        model_filename: str = "",
        json_data: dict = {},
    ):
        """
        The generates the json file needed for a model to be read in the models directory.

        architecture: A string that is used to determine which plugins support this model.
        filename: (Optional) A string representing model_filename or "" if none.
        json_data: (Default empty) A dictionary of values to add to the json_data of this model.

        Returns the object used to generate the JSON.
        """
        model_id = self.id
        model_description = {
            "model_id": f"TransformerLab/{model_id}",
            "model_filename": model_filename,
            "name": model_id,
            "local_model": True,
            "json_data": {
                "uniqueID": f"TransformerLab/{model_id}",
                "name": model_id,
                "model_filename": model_filename,
                "description": "Generated by Transformer Lab.",
                "source": "transformerlab",
                "architecture": architecture,
                "huggingface_repo": "",
            },
        }

        # Add and update any fields passed in json_data object
        # This overwrites anything defined above with values passed in
        model_description["json_data"].update(json_data)

        # Output the json to the file
        with storage.open(storage.join(self.get_dir(), "index.json"), "w") as outfile:
            json.dump(model_description, outfile)

        return model_description
