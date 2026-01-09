from __future__ import annotations

import time
import asyncio
from typing import Optional, Dict, Any, Union
import os
import io
import posixpath

from .experiment import Experiment
from .job import Job
from . import dirs
from .model import Model as ModelService
from . import storage
from .dataset import Dataset


def _run_async(coro):
    """
    Helper to run async code from sync context.
    Handles event loop detection intelligently:
    - If there's a running event loop, we need to use the async version instead
    - If no running loop, uses asyncio.run() or run_until_complete()
    """
    try:
        # Try to get the running event loop
        loop = asyncio.get_running_loop()
        # If we're in an async context, we can't use blocking calls
        # The sync wrapper should not be used from async contexts
        # Use the async version (a_* methods) instead
        raise RuntimeError(
            "Cannot use sync method when already in async context. "
            "Use the async version instead (e.g., await lab.a_save_artifact() instead of lab.save_artifact())."
        )
    except RuntimeError as e:
        # Check if this is our custom error or a "no running loop" error
        if "Cannot use sync method" in str(e):
            raise
        # No running loop - we can safely create/use one
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                # Loop is closed, create a new one
                return asyncio.run(coro)
            else:
                # Loop exists but not running, use it
                return loop.run_until_complete(coro)
        except RuntimeError:
            # No event loop at all, create one
            return asyncio.run(coro)


