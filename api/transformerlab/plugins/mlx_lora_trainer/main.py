"""
Fine-Tuning with LoRA or QLoRA using MLX

https://github.com/ml-explore/mlx-examples/blob/main/llms/mlx_lm/LORA.md
"""

import json
import os
import re
import subprocess
import sys
import time
import yaml

from lab import lab
from lab import storage
from lab.dirs import get_workspace_dir

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_async(coro):
    """Run an async coroutine from sync context."""
    import asyncio

    try:
        asyncio.get_running_loop()
        running = True
    except RuntimeError:
        running = False
    if not running:
        return asyncio.run(coro)
    loop = asyncio.get_event_loop()
    if loop.is_closed():
        return asyncio.run(coro)
    return loop.run_until_complete(coro)


# ---------------------------------------------------------------------------
# Compatibility shim: bridge the plugin-harness CLI flow with the lab facade.
#
# The traditional plugin harness (shared.py → plugin_harness.py → main.py)
# passes --input_file / --experiment_name as CLI args and does NOT set the
# _TFL_JOB_ID / _TFL_EXPERIMENT_ID environment variables that lab.init()
# expects.
#
# The LocalProvider flow already sets these env vars and stores parameters in
# job_data["parameters"], so lab.init() + lab.get_config() work out of the box.
#
# _bootstrap_from_harness() detects the harness path and patches the
# environment so that lab.init() / lab.get_config() behave identically in
# both flows.
# ---------------------------------------------------------------------------
_HARNESS_CONFIG = None  # Populated by _bootstrap_from_harness()


def _bootstrap_from_harness():
    """Parse CLI args from the plugin harness and set env vars for lab.init().

    Returns the training config dict read from --input_file so we can inject
    it into job_data["parameters"] after lab.init().
    """
    global _HARNESS_CONFIG

    # If _TFL_JOB_ID is already in the environment (LocalProvider), skip.
    if os.environ.get("_TFL_JOB_ID"):
        return

    # ---- Parse --input_file and --experiment_name from sys.argv ----
    input_file = None
    experiment_name = None
    argv = sys.argv[1:]  # skip script name
    for i, arg in enumerate(argv):
        if arg == "--input_file" and i + 1 < len(argv):
            input_file = argv[i + 1]
        elif arg == "--experiment_name" and i + 1 < len(argv):
            experiment_name = argv[i + 1]

    if not input_file:
        return  # Nothing to bootstrap

    # ---- Read the JSON config written by shared.py ----
    with open(input_file, "r") as f:
        input_contents = json.load(f)

    config = input_contents.get("config", input_contents)

    # Extract job_id – shared.py stores it as template_config["job_id"]
    job_id = config.get("job_id")
    if job_id:
        os.environ["_TFL_JOB_ID"] = str(job_id)

    if experiment_name:
        os.environ["_TFL_EXPERIMENT_ID"] = experiment_name
    elif "experiment_name" in config:
        os.environ["_TFL_EXPERIMENT_ID"] = config["experiment_name"]

    _HARNESS_CONFIG = config


# Run bootstrap immediately on import so env vars are ready before lab.init()
_bootstrap_from_harness()


def _get_python_executable(plugin_dir):
    """Return python from plugin venv if available, else sys.executable."""
    venv_python = os.path.join(plugin_dir, "venv", "bin", "python")
    if os.path.exists(venv_python):
        return venv_python
    return sys.executable


