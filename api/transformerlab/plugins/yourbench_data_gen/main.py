import asyncio
import os
import yaml
import subprocess
from huggingface_hub import get_token, HfApi
from datasets import load_from_disk
from transformerlab.sdk.v1.generate import tlab_gen
from transformerlab.plugin import get_python_executable
from lab.dirs import get_workspace_dir
from lab import storage


def generate_config():
    """Generate YourBench configuration based on tlab_gen params"""
    hf_token = get_token()
    hf_username = get_huggingface_username(hf_token)
    docs = tlab_gen.params.docs.split(",")[0]

    # Load generation model config
    trlab_model = tlab_gen.load_evaluation_model(field_name="generation_model")
    print("Model loaded successfully")
    tlab_gen.progress_update(30)

    workspace_dir = asyncio.run(get_workspace_dir())

    tlab_gen.params.documents_dir = storage.join(
        workspace_dir, "experiments", tlab_gen.params.experiment_name, "documents", docs
    )
    if not asyncio.run(storage.isdir(tlab_gen.params.documents_dir)):
        raise FileNotFoundError("Please provide a directory containing all your files instead of individual files")

    base_url = getattr(trlab_model, "base_url", None)
    if not base_url:
        base_url = "http://localhost:8338/v1"
    config = {
        "settings": {"debug": True},
        "hf_configuration": {
            "token": hf_token,
            "hf_organization": hf_username,
            "private": True,
            "hf_dataset_name": f"{tlab_gen.params.template_name}_{tlab_gen.params.job_id}",
            "concat_if_exist": False,
        },
        "local_dataset_dir": tlab_gen.params.local_dataset_dir,
        "model_list": [
            {
                "model_name": trlab_model.generation_model_name,
                "api_key": trlab_model.api_key,
                "max_concurrent_requests": 8,
                "base_url": base_url,
            },
        ],
        "model_roles": {
            "ingestion": [trlab_model.generation_model_name],
            "summarization": [trlab_model.generation_model_name],
            "chunking": [trlab_model.generation_model_name],
            "single_shot_question_generation": [trlab_model.generation_model_name],
            "multi_hop_question_generation": [trlab_model.generation_model_name],
        },
        "pipeline": {
            "ingestion": {
                "run": True,
                "source_documents_dir": tlab_gen.params.documents_dir,
                "output_dir": tlab_gen.params.output_dir,
            },
            "upload_ingest_to_hub": {"run": True, "source_documents_dir": tlab_gen.params.output_dir},
            "summarization": {"run": True},
            "chunking": {
                "run": True,
                "chunking_configuration": {
                    "l_min_tokens": int(tlab_gen.params.l_min_tokens),
                    "l_max_tokens": int(tlab_gen.params.l_max_tokens),
                    "tau_threshold": float(tlab_gen.params.tau_threshold),
                    "h_min": int(tlab_gen.params.h_min),
                    "h_max": int(tlab_gen.params.h_max),
                    "num_multihops_factor": int(tlab_gen.params.num_multihops_factor),
                },
            },
            "single_shot_question_generation": {
                "run": True,
                "additional_instructions": tlab_gen.params.single_shot_instructions,
                "chunk_sampling": {
                    "mode": tlab_gen.params.single_shot_sampling_mode,
                    "value": tlab_gen.params.single_shot_sampling_value,
                    "random_seed": tlab_gen.params.single_shot_random_seed,
                },
            },
            "multi_hop_question_generation": {
                "run": True,
                "additional_instructions": tlab_gen.params.multi_hop_instructions,
                "chunk_sampling": {
                    "mode": tlab_gen.params.multi_hop_sampling_mode,
                    "value": tlab_gen.params.multi_hop_sampling_value,
                    "random_seed": tlab_gen.params.multi_hop_random_seed,
                },
            },
            "lighteval": {"run": True},
        },
    }

    return config


def get_huggingface_username(token):
    api = HfApi()
    user_info = api.whoami(token=get_token())
    return user_info["name"]