class Lab:
    """
    Simple facade over Experiment and Job for easy usage:

    from lab import lab
    lab.init(experiment_id="alpha")
    lab.set_config({ ... })
    lab.log("message")
    lab.finish("success")
    """

    def __init__(self) -> None:
        self._experiment: Optional[Experiment] = None
        self._job: Optional[Job] = None

    # ------------- lifecycle -------------
    def init(self, experiment_id: str | None = None, config: Optional[Dict[str, Any]] = None) -> None:
        """
        Initialize a job under the given experiment.
        If _TFL_JOB_ID environment variable is set, uses that existing job.
        If _TFL_EXPERIMENT_ID environment variable is set and experiment_id is not specified (defaults to "alpha"),
        uses the environment variable value as the experiment_id.
        Otherwise, creates the experiment structure if needed and creates a new job.
        """
        # Check if we should use experiment_id from environment variable
        # If experiment_id is the default "alpha" and _TFL_EXPERIMENT_ID is set, use the env var
        if not experiment_id:
            env_experiment_id = os.environ.get("_TFL_EXPERIMENT_ID")
            if env_experiment_id:
                experiment_id = env_experiment_id
            else:
                experiment_id = "alpha"

        # Check if we should use an existing job from environment variable
        existing_job_id = os.environ.get("_TFL_JOB_ID")

        if existing_job_id:
            # Use existing job from environment variable
            # This will raise an error if the job doesn't exist
            self._experiment = _run_async(Experiment.create_or_get(experiment_id, create_new=False))
            self._job = _run_async(Job.get(existing_job_id))
            if self._job is None:
                raise RuntimeError(f"Job with ID {existing_job_id} not found. Check _TFL_JOB_ID environment variable.")
            print(f"Using existing job ID: {existing_job_id}")
            # Set start_time if not already set (for remote jobs launched through providers)
            job_data = _run_async(self._job.get_job_data())
            if not job_data.get("start_time"):
                _run_async(
                    self._job.update_job_data_field("start_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime()))
                )
        else:
            # Create new job as before
            self._experiment = _run_async(Experiment.create_or_get(experiment_id, create_new=True))
            self._job = _run_async(self._experiment.create_job())
            _run_async(self._job.update_job_data_field("start_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())))
            _run_async(self._job.set_experiment(experiment_id))
            print(f"Created new job ID: {self._job.id}")

        # Update status to RUNNING for both cases
        _run_async(self._job.update_status("RUNNING"))

        # Check for wandb integration and capture URL if available
        self._detect_and_capture_wandb_url()

        # Set config if provided, otherwise auto-load from job_data if available
        if config is not None:
            self.set_config(config)
        else:
            # Auto-load config from job_data if available (for remote tasks)
            auto_config = self.get_config()
            if auto_config:
                # Merge with any existing config, but don't overwrite experiment_name
                if self._experiment is not None and "experiment_name" not in auto_config:
                    auto_config = {**auto_config, "experiment_name": self._experiment.id}
                self.set_config(auto_config)

    def set_config(self, config: Dict[str, Any]) -> None:
        """
        Attach configuration to the current job.
        """
        self._ensure_initialized()
        # Ensure experiment_name present for downstream consumers
        if isinstance(config, dict) and "experiment_name" not in config and self._experiment is not None:
            config = {**config, "experiment_name": self._experiment.id}
        # keep the existing config with fields that are not in the new config
        config_old = _run_async(self._job.get_job_data())
        config_new = {**config_old, **config}
        _run_async(self._job.set_job_data(config_new))  # type: ignore[union-attr]

    def get_config(self) -> Dict[str, Any]:
        """
        Get configuration/parameters from job_data.

        This method retrieves parameters that were stored when the task was launched.
        Parameters are typically stored under the 'parameters' key in job_data.

        Returns:
            Dict[str, Any]: Configuration dictionary. Returns empty dict if no config found.
        """
        self._ensure_initialized()
        job_data = self._job.get_job_data()

        # Try to get parameters from job_data
        if isinstance(job_data, dict):
            # First check for 'parameters' key (new standard)
            if "parameters" in job_data and isinstance(job_data["parameters"], dict):
                return job_data["parameters"]

        return {}

    # ------------- convenience logging -------------
    def log(self, message: str) -> None:
        self._ensure_initialized()
        _run_async(self._job.log_info(message))  # type: ignore[union-attr]
        # Check for wandb URL on every log operation
        self._check_and_capture_wandb_url()

    def update_progress(self, progress: int) -> None:
        """
        Update job progress and check for wandb URL detection.
        """
        self._ensure_initialized()
        _run_async(self._job.update_progress(progress))  # type: ignore[union-attr]
        # Check for wandb URL on every progress update
        self._check_and_capture_wandb_url()

    # ------------- checkpoint resume support -------------
    def get_checkpoint_to_resume(self) -> Optional[str]:
        """
        Get the checkpoint path to resume training from (sync version).

        This is a sync wrapper around the async implementation.
        Use a_get_checkpoint_to_resume() if you're already in an async context.
        """
        return _run_async(self.async_get_checkpoint_to_resume())

    async def async_get_checkpoint_to_resume(self) -> Optional[str]:
        """
        Get the checkpoint path to resume training from.

        This method checks for checkpoint resume information stored in the job data
        when resuming training from a checkpoint.

        Returns:
            Optional[str]: The full path to the checkpoint to resume from, or None if no
                          checkpoint resume is requested.
        """
        if not self._job:
            return None

        job_data = await self._job.get_job_data()
        if not job_data:
            return None

        parent_job_id = job_data.get("parent_job_id")
        checkpoint_name = job_data.get("resumed_from_checkpoint")

        if not parent_job_id or not checkpoint_name:
            return None

        # Build the checkpoint path from parent job's checkpoints directory
        checkpoint_path = await self.a_get_parent_job_checkpoint_path(parent_job_id, checkpoint_name)

        # Verify the checkpoint exists
        if checkpoint_path and await storage.exists(checkpoint_path):
            return checkpoint_path

        return None

    def get_parent_job_checkpoint_path(self, parent_job_id: str, checkpoint_name: str) -> Optional[str]:
        """
        Get the full path to a checkpoint from a parent job (sync version).

        This is a sync wrapper around the async implementation.
        Use a_get_parent_job_checkpoint_path() if you're already in an async context.
        """
        return _run_async(self.async_get_parent_job_checkpoint_path(parent_job_id, checkpoint_name))

    async def async_get_parent_job_checkpoint_path(self, parent_job_id: str, checkpoint_name: str) -> Optional[str]:
        """
        Get the full path to a checkpoint from a parent job.

        This is a helper method that constructs the path to a specific checkpoint
        from a parent job's checkpoints directory.

        Args:
            parent_job_id (str): The ID of the parent job that created the checkpoint
            checkpoint_name (str): The name of the checkpoint file or directory

        Returns:
            Optional[str]: The full path to the checkpoint, or None if it doesn't exist
        """
        try:
            checkpoints_dir = await dirs.get_job_checkpoints_dir(parent_job_id)
            checkpoint_path = storage.join(checkpoints_dir, checkpoint_name)

            # Security check: ensure the checkpoint path is within the checkpoints directory
            # Handle remote storage URIs (s3://, gs://, etc.) differently from local paths
            is_remote = checkpoint_path.startswith(("s3://", "gs://", "gcs://", "abfs://"))

            if is_remote:
                # For remote storage, normalize only the path portion after the protocol
                # posixpath.normpath breaks S3 URI format, so we need to handle it manually
                checkpoint_path_normalized = checkpoint_path.rstrip("/")
                checkpoints_dir_normalized = checkpoints_dir.rstrip("/")

                # Ensure checkpoint path starts with checkpoints directory
                if not checkpoint_path_normalized.startswith(checkpoints_dir_normalized + "/"):
                    return None
            else:
                # For local paths, use posixpath.normpath
                checkpoint_path_normalized = posixpath.normpath(checkpoint_path).rstrip("/")
                checkpoints_dir_normalized = posixpath.normpath(checkpoints_dir).rstrip("/")

                # Check if checkpoint path is strictly within checkpoints directory
                if not checkpoint_path_normalized.startswith(checkpoints_dir_normalized + "/"):
                    return None

            if await storage.exists(checkpoint_path_normalized):
                return checkpoint_path_normalized

            return None
        except Exception as e:
            print(f"Error getting parent job checkpoint path: {str(e)}")
            return None

    # ------------- completion -------------
    def finish(
        self,
        message: str = "Job completed successfully",
        score: Optional[Dict[str, Any]] = None,
        additional_output_path: Optional[str] = None,
        plot_data_path: Optional[str] = None,
    ) -> None:
        """
        Mark the job as successfully completed and set completion metadata.
        """
        self._ensure_initialized()
        _run_async(self._job.update_progress(100))  # type: ignore[union-attr]
        _run_async(self._job.update_status("COMPLETE"))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("completion_status", "success"))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("completion_details", message))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("end_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())))  # type: ignore[union-attr]
        if score is not None:
            _run_async(self._job.update_job_data_field("score", score))  # type: ignore[union-attr]
        if additional_output_path is not None and additional_output_path.strip() != "":
            _run_async(self._job.update_job_data_field("additional_output_path", additional_output_path))  # type: ignore[union-attr]
        if plot_data_path is not None and plot_data_path.strip() != "":
            _run_async(self._job.update_job_data_field("plot_data_path", plot_data_path))  # type: ignore[union-attr]

    def save_artifact(
        self,
        source_path: Union[str, Any],
        name: Optional[str] = None,
        type: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Save an artifact file or directory into this job's artifacts folder (sync version).

        This is a sync wrapper around the async implementation.
        Use a_save_artifact() if you're already in an async context.
        """
        return _run_async(self.async_save_artifact(source_path, name, type, config))

    async def async_save_artifact(
        self,
        source_path: Union[str, Any],
        name: Optional[str] = None,
        type: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Save an artifact file or directory into this job's artifacts folder.

        Args:
            source_path: Path to the file or directory to save, OR a pandas DataFrame
                         when type="eval" or type="dataset"
            name: Optional name for the artifact. If not provided, uses source basename
                  or generates a default name for DataFrames. When type="dataset",
                  this is used as the dataset_id. When type="model", this is used as the model name
                  (will be prefixed with job_id for uniqueness).
            type: Optional type of artifact.
                  - If "evals", saves to eval_results directory and updates job data accordingly.
                  - If "dataset", saves as a dataset and tracks dataset_id in job data.
                  - If "model", saves to workspace models directory and creates Model Zoo metadata.
                  - Otherwise saves to artifacts directory.
            config: Optional configuration dict.
                   When type="eval", can contain column mappings under "evals" key, e.g.:
                   {"evals": {"input": "input_col", "output": "output_col",
                             "expected_output": "expected_col", "score": "score_col"}}
                   When type="dataset", can contain:
                   {"dataset": {...metadata...}, "suffix": "...", "is_image": bool}
                   When type="model", can contain:
                   {"model": {"architecture": "...", "pipeline_tag": "...", "parent_model": "..."}}
                   or top-level keys: {"architecture": "...", "pipeline_tag": "...", "parent_model": "..."}

        Returns:
            The destination path on disk.
        """
        self._ensure_initialized()

        job_id = self._job.id  # type: ignore[union-attr]

        # Handle DataFrame input when type="dataset"
        if type == "dataset" and hasattr(source_path, "to_json"):
            # Normalize input: convert Hugging Face datasets.Dataset to pandas DataFrame
            df = source_path
            try:
                if hasattr(df, "to_pandas") and callable(getattr(df, "to_pandas")):
                    df = df.to_pandas()
            except Exception:
                pass

            # Use name as dataset_id, or generate one if not provided
            if name is None or (isinstance(name, str) and name.strip() == ""):
                import time

                timestamp = time.strftime("%Y%m%d_%H%M%S")
                dataset_id = f"generated_dataset_{job_id}_{timestamp}"
            else:
                dataset_id = name.strip()

            # Get additional metadata from config if provided
            additional_metadata = {}
            if config and isinstance(config, dict) and "dataset" in config:
                additional_metadata = config["dataset"]

            # Get other parameters from config
            suffix = None
            is_image = False
            if config and isinstance(config, dict):
                if "suffix" in config:
                    suffix = config["suffix"]
                if "is_image" in config:
                    is_image = config["is_image"]

            # Use the existing save_dataset method
            output_path = await self.a_save_dataset(
                df=df,
                dataset_id=dataset_id,
                additional_metadata=additional_metadata if additional_metadata else None,
                suffix=suffix,
                is_image=is_image,
            )

            # Track dataset_id in job_data
            try:
                job_data = await self._job.get_job_data()
                generated_datasets_list = []
                if isinstance(job_data, dict):
                    existing = job_data.get("generated_datasets", [])
                    if isinstance(existing, list):
                        generated_datasets_list = existing
                generated_datasets_list.append(dataset_id)
                await self._job.update_job_data_field("generated_datasets", generated_datasets_list)
            except Exception:
                pass

            await self._job.log_info(
                f"Dataset saved to '{output_path}' and registered as generated dataset '{dataset_id}'"
            )  # type: ignore[union-attr]
            return output_path

        # Handle DataFrame input when type="evals"
        if type == "eval" and hasattr(source_path, "to_csv"):
            # Normalize input: convert Hugging Face datasets.Dataset to pandas DataFrame
            df = source_path
            try:
                if hasattr(df, "to_pandas") and callable(getattr(df, "to_pandas")):
                    df = df.to_pandas()
            except Exception:
                pass

            # Get column mappings from config or use defaults
            evals_config = {}
            if config and isinstance(config, dict) and "evals" in config:
                evals_config = config["evals"]

            default_mappings = {
                "input": "input",
                "output": "output",
                "expected_output": "expected_output",
                "score": "score",
            }

            # Merge user config with defaults
            column_mappings = {**default_mappings, **evals_config}

            # Validate that required columns exist (input, output, score are required)
            required_columns = [
                column_mappings["input"],
                column_mappings["output"],
                column_mappings["score"],
            ]
            if column_mappings.get("expected_output"):
                required_columns.append(column_mappings["expected_output"])

            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                raise ValueError(f"Missing required columns in DataFrame: {missing_columns}")

            # Determine destination directory and filename
            dest_dir = await dirs.get_job_eval_results_dir(job_id)

            if name is None or (isinstance(name, str) and name.strip() == ""):
                import time

                timestamp = time.strftime("%Y%m%d_%H%M%S")
                filename = f"eval_results_{job_id}_{timestamp}.csv"
            else:
                filename = name if name.endswith(".csv") else f"{name}.csv"

            dest = storage.join(dest_dir, filename)

            # Create parent directories
            await storage.makedirs(dest_dir, exist_ok=True)

            # Save DataFrame to CSV using storage module
            try:
                if not hasattr(df, "to_csv"):
                    raise TypeError(
                        "source_path must be a pandas DataFrame or a Hugging Face datasets.Dataset when type='evals'"
                    )
                # Write DataFrame to StringIO buffer first (pandas doesn't support fsspec handles directly)
                buffer = io.StringIO()
                df.to_csv(buffer, index=False)
                buffer.seek(0)
                # Then write buffer content to storage
                async with await storage.open(dest, "w", encoding="utf-8") as f:
                    await f.write(buffer.getvalue())
            except Exception as e:
                raise RuntimeError(f"Failed to save evaluation results to {dest}: {str(e)}")

            # Track in job_data
            try:
                job_data = await self._job.get_job_data()
                eval_results_list = []
                if isinstance(job_data, dict):
                    existing = job_data.get("eval_results", [])
                    if isinstance(existing, list):
                        eval_results_list = existing
                eval_results_list.append(dest)
                await self._job.update_job_data_field("eval_results", eval_results_list)
            except Exception:
                pass

            await self._job.log_info(f"Evaluation results saved to '{dest}'")  # type: ignore[union-attr]
            return dest

        # Handle file path input when type="model"
        if type == "model":
            if not isinstance(source_path, str) or source_path.strip() == "":
                raise ValueError("source_path must be a non-empty string when type='model'")
            src = source_path
            # For local paths, resolve to absolute path; for remote paths (s3://, etc.), use as-is
            is_remote = src.startswith(("s3://", "gs://", "abfs://", "gcs://", "http://", "https://"))
            if not is_remote:
                src = os.path.abspath(src)

            # Check source existence: use local filesystem for local paths, storage backend for remote
            if is_remote:
                if not await storage.exists(src):
                    raise FileNotFoundError(f"Model source does not exist: {src}")
            else:
                if not os.path.exists(src):
                    raise FileNotFoundError(f"Model source does not exist: {src}")

            # Get model-specific parameters from config
            model_config = {}
            architecture = None
            pipeline_tag = None
            parent_model = None

            if config and isinstance(config, dict):
                # Check for model config in nested dict
                if "model" in config and isinstance(config["model"], dict):
                    model_config = config["model"]
                # Also allow top-level keys for convenience
                if "architecture" in config:
                    architecture = config["architecture"]
                if "pipeline_tag" in config:
                    pipeline_tag = config["pipeline_tag"]
                if "parent_model" in config:
                    parent_model = config["parent_model"]

            # Override with nested model config if present
            if model_config:
                architecture = model_config.get("architecture") or architecture
                pipeline_tag = model_config.get("pipeline_tag") or pipeline_tag
                parent_model = model_config.get("parent_model") or parent_model

            # Determine base name with job_id prefix for uniqueness
            if isinstance(name, str) and name.strip() != "":
                base_name = f"{job_id}_{name}"
            else:
                base_name = f"{job_id}_{posixpath.basename(src)}"

            # Save to main workspace models directory for Model Zoo visibility
            models_dir = await dirs.get_models_dir()
            dest = storage.join(models_dir, base_name)

            # Create parent directories
            await storage.makedirs(models_dir, exist_ok=True)

            # Copy file or directory
            # Check if source is directory: use local filesystem for local paths, storage backend for remote
            if is_remote:
                src_is_dir = await storage.isdir(src)
            else:
                src_is_dir = os.path.isdir(src)

            if src_is_dir:
                if await storage.exists(dest):
                    await storage.rm_tree(dest)
                await storage.copy_dir(src, dest)
            else:
                await storage.copy_file(src, dest)

            # Initialize model service for metadata creation
            model_service = ModelService(base_name)

            # Create Model metadata so it appears in Model Zoo
            try:
                # Use provided architecture or detect it
                if architecture is None:
                    architecture = await model_service.detect_architecture(dest)

                # Handle pipeline tag logic
                if pipeline_tag is None and parent_model is not None:
                    # Try to fetch pipeline tag from parent model
                    pipeline_tag = model_service.fetch_pipeline_tag(parent_model)

                # Determine model_filename for single-file models
                model_filename = "" if await storage.isdir(dest) else posixpath.basename(dest)

                # Prepare json_data with basic info
                json_data = {
                    "job_id": job_id,
                    "description": f"Model generated by job {job_id}",
                }

                # Add pipeline tag to json_data if provided
                if pipeline_tag is not None:
                    json_data["pipeline_tag"] = pipeline_tag

                # Use the Model class's generate_model_json method to create metadata
                await model_service.generate_model_json(
                    architecture=architecture,
                    model_filename=model_filename,
                    json_data=json_data,
                )
                await self._job.log_info(f"Model saved to Model Zoo as '{base_name}'")  # type: ignore[union-attr]
            except Exception as e:
                self.log(f"Warning: Model saved but metadata creation failed: {str(e)}")

            # Track in job_data
            try:
                job_data = await self._job.get_job_data()
                model_list = []
                if isinstance(job_data, dict):
                    existing = job_data.get("models", [])
                    if isinstance(existing, list):
                        model_list = existing
                model_list.append(dest)
                await self._job.update_job_data_field("models", model_list)
            except Exception:
                pass

            return dest

        # Handle file path input (original behavior)
        if not isinstance(source_path, str) or source_path.strip() == "":
            raise ValueError("source_path must be a non-empty string")
        src = source_path
        # For local paths, resolve to absolute path; for remote paths (s3://, etc.), use as-is
        is_remote = src.startswith(("s3://", "gs://", "abfs://", "gcs://", "http://", "https://"))
        if not is_remote:
            src = os.path.abspath(src)

        # Check source existence: use local filesystem for local paths, storage backend for remote
        if is_remote:
            if not await storage.exists(src):
                raise FileNotFoundError(f"Artifact source does not exist: {src}")
        else:
            if not os.path.exists(src):
                raise FileNotFoundError(f"Artifact source does not exist: {src}")

        # Determine destination directory based on type
        if type == "evals":
            dest_dir = await dirs.get_job_eval_results_dir(job_id)
        else:
            dest_dir = await dirs.get_job_artifacts_dir(job_id)

        base_name = name if (isinstance(name, str) and name.strip() != "") else posixpath.basename(src)
        dest = storage.join(dest_dir, base_name)

        # Create parent directories
        await storage.makedirs(dest_dir, exist_ok=True)

        # Copy file or directory
        # Check if source is directory: use local filesystem for local paths, storage backend for remote
        if is_remote:
            src_is_dir = await storage.isdir(src)
        else:
            src_is_dir = os.path.isdir(src)

        if src_is_dir:
            if await storage.exists(dest):
                await storage.rm_tree(dest)
            await storage.copy_dir(src, dest)
        else:
            await storage.copy_file(src, dest)

        # Track in job_data based on type
        try:
            job_data = await self._job.get_job_data()
            if type == "evals":
                # For eval results, track in eval_results list
                eval_results_list = []
                if isinstance(job_data, dict):
                    existing = job_data.get("eval_results", [])
                    if isinstance(existing, list):
                        eval_results_list = existing
                eval_results_list.append(dest)
                await self._job.update_job_data_field("eval_results", eval_results_list)
            else:
                # For regular artifacts, track in artifacts list
                artifact_list = []
                if isinstance(job_data, dict):
                    existing = job_data.get("artifacts", [])
                    if isinstance(existing, list):
                        artifact_list = existing
                artifact_list.append(dest)
                await self._job.update_job_data_field("artifacts", artifact_list)
        except Exception:
            pass

        return dest

    def save_dataset(
        self,
        df,
        dataset_id: str,
        additional_metadata: Optional[Dict[str, Any]] = None,
        suffix: Optional[str] = None,
        is_image: bool = False,
    ) -> str:
        """
        Save a dataset under the workspace datasets directory (sync version).

        This is a sync wrapper around the async implementation.
        Use a_save_dataset() if you're already in an async context.
        """
        return _run_async(self.async_save_dataset(df, dataset_id, additional_metadata, suffix, is_image))

    async def async_save_dataset(
        self,
        df,
        dataset_id: str,
        additional_metadata: Optional[Dict[str, Any]] = None,
        suffix: Optional[str] = None,
        is_image: bool = False,
    ) -> str:
        """
        Save a dataset under the workspace datasets directory and mark it as generated.

        Args:
            df: A pandas DataFrame or a Hugging Face datasets.Dataset to serialize to disk.
            dataset_id: Identifier for the dataset directory under `datasets/`.
            additional_metadata: Optional dict to merge into dataset json_data.
            suffix: Optional suffix to append to the output filename stem.
            is_image: If True, save JSON Lines (for image metadata-style rows).

        Returns:
            The path to the saved dataset file on disk.
        """
        self._ensure_initialized()
        if not isinstance(dataset_id, str) or dataset_id.strip() == "":
            raise ValueError("dataset_id must be a non-empty string")

        # Normalize input: convert Hugging Face datasets.Dataset to pandas DataFrame
        try:
            if hasattr(df, "to_pandas") and callable(getattr(df, "to_pandas")):
                df = df.to_pandas()
        except Exception as e:
            print(f"Warning: Failed to convert dataset to pandas DataFrame: {str(e)}")

        # Prepare dataset directory
        dataset_id_safe = dataset_id.strip()
        dataset_dir = await dirs.dataset_dir_by_id(dataset_id_safe)
        # If exists, then raise an error
        if await storage.exists(dataset_dir):
            raise FileExistsError(f"Dataset with ID {dataset_id_safe} already exists")
        await storage.makedirs(dataset_dir, exist_ok=True)

        # Determine output filename
        if is_image:
            lines = True
            output_filename = "metadata.jsonl"
        else:
            lines = False
            stem = dataset_id_safe
            if isinstance(suffix, str) and suffix.strip() != "":
                stem = f"{stem}_{suffix.strip()}"
            output_filename = f"{stem}.json"

        output_path = storage.join(dataset_dir, output_filename)

        # Persist dataframe
        try:
            if not hasattr(df, "to_json"):
                raise TypeError("df must be a pandas DataFrame or a Hugging Face datasets.Dataset")
            # Write DataFrame to StringIO buffer first (pandas doesn't support fsspec handles directly)
            buffer = io.StringIO()
            df.to_json(buffer, orient="records", lines=lines)
            buffer.seek(0)
            # Then write buffer content to storage
            async with await storage.open(output_path, "w", encoding="utf-8") as f:
                await f.write(buffer.getvalue())
        except Exception as e:
            raise RuntimeError(f"Failed to save dataset to {output_path}: {str(e)}")

        # Create or update filesystem metadata so it appears under generated datasets
        try:
            try:
                ds = await Dataset.get(dataset_id_safe)
            except FileNotFoundError:
                ds = await Dataset.create(dataset_id_safe)

            # Base json_data with generated flag for UI filtering
            json_data: Dict[str, Any] = {
                "generated": True,
                "sample_count": len(df) if hasattr(df, "__len__") else -1,
                "files": [output_filename],
            }
            if additional_metadata and isinstance(additional_metadata, dict):
                json_data.update(additional_metadata)

            await ds.set_metadata(
                location="local",
                description=json_data.get("description", ""),
                size=-1,
                json_data=json_data,
            )
        except Exception as e:
            # Do not fail the save if metadata write fails; log to job data
            print(f"Warning: Failed to create dataset metadata: {str(e)}")
            try:
                await self._job.update_job_data_field("dataset_metadata_error", str(e))  # type: ignore[union-attr]
            except Exception as e2:
                print(f"Warning: Failed to log dataset metadata error: {str(e2)}")

        # Track dataset on the job for provenance
        try:
            await self._job.update_job_data_field("dataset_id", dataset_id_safe)  # type: ignore[union-attr]
        except Exception as e:
            print(f"Warning: Failed to track dataset in job_data: {str(e)}")

        await self._job.log_info(
            f"Dataset saved to '{output_path}' and registered as generated dataset '{dataset_id_safe}'"
        )  # type: ignore[union-attr]
        return output_path

    def save_checkpoint(self, source_path: str, name: Optional[str] = None) -> str:
        """
        Save a checkpoint file or directory into this job's checkpoints folder (sync version).

        This is a sync wrapper around the async implementation.
        Use async_save_checkpoint() if you're already in an async context.
        """
        return _run_async(self.async_save_checkpoint(source_path, name))

    async def async_save_checkpoint(self, source_path: str, name: Optional[str] = None) -> str:
        """
        Save a checkpoint file or directory into this job's checkpoints folder.
        Returns the destination path on disk.
        """
        self._ensure_initialized()
        if not isinstance(source_path, str) or source_path.strip() == "":
            raise ValueError("source_path must be a non-empty string")
        src = source_path
        # For local paths, resolve to absolute path; for remote paths (s3://, etc.), use as-is
        is_remote = src.startswith(("s3://", "gs://", "abfs://", "gcs://", "http://", "https://"))
        if not is_remote:
            src = os.path.abspath(src)

        # Check source existence: use local filesystem for local paths, storage backend for remote
        if is_remote:
            if not await storage.exists(src):
                raise FileNotFoundError(f"Checkpoint source does not exist: {src}")
        else:
            if not os.path.exists(src):
                raise FileNotFoundError(f"Checkpoint source does not exist: {src}")

        job_id = self._job.id  # type: ignore[union-attr]
        ckpts_dir = await dirs.get_job_checkpoints_dir(job_id)
        base_name = name if (isinstance(name, str) and name.strip() != "") else posixpath.basename(src)
        dest = storage.join(ckpts_dir, base_name)

        # Create parent directories
        await storage.makedirs(ckpts_dir, exist_ok=True)

        # Copy file or directory
        # Check if source is directory: use local filesystem for local paths, storage backend for remote
        if is_remote:
            src_is_dir = await storage.isdir(src)
        else:
            src_is_dir = os.path.isdir(src)

        if src_is_dir:
            if await storage.exists(dest):
                await storage.rm_tree(dest)
            await storage.copy_dir(src, dest)
        else:
            await storage.copy_file(src, dest)

        # Track in job_data and update latest pointer
        try:
            job_data = await self._job.get_job_data()
            ckpt_list = []
            if isinstance(job_data, dict):
                existing = job_data.get("checkpoints", [])
                if isinstance(existing, list):
                    ckpt_list = existing
            ckpt_list.append(dest)
            await self._job.update_job_data_field("checkpoints", ckpt_list)
            await self._job.update_job_data_field("latest_checkpoint", dest)
        except Exception as e:
            print(f"Warning: Failed to track checkpoint in job_data: {str(e)}")

        return dest

    def save_model(
        self,
        source_path: str,
        name: Optional[str] = None,
        architecture: Optional[str] = None,
        pipeline_tag: Optional[str] = None,
        parent_model: Optional[str] = None,
    ) -> str:
        """
        Save a model file or directory to the workspace models directory (sync version).

        This is a sync wrapper around the async implementation.
        Use async_save_model() if you're already in an async context.
        """
        return _run_async(self.async_save_model(source_path, name, architecture, pipeline_tag, parent_model))

    async def async_save_model(
        self,
        source_path: str,
        name: Optional[str] = None,
        architecture: Optional[str] = None,
        pipeline_tag: Optional[str] = None,
        parent_model: Optional[str] = None,
    ) -> str:
        """
        Save a model file or directory to the workspace models directory.
        The model will automatically appear in the Model Zoo's Local Models list.

        This method is a convenience wrapper around save_artifact with type="model".
        For new code, consider using save_artifact directly with type="model".

        Args:
            source_path: Path to the model file or directory to save
            name: Optional name for the model. If not provided, uses source basename.
                 The final model name will be prefixed with the job_id for uniqueness.
            architecture: Optional architecture string. If not provided, will attempt to
                         detect from config.json for directory-based models.
            pipeline_tag: Optional pipeline tag. If not provided and parent_model is given,
                         will attempt to fetch from parent model on HuggingFace.
            parent_model: Optional parent model name/ID.

        Returns:
            The destination path on disk.
        """
        # Build config dict from parameters
        config = {}
        if architecture is not None:
            config["architecture"] = architecture
        if pipeline_tag is not None:
            config["pipeline_tag"] = pipeline_tag
        if parent_model is not None:
            config["parent_model"] = parent_model

        # Use save_artifact with type="model"
        return await self.a_save_artifact(
            source_path=source_path,
            name=name,
            type="model",
            config=config if config else None,
        )

    def error(
        self,
        message: str = "",
    ) -> None:
        """
        Mark the job as failed and set completion metadata.
        """
        self._ensure_initialized()
        _run_async(self._job.update_status("COMPLETE"))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("completion_status", "failed"))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("completion_details", message))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("end_time", time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())))  # type: ignore[union-attr]
        _run_async(self._job.update_job_data_field("status", "FAILED"))  # type: ignore[union-attr]

    def _detect_and_capture_wandb_url(self) -> None:
        """
        Detect wandb run URLs from various sources and store them in job data.
        This method checks for wandb integration in multiple ways:
        1. Environment variables set by wandb
        2. Active wandb runs in the current process
        3. TRL trainer integrations
        """
        try:
            # Method 1: Check environment variables set by wandb
            wandb_url = os.environ.get("WANDB_URL")
            if wandb_url:
                _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url))
                print(f"📊 Detected wandb run URL: {wandb_url}")
                return

            # Method 2: Check for active wandb run in current process
            try:
                import wandb

                if wandb.run is not None:
                    wandb_url = wandb.run.url
                    if wandb_url:
                        _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url))
                        print(f"📊 Detected wandb run URL: {wandb_url}")
                        return
            except ImportError:
                pass

            # Method 3: Check for wandb in TRL trainers or other frameworks
            # Look for wandb integration in global variables or modules
            try:
                import wandb

                # Check if there's a wandb run that was initialized elsewhere
                if hasattr(wandb, "api") and wandb.api and wandb.api.api_key:
                    # If wandb is configured, try to get the current run
                    current_run = wandb.run
                    if current_run and hasattr(current_run, "url"):
                        wandb_url = current_run.url
                        if wandb_url:
                            _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url))
                            print(f"📊 Detected wandb run URL: {wandb_url}")
                            return
            except (ImportError, AttributeError):
                pass

        except Exception:
            # Silently fail - wandb detection is optional
            pass

    def _check_and_capture_wandb_url(self) -> None:
        """
        Check for wandb run URLs and capture them in job data.
        This is called automatically on every log and progress update operation.
        """
        try:
            # Only check if we haven't already captured a wandb URL
            job_data = _run_async(self._job.get_job_data())
            if job_data.get("wandb_run_url"):
                return  # Already have a wandb URL

            # Method 1: Check environment variables
            wandb_url = os.environ.get("WANDB_URL")
            if wandb_url:
                _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url))
                print(f"📊 Auto-detected wandb URL from environment: {wandb_url}")
                return

            # Method 2: Check active wandb run
            try:
                import wandb

                if wandb.run is not None and hasattr(wandb.run, "url"):
                    wandb_url = wandb.run.url
                    if wandb_url:
                        _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url))
                        print(f"📊 Auto-detected wandb URL from wandb.run: {wandb_url}")
                        return
            except ImportError:
                pass

        except Exception:
            # Silently fail - wandb detection is optional
            pass

    def capture_wandb_url(self, wandb_url: str) -> None:
        """
        Manually capture a wandb run URL and store it in job data.
        This can be called by scripts that have wandb integration.
        """
        if wandb_url and wandb_url.strip():
            self._ensure_initialized()
            _run_async(self._job.update_job_data_field("wandb_run_url", wandb_url.strip()))
            print(f"📊 Captured wandb run URL: {wandb_url.strip()}")

    # ------------- helpers -------------
    def _ensure_initialized(self) -> None:
        if self._experiment is None or self._job is None:
            raise RuntimeError("lab not initialized. Call lab.init(experiment_id=...) first.")

    @property
    def job(self) -> Job:
        self._ensure_initialized()
        return self._job  # type: ignore[return-value]

    def get_checkpoints_dir(self) -> str:
        """
        Get the checkpoints directory path for the current job (sync version).

        This is a sync wrapper around the async implementation.
        Use async_get_checkpoints_dir() if you're already in an async context.
        """
        return _run_async(self.async_get_checkpoints_dir())

    async def async_get_checkpoints_dir(self) -> str:
        """
        Get the checkpoints directory path for the current job.
        """
        self._ensure_initialized()
        return await self._job.get_checkpoints_dir()  # type: ignore[union-attr]

    def get_artifacts_dir(self) -> str:
        """
        Get the artifacts directory path for the current job (sync version).

        This is a sync wrapper around the async implementation.
        Use a_get_artifacts_dir() if you're already in an async context.
        """
        return _run_async(self.async_get_artifacts_dir())

    async def async_get_artifacts_dir(self) -> str:
        """
        Get the artifacts directory path for the current job.
        """
        self._ensure_initialized()
        return await self._job.get_artifacts_dir()  # type: ignore[union-attr]

    def get_checkpoint_paths(self) -> list[str]:
        """
        Get list of checkpoint file paths for the current job (sync version).

        This is a sync wrapper around the async implementation.
        Use async_get_checkpoint_paths() if you're already in an async context.
        """
        return _run_async(self.async_get_checkpoint_paths())

    async def async_get_checkpoint_paths(self) -> list[str]:
        """
        Get list of checkpoint file paths for the current job.
        """
        self._ensure_initialized()
        return await self._job.get_checkpoint_paths()  # type: ignore[union-attr]

    def get_artifact_paths(self) -> list[str]:
        """
        Get list of artifact file paths for the current job (sync version).

        This is a sync wrapper around the async implementation.
        Use a_get_artifact_paths() if you're already in an async context.
        """
        return _run_async(self.async_get_artifact_paths())

    async def async_get_artifact_paths(self) -> list[str]:
        """
        Get list of artifact file paths for the current job.
        """
        self._ensure_initialized()
        return await self._job.get_artifact_paths()  # type: ignore[union-attr]

    def list_models(self) -> list[Dict[str, Any]]:
        """
        List all local models available in the workspace.

        Returns:
            List of dictionaries containing model metadata. Each dictionary includes:
            - model_id: The model identifier
            - name: The model name
            - json_data: Additional model metadata
        """
        return _run_async(ModelService.list_all())

    def get_model(self, model_id: str) -> ModelService:
        """
        Get a specific local model by ID.

        Args:
            model_id: The identifier of the model to retrieve

        Returns:
            Model: A Model instance for the specified model

        Raises:
            FileNotFoundError: If the model directory doesn't exist
        """
        return _run_async(ModelService.get(model_id))

    def get_model_path(self, model_id: str) -> str:
        """
        Get the filesystem path to a specific local model.

        Args:
            model_id: The identifier of the model

        Returns:
            str: The full path to the model directory

        Raises:
            FileNotFoundError: If the model doesn't exist
        """
        model = _run_async(ModelService.get(model_id))
        return _run_async(model.get_dir())

    @property
    def experiment(self) -> Experiment:
        self._ensure_initialized()
        return self._experiment  # type: ignore[return-value]

    def get_job_data(self) -> Dict[str, Any]:
        """
        Get the job data dictionary (sync version).

        This is a sync wrapper around the async Job.get_job_data() method.
        Use async_get_job_data() if you're already in an async context.
        """
        self._ensure_initialized()
        return _run_async(self._job.get_job_data())  # type: ignore[union-attr]

    async def async_get_job_data(self) -> Dict[str, Any]:
        """
        Get the job data dictionary (async version).
        """
        self._ensure_initialized()
        return await self._job.get_job_data()  # type: ignore[union-attr]

    def get_hf_callback(self):
        """
        Get a HuggingFace TrainerCallback instance for TransformerLab integration.

        This callback automatically:
        - Updates training progress in TransformerLab
        - Logs training metrics (loss, etc.)
        - Saves checkpoints to TransformerLab when they are created
        - Logs epoch completion and training end events

        Returns:
            LabCallback: A TrainerCallback instance that can be passed to HuggingFace Trainer

        Example:
            from lab import lab
            from transformers import Trainer

            lab.init(experiment_id="my_experiment")
            callback = lab.get_hf_callback()

            trainer = Trainer(
                model=model,
                args=training_args,
                train_dataset=dataset,
                callbacks=[callback],
            )
        """
        self._ensure_initialized()

        # Import TrainerCallback at runtime to avoid requiring transformers as a dependency
        try:
            from transformers import TrainerCallback
        except ImportError:
            raise ImportError(
                "transformers package is required to use get_hf_callback(). "
                "Please install it with: uv pip install transformers"
            )

        class LabCallback(TrainerCallback):
            """Custom callback to update TransformerLab progress and save checkpoints"""

            def __init__(self, lab_instance: "Lab"):
                super().__init__()
                self.lab = lab_instance
                self.training_started = False
                self.total_steps = None

            def on_train_begin(self, args, state, control, **kwargs):
                """Called when training begins"""
                self.lab.log("🚀 Training started with HuggingFace Trainer")
                self.training_started = True
                if state.max_steps and state.max_steps > 0:
                    self.total_steps = state.max_steps
                else:
                    # Estimate steps if not provided
                    self.total_steps = 1000

            def on_step_end(self, args, state, control, **kwargs):
                """Called after each training step"""
                if self.total_steps:
                    progress = int((state.global_step / self.total_steps) * 100)
                    progress = min(progress, 95)  # Keep some buffer for final operations
                    self.lab.update_progress(progress)

                # Log training metrics if available
                if state.log_history:
                    latest_log = state.log_history[-1]
                    if "loss" in latest_log:
                        self.lab.log(f"Step {state.global_step}: loss={latest_log['loss']:.4f}")

            def on_save(self, args, state, control, **kwargs):
                """Called when a checkpoint is saved"""
                self.lab.log(f"💾 Checkpoint saved at step {state.global_step}")

                # Attempt to save the checkpoint using lab's checkpoint mechanism
                if hasattr(args, "output_dir"):
                    checkpoint_dir = None
                    # Find the most recent checkpoint
                    if os.path.exists(args.output_dir):
                        checkpoints = [d for d in os.listdir(args.output_dir) if d.startswith("checkpoint-")]
                        if checkpoints:
                            # Sort by checkpoint number
                            checkpoints.sort(key=lambda x: int(x.split("-")[1]))
                            latest_checkpoint = checkpoints[-1]
                            checkpoint_dir = os.path.join(args.output_dir, latest_checkpoint)

                            # Save checkpoint to TransformerLab
                            try:
                                saved_path = self.lab.save_checkpoint(checkpoint_dir, f"checkpoint-{state.global_step}")
                                self.lab.log(f"✅ Saved checkpoint to TransformerLab: {saved_path}")
                            except Exception as e:
                                self.lab.log(f"⚠️  Could not save checkpoint to TransformerLab: {e}")

            def on_epoch_end(self, args, state, control, **kwargs):
                """Called at the end of each epoch"""
                if state.epoch:
                    self.lab.log(f"📊 Completed epoch {int(state.epoch)} / {args.num_train_epochs}")

            def on_train_end(self, args, state, control, **kwargs):
                """Called when training ends"""
                self.lab.log("✅ Training completed successfully")
                self.lab.update_progress(95)

        return LabCallback(self)


def capture_wandb_url_from_env() -> str | None:
    """
    Utility function to capture wandb run URL from environment variables.
    This can be called by scripts that use wandb but don't use the TLabPlugin system.

    Returns:
        str: The wandb run URL if found, None otherwise
    """
    return os.environ.get("WANDB_URL")


def capture_wandb_url_from_run() -> str | None:
    """
    Utility function to capture wandb run URL from the current wandb run.
    This can be called by scripts that have initialized wandb.run.

    Returns:
        str: The wandb run URL if found, None otherwise
    """
    try:
        import wandb

        if wandb.run is not None and hasattr(wandb.run, "url"):
            return wandb.run.url
    except ImportError:
        pass
    return None


def capture_wandb_url_from_trl() -> str | None:
    """
    Utility function to capture wandb run URL from TRL trainers.
    This checks for wandb integration in TRL-based training scripts.

    Returns:
        str: The wandb run URL if found, None otherwise
    """
    try:
        import wandb

        # Check for wandb in TRL trainer context
        if wandb.run is not None:
            return wandb.run.url

        # Check environment variables as fallback
        return os.environ.get("WANDB_URL")
    except ImportError:
        return None
