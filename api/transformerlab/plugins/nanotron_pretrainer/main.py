import os
import re
import subprocess

import torch
import yaml
from transformerlab.sdk.v1.train import tlab_trainer


def get_gpu_count():
    """Get the number of available GPUs using PyTorch"""
    try:
        if torch.cuda.is_available():
            return torch.cuda.device_count()
    except Exception as e:
        print(f"Failed to get GPU count using PyTorch: {e}")

    print("Could not determine GPU count, defaulting to 1")
    return 1


def generate_nanotron_config():
    """
    Generate YAML configuration for Nanotron from input parameters

    Args:
        config: Dictionary containing configuration parameters

    Returns:
        dict: Complete Nanotron configuration
    """
    # Format the run name with job ID
    run_name = (
        tlab_trainer.params.get("template_name", "nanotron_run")
        + "_"
        + str(tlab_trainer.params.job_id)
    )
    from transformerlab.plugin import WORKSPACE_DIR

    checkpoint_path = os.path.join(WORKSPACE_DIR, "models", "pretrained", run_name, "checkpoints")

    MODEL_SIZES: dict[str, tuple[int, int, int, int, int]] = {
        # (layers, hidden, heads, kv_heads, ffn_size)
        "160M": (12, 768, 12, 12, 3072),  # ~160M params
        "410M": (24, 1024, 16, 16, 4096),  # ~410M params
        # Small to medium models
        "1B": (16, 2048, 16, 16, 5632),  # ~1B params
        "3B": (28, 3072, 32, 32, 8192),  # ~3B params
        # Standard sizes
        "7B": (32, 4096, 32, 32, 11008),  # ~7B params
        "13B": (40, 5120, 40, 40, 13824),  # ~13B params
        # Large models
        "30B": (60, 6656, 52, 52, 17920),  # ~30B params
        "70B": (80, 8192, 64, 8, 28672),  # ~70B params (MQA)
    }

    model_size = tlab_trainer.params.get("model_size", "custom")
    if model_size not in MODEL_SIZES:
        layers = int(tlab_trainer.params.get("model_num_layers", 2))
        hidden = int(tlab_trainer.params.get("model_hidden_size", 16))
        heads = int(tlab_trainer.params.get("model_num_attention_heads", 4))
        kv_heads = int(tlab_trainer.params.get("model_num_key_value_heads", 4))
        intermediate = int(tlab_trainer.params.get("model_intermediate_size", 64))
    else:
        layers, hidden, heads, kv_heads, intermediate = MODEL_SIZES[
            tlab_trainer.params.get("model_size")
        ]

    # Create the config dictionary
    nanotron_config = {
        "checkpoints": {
            "checkpoint_interval": int(tlab_trainer.params.get("checkpoint_interval", 1000)),
            "checkpoints_path": checkpoint_path,
            "checkpoints_path_is_shared_file_system": False,
            "resume_checkpoint_path": None,
            "save_initial_state": False,
            "save_final_state": True,
        },
        "data_stages": [
            {
                "data": {
                    "dataset": {
                        "dataset_overwrite_cache": False,
                        "dataset_processing_num_proc_per_process": 1,
                        "hf_dataset_config_name": None,
                        "hf_dataset_or_datasets": tlab_trainer.params.get(
                            "dataset_name", "stas/openwebtext-10k"
                        ),
                        "hf_dataset_splits": tlab_trainer.params.get("dataset_split", "train"),
                        "text_column_name": tlab_trainer.params.get("text_column_name", "text"),
                    },
                    "num_loading_workers": 1,
                    "seed": int(tlab_trainer.params.get("seed", 42)),
                },
                "name": "Stable Training Stage",
                "start_training_step": 1,
            },
            {
                "data": {
                    "dataset": {
                        "dataset_overwrite_cache": False,
                        "dataset_processing_num_proc_per_process": 1,
                        "hf_dataset_config_name": None,
                        "hf_dataset_or_datasets": tlab_trainer.params.get(
                            "dataset_name", "stas/openwebtext-10k"
                        ),
                        "hf_dataset_splits": tlab_trainer.params.get("dataset_split", "train"),
                        "text_column_name": tlab_trainer.params.get("text_column_name", "text"),
                    },
                    "num_loading_workers": 1,
                    "seed": int(tlab_trainer.params.get("seed", 42)),
                },
                "name": "Annealing Phase",
                "start_training_step": int(tlab_trainer.params.get("annealing_start_step", 10)),
            },
        ],
        "general": {
            "benchmark_csv_path": None,
            "consumed_train_samples": None,
            "ignore_sanity_checks": True,
            "project": "TLab_Pretraining",
            "run": run_name,
            "seed": int(tlab_trainer.params.get("seed", 42)),
            "step": None,
        },
        "lighteval": None,
        "logging": {
            "iteration_step_info_interval": 1,
            "log_level": "info",
            "log_level_replica": "info",
        },
        "model": {
            "ddp_bucket_cap_mb": 25,
            "dtype": tlab_trainer.params.get("mixed_precision", "bfloat16"),
            "init_method": {"std": 0.025},
            "make_vocab_size_divisible_by": 1,
            "model_config": {
                "bos_token_id": 1,
                "eos_token_id": 2,
                "hidden_act": "silu",
                "hidden_size": hidden,
                "initializer_range": 0.02,
                "intermediate_size": intermediate,
                "is_llama_config": True,
                "max_position_embeddings": int(
                    tlab_trainer.params.get("maximum_sequence_length", 256)
                ),
                "num_attention_heads": heads,
                "num_hidden_layers": layers,
                "num_key_value_heads": kv_heads,
                "pad_token_id": None,
                "pretraining_tp": 1,
                "rms_norm_eps": 1.0e-05,
                "rope_scaling": None,
                "tie_word_embeddings": True,
                "use_cache": True,
                "vocab_size": 256,  # Will be determined by the tokenizer in practice
            },
        },
        "optimizer": {
            "accumulate_grad_in_fp32": True,
            "clip_grad": 1.0,
            "learning_rate_scheduler": {
                "learning_rate": float(tlab_trainer.params.get("learning_rate", 5e-4)),
                "lr_decay_starting_step": None,
                "lr_decay_steps": int(tlab_trainer.params.get("train_steps", 10000))
                - int(tlab_trainer.params.get("warmup_steps", 2)),
                "lr_decay_style": "cosine",
                "lr_warmup_steps": int(tlab_trainer.params.get("warmup_steps", 2)),
                "lr_warmup_style": "linear",
                "min_decay_lr": 1.0e-05,
            },
            "optimizer_factory": {
                "adam_beta1": 0.9,
                "adam_beta2": 0.95,
                "adam_eps": 1.0e-08,
                "name": "adamW",
                "torch_adam_is_fused": True,
            },
            "weight_decay": float(tlab_trainer.params.get("weight_decay", 0.01)),
            "zero_stage": 0,
        },
        "parallelism": {
            "dp": int(tlab_trainer.params.get("data_parallel_size", 2)),
            "expert_parallel_size": 1,
            "pp": int(tlab_trainer.params.get("pipeline_parallel_size", 1)),
            "pp_engine": "1f1b",
            "tp": int(tlab_trainer.params.get("tensor_parallel_size", 1)),
            "tp_linear_async_communication": True,
            "tp_mode": "REDUCE_SCATTER",
        },
        "profiler": None,
        "tokenizer": {
            "tokenizer_max_length": None,
            "tokenizer_name_or_path": tlab_trainer.params.get(
                "tokenizer_name", "robot-test/dummy-tokenizer-wordlevel"
            ),
            "tokenizer_revision": None,
        },
        "tokens": {
            "batch_accumulation_per_replica": 1,
            "limit_test_batches": 0,
            "limit_val_batches": 0,
            "micro_batch_size": int(tlab_trainer.params.get("micro_batch_size", 2)),
            "sequence_length": int(tlab_trainer.params.get("maximum_sequence_length", 256)),
            "train_steps": int(tlab_trainer.params.get("train_steps", 10000)),
            "val_check_interval": -1,
        },
    }

    return nanotron_config


