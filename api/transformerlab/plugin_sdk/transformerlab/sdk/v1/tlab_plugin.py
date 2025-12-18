import argparse
import asyncio
import functools
import os
import time
import traceback
import requests
import json
from pydantic import BaseModel
from typing import Any, List

from datasets import get_dataset_split_names, get_dataset_config_names, load_dataset

try:
    from transformerlab.plugin import get_dataset_path
    import transformerlab.plugin as tlab_core
except ModuleNotFoundError:
    from transformerlab.plugin_sdk.transformerlab.plugin import get_dataset_path
    import transformerlab.plugin_sdk.transformerlab.plugin as tlab_core

from lab import Job
from lab import storage


class DotDict(dict):
    """Dictionary subclass that allows attribute access to dictionary keys"""

    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


class TLabPlugin:
    """Decorator class for TransformerLab plugins with automatic argument handling"""

    def __init__(self):
        self._job = None
        self._parser = argparse.ArgumentParser(description="TransformerLab Plugin")
        self._parser.add_argument("--job_id", type=str, help="Job identifier")
        self._parser.add_argument("--dataset_name", type=str, help="Dataset to use")
        self._parser.add_argument("--model_name", type=str, help="Model to use")

        # Store all parsed arguments in this dictionary
        self.params = DotDict()

        # Flag to track if args have been parsed
        self._args_parsed = False

        # Flag to track if worker was started by this SDK instance
        self.WORKER_STARTED = False

    @property
    def job(self):
        """Get the job object, initializing if necessary"""
        if not self._job:
            self._ensure_args_parsed()
            self._job = Job(self.params.job_id)
        return self._job

    def _ensure_args_parsed(self):
        """Parse arguments if not already done"""
        if not self._args_parsed:
            args, _ = self._parser.parse_known_args()
            # Store all arguments in the parameters dictionary
            self.params = vars(args)
            self._args_parsed = True

    def add_argument(self, *args, **kwargs):
        """Add an argument to the parser"""
        self._parser.add_argument(*args, **kwargs)
        return self

    def job_wrapper(
        self,
        progress_start: int = 0,
        progress_end: int = 100,
        wandb_project_name: str = "TLab_Training",
        manual_logging: bool = False,
    ):
        """Decorator for wrapping a function with job status updates"""

        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Ensure args are parsed and job is initialized
                self._ensure_args_parsed()
                start_time = time.strftime("%Y-%m-%d %H:%M:%S")
                self.add_job_data("start_time", start_time)
                self.params.start_time = start_time
                self.add_job_data("model_name", self.params.model_name)
                self.add_job_data("template_name", self.params.template_name)
                self.add_job_data("model_adapter", self.params.get("model_adapter", ""))

                # Update starting progress
                self.progress_update(progress_start)

                try:
                    # Setup logging
                    if self.tlab_plugin_type == "trainer":
                        self.setup_train_logging(wandb_project_name=wandb_project_name, manual_logging=manual_logging)
                    elif self.tlab_plugin_type == "evals":
                        self.setup_eval_logging(wandb_project_name=wandb_project_name, manual_logging=manual_logging)

                    # Call the wrapped function
                    result = func(*args, **kwargs)

                    # Update final progress and success status
                    self.progress_update(progress_end)

                    job_data = self.job.get_json_data()
                    if job_data.get("job_data", {}).get("completion_status", "") != "success":
                        asyncio.run(self.job.update_job_data_field("completion_status", "success"))

                    job_data = self.job.get_json_data()
                    if job_data.get("job_data", {}).get("completion_status", "") != "Job completed successfully":
                        asyncio.run(self.job.update_job_data_field("completion_details", "Job completed successfully"))

                    job_data = self.job.get_json_data()
                    if (
                        job_data.get("job_data", {}).get("end_time", "") is not None
                        and job_data.get("job_data", {}).get("end_time", "") != ""
                    ):
                        self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))

                    if manual_logging and getattr(self.params, "wandb_run") is not None:
                        self.wandb_run.finish()

                    # Stop worker if it was started by this SDK instance
                    if self.WORKER_STARTED:
                        self.stop_worker()

                    return result

                except Exception as e:
                    # Capture the full error
                    error_msg = f"Error in Job: {str(e)}\n{traceback.format_exc()}"
                    print(error_msg)

                    # Update job with failure status
                    asyncio.run(self.job.update_job_data_field("completion_status", "failed"))
                    asyncio.run(
                        self.job.update_job_data_field("completion_details", "Error occurred while executing job")
                    )
                    self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
                    if manual_logging and getattr(self.params, "wandb_run") is not None:
                        self.wandb_run.finish()

                    # Stop worker if it was started by this SDK instance
                    if self.WORKER_STARTED:
                        self.stop_worker()

                    # Re-raise the exception
                    raise

            return wrapper

        return decorator

    def async_job_wrapper(
        self,
        progress_start: int = 0,
        progress_end: int = 100,
        wandb_project_name: str = "TLab_Training",
        manual_logging=False,
    ):
        """Decorator for wrapping an async function with job status updates"""

        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                # Ensure args are parsed and job is initialized
                try:
                    self._ensure_args_parsed()
                except Exception as e:
                    print(f"Error parsing arguments: {str(e)}")
                    raise

                self.add_job_data("start_time", time.strftime("%Y-%m-%d %H:%M:%S"))
                self.add_job_data("model_name", self.params.model_name)
                self.add_job_data("template_name", self.params.template_name)

                # Update starting progress
                self.progress_update(progress_start)

                async def run_async():
                    try:
                        # Setup logging
                        if self.tlab_plugin_type == "trainer":
                            self.setup_train_logging(
                                wandb_project_name=wandb_project_name, manual_logging=manual_logging
                            )
                        elif self.tlab_plugin_type == "evals":
                            self.setup_eval_logging(
                                wandb_project_name=wandb_project_name, manual_logging=manual_logging
                            )

                        # Call the wrapped async function
                        result = await func(*args, **kwargs)

                        # Update final progress and success status
                        self.progress_update(progress_end)
                        asyncio.run(self.job.update_job_data_field("completion_status", "success"))
                        asyncio.run(self.job.update_job_data_field("completion_details", "Job completed successfully"))
                        self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
                        if manual_logging and getattr(self, "wandb_run") is not None:
                            self.wandb_run.finish()

                        # Stop worker if it was started by this SDK instance
                        if self.WORKER_STARTED:
                            self.stop_worker()

                        return result

                    except Exception as e:
                        # Capture the full error
                        error_msg = f"Error in Async Job: {str(e)}\n{traceback.format_exc()}"
                        print(error_msg)

                        # Update job with failure status
                        asyncio.run(self.job.update_job_data_field("completion_status", "failed"))
                        asyncio.run(
                            self.job.update_job_data_field("completion_details", "Error occurred while executing job")
                        )
                        self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
                        if manual_logging and getattr(self, "wandb_run") is not None:
                            self.wandb_run.finish()

                        # Stop worker if it was started by this SDK instance
                        if self.WORKER_STARTED:
                            self.stop_worker()

                        # Re-raise the exception
                        raise

                # Use asyncio.run() inside the wrapper
                return asyncio.run(run_async())

            return wrapper

        return decorator

    def progress_update(self, progress: int):
        """Update job progress using SDK directly"""
        job_data = asyncio.run(self.job.get_job_data())
        if job_data.get("sweep_progress") is not None:
            if int(job_data.get("sweep_progress")) != 100:
                asyncio.run(self.job.update_job_data_field("sweep_subprogress", progress))
                return

        asyncio.run(self.job.update_progress(progress))
        # Check stop status using SDK
        job_data = asyncio.run(self.job.get_job_data())
        if job_data.get("stop", False):
            asyncio.run(self.job.update_status("STOPPED"))
            raise KeyboardInterrupt("Job stopped by user")

    def get_experiment_config(self, experiment_name: str):
        """Get experiment configuration"""
        return tlab_core.get_experiment_config(experiment_name)

    def add_job_data(self, key: str, value: Any):
        """Add data to job using SDK directly"""
        asyncio.run(self.job.update_job_data_field(key, value))

    def load_dataset(self, dataset_types: List[str] = ["train"], config_name: str = None):
        """Decorator for loading datasets with error handling"""

        self._ensure_args_parsed()

        if not self.params.dataset_name:
            asyncio.run(self.job.update_job_data_field("completion_status", "failed"))
            asyncio.run(self.job.update_job_data_field("completion_details", "Dataset name not provided"))
            self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
            raise ValueError("Dataset name not provided")

        try:
            # Get the dataset path/ID
            dataset_target = get_dataset_path(self.params.dataset_name)

            # If this is a directory, prepare data_files excluding index.json and hidden files
            async def _check_dir():
                if await storage.exists(dataset_target):
                    return await storage.isdir(dataset_target)
                return os.path.isdir(dataset_target)

            is_dir = isinstance(dataset_target, str) and asyncio.run(_check_dir())
            data_files_map = None
            if is_dir:
                try:

                    async def _get_entries():
                        if await storage.exists(dataset_target):
                            entries_full = await storage.ls(dataset_target)
                            # normalize to basenames
                            return [e.rstrip("/").split("/")[-1] for e in entries_full]
                        else:
                            return os.listdir(dataset_target)

                    entries = asyncio.run(_get_entries())
                except Exception:
                    entries = []

                # Collect all relevant files into a single train split; let code derive other splits via slicing
                filtered_files = []
                for name in entries:
                    if name in ["index.json"] or name.startswith("."):
                        continue
                    lower = name.lower()
                    if not (lower.endswith(".json") or lower.endswith(".jsonl") or lower.endswith(".csv")):
                        continue

                    async def _check_file():
                        if await storage.exists(dataset_target):
                            full_path = storage.join(dataset_target, name)
                            if await storage.isfile(full_path):
                                return full_path
                        else:
                            full_path = os.path.join(dataset_target, name)
                            if os.path.isfile(full_path):
                                return full_path
                        return None

                    full_path = asyncio.run(_check_file())
                    if full_path:
                        filtered_files.append(full_path)

                if len(filtered_files) > 0:
                    data_files_map = {"train": filtered_files}
            # Get the available splits
            available_splits = get_dataset_split_names(dataset_target)
            # Get the available config names
            available_configs = get_dataset_config_names(dataset_target)

            if available_configs and available_configs[0] == "default":
                available_configs.pop(0)
                config_name = None
                print("Default config found, ignoring config_name")

            if config_name and config_name not in available_configs:
                raise ValueError(f"Config name {config_name} not found in dataset")

            if not config_name and len(available_configs) > 0:
                config_name = available_configs[0]
                print(f"Using default config name: {config_name}")

            # Handle different validation split names
            dataset_splits = {}
            for dataset_type in dataset_types:
                dataset_splits[dataset_type] = dataset_type

            # Check if train split is available and handle it if not available
            if "train" in dataset_types and "train" not in available_splits:
                print(
                    "WARNING: No train split found in dataset, we will use the first available split as train.\n Training a model on non-train splits is not recommended."
                )
                dataset_splits["train"] = available_splits[0]
                print(f"Using `{dataset_splits['train']}` for the training split.")

            if "validation" in available_splits and "valid" in dataset_splits:
                dataset_splits["valid"] = "validation"
            elif "valid" in dataset_types and "valid" not in available_splits:
                print("No validation slice found in dataset, using train split as 80-20 for training and validation")
                dataset_splits["valid"] = dataset_splits["train"] + "[-20%:]"
                dataset_splits["train"] = dataset_splits["train"] + "[:80%]"

            # If dataset_splits for train is same as any other split, make it a 80:20 thing to not have same data in train and test/valid
            for expected_split, actual_split in dataset_splits.items():
                if expected_split != "train" and actual_split == dataset_splits["train"]:
                    dataset_splits[expected_split] = dataset_splits["train"] + "[-20%:]"
                    dataset_splits["train"] = dataset_splits["train"] + "[:80%]"
                    print(
                        f"Using `{dataset_splits[expected_split]}` for the {expected_split} split as its same as train split."
                    )

            # Load each dataset split
            datasets = {}
            for dataset_type in dataset_splits:
                if is_dir and data_files_map:
                    datasets[dataset_type] = load_dataset(
                        dataset_target,
                        data_files=data_files_map,
                        split=dataset_splits[dataset_type],
                        trust_remote_code=True,
                    )
                else:
                    datasets[dataset_type] = load_dataset(
                        dataset_target,
                        data_dir=config_name,
                        split=dataset_splits[dataset_type],
                        trust_remote_code=True,
                    )
            if "train" in dataset_types:
                print(f"Loaded train dataset with {len(datasets['train'])} examples.")
            else:
                print("WARNING: No train dataset loaded, ensure you have a train split in your dataset.")

            if "valid" in dataset_types:
                print(f"Loaded valid dataset with {len(datasets['valid'])} examples.")

            if "test" in dataset_types:
                print(f"Loaded test dataset with {len(datasets['test'])} examples.")

            return datasets

        except Exception as e:
            error_msg = f"Error loading dataset: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            asyncio.run(self.job.update_job_data_field("completion_status", "failed"))
            asyncio.run(self.job.update_job_data_field("completion_details", "Failed to load dataset"))
            self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
            raise

    def load_evaluation_model(self, field_name="generation_model", model_type=None, model_name=None):
        """
        Load an appropriate model for evaluation based on configuration

        Args:
            field_name: Field name for the generation model
            model_type: Model type ('local', 'openai', 'claude', 'custom') or None to auto-detect
            model_name: Model name to use (defaults to self.model_name)

        Returns:
            A model object wrapped for evaluation use
        """
        from langchain_openai import ChatOpenAI  # noqa

        # Use provided values or class attributes
        model_name = model_name or self.params.model_name
        generation_model = self.params.get(field_name, "{'provider': 'local'}")

        if isinstance(generation_model, str):
            try:
                generation_model = json.loads(generation_model)
            except json.JSONDecodeError:
                print(f"Invalid JSON format for {field_name}: {generation_model}")
                generation_model = {"provider": generation_model}

        # Auto-detect model type if not provided
        if not model_type:
            gen_model = generation_model.get("provider", "").lower()
            if "local" in gen_model:
                model_type = "local"
            elif "azure" in gen_model:
                model_type = "azure"
            elif "openai" in gen_model or "gpt" in gen_model:
                model_type = "openai"
            elif "claude" in gen_model or "anthropic" in gen_model:
                model_type = "claude"
            elif "custom" in gen_model:
                model_type = "custom"
            else:
                model_type = "local"  # Default

        # Load the appropriate model
        if model_type == "local":
            model_server = generation_model.get("model_server")
            self.check_local_server(model_server)

            verified_model_name = self.get_local_model_name()
            if verified_model_name is not None and verified_model_name != "":
                print(f"Using verified local model name: {verified_model_name}")
                model_name = verified_model_name

            custom_model = ChatOpenAI(
                api_key="dummy",
                base_url="http://localhost:8338/v1",
                model=model_name,
            )
            return self._create_local_model_wrapper(custom_model, model_name)

        elif model_type == "claude":
            anthropic_api_key = tlab_core.get_db_config_value("ANTHROPIC_API_KEY")
            if not anthropic_api_key or anthropic_api_key.strip() == "":
                raise ValueError("Please set the Anthropic API Key from Settings.")

            os.environ["ANTHROPIC_API_KEY"] = anthropic_api_key
            return self._create_commercial_model_wrapper("claude", generation_model)

        elif model_type == "azure":
            azure_api_details = tlab_core.get_db_config_value("AZURE_OPENAI_DETAILS")
            if not azure_api_details or azure_api_details.strip() == "":
                raise ValueError("Please set the Azure OpenAI Details from Settings.")

            return self._create_commercial_model_wrapper("azure", "")

        elif model_type == "openai":
            openai_api_key = tlab_core.get_db_config_value("OPENAI_API_KEY")
            if not openai_api_key or openai_api_key.strip() == "":
                raise ValueError("Please set the OpenAI API Key from Settings.")

            os.environ["OPENAI_API_KEY"] = openai_api_key
            return self._create_commercial_model_wrapper("openai", generation_model)

        elif model_type == "custom":
            custom_api_details = tlab_core.get_db_config_value("CUSTOM_MODEL_API_KEY")
            if not custom_api_details or custom_api_details.strip() == "":
                raise ValueError("Please set the Custom API Details from Settings.")

            return self._create_commercial_model_wrapper("custom", "")

        else:
            raise ValueError(f"Unsupported model type: {model_type}")

    def get_local_model_name(self):
        """
        Fetch model names from the local server

        Returns:
            List of model names available on the local server, or None if error occurs
        """
        try:
            response = requests.get("http://localhost:8338/v1/models", timeout=10)
            response.raise_for_status()

            data = response.json()
            if "data" in data and isinstance(data["data"], list):
                model_names = [model.get("id") for model in data["data"] if model.get("id")]
                return model_names[0]
            else:
                print(f"Unexpected response format: {data}")
                return None

        except requests.exceptions.RequestException as e:
            print(f"Error fetching model names from local server: {str(e)}")
            return None
        except (KeyError, ValueError) as e:
            print(f"Error parsing response from local server: {str(e)}")
            return None

    def check_local_server(self, model_server=None):
        """Check if the local model server is running, and start it if not"""
        try:
            response = requests.get("http://localhost:8338/server/worker_healthz", timeout=5)
            if response.status_code == 200 and isinstance(response.json(), list) and len(response.json()) > 0:
                print("Local model server is already running")
                return
        except requests.exceptions.RequestException:
            print("Local model server is not responding")

        # Server is not running, try to start it and wait for it to be ready
        print("Starting local model server...")
        self._start_worker_sync(model_server=model_server)
        # Mark that we started the worker
        self.WORKER_STARTED = True

    def _start_worker_sync(self, model_server=None):
        """Start the local model server and wait for it to be ready"""
        # Get experiment_id from the job
        experiment_id = self.job.get_experiment_id() if self.job else None

        params = {
            "model_name": self.params.model_name,
            "inference_params": "",
        }

        if model_server is not None:
            params["inference_engine"] = model_server

        # Add experiment_id if we have one
        if experiment_id is not None:
            params["experiment_id"] = experiment_id

        # Add optional parameters if they exist
        if self.params.get("model_adapter"):
            params["adaptor"] = self.params.get("model_adapter")

        if self.params.get("model_architecture"):
            params["model_architecture"] = self.params.get("model_architecture")

        if self.params.get("model_path"):
            params["model_filename"] = self.params.get("model_filename")

        print(f"Starting worker with params: {params}")

        try:
            # Start the worker
            response = requests.get("http://localhost:8338/server/worker_start", params=params, timeout=60)
            print(f"Worker start response: {response.status_code}, {response.text}")

            if response.status_code == 200:
                print("Worker start request sent successfully")

                # Wait for worker to be ready with retries
                print("Waiting for worker to become ready...")
                max_retries = 10  # Wait up to 60 seconds (10 * 6 seconds)
                for attempt in range(max_retries):
                    try:
                        time.sleep(6)  # Wait 6 seconds between checks
                        health_response = requests.get("http://localhost:8338/server/worker_healthz", timeout=5)
                        if (
                            health_response.status_code == 200
                            and isinstance(health_response.json(), list)
                            and len(health_response.json()) > 0
                        ):
                            print("Worker is now running and healthy")
                            self.WORKER_STARTED = True
                            return
                    except requests.exceptions.RequestException:
                        pass

                    print(f"Worker not ready yet... (attempt {attempt + 1}/{max_retries})")

                raise RuntimeError("Worker started but failed to become healthy within 60 seconds")
            else:
                error_msg = f"Failed to start worker. Status: {response.status_code}, Response: {response.text}"
                print(error_msg)
                raise RuntimeError(error_msg)

        except requests.exceptions.RequestException as e:
            error_msg = f"Failed to connect to server to start worker: {str(e)}"
            print(error_msg)
            raise RuntimeError(error_msg)

    def stop_worker(self):
        """Stop the local model server worker"""
        try:
            print("Stopping local model server worker...")
            response = requests.get("http://localhost:8338/server/worker_stop", timeout=10)

            if response.status_code == 200:
                print("Worker stopped successfully")
                self.WORKER_STARTED = False
            else:
                print(f"Failed to stop worker. Status: {response.status_code}, Response: {response.text}")

        except requests.exceptions.RequestException as e:
            print(f"Error stopping worker: {str(e)}")
            # Don't raise an exception here as this is cleanup code
            # and we don't want to mask the original error if this is called from an exception handler

    def _create_local_model_wrapper(self, model, model_name=None):
        """Create a wrapper for local models"""
        # Import here to avoid circular imports
        from deepeval.models.base_model import DeepEvalBaseLLM  # noqa
        from langchain.schema import HumanMessage, SystemMessage  # noqa

        if model_name is None:
            plugin_model_name = self.params.model_name
        else:
            plugin_model_name = model_name

        class TRLAB_MODEL(DeepEvalBaseLLM):
            def __init__(self, model):
                self.model = model
                self.chat_completions_url = "http://localhost:8338/v1/chat/completions"
                self.generation_model_name = plugin_model_name
                self.api_key = "dummy"

            def load_model(self):
                return self.model

            def generate(self, prompt: str) -> str:
                chat_model = self.load_model()
                return chat_model.invoke(prompt).content

            async def a_generate(self, prompt: str) -> str:
                chat_model = self.load_model()
                res = await chat_model.ainvoke(prompt)
                return res.content

            def generate_without_instructor(self, messages: List[dict]) -> BaseModel:
                chat_model = self.load_model()
                modified_messages = []
                for message in messages:
                    if message["role"] == "system":
                        modified_messages.append(SystemMessage(**message))
                    else:
                        modified_messages.append(HumanMessage(**message))
                return chat_model.invoke(modified_messages).content

            def get_model_name(self):
                return self.model

        return TRLAB_MODEL(model)

    def _create_commercial_model_wrapper(self, model_type, model_name):
        """Create a wrapper for commercial models"""
        from anthropic import Anthropic
        from deepeval.models.base_model import DeepEvalBaseLLM
        from openai import OpenAI, AzureOpenAI

        class CustomCommercialModel(DeepEvalBaseLLM):
            def __init__(self, model_type="claude", model_name="claude-3-7-sonnet-latest"):
                self.model_type = model_type
                self.generation_model_name = model_name
                # Dealing with the new {"provider": "<model_name>"} output format
                if isinstance(model_name, dict):
                    self.generation_model_name = model_name.get("provider", model_name)

                if model_type == "claude":
                    self.chat_completions_url = "https://api.anthropic.com/v1/chat/completions"
                    self.base_url = "https://api.anthropic.com/v1"
                    anthropic_api_key = tlab_core.get_db_config_value("ANTHROPIC_API_KEY")
                    self.api_key = anthropic_api_key
                    if not anthropic_api_key or anthropic_api_key.strip() == "":
                        raise ValueError("Please set the Anthropic API Key from Settings.")
                    else:
                        os.environ["ANTHROPIC_API_KEY"] = anthropic_api_key
                    self.model = Anthropic()
                elif model_type == "azure":
                    azure_api_details = tlab_core.get_db_config_value("AZURE_OPENAI_DETAILS")
                    if not azure_api_details or azure_api_details.strip() == "":
                        raise ValueError("Please set the Azure OpenAI Details from Settings.")
                    azure_api_details = json.loads(azure_api_details)

                    self.model = AzureOpenAI(
                        api_key=azure_api_details["azure_openai_api_key"],
                        api_version=azure_api_details["openai_api_version"],
                        azure_endpoint=azure_api_details["azure_endpoint"],
                    )
                    self.generation_model_name = azure_api_details["azure_deployment"]
                    self.model_name = azure_api_details["azure_deployment"]

                    self.chat_completions_url = f"{azure_api_details['azure_endpoint']}/openai/deployments/{azure_api_details['azure_deployment']}/chat/completions?api-version={azure_api_details['openai_api_version']}"
                    self.api_key = azure_api_details["azure_openai_api_key"]

                elif model_type == "openai":
                    self.chat_completions_url = "https://api.openai.com/v1/chat/completions"
                    self.base_url = "https://api.openai.com/v1"
                    openai_api_key = tlab_core.get_db_config_value("OPENAI_API_KEY")
                    self.api_key = openai_api_key
                    if not openai_api_key or openai_api_key.strip() == "":
                        raise ValueError("Please set the OpenAI API Key from Settings.")
                    else:
                        os.environ["OPENAI_API_KEY"] = openai_api_key
                    self.model = OpenAI()

                elif model_type == "custom":
                    custom_api_details = tlab_core.get_db_config_value("CUSTOM_MODEL_API_KEY")

                    if not custom_api_details or custom_api_details.strip() == "":
                        raise ValueError("Please set the Custom API Details from Settings.")
                    else:
                        custom_api_details = json.loads(custom_api_details)
                        self.model = OpenAI(
                            api_key=custom_api_details["customApiKey"],
                            base_url=custom_api_details["customBaseURL"],
                        )
                        self.chat_completions_url = f"{custom_api_details['customBaseURL']}/chat/completions"
                        self.base_url = f"{custom_api_details['customBaseURL']}"
                        self.api_key = custom_api_details["customApiKey"]
                        self.generation_model_name = custom_api_details["customModelName"]
                        self.model_name = custom_api_details["customModelName"]

            def load_model(self):
                return self.model

            def generate(self, prompt: str, schema=None):
                client = self.load_model()
                if isinstance(self.generation_model_name, dict):
                    self.generation_model_name = self.generation_model_name.get("provider", self.generation_model_name)
                if schema:
                    import instructor

                    if self.model_type == "claude":
                        instructor_client = instructor.from_anthropic(client)
                    else:
                        instructor_client = instructor.from_openai(client)

                    resp = instructor_client.messages.create(
                        model=self.generation_model_name,
                        max_tokens=1024,
                        messages=[{"role": "user", "content": prompt}],
                        response_model=schema,
                    )
                    return resp
                else:
                    response = client.chat.completions.create(
                        model=self.generation_model_name,
                        messages=[{"role": "user", "content": prompt}],
                    )

                    return response.choices[0].message.content

            async def a_generate(self, prompt: str, schema=None):
                return self.generate(prompt, schema)

            def generate_without_instructor(self, messages: List[dict]):
                client = self.load_model()
                response = client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                )
                return response.choices[0].message.content

            def get_model_name(self):
                return self.generation_model_name

        return CustomCommercialModel(model_type, model_name)
