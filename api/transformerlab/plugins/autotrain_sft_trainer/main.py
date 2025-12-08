import json
import os
import re
import subprocess

from jinja2 import Environment
from transformerlab.plugin import get_python_executable

# Import the TrainerTLabPlugin
from transformerlab.sdk.v1.train import tlab_trainer

# Setup Jinja environment
jinja_environment = Environment()


@tlab_trainer.job_wrapper(manual_logging=True)
def train_model():
    """Main training function for AutoTrain SFT"""
    config = tlab_trainer.params._config

    # Parameters to pass to autotrain
    learning_rate = config["learning_rate"]
    batch_size = config.get("batch_size", 4)
    num_train_epochs = config.get("num_train_epochs", 4)

    # Generate a model name using the original model and the passed adaptor
    adaptor_name = config.get("adaptor_name", "default")
    input_model_no_author = config["model_name"].split("/")[-1]
    project_name = f"{input_model_no_author}-{adaptor_name}".replace(".", "")

    # Setup directories
    plugin_dir = os.path.dirname(os.path.realpath(__file__))
    # Get Python executable (from venv if available)
    python_executable = get_python_executable(plugin_dir)

    data_directory = os.path.join(plugin_dir, "data")
    if not os.path.exists(data_directory):
        os.makedirs(data_directory)

    # Get template from config
    formatting_template = jinja_environment.from_string(config["formatting_template"])

    # Load datasets (train, test)
    dataset_types = ["train", "test"]
    try:
        # This handles all the complexities like missing splits, validation renaming, etc.
        dataset = tlab_trainer.load_dataset(dataset_types=dataset_types)
        dataset_types = dataset.keys()
    except Exception as e:
        # The load_dataset method already handles error reporting to the job
        raise e

    for dataset_type in dataset_types:
        print(f"Loaded {dataset_type} dataset with {len(dataset[dataset_type])} examples.")

        # Output training files in templated format
        with open(f"{data_directory}/{dataset_type}.jsonl", "w") as f:
            for i in range(len(dataset[dataset_type])):
                data_line = dict(dataset[dataset_type][i])
                line = formatting_template.render(data_line)

                # Escape newlines for jsonl format
                line = line.replace("\n", "\\n")
                line = line.replace("\r", "\\r")
                o = {"text": line}
                f.write(json.dumps(o) + "\n")

    # Copy test.jsonl to valid.jsonl (validation = test)
    os.system(f"cp {data_directory}/test.jsonl {data_directory}/valid.jsonl")

    print("Example formatted training example:")
    example = formatting_template.render(dataset["train"][1])
    print(example)

    env = os.environ.copy()
    env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]

    if "venv" in python_executable:
        python_executable = python_executable.replace("venv/bin/python", "venv/bin/autotrain")

    # Prepare autotrain command
    popen_command = [
        python_executable,
        "llm",
        "--train",
        "--model",
        config["model_name"],
        "--data-path",
        data_directory,
        "--lr",
        learning_rate,
        "--batch-size",
        batch_size,
        "--epochs",
        num_train_epochs,
        "--trainer",
        "sft",
        "--peft",
        "--merge-adapter",
        "--auto_find_batch_size",  # automatically find optimal batch size
        "--project-name",
        project_name,
    ]

    print("Running command:")
    print(popen_command)

    print("Training beginning:")

    # Run the subprocess with output monitoring
    with subprocess.Popen(
        popen_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        universal_newlines=True,
    ) as process:
        iteration = 0
        it_per_sec = 0
        percent_complete = 0

        for line in process.stdout:
            # Parse progress from output lines
            # Progress complete pattern
            pattern = r"\s*(\d+)\%\|.+?(?=\d+/)(\d+)/.+?(?=\d+.\d+s/it)(\d+.\d+)s/it"
            match = re.search(pattern, line)
            if match:
                percent_complete = int(match.group(1))
                iteration = int(match.group(2))
                it_per_sec = float(match.group(3))
                # Update progress in TransformerLab
                tlab_trainer.progress_update(percent_complete)

            # Parse metrics for logging
            pattern = r"INFO.+?{'loss': (\d+\.\d+), 'grad_norm': (\d+\.\d+), 'learning_rate': (\d+\.\d+), 'epoch': (\d+\.\d+)}"
            match = re.search(pattern, line)
            if match:
                loss = float(match.group(1))
                grad_norm = float(match.group(2))
                learning_rate = float(match.group(3))
                epoch = float(match.group(4))

                print("Progress: ", f"{percent_complete}%")
                print("Iteration: ", iteration)
                print("It/sec: ", it_per_sec)
                print("Loss: ", loss)
                print("Epoch:", epoch)

                # Log metrics to tensorboard and wandb
                tlab_trainer.log_metric("train/loss", loss, iteration)
                tlab_trainer.log_metric("train/grad_norm", grad_norm, iteration)
                tlab_trainer.log_metric("train/it_per_sec", it_per_sec, iteration)
                tlab_trainer.log_metric("train/learning_rate", learning_rate, iteration)
                tlab_trainer.log_metric("train/epoch", epoch, iteration)

            # Print the output line
            print(line, end="", flush=True)

    # Clean up and move model
    try:
        # Remove autotrain data as it's not needed anymore
        os.system(f"rm -rf {project_name}/autotrain_data")
    except Exception as e:
        print(f"Failed to delete unnecessary data: {e}")

    try:
        # Move the model to the Transformer Lab directory
        os.system(f"mv {project_name} {config['adaptor_output_dir']}/")
    except Exception as e:
        raise e

    print("Finished training.")


train_model()