@tlab_trainer.job_wrapper(wandb_project_name="TLab_Pretraining")
def train_model():
    """Main training function using TrainerTLabPlugin"""

    # Create the Nanotron configuration
    nanotron_config = generate_nanotron_config()

    # Set up output paths
    run_name = (
        tlab_trainer.params.get("template_name", "nanotron_run")
        + "_"
        + str(tlab_trainer.params.job_id)
    )

    # Create output directories
    from transformerlab.plugin import WORKSPACE_DIR

    output_path = os.path.join(
        WORKSPACE_DIR, "models", "pretrained", run_name, "nanotron_config_files"
    )
    os.makedirs(output_path, exist_ok=True)
    # Save the configuration to a YAML file
    config_path = os.path.join(output_path, f"{run_name}.yaml")
    with open(config_path, "w") as f:
        yaml.dump(nanotron_config, f, default_flow_style=False)

    # Get the number of GPUs to use
    if tlab_trainer.params.gpu_ids and tlab_trainer.params.gpu_ids.lower() != "auto":
        # Use specified GPU IDs
        gpu_ids = tlab_trainer.params.gpu_ids.split(",")
        num_gpus = len(gpu_ids)
        os.environ["CUDA_VISIBLE_DEVICES"] = tlab_trainer.params.gpu_ids
    else:
        # Get GPU count
        num_gpus = get_gpu_count()
    # Create run_train.py script
    from transformerlab.plugin import WORKSPACE_DIR

    run_train_path = os.path.join(
        WORKSPACE_DIR, "plugins", "nanotron_pretrainer", "nanotron", "run_train.py"
    )

    # Run training with torchrun
    env = os.environ.copy()
    env["CUDA_DEVICE_MAX_CONNECTIONS"] = "1"

    cmd = [
        "torchrun",
        f"--nproc_per_node={num_gpus}",
        run_train_path,
        "--config-file",
        config_path,
    ]

    print(f"Running Nanotron with command: {' '.join(cmd)}")

    process = subprocess.Popen(
        cmd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        universal_newlines=True,
        bufsize=1,
    )

    # Process output line by line
    for line in iter(process.stdout.readline, ""):
        print(line.rstrip())  # Echo the output

        # Look for iteration information
        if "[INFO|" in line and "iteration:" in line:
            try:
                # Extract iteration information using regex
                iteration_match = re.search(r"iteration: (\d+) / (\d+)", line)
                if iteration_match:
                    current_iter = int(iteration_match.group(1))
                    total_iter = int(iteration_match.group(2))

                    # Calculate progress as percentage
                    progress_percentage = min(100, (current_iter / total_iter) * 100)

                    # Update job progress
                    tlab_trainer.progress_update(progress_percentage)

                    # Extract other metrics for TensorBoard
                    # Loss
                    loss_match = re.search(r"lm_loss: ([\d.]+)", line)
                    if loss_match:
                        loss_value = float(loss_match.group(1))
                        tlab_trainer.log_metric("train/loss", loss_value, current_iter)

                    # Learning rate
                    lr_match = re.search(r"lr: ([\d.e\-]+)", line)
                    if lr_match:
                        lr_value = float(lr_match.group(1))
                        tlab_trainer.log_metric("train/learning_rate", lr_value, current_iter)

                    # Tokens per second
                    tps_match = re.search(r"tokens_per_sec: ([\d.]+)K", line)
                    if tps_match:
                        tps_value = float(tps_match.group(1)) * 1000  # Convert K to actual value
                        tlab_trainer.log_metric("system/tokens_per_sec", tps_value, current_iter)

                    # Gradient norm
                    grad_norm_match = re.search(r"grad_norm: ([\d.]+)", line)
                    if grad_norm_match:
                        grad_norm_value = float(grad_norm_match.group(1))
                        tlab_trainer.log_metric(
                            "train/gradient_norm", grad_norm_value, current_iter
                        )

                    # Hardware TFLOPS per GPU
                    tflops_match = re.search(r"hardware_tflops_per_gpu: ([\d.]+)", line)
                    if tflops_match:
                        tflops_value = float(tflops_match.group(1))
                        tlab_trainer.log_metric("system/tflops_per_gpu", tflops_value, current_iter)

            except Exception as e:
                print(f"Error parsing progress: {e}")

    # Wait for process to complete
    process.wait()

    # Ensure we mark the job as 100% complete when done
    tlab_trainer.progress_update(100)

    # Convert Nanotron checkpoint to HF format
    from transformerlab.plugin import WORKSPACE_DIR

    checkpoint_path = os.path.join(WORKSPACE_DIR, "models", "pretrained", run_name, "checkpoints")
    try:
        with open(os.path.join(checkpoint_path, "latest.txt")) as f:
            latest_checkpoint = f.read().strip()

        from transformerlab.plugin import WORKSPACE_DIR

        save_path = os.path.join(WORKSPACE_DIR, "models", run_name)
        latest_checkpoint_path = os.path.join(checkpoint_path, latest_checkpoint)
        print("Latest checkpoint path:", latest_checkpoint_path)
        print("Save path:", save_path)

        from transformerlab.plugin import WORKSPACE_DIR

        convert_script_path = os.path.join(
            WORKSPACE_DIR, "plugins", "nanotron_pretrainer", "convert_nanotron_to_hf.py"
        )

        cmd_convert = [
            "torchrun",
            "--nproc_per_node=1",
            convert_script_path,
            "--checkpoint_path",
            latest_checkpoint_path,
            "--save_path",
            save_path,
            "--tokenizer_name",
            tlab_trainer.params.get("tokenizer_name", "robot-test/dummy-tokenizer-wordlevel"),
        ]

        process_convert = subprocess.Popen(
            cmd_convert,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
        )

        for line in iter(process_convert.stdout.readline, ""):
            print(line.rstrip())  # Echo the output

        process_convert.wait()

        # Import the model into TransformerLab
        try:
            json_data = {
                "description": f"An embedding model trained and generated by Transformer Lab based on {tlab_trainer.params.embedding_model}"
            }
            tlab_trainer.create_transformerlab_model(
                run_name,
                "LlamaForCausalLM",
                json_data=json_data,
            )

        except Exception as e:
            print(f"Warning: Failed to import model to Transformer Lab: {e}")

        return True

    except Exception as e:
        print(f"Error during conversion: {e}")
        raise


train_model()
