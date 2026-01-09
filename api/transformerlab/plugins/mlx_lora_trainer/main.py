"""
Fine-Tuning with LoRA or QLoRA using MLX

https://github.com/ml-explore/mlx-examples/blob/main/llms/mlx_lm/LORA.md
"""

import yaml
import re
import subprocess
import os
import time


# Import tlab_trainer from the SDK
# from transformerlab.tlab_decorators import tlab_trainer
from transformerlab.sdk.v1.train import tlab_trainer
from transformerlab.plugin import prepare_dataset_files

from transformerlab.plugin import get_python_executable
from lab.dirs import get_workspace_dir
from lab import storage


@tlab_trainer.job_wrapper(wandb_project_name="TLab_Training", manual_logging=True)
def train_mlx_lora():
    plugin_dir = os.path.dirname(os.path.realpath(__file__))
    print("Plugin dir:", plugin_dir)

    # Extract configuration parameters
    lora_layers = tlab_trainer.params.get("lora_layers", "16")
    learning_rate = tlab_trainer.params.get("learning_rate", "5e-5")
    batch_size = str(tlab_trainer.params.get("batch_size", "4"))
    steps_per_eval = str(tlab_trainer.params.get("steps_per_eval", "200"))
    iters = tlab_trainer.params.get("iters", "1000")
    adaptor_name = tlab_trainer.params.get("adaptor_name", "default")
    fuse_model = tlab_trainer.params.get("fuse_model", True)
    num_train_epochs = tlab_trainer.params.get("num_train_epochs", None)
    datasets = tlab_trainer.load_dataset(["train", "valid"])
    steps_per_report = tlab_trainer.params.get("steps_per_report", "10")
    save_every = tlab_trainer.params.get("save_every", "1000")
    tlab_trainer.add_job_data("checkpoints", True)  # save_every implies checkpoints

    # Check if LoRA parameters are set
    lora_rank = tlab_trainer.params.get("lora_rank", None)
    lora_alpha = tlab_trainer.params.get("lora_alpha", None)

    # Check if template parameters are set
    chat_template = tlab_trainer.params.get("formatting_chat_template", None)
    chat_column = tlab_trainer.params.get("chatml_formatted_column", "messages")
    formatting_template = tlab_trainer.params.get("formatting_template", None)

    if num_train_epochs is not None and num_train_epochs != "" and int(num_train_epochs) >= 0:
        if num_train_epochs == 0:
            print(
                "Training is set to 0 epochs which is not allowed. Setting to 1 epoch. To avoid epoch based training set 'Number of Training Epochs' to -1."
            )
            num_train_epochs = 1
        batch_size_int = int(batch_size)
        num_examples = len(datasets["train"])
        steps_per_epoch = num_examples // batch_size_int
        if steps_per_epoch == 0:
            steps_per_epoch = 1  # Handle case where batch size > dataset size
        total_steps = steps_per_epoch * int(num_train_epochs)
        iters = str(total_steps)
        print(f"Using epoch-based training: {num_train_epochs} epochs")
        print(f"Training dataset size: {num_examples} examples")
        print(f"Steps per epoch: {steps_per_epoch}")
        print(f"Total training iterations: {iters}")
        print(f"Steps per eval: {steps_per_eval}")
        print(f"Steps per report: {steps_per_report}")
        print(f"Save every: {save_every}")

    # LoRA parameters have to be passed in a config file
    config_file = None
    if lora_rank or lora_alpha:
        config_file = os.path.join(plugin_dir, "config.yaml")
        with open(config_file, "w") as file:
            # It looks like the MLX code doesn't actually read the alpha parameter!
            # Instead it uses another parameter called scale to imply alpha
            # scale = alpha / rank
            lora_scale = int(lora_alpha) / int(lora_rank) if lora_alpha and lora_rank else 1

            lora_config = {}
            lora_config["lora_parameters"] = {}
            lora_config["lora_parameters"]["alpha"] = lora_alpha
            lora_config["lora_parameters"]["rank"] = lora_rank
            lora_config["lora_parameters"]["scale"] = lora_scale
            lora_config["lora_parameters"]["dropout"] = 0
            yaml.dump(lora_config, file)
            print("LoRA config:")
            print(lora_config)

    # Directory for storing temporary working files
    workspace_dir = get_workspace_dir()
    data_directory = storage.join(workspace_dir, "plugins", "mlx_lora_trainer", "data")
    if not storage.exists(data_directory):
        storage.makedirs(data_directory)

    prepare_dataset_files(
        data_directory=data_directory,
        datasets=datasets,
        formatting_template=formatting_template,
        chat_template=chat_template,
        model_name=tlab_trainer.params.model_name,
        chat_column=chat_column,
    )

    # Set output directory for the adaptor
    adaptor_output_dir = tlab_trainer.params.get("adaptor_output_dir", "")
    if adaptor_output_dir == "" or adaptor_output_dir is None:
        workspace_dir = get_workspace_dir()
        adaptor_output_dir = storage.join(workspace_dir, "adaptors", tlab_trainer.params.model_name, adaptor_name)
        print("Using default adaptor output directory:", adaptor_output_dir)
    if not storage.exists(adaptor_output_dir):
        storage.makedirs(adaptor_output_dir)

    # Get Python executable (from venv if available)
    python_executable = get_python_executable(plugin_dir)
    env = os.environ.copy()
    env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]

    # Prepare the command for MLX LoRA training
    popen_command = [
        python_executable,
        "-um",
        "mlx_lm",
        "lora",
        "--model",
        tlab_trainer.params.model_name,
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

    # If a config file has been created then include it
    if config_file:
        popen_command.extend(["--config", config_file])

    print("Running command:")
    print(popen_command)

    print("Training beginning:")
    print("Adaptor will be saved in:", adaptor_output_dir)

    # Track start time for estimated time remaining calculation
    start_time = time.time()

    # Run the MLX LoRA training process
    with subprocess.Popen(
        popen_command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, bufsize=1, universal_newlines=True, env=env
    ) as process:
        for line in process.stdout:
            # Parse progress from output
            pattern = r"Iter (\d+):"
            match = re.search(pattern, line)
            if match:
                iteration = int(match.group(1))
                percent_complete = float(iteration) / float(iters) * 100
                print("Progress: ", f"{percent_complete:.2f}%")
                tlab_trainer.progress_update(percent_complete)

                # Calculate estimated time remaining
                if iteration > 0:
                    elapsed_time = time.time() - start_time
                    iterations_remaining = int(iters) - iteration

                    if iterations_remaining > 0:
                        avg_time_per_iter = elapsed_time / iteration
                        estimated_time_remaining = avg_time_per_iter * iterations_remaining
                        # Store estimated time remaining in seconds
                        tlab_trainer.add_job_data("estimated_time_remaining", int(estimated_time_remaining))

                # Parse training metrics
                pattern = (
                    r"Train loss (\d+\.\d+), Learning Rate (\d+\.[e\-\d]+), It/sec (\d+\.\d+), Tokens/sec (\d+\.\d+)"
                )
                match = re.search(pattern, line)
                if match:
                    loss = float(match.group(1))
                    it_per_sec = float(match.group(3))
                    tokens_per_sec = float(match.group(4))
                    print("Training Loss: ", loss)

                    tlab_trainer.log_metric("train/loss", loss, iteration)
                    tlab_trainer.log_metric("train/it_per_sec", it_per_sec, iteration)
                    tlab_trainer.log_metric("train/tokens_per_sec", tokens_per_sec, iteration)

                # Parse validation metrics
                else:
                    pattern = r"Val loss (\d+\.\d+), Val took (\d+\.\d+)s"
                    match = re.search(pattern, line)
                    if match:
                        validation_loss = float(match.group(1))
                        print("Validation Loss: ", validation_loss)
                        tlab_trainer.log_metric("eval/loss", validation_loss, iteration)

            print(line, end="", flush=True)

    # Check if the training process completed successfully
    if process.returncode and process.returncode != 0:
        print("An error occured before training completed.")
        raise RuntimeError("Training failed.")

    print("Finished training.")

    # Fuse the model with the base model if requested
    if not fuse_model:
        print(f"Adaptor training complete and saved at {adaptor_output_dir}.")
        return True
    else:
        print("Now fusing the adaptor with the model.")

        model_name = tlab_trainer.params.model_name
        if "/" in model_name:
            model_name = model_name.split("/")[-1]
        fused_model_name = f"{model_name}_{adaptor_name}"
        workspace_dir = get_workspace_dir()
        fused_model_location = storage.join(workspace_dir, "models", fused_model_name)

        # Make the directory to save the fused model
        if not storage.exists(fused_model_location):
            storage.makedirs(fused_model_location)

        fuse_popen_command = [
            python_executable,
            "-m",
            "mlx_lm",
            "fuse",
            "--model",
            tlab_trainer.params.model_name,
            "--adapter-path",
            adaptor_output_dir,
            "--save-path",
            fused_model_location,
        ]

        with subprocess.Popen(
            fuse_popen_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True,
            env=env,
        ) as process:
            for line in process.stdout:
                print(line, end="", flush=True)

            return_code = process.wait()

            if return_code == 0:
                json_data = {
                    "description": f"An MLX model trained and generated by Transformer Lab based on {tlab_trainer.params.model_name}"
                }
                tlab_trainer.create_transformerlab_model(
                    fused_model_name=fused_model_name, model_architecture="MLX", json_data=json_data
                )
                print("Finished fusing the adaptor with the model.")
                return True
            else:
                print("Fusing model with adaptor failed: ", return_code)
                raise RuntimeError(f"Model fusion failed with return code {return_code}")


train_mlx_lora()