def save_generated_datasets(output_dir):
    dataset_types = ["chunked", "lighteval", "ingested", "multi_hop_questions", "single_shot_questions", "summarized"]
    for data_split in dataset_types:
        dataset = load_from_disk(storage.join(output_dir, data_split))
        df = dataset[data_split].to_pandas()
        # Save the generated data and upload to TransformerLab
        additional_metadata = {"source_docs": tlab_gen.params.documents_dir}
        tlab_gen.save_generated_dataset(df, additional_metadata=additional_metadata, suffix=data_split)


@tlab_gen.job_wrapper(progress_start=0, progress_end=100)
def run_yourbench():
    """Run YourBench with generated configuration"""
    # Ensure arguments are parsed
    tlab_gen._ensure_args_parsed()

    # Get output directory for the config file
    output_dir = tlab_gen.get_output_file_path(dir_only=True)
    tlab_gen.params.local_dataset_dir = output_dir
    tlab_gen.params.output_dir = storage.join(output_dir, "temp")
    if not asyncio.run(storage.exists(tlab_gen.params.output_dir)):
        asyncio.run(storage.makedirs(tlab_gen.params.output_dir))
    config_path = storage.join(output_dir, f"yourbench_config_{tlab_gen.params.job_id}.yaml")

    # Generate the configuration
    tlab_gen.progress_update(10)
    config = generate_config()

    tlab_gen.progress_update(20)

    # Write the configuration to a file
    async def _write_config():
        async with await storage.open(config_path, "w") as config_file:
            await config_file.write(yaml.dump(config, default_flow_style=False))

    asyncio.run(_write_config())

    print(f"Configuration written to {config_path}")
    tlab_gen.add_job_data("config_file", config_path)

    tlab_gen.progress_update(30)

    # Get the yourbench directory path
    workspace_dir = asyncio.run(get_workspace_dir())
    current_dir = storage.join(workspace_dir, "plugins", "yourbench_data_gen")

    # Run yourbench with the configuration
    try:
        print(f"Executing YourBench with config: {config_path}")
        tlab_gen.progress_update(40)

        plugin_dir = os.path.dirname(os.path.realpath(__file__))
        env = os.environ.copy()
        python_executable = get_python_executable(plugin_dir)
        env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]

        if "venv" in python_executable:
            yourbench_executable = python_executable.replace("venv/bin/python", "venv/bin/yourbench")
        else:
            yourbench_executable = "yourbench"

        command = f"""
            {yourbench_executable} run {config_path}
            """
        print("")

        process = subprocess.Popen(
            command,
            cwd=current_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            shell=True,
            executable="/bin/bash",  # ensure bash is used
        )

        # Monitor progress
        for line in process.stdout:
            print(line.strip())
            # Update progress based on output (simplified approach)
            if "Ingestion" in line:
                tlab_gen.progress_update(50)
            elif "Summarization" in line:
                tlab_gen.progress_update(60)
            elif "Chunking" in line:
                tlab_gen.progress_update(70)
            elif "Single shot question" in line:
                tlab_gen.progress_update(80)
            elif "Multi hop question" in line:
                tlab_gen.progress_update(90)

        process.wait()

        if process.returncode == 0:
            print("YourBench execution completed successfully!")
            tlab_gen.progress_update(95)
            print("Saving generated datasets now...")
            save_generated_datasets(output_dir)

            return config_path
        else:
            error_msg = f"YourBench process exited with error code: {process.returncode}"
            print(error_msg)
            raise ValueError("Error in process")

    except subprocess.CalledProcessError as e:
        error_msg = f"Error running YourBench: {e}"
        print(error_msg)
        raise ValueError("Error in process")
    except FileNotFoundError:
        error_msg = "Error: The 'yourbench' command was not found. Please ensure it's installed and in your PATH."
        print(error_msg)
        raise ValueError("Error in process")


run_yourbench()