def _prepare_dataset_files(
    data_directory,
    datasets,
    formatting_template=None,
    chat_template=None,
    model_name=None,
    chat_column="messages",
):
    """Prepare train.jsonl / valid.jsonl for MLX from HuggingFace dataset splits."""
    from jinja2 import Environment
    from transformers import AutoTokenizer

    tokenizer = None
    if chat_template:
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)

    def _format(example):
        if chat_template and tokenizer and tokenizer.chat_template:
            return tokenizer.apply_chat_template(
                example[chat_column], tokenize=False, add_generation_prompt=False, chat_template=chat_template
            )
        if formatting_template:
            jinja_env = Environment()
            tmpl = jinja_env.from_string(formatting_template)
            return tmpl.render(example)
        raise ValueError("Either formatting_template or chat_template must be provided.")

    async def _write():
        await storage.makedirs(data_directory, exist_ok=True)
        for split_name, split_data in datasets.items():
            output_file = storage.join(data_directory, f"{split_name}.jsonl")
            async with await storage.open(output_file, "w") as f:
                for i in range(len(split_data)):
                    example = split_data[i]
                    try:
                        rendered = _format(example)
                        rendered = rendered.replace("\n", "\\n").replace("\r", "\\r")
                        await f.write(json.dumps({"text": rendered}) + "\n")
                    except Exception:
                        print(f"Warning: Failed to process example {i} in '{split_name}'. Skipping.")
                        continue
            # Print one example
            try:
                async with await storage.open(output_file, "r") as f:
                    first_line = await f.readline()
                    if first_line:
                        parsed = json.loads(first_line)
                        print(f"Example from {split_name} split:")
                        print(parsed.get("text", first_line))
            except Exception as e:
                print(f"Error reading example from {output_file}: {e}")

    _run_async(_write())


def _load_datasets(dataset_name, splits=None, config_name=None):
    """Load datasets from HuggingFace or local path, handling split negotiation."""
    from datasets import load_dataset, get_dataset_split_names, get_dataset_config_names

    if splits is None:
        splits = ["train", "valid"]

    available_splits = get_dataset_split_names(dataset_name)
    available_configs = get_dataset_config_names(dataset_name)

    if available_configs and available_configs[0] == "default":
        available_configs.pop(0)
        config_name = None

    if not config_name and len(available_configs) > 0:
        config_name = available_configs[0]
        print(f"Using default config name: {config_name}")

    # Build a mapping of desired → actual split name
    dataset_splits = {}
    for s in splits:
        dataset_splits[s] = s

    if "train" in splits and "train" not in available_splits:
        dataset_splits["train"] = available_splits[0]
        print(f"Using `{dataset_splits['train']}` for the training split.")

    if "validation" in available_splits and "valid" in dataset_splits:
        dataset_splits["valid"] = "validation"
    elif "valid" in splits and "valid" not in available_splits:
        print("No validation split found, splitting train 80/20.")
        dataset_splits["valid"] = dataset_splits["train"] + "[-20%:]"
        dataset_splits["train"] = dataset_splits["train"] + "[:80%]"

    # Avoid identical train/valid
    for expected, actual in list(dataset_splits.items()):
        if expected != "train" and actual == dataset_splits["train"]:
            dataset_splits[expected] = dataset_splits["train"] + "[-20%:]"
            dataset_splits["train"] = dataset_splits["train"] + "[:80%]"

    result = {}
    for desired, actual in dataset_splits.items():
        result[desired] = load_dataset(dataset_name, config_name, split=actual)
        print(f"Loaded {desired} split ({actual}): {len(result[desired])} examples")

    return result


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------


