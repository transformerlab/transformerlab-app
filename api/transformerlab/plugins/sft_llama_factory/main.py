"""
Fine-Tuning with Llama Factory

https://github.com/hiyouga/LLaMA-Factory/tree/main

Standard command:
CUDA_VISIBLE_DEVICES=0 llamafactory-cli train examples/lora_single_gpu/llama3_lora_sft.yaml

"""

import os
import subprocess
import time
import json
import yaml
import re
import asyncio

from transformerlab.sdk.v1.train import tlab_trainer
from transformerlab.plugin import get_python_executable
from lab.dirs import get_workspace_dir
from lab import storage
from jinja2 import Environment

jinja_environment = Environment()


########################################
# First set up arguments and parameters
########################################

plugin_dir = os.path.dirname(os.path.realpath(__file__))
print("Plugin dir:", plugin_dir)


@tlab_trainer.job_wrapper()
def run_train():
    # Directory for storing temporary working files
    workspace_dir = asyncio.run(get_workspace_dir())
    data_directory = storage.join(workspace_dir, "temp", "llama_factory", "data")
    if not storage.exists(data_directory):
        storage.makedirs(data_directory)

    # Typecasting the parameters
    tlab_trainer.params.learning_rate = float(tlab_trainer.params.learning_rate)
    tlab_trainer.params.num_train_epochs = int(tlab_trainer.params.num_train_epochs)
    tlab_trainer.params.maximum_sequence_length = int(tlab_trainer.params.maximum_sequence_length)
    tlab_trainer.params.max_steps = int(tlab_trainer.params.max_steps)
    tlab_trainer.params.lora_alpha = int(tlab_trainer.params.lora_alpha)
    tlab_trainer.params.lora_r = int(tlab_trainer.params.lora_r)
    tlab_trainer.params.lora_dropout = float(tlab_trainer.params.lora_dropout)

    def create_data_directory_in_llama_factory_format():
        """This function creates a directory in the data_directory location
        that contains the files in the format that LLaMA-Factory expects.
        The main file being a dataset_info.json file that acts as an index to the JSON training data
        """
        dataset_info = {"training_data": {"file_name": "train.json"}}

        with storage.open(storage.join(data_directory, "dataset_info.json"), "w") as f:
            json.dump(dataset_info, f, indent=2)

    ########################################
    # Now process the Dataset
    ########################################

    dataset = tlab_trainer.load_dataset()
    dataset = dataset["train"]

    print(f"Loaded Training dataset with {len(dataset)} examples.")

    # Format the dataset into the alpaca format
    instruction_template = jinja_environment.from_string(tlab_trainer.params.instruction_template)
    input_template = jinja_environment.from_string(tlab_trainer.params.input_template)
    output_template = jinja_environment.from_string(tlab_trainer.params.output_template)

    instruction_text = instruction_template.render(dataset[0])
    input_text = input_template.render(dataset[0])
    output_text = output_template.render(dataset[0])

    example = {"instruction": instruction_text, "input": input_text, "output": output_text}

    print(example)

    formatted_dataset = []
    for i in range(len(dataset)):
        instruction_text = instruction_template.render(dataset[i])
        input_text = input_template.render(dataset[i])
        output_text = output_template.render(dataset[i])

        formatted_dataset.append({"instruction": instruction_text, "input": input_text, "output": output_text})

    # output training files in templated format in to data directory
    with storage.open(storage.join(data_directory, "train.json"), "w") as f:
        json.dump(formatted_dataset, f, indent=2)

    print("Example formatted training example:")
    print(example)

    ########################################
    # Generate a config YAML file that will be used by LLaMA-Factory
    ########################################

    yaml_config_path = storage.join(data_directory, "llama3_lora_sft.yaml")

    today = time.strftime("%Y%m%d-%H%M%S")
    output_dir = storage.join(tlab_trainer.params.output_dir, f"job_{tlab_trainer.params.job_id}_{today}")

    try:
        # First copy a template file to the data directory
        os.system(f"cp {plugin_dir}/LLaMA-Factory/examples/train_lora/llama3_lora_sft.yaml {yaml_config_path}")
    except Exception as e:
        raise e

    # Now replace specific values in the file using the PyYAML library:
    yml = {}
    with storage.open(yaml_config_path, "r") as file:
        yml = yaml.safe_load(file)

    try:
        create_data_directory_in_llama_factory_format()
    except Exception as e:
        raise e

    print("Template configuration:")
    print(yml)

    # Remove max_samples if it exists to use all training data
    if "max_samples" in yml and int(tlab_trainer.params.max_samples) < 1:
        del yml["max_samples"]
    else:
        yml["max_samples"] = int(tlab_trainer.params.max_samples)

    yml["model_name_or_path"] = tlab_trainer.params.model_name
    yml["output_dir"] = tlab_trainer.params.adaptor_output_dir
    yml["logging_dir"] = output_dir
    yml["max_length"] = int(tlab_trainer.params.maximum_sequence_length)
    yml["learning_rate"] = float(tlab_trainer.params.learning_rate)
    yml["num_train_epochs"] = int(tlab_trainer.params.num_train_epochs)
    yml["max_steps"] = float(tlab_trainer.params.max_steps)
    yml["lora_alpha"] = int(tlab_trainer.params.lora_alpha)
    yml["lora_rank"] = int(tlab_trainer.params.lora_r)
    yml["lora_dropout"] = float(tlab_trainer.params.lora_dropout)
    yml["dataset_dir"] = data_directory
    yml["dataset"] = "training_data"
    # Without resize_vocab the training fails for many models including Mistral
    yml["resize_vocab"] = True
    print("--------")

    with storage.open(yaml_config_path, "w") as file:
        # Now write out the new file
        yaml.dump(yml, file)
        print("New configuration:")
        print(yml)

    ########################################
    # Now train
    # CUDA_VISIBLE_DEVICES=0 llamafactory-cli train examples/lora_single_gpu/llama3_lora_sft.yaml
    ########################################
    env = os.environ.copy()
    python_executable = get_python_executable(plugin_dir)
    env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]

    if "venv" in python_executable:
        python_executable = python_executable.replace("venv/bin/python", "venv/bin/llamafactory-cli")

    os.environ["CUDA_VISIBLE_DEVICES"] = "0"
    popen_command = [python_executable, "train", yaml_config_path]

    print("Running command:")
    print(popen_command)

    error_output = ""
    with subprocess.Popen(
        popen_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        universal_newlines=True,
        cwd=os.path.join(plugin_dir, "LLaMA-Factory"),
        env=env,
    ) as process:
        for line in process.stdout:
            error_output += line
            # Each output line from lora.py looks like
            # "  2%|▏         | 8/366 [00:15<11:28,  1.92s/it]"
            pattern = r"(\d+)%\|.*\| (\d+)\/(\d+) \[(\d+):(\d+)<(\d+):(\d+),(\s*)(\d+\.\d+)(.+)]"
            match = re.search(pattern, line)
            if match:
                percentage = match.group(1)
                current = match.group(2)
                total = match.group(3)
                minutes = match.group(4)
                seconds = match.group(5)
                it_s = match.group(9)

                print(
                    f"Percentage: {percentage}, Current: {current}, Total: {total}, Minutes: {minutes}, Seconds: {seconds}, It/s: {it_s}"
                )
                tlab_trainer.progress_update(round(float(percentage), 2))

            print(line, end="", flush=True)

        return_code = process.wait()

        if (
            return_code != 0
            and "TypeError: DPOTrainer.create_model_card() got an unexpected keyword argument 'license'"
            not in error_output
        ):
            raise RuntimeError(f"Training failed: {error_output}")

    print("Finished training.")

    # Fuse the model with the base model
    fuse_model()


