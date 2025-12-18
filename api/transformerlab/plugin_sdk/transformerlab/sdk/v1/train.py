import asyncio
import hashlib
import json
import time
import traceback
import posixpath

try:
    from transformerlab.plugin import WORKSPACE_DIR, generate_model_json, test_wandb_login
    from transformerlab.sdk.v1.tlab_plugin import TLabPlugin

except ModuleNotFoundError:
    from transformerlab.plugin_sdk.transformerlab.plugin import WORKSPACE_DIR, generate_model_json, test_wandb_login
    from transformerlab.plugin_sdk.transformerlab.sdk.v1.tlab_plugin import TLabPlugin
from lab import storage
import aiofiles


class DotDict(dict):
    """Dictionary subclass that allows attribute access to dictionary keys"""

    __getattr__ = dict.get
    __setattr__ = dict.__setitem__
    __delattr__ = dict.__delitem__


class TrainerTLabPlugin(TLabPlugin):
    """Enhanced decorator class for TransformerLab training plugins"""

    def __init__(self):
        super().__init__()
        self.tlab_plugin_type = "trainer"
        # Add training-specific default arguments
        self._parser.add_argument("--input_file", default=None, type=str, help="Path to configuration file")

        # Training state tracking
        self._config_parsed = False

    def _ensure_args_parsed(self):
        """Parse arguments if not already done"""
        if not self._args_parsed:
            args, _ = self._parser.parse_known_args()
            # Transfer all arguments to attributes of self
            for key, value in vars(args).items():
                self.params[key] = value
            self._args_parsed = True

        if self._args_parsed and not self._config_parsed:
            if getattr(self.params, "input_file") is not None:
                self.load_config()
                self._config_parsed = True

    def create_progress_callback(self, framework="huggingface", **kwargs):
        """
        Create a progress callback for various ML frameworks.

        Args:
            framework: The framework to create a callback for (e.g., "huggingface")
            **kwargs: Additional arguments specific to the callback

        Returns:
            A callback object compatible with the specified framework
        """
        self._ensure_args_parsed()
        from tensorboardX import SummaryWriter

        if framework.lower() in ("huggingface", "hf"):
            try:
                from transformers import TrainerCallback
            except ImportError:
                raise ImportError("Could not create HuggingFace callback. Please install transformers package.")

            class TLabProgressCallback(TrainerCallback):
                """Callback that updates progress and logs metrics to metrics.json"""

                def __init__(self, tlab_instance):
                    self.tlab = tlab_instance
                    self.writer = None
                    self.start_time = None

                def on_init_end(self, args, state, control, **kwargs):
                    self.writer = SummaryWriter(log_dir=args.logging_dir)
                    # Initialize start_time as fallback if on_train_begin hasn't been called yet
                    if self.start_time is None and state.is_local_process_zero:
                        self.start_time = time.time()

                def on_train_begin(self, args, state, control, **kwargs):
                    """Called at the beginning of training"""
                    if state.is_local_process_zero:
                        # Only set start_time if not already set (e.g., if on_init_end set it)
                        if self.start_time is None:
                            self.start_time = time.time()

                def on_step_end(self, args, state, control, **cb_kwargs):
                    if state.is_local_process_zero and state.max_steps > 0:
                        progress = int(state.global_step / state.max_steps * 100)
                        self.tlab.progress_update(progress)

                        # Calculate estimated time remaining
                        if self.start_time is not None and state.global_step > 0:
                            elapsed_time = time.time() - self.start_time
                            steps_completed = state.global_step
                            steps_remaining = state.max_steps - steps_completed

                            if steps_completed > 0 and steps_remaining > 0:
                                avg_time_per_step = elapsed_time / steps_completed
                                estimated_time_remaining = avg_time_per_step * steps_remaining
                                # Store estimated time remaining in seconds
                                self.tlab.add_job_data("estimated_time_remaining", int(estimated_time_remaining))

                        if self.tlab.job.should_stop:
                            control.should_training_stop = True
                    return control

                def on_log(self, args, state, control, logs=None, **cb_kwargs):
                    # Called whenever Trainer.log() is called
                    if state.is_local_process_zero and logs:
                        step = logs.get("step", state.global_step)
                        for name, val in logs.items():
                            # skip the step counter itself
                            if name == "step":
                                continue
                            try:
                                self.tlab.log_metric(
                                    name.replace("train_", "train/").replace("eval_", "eval/"),
                                    float(val),
                                    step,
                                    logging_platforms=False,
                                )
                            except Exception:
                                pass
                    return control

                def on_evaluate(self, args, state, control, metrics=None, **cb_kwargs):
                    # Called at end of evaluation
                    if state.is_local_process_zero and metrics:
                        for name, val in metrics.items():
                            try:
                                self.tlab.log_metric(
                                    name.replace("train_", "train/").replace("eval_", "eval/"),
                                    float(val),
                                    state.global_step,
                                    logging_platforms=False,
                                )
                            except Exception:
                                pass

                    if self.writer is None:
                        return  # Safety check

                    import torch
                    import psutil

                    step = state.global_step

                    if torch.cuda.is_available():
                        self.writer.add_scalar("system/vram_allocated_gb", torch.cuda.memory_allocated() / 1e9, step)
                        self.writer.add_scalar("system/vram_reserved_gb", torch.cuda.memory_reserved() / 1e9, step)
                        # self.writer.flush()
                    else:
                        mem = psutil.virtual_memory()
                        self.writer.add_scalar("system/ram_used_mb", mem.used / 1e6, step)
                        self.writer.add_scalar("system/ram_total_mb", mem.total / 1e6, step)

                    return control

            return TLabProgressCallback(self)

        else:
            raise ValueError(f"Unsupported framework: {framework}. Supported frameworks: huggingface")

    def load_config(self):
        """Decorator for loading configuration from input file"""

        try:
            import json

            # Load configuration from file
            async def _load_config():
                async with aiofiles.open(self.params.input_file, "r", encoding="utf-8") as json_file:
                    return json.loads(await json_file.read())

            input_config = asyncio.run(_load_config())

            if "config" in input_config:
                self.params._config = input_config["config"]
            else:
                self.params._config = input_config

            # Transfer config values to instance attributes for easy access
            for key, value in self.params._config.items():
                if getattr(self.params, key) is None:
                    self.params[key] = value

        except Exception as e:
            error_msg = f"Error loading configuration: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            self.job.update_job_data_field("completion_status", "failed")
            self.job.update_job_data_field("completion_details", "Error loading configuration")
            self.add_job_data("end_time", time.strftime("%Y-%m-%d %H:%M:%S"))
            raise

    def setup_train_logging(self, wandb_project_name: str = "TLab_Training", manual_logging=False, output_dir=None):
        """Setup Weights and Biases and TensorBoard logging

        Args:
            wandb_project_name: Name of the W&B project

        Returns:
            List of reporting targets (e.g. ["tensorboard", "wandb"])
        """
        from tensorboardX import SummaryWriter

        self._ensure_args_parsed()
        if not self.params.template_name:
            self.params.template_name = "default"
        # Add tensorboard_output_dir
        if output_dir is None:
            self.params.tensorboard_output_dir = storage.join(
                self.params.output_dir, f"job_{self.params.job_id}_{self.params.template_name}"
            )
            self.add_job_data("tensorboard_output_dir", self.params.output_dir)
            print("Writing tensorboard logs to:", self.params.output_dir)
        else:
            self.params.tensorboard_output_dir = storage.join(
                output_dir, f"job_{self.params.job_id}_{self.params.template_name}"
            )
            self.add_job_data("tensorboard_output_dir", output_dir)
            print("Writing tensorboard logs to:", output_dir)

        # Ensure directory exists
        asyncio.run(storage.makedirs(self.params.tensorboard_output_dir, exist_ok=True))

        self.writer = SummaryWriter(self.params.tensorboard_output_dir)

        # Check config or direct attribute for wandb logging preference
        log_to_wandb = False
        if getattr(self.params, "_config") is not None:
            log_to_wandb = self.params._config.get("log_to_wandb", False)
        elif getattr(self.params, "log_to_wandb") is not None:
            log_to_wandb = self.params.log_to_wandb

        report_to = ["tensorboard"]

        if log_to_wandb:
            try:
                wandb_success, report_to = test_wandb_login(wandb_project_name)

                if wandb_success:
                    print(f"W&B logging enabled (project: {wandb_project_name})")
                    try:
                        import wandb

                        report_to.append("wandb")
                    except ImportError:
                        raise ImportError("Could not import wandb. Skipping W&B logging.")

                else:
                    print("W&B API key not found. W&B logging disabled.")
                    self.add_job_data("wandb_logging", False)

            except Exception as e:
                print(f"Error setting up W&B: {str(e)}. Continuing without W&B.")
                self.add_job_data("wandb_logging", False)
                report_to = ["tensorboard"]

        if "wandb" in report_to and manual_logging:
            self.wandb_run = wandb.init(
                project=wandb_project_name,
                config=self.params._config,
                name=f"{self.params.template_name}_{self.params.job_id}",
            )

        self.report_to = report_to

    def log_metric(self, metric_name: str, metric_value: float, step: int = None, logging_platforms: bool = True):
        """Log a metric to all reporting targets"""
        if logging_platforms:
            if "tensorboard" in self.report_to:
                self.writer.add_scalar(metric_name, metric_value, step)
            if "wandb" in self.report_to and getattr(self, "wandb_run") is not None:
                self.wandb_run.log({metric_name: metric_value}, step=step)

            # # Log system metrics
            # system_metrics = self._get_system_metrics()
            # for sys_metric, sys_value in system_metrics.items():
            #     if "tensorboard" in self.report_to:
            #         self.writer.add_scalar(sys_metric, sys_value, step)

        # Store metrics in memory
        if not hasattr(self, "_metrics"):
            self._metrics = {}

        # Store the latest value for each metric
        self._metrics[metric_name] = metric_value

        # Save metrics to a file in the output directory
        try:
            # Ensure output_dir exists
            output_dir = self.params.get("output_dir", "")

            async def _save_metrics():
                if output_dir and await storage.exists(output_dir):
                    # Save metrics to a JSON file
                    metrics_path = storage.join(output_dir, "metrics.json")
                    async with aiofiles.open(metrics_path, "w", encoding="utf-8") as f:
                        await f.write(json.dumps(self._metrics, indent=2))
                else:
                    print(f"Output directory not found or not specified: {output_dir}")

            asyncio.run(_save_metrics())
        except Exception as e:
            print(f"Error saving metrics to file: {str(e)}")

    def create_transformerlab_model(
        self,
        fused_model_name,
        model_architecture,
        json_data,
        output_dir=None,
        generate_json=True,
        pipeline_tag=None,
        parent_model=None,
    ):
        # Handle pipeline tag logic
        if pipeline_tag is None and parent_model is not None:
            # Try to fetch pipeline tag from parent model
            try:
                from huggingface_hub import HfApi

                api = HfApi()
                model_info = api.model_info(parent_model)
                pipeline_tag = model_info.pipeline_tag
                print(f"Fetched pipeline tag '{pipeline_tag}' from parent model '{parent_model}'")
            except Exception as e:
                print(f"Error fetching pipeline tag from parent model '{parent_model}': {type(e).__name__}: {e}")
                pipeline_tag = None  # Default fallback

        # Add pipeline tag to json_data if provided
        if pipeline_tag is not None:
            json_data = json_data.copy() if json_data else {}
            json_data["pipeline_tag"] = pipeline_tag

        if output_dir is None:
            fused_model_location = storage.join(WORKSPACE_DIR, "models", fused_model_name)
        else:
            fused_model_location = storage.join(output_dir, fused_model_name)

        # Determine model_filename based on architecture
        # Most models are directory-based, only GGUF models are file-based
        # Default to directory-based (use "." to indicate the directory itself)
        model_filename = "."

        # GGUF architecture indicates a file-based model
        # The actual filename will be set by the export process, so we don't set it here
        # For now, if it's GGUF and the file exists, use the filename
        if "GGUF" in model_architecture.upper() or model_architecture.upper() == "GGUF":

            async def _check_gguf():
                if await storage.exists(fused_model_location):
                    if await storage.isfile(fused_model_location):
                        # File-based model - use the filename
                        return posixpath.basename(fused_model_location)
                return "."

            model_filename = asyncio.run(_check_gguf())
            # If GGUF file doesn't exist yet, the export process will set the filename

        if generate_json:
            generate_model_json(
                fused_model_name,
                model_architecture,
                model_filename=model_filename,
                json_data=json_data,
                output_directory=output_dir,
            )

        # Create the hash files for the model
        md5_objects = self.create_md5_checksum_model_files(fused_model_location)

        # Create the _tlab_provenance.json file
        provenance_file = self.create_provenance_file(
            model_location=fused_model_location,
            model_name=fused_model_name,
            model_architecture=model_architecture,
            md5_objects=md5_objects,
        )
        print(f"Provenance file created at: {provenance_file}")

    def create_md5_checksum_model_files(self, fused_model_location):
        async def compute_md5(file_path):
            md5 = hashlib.md5()
            async with aiofiles.open(file_path, "rb") as f:
                while True:
                    chunk = await f.read(8192)
                    if not chunk:
                        break
                    md5.update(chunk)
            return md5.hexdigest()

        async def _create_checksums():
            md5_objects = []

            if not await storage.isdir(fused_model_location):
                print("Fused model location is not a directory, skipping md5 within provenance")
                return md5_objects

            # Walk directory using storage
            stack = [fused_model_location]
            while stack:
                current_dir = stack.pop()
                for entry in await storage.ls(current_dir):
                    if await storage.isdir(entry):
                        stack.append(entry)
                    else:
                        file_path = entry
                        md5_hash = await compute_md5(file_path)
                        md5_objects.append({"file_path": file_path, "md5_hash": md5_hash})

            return md5_objects

        return asyncio.run(_create_checksums())

    def create_provenance_file(self, model_location, model_name, model_architecture, md5_objects):
        """Create a _tlab_provenance.json file containing model provenance data"""

        # Get training parameters and metadata
        dataset_name = self.params.get("dataset_name", None)
        if dataset_name is None:
            dataset_name = self.params.get("dataset", None)
        provenance_data = {
            "model_name": model_name,
            "model_architecture": model_architecture,
            "job_id": self.params.get("job_id", None),
            "input_model": self.params.get("model_name", None),
            "dataset": dataset_name,
            "adaptor_name": self.params.get("adaptor_name", None),
            "parameters": self.params.get("_config", None),
            "start_time": self.params.get("start_time", ""),
            "end_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "md5_checksums": md5_objects,
        }

        # Write provenance to file
        async def _write_provenance():
            provenance_path = storage.join(model_location, "_tlab_provenance.json")
            async with aiofiles.open(provenance_path, "w", encoding="utf-8") as f:
                await f.write(json.dumps(provenance_data, indent=2))
            return provenance_path

        return asyncio.run(_write_provenance())


# Create an instance of the TrainerTLabPlugin class
tlab_trainer = TrainerTLabPlugin()
