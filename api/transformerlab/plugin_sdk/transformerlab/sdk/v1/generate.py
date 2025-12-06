import json
import time
from pathlib import Path

import requests
from lab import storage
from transformerlab.sdk.v1.tlab_plugin import TLabPlugin


class GenTLabPlugin(TLabPlugin):
    """Enhanced decorator class for TransformerLab generation plugins"""

    def __init__(self):
        super().__init__()
        # Add common generation-specific arguments
        self._parser.add_argument(
            "--run_name", default="generated", type=str, help="Name for the generated dataset"
        )
        self._parser.add_argument(
            "--experiment_name", default="default", type=str, help="Name of the experiment"
        )
        self._parser.add_argument(
            "--model_adapter", default=None, type=str, help="Model adapter to use"
        )
        self._parser.add_argument(
            "--generation_model", default="local", type=str, help="Model to use for generation"
        )
        self._parser.add_argument(
            "--generation_type", default="local", type=str, help="Model to use for generation"
        )

        self.tlab_plugin_type = "generation"

    def _ensure_args_parsed(self):
        """Parse arguments if not already done"""
        if not self._args_parsed:
            args, unknown_args = self._parser.parse_known_args()

            # Transfer all known arguments to attributes of self
            for key, value in vars(args).items():
                self.params[key] = value

            self._parse_unknown_args(unknown_args)
            self._args_parsed = True

    def _parse_unknown_args(self, unknown_args):
        """Parse unknown arguments which change with each eval"""
        key = None
        for arg in unknown_args:
            if arg.startswith("--"):  # Argument key
                key = arg.lstrip("-")
                self.params[key] = True
            elif key:  # Argument value
                self.params[key] = arg
                key = None

    def save_generated_dataset(
        self, df, additional_metadata=None, dataset_id=None, suffix=None, is_image=False
    ):
        """Save generated data to file and create dataset in TransformerLab

        Args:
            df: DataFrame containing generated data
            additional_metadata: Optional dict with additional metadata to save

        Returns:
            tuple: Paths to the saved files (output_file, dataset_name)
        """
        self._ensure_args_parsed()

        # Create output directory
        if dataset_id is not None:
            output_dir = self.get_output_file_path(dataset_id=dataset_id, dir_only=True)
        else:
            output_dir = self.get_output_file_path(dir_only=True)

        storage.makedirs(output_dir, exist_ok=True)

        if is_image:
            lines = True
            output_file = storage.join(output_dir, "metadata.jsonl")
            if dataset_id is None:
                dataset_id = f"{self.params.run_name}_{self.params.job_id}".lower()
        else:
            lines = False
            if suffix is not None:
                output_file = storage.join(
                    output_dir, f"{self.params.run_name}_{self.params.job_id}_{suffix}.json"
                )
            else:
                output_file = storage.join(
                    output_dir, f"{self.params.run_name}_{self.params.job_id}.json"
                )

            if dataset_id is None:
                # Makes /Users/xx/yy.json to yy
                dataset_id = Path(output_file).stem

            dataset_id = dataset_id.lower()
            # Store metadata
            metadata = {
                "generation_model": self.params.generation_model,
                "generation_type": getattr(self, "generation_type", "scratch"),
                "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                "sample_count": len(df),
            }

            if additional_metadata:
                metadata.update(additional_metadata)

            # Save metadata
            if dataset_id is None:
                metadata_file = storage.join(
                    output_dir, f"{self.params.run_name}_{self.params.job_id}_metadata.json"
                )
            else:
                metadata_file = storage.join(output_dir, f"{dataset_id}_metadata.json")
            with storage.open(metadata_file, "w", encoding="utf-8") as f:
                json.dump(metadata, f, indent=2)

        with storage.open(output_file, "w", encoding="utf-8") as f:
            df.to_json(f, orient="records", lines=lines)
        print(f"Generated data saved to {output_file}")

        # Upload to Transformer Lab as a dataset
        try:
            self.upload_to_transformerlab(output_file, dataset_id)
            if dataset_id:
                self.add_job_data("dataset_id", dataset_id)
            else:
                self.add_job_data("dataset_name", self.params.run_name)
        except Exception as e:
            print(f"Error uploading to TransformerLab: {e}")
            self.add_job_data("upload_error", str(e))

        return output_file, dataset_id

    def upload_to_transformerlab(self, output_file_path, dataset_id=None):
        """Create a dataset in TransformerLab from the generated file

        Args:
            output_file_path: Path to the generated file

        Returns:
            bool: Whether upload was successful
        """
        try:
            api_url = "http://localhost:8338/"

            # Create a new dataset
            if not dataset_id:
                params = {
                    "dataset_id": f"{self.params.run_name}_{self.params.job_id}",
                    "generated": True,
                }
            else:
                params = {"dataset_id": dataset_id, "generated": True}

            response = requests.get(api_url + "data/new", params=params)
            if response.status_code != 200:
                raise RuntimeError(f"Error creating a new dataset: {response.json()}")

            # Upload the file
            with storage.open(output_file_path, "rb") as json_file:
                files = {"files": json_file}
                response = requests.post(api_url + "data/fileupload", params=params, files=files)

            if response.status_code != 200:
                raise RuntimeError(f"Error uploading the dataset: {response.json()}")

            # Adding dataset so it can be previewed.
            self.add_job_data("additional_output_path", output_file_path)

            print(f"Dataset '{params['dataset_id']}' uploaded successfully to TransformerLab")
            return True

        except Exception as e:
            print(f"Error uploading to TransformerLab: {e}")
            raise

    def get_output_file_path(self, suffix="", dataset_id=None, dir_only=False):
        """Get path for saving generated outputs

        Args:
            suffix: Optional suffix for the filename
            dir_only: Whether to return just the directory

        Returns:
            str: Full path for output file or directory
        """
        self._ensure_args_parsed()

        from lab.dirs import get_workspace_dir

        workspace_dir = get_workspace_dir()

        experiment_dir = storage.join(workspace_dir, "experiments", self.params.experiment_name)
        dataset_dir = storage.join(experiment_dir, "datasets")

        # Create a specific directory for this generation job
        if dataset_id is None:
            gen_dir = storage.join(dataset_dir, f"{self.params.run_name}_{self.params.job_id}")
        else:
            gen_dir = storage.join(dataset_dir, dataset_id)
        storage.makedirs(gen_dir, exist_ok=True)

        if dir_only:
            return gen_dir

        if suffix:
            return storage.join(gen_dir, f"{self.params.run_name}_{suffix}")
        else:
            return storage.join(gen_dir, f"{self.params.run_name}.json")

    def generate_expected_outputs(
        self, input_values, task=None, scenario=None, input_format=None, output_format=None
    ):
        """Generate expected outputs for given inputs using loaded model

        Args:
            input_values: List of input values
            task: Optional task description
            scenario: Optional scenario description
            input_format: Optional input format description
            output_format: Optional output format description

        Returns:
            list: Generated expected outputs
        """
        # Use provided values or class attributes if available
        task = task or self.params.get("task", "")
        scenario = scenario or self.params.get("scenario", "")
        input_format = input_format or self.params.get("input_format", "")
        output_format = output_format or self.params.get("expected_output_format", "")

        # Load model if not already available as instance attribute
        if self.params.generation_model_instance is None:
            self.generation_model_instance = self.load_evaluation_model(
                field_name="generation_model"
            )

        model = self.generation_model_instance

        # Generate outputs
        expected_outputs = []
        for i, input_val in enumerate(input_values):
            prompt = f"""Given a task, scenario and expected input as well as output formats, generate the output for a given input.
                    \n\nTask: {task}
                    \n\nScenario: {scenario}
                    \n\nExpected Output Format: {output_format}
                    \n\nExpected Input Format: {input_format}
                    \n\n Generate the output for the following input: {input_val}.
                    \n Output: """

            messages = [{"role": "system", "content": prompt}]

            # Try to use generate_without_instructor if available
            try:
                expected_output = model.generate_without_instructor(messages)
            except AttributeError:
                # Fall back to normal generate
                expected_output = model.generate(prompt)

            expected_outputs.append(expected_output)

            # Update progress for long generations
            if i % 5 == 0 and len(input_values) > 10:
                progress = int((i / len(input_values)) * 100)
                self.progress_update(progress)

        return expected_outputs


tlab_gen = GenTLabPlugin()