def fuse_model():
    """Fuse the adapter with the base model"""
    print("Now fusing the adaptor with the model.")

    workspace_dir = asyncio.run(get_workspace_dir())
    data_directory = storage.join(workspace_dir, "temp", "llama_factory", "data")
    model_name = tlab_trainer.params.model_name
    adaptor_name = tlab_trainer.params.adaptor_name
    adaptor_output_dir = tlab_trainer.params.adaptor_output_dir

    if "/" in model_name:
        model_name = model_name.split("/")[-1]
    fused_model_name = f"{model_name}_{adaptor_name}"
    fused_model_location = storage.join(workspace_dir, "models", fused_model_name)

    # Make the directory to save the fused model
    if not storage.exists(fused_model_location):
        storage.makedirs(fused_model_location)

    yaml_config_path = storage.join(data_directory, "merge_llama3_lora_sft.yaml")
    # Copy a template file to the data directory
    os.system(f"cp {plugin_dir}/LLaMA-Factory/examples/merge_lora/llama3_lora_sft.yaml {yaml_config_path}")

    yml = {}
    with storage.open(yaml_config_path, "r") as file:
        yml = yaml.safe_load(file)

    yml["model_name_or_path"] = tlab_trainer.params.model_name
    yml["adapter_name_or_path"] = adaptor_output_dir
    yml["export_dir"] = fused_model_location
    yml["resize_vocab"] = True

    with storage.open(yaml_config_path, "w") as file:
        yaml.dump(yml, file)
        print("Merge configuration:")
        print(yml)

    env = os.environ.copy()
    python_executable = get_python_executable(plugin_dir)
    env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]

    if "venv" in python_executable:
        python_executable = python_executable.replace("venv/bin/python", "venv/bin/llamafactory-cli")

    fuse_popen_command = [python_executable, "export", yaml_config_path]

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

        # If model creation was successful, create an info.json file
        print("Return code: ", return_code)
        if return_code == 0:
            # Create a TransformerLab model using the SDK function
            tlab_trainer.create_transformerlab_model(
                fused_model_name=fused_model_name,
                model_architecture=tlab_trainer.params.get("model_architecture", "llama"),
                json_data={
                    "uniqueID": f"TransformerLab/{fused_model_name}",
                    "name": "sft_llama_factory",
                    "description": f"Model generated using Llama Factory in Transformer Lab based on {tlab_trainer.params.model_name}",
                    "architecture": tlab_trainer.params.get("model_architecture", "llama"),
                    "huggingface_repo": "",
                },
                output_dir=storage.join(workspace_dir, "models"),
            )

            print("Finished fusing the adaptor with the model.")
        else:
            print("Fusing model with adaptor failed: ", return_code)
            raise RuntimeError(f"Fusing model with adaptor failed: {return_code}")


# Run the training process
run_train()