def train_mlx_lora():
    plugin_dir = os.path.dirname(os.path.realpath(__file__))
    print("Plugin dir:", plugin_dir)

    # Initialize lab facade – picks up _TFL_JOB_ID / _TFL_EXPERIMENT_ID from env.
    # _bootstrap_from_harness() has already set these from CLI args if needed.
    lab.init()

    # If we came through the plugin harness, inject the config from --input_file
    # into job_data["parameters"] so that lab.get_config() returns it.
    if _HARNESS_CONFIG is not None:
        lab.set_config({"parameters": _HARNESS_CONFIG})

    try:
        # Get configuration – comes from job_data["parameters"] which is populated
        # by either the plugin harness (via _bootstrap_from_harness) or the
        # LocalProvider launch flow.
        config = lab.get_config()

        # Extract configuration parameters
        model_name = config.get("model_name", "")
        dataset_name = config.get("dataset_name", config.get("dataset", ""))
        lora_layers = config.get("lora_layers", 16)
        learning_rate = config.get("learning_rate", 5e-5)
        batch_size = int(config.get("batch_size", 4))
        steps_per_eval = int(config.get("steps_per_eval", 200))
        iters = int(config.get("iters", 1000))
        adaptor_name = config.get("adaptor_name", "default")
        fuse_model = config.get("fuse_model", True)
        num_train_epochs = config.get("num_train_epochs", None)
        steps_per_report = int(config.get("steps_per_report", 10))
        save_every = int(config.get("save_every", 1000))
        lora_rank = config.get("lora_rank", None)
        lora_alpha = config.get("lora_alpha", None)
        chat_template = config.get("formatting_chat_template", None)
        chat_column = config.get("chatml_formatted_column", "messages")
        formatting_template = config.get("formatting_template", None)

        lab.log("Loading dataset…")
        datasets = _load_datasets(dataset_name, ["train", "valid"])
        lab.log(f"Dataset loaded: {len(datasets.get('train', []))} train, {len(datasets.get('valid', []))} valid")

        # Epoch-based training: compute total iterations from dataset size
        if num_train_epochs is not None and str(num_train_epochs) != "" and int(num_train_epochs) >= 0:
            num_train_epochs = int(num_train_epochs)
            if num_train_epochs == 0:
                lab.log("Training set to 0 epochs – overriding to 1. Set -1 to disable epoch-based training.")
                num_train_epochs = 1
            num_examples = len(datasets["train"])
            steps_per_epoch = max(num_examples // batch_size, 1)
            iters = steps_per_epoch * num_train_epochs
            lab.log(
                f"Epoch-based training: {num_train_epochs} epochs, {steps_per_epoch} steps/epoch, {iters} total iterations"
            )

        # LoRA parameters → config YAML file
        config_file = None
        if lora_rank or lora_alpha:
            config_file = os.path.join(plugin_dir, "config.yaml")
            lora_scale = int(lora_alpha) / int(lora_rank) if lora_alpha and lora_rank else 1
            lora_config = {
                "lora_parameters": {
                    "alpha": lora_alpha,
                    "rank": lora_rank,
                    "scale": lora_scale,
                    "dropout": 0,
                }
            }
            with open(config_file, "w") as f:
                yaml.dump(lora_config, f)
            lab.log(f"LoRA config: {lora_config}")

        # Directory for formatted dataset files
        workspace_dir = _run_async(get_workspace_dir())
        data_directory = storage.join(workspace_dir, "plugins", "mlx_lora_trainer", "data")

        _prepare_dataset_files(
            data_directory=data_directory,
            datasets=datasets,
            formatting_template=formatting_template,
            chat_template=chat_template,
            model_name=model_name,
            chat_column=chat_column,
        )

        # Adaptor output directory
        adaptor_output_dir = config.get("adaptor_output_dir", "")
        if not adaptor_output_dir:
            adaptor_output_dir = storage.join(workspace_dir, "adaptors", model_name, adaptor_name)
            lab.log(f"Using default adaptor output directory: {adaptor_output_dir}")
        if not _run_async(storage.exists(adaptor_output_dir)):
            _run_async(storage.makedirs(adaptor_output_dir))

        # Python executable (from plugin venv if available)
        python_executable = _get_python_executable(plugin_dir)
        env = os.environ.copy()
        env["PATH"] = os.path.dirname(python_executable) + os.pathsep + env.get("PATH", "")

        # Build the MLX LoRA training command
        popen_command = [
            python_executable,
            "-um",
            "mlx_lm",
            "lora",
            "--model",
            model_name,
            "--iters",
            str(iters),
            "--train",
            "--adapter-path",
            adaptor_output_dir,
            "--num-layers",
            str(lora_layers),
            "--batch-size",
            str(batch_size),
            "--learning-rate",
            str(learning_rate),
            "--data",
            data_directory,
            "--steps-per-report",
            str(steps_per_report),
            "--steps-per-eval",
            str(steps_per_eval),
            "--save-every",
            str(save_every),
        ]
        if config_file:
            popen_command.extend(["--config", config_file])

        lab.log(f"Running command: {' '.join(popen_command)}")
        lab.log(f"Adaptor will be saved in: {adaptor_output_dir}")

        # Track start time for ETA
        start_time = time.time()

        # Run the MLX LoRA training process
        with subprocess.Popen(
            popen_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True,
            env=env,
        ) as process:
            for line in process.stdout:
                # Parse progress from output
                iter_match = re.search(r"Iter (\d+):", line)
                if iter_match:
                    iteration = int(iter_match.group(1))
                    percent_complete = float(iteration) / float(iters) * 100
                    lab.update_progress(int(percent_complete))

                    # ETA calculation
                    if iteration > 0:
                        elapsed = time.time() - start_time
                        remaining = int(iters) - iteration
                        if remaining > 0:
                            eta = int((elapsed / iteration) * remaining)
                            lab.log(f"Iter {iteration}/{iters} ({percent_complete:.1f}%) – ETA {eta}s")

                    # Parse training metrics
                    train_match = re.search(
                        r"Train loss (\d+\.\d+), Learning Rate (\d+\.[e\-\d]+), "
                        r"It/sec (\d+\.\d+), Tokens/sec (\d+\.\d+)",
                        line,
                    )
                    if train_match:
                        loss = float(train_match.group(1))
                        it_per_sec = float(train_match.group(3))
                        tokens_per_sec = float(train_match.group(4))
                        lab.log(f"  train/loss={loss:.4f}  it/sec={it_per_sec:.2f}  tok/sec={tokens_per_sec:.2f}")
                    else:
                        # Parse validation metrics
                        val_match = re.search(r"Val loss (\d+\.\d+), Val took (\d+\.\d+)s", line)
                        if val_match:
                            validation_loss = float(val_match.group(1))
                            lab.log(f"  eval/loss={validation_loss:.4f}")

                print(line, end="", flush=True)

        # Check return code
        if process.returncode and process.returncode != 0:
            raise RuntimeError("Training failed.")

        lab.log("Training completed.")

        # ---------------------------------------------------------------
        # Fuse model if requested
        # ---------------------------------------------------------------
        if not fuse_model:
            lab.log(f"Adaptor training complete – saved at {adaptor_output_dir}")
            lab.save_artifact(adaptor_output_dir, f"adaptor_{adaptor_name}")
        else:
            lab.log("Fusing adaptor with base model…")

            short_name = model_name.split("/")[-1] if "/" in model_name else model_name
            fused_model_name = f"{short_name}_{adaptor_name}"
            fused_model_location = storage.join(workspace_dir, "models", fused_model_name)
            if not _run_async(storage.exists(fused_model_location)):
                _run_async(storage.makedirs(fused_model_location))

            fuse_command = [
                python_executable,
                "-m",
                "mlx_lm",
                "fuse",
                "--model",
                model_name,
                "--adapter-path",
                adaptor_output_dir,
                "--save-path",
                fused_model_location,
            ]

            with subprocess.Popen(
                fuse_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True,
                env=env,
            ) as fuse_proc:
                for line in fuse_proc.stdout:
                    print(line, end="", flush=True)
                return_code = fuse_proc.wait()

            if return_code == 0:
                lab.save_model(
                    fused_model_location,
                    name=fused_model_name,
                    architecture="MLX",
                    parent_model=model_name,
                )
                lab.log("Model fusion complete.")
            else:
                raise RuntimeError(f"Model fusion failed with return code {return_code}")

        lab.update_progress(100)
        lab.finish("Training completed successfully with MLX LoRA")

    except KeyboardInterrupt:
        lab.error("Stopped by user")
    except Exception as e:
        import traceback

        traceback.print_exc()
        lab.error(str(e))
        raise


train_mlx_lora()
