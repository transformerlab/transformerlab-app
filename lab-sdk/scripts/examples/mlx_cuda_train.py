#!/usr/bin/env python3
"""
MLX LoRA training script using MLX-LM to demonstrate lab SDK integration
for language model fine-tuning with CUDA backend.

This script demonstrates:
- LoRA fine-tuning using MLX with CUDA backend
- Training on HuggingFace datasets
- Using Qwen3 0.6B model
"""

import os
import argparse
import json
import subprocess
import re
import time
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, TemplateError

from lab import lab


def setup_cuda_backend():
    """
    Attempt to set up CUDA backend for MLX.
    Sets CUDA_HOME/CUDA_PATH if not set and CUDA is available.
    Returns True if CUDA backend should be used, False otherwise.
    """
    # Check if CUDA_HOME or CUDA_PATH is already set
    cuda_home = os.environ.get("CUDA_HOME") or os.environ.get("CUDA_PATH")

    if cuda_home:
        lab.log(f"CUDA environment variable found: {cuda_home}")
        return True

    # Try to find CUDA installation
    common_cuda_paths = [
        "/usr/local/cuda",
        "/usr/local/cuda-12.0",
        "/usr/local/cuda-11.8",
        "/opt/cuda",
        "/usr/lib/cuda",
    ]

    for cuda_path in common_cuda_paths:
        if os.path.exists(cuda_path) and os.path.isdir(cuda_path):
            os.environ["CUDA_HOME"] = cuda_path
            os.environ["CUDA_PATH"] = cuda_path
            lab.log(f"✅ Found CUDA installation at: {cuda_path}")
            return True

    # Check if nvcc is in PATH (indicates CUDA is installed)
    try:
        result = subprocess.run(["which", "nvcc"], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            nvcc_path = result.stdout.strip()
            # Extract CUDA_HOME from nvcc path (usually .../bin/nvcc)
            cuda_home = os.path.dirname(os.path.dirname(nvcc_path))
            os.environ["CUDA_HOME"] = cuda_home
            os.environ["CUDA_PATH"] = cuda_home
            lab.log(f"✅ Found CUDA via nvcc at: {cuda_home}")
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    # Check if nvidia-smi is available (indicates NVIDIA GPU driver)
    try:
        result = subprocess.run(["nvidia-smi", "--version"], capture_output=True, text=True, timeout=2)
        if result.returncode == 0:
            lab.log("⚠️  NVIDIA GPU detected but CUDA_HOME not set")
            lab.log("   MLX will attempt to use CUDA, but may fail if CUDA toolkit is not properly installed")
            lab.log("   Consider setting CUDA_HOME environment variable manually")
            return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return False


def prepare_dataset_for_mlx(dataset_name: str, output_dir: str, template: str = "{{prompt}}{{completion}}"):
    """
    Load a HuggingFace dataset and prepare it in MLX format (JSONL files) using a Jinja template.

    Args:
        dataset_name: HuggingFace dataset name (e.g., "Trelis/touch-rugby-rules")
        output_dir: Directory to save the prepared dataset files
        template: Jinja2 template string for formatting each example (default: "{{prompt}}{{completion}}")

    Returns:
        Path to the data directory containing train.jsonl and valid.jsonl
    """
    try:
        from datasets import load_dataset
    except ImportError:
        raise ImportError("datasets library not available. Install with: pip install datasets")

    lab.log(f"Loading dataset from HuggingFace: {dataset_name}")

    # Load the dataset
    try:
        dataset = load_dataset(dataset_name)
    except Exception as e:
        lab.log(f"Error loading dataset: {e}")
        raise

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # MLX expects JSONL files with 'text' field
    # Convert the dataset to the expected format
    train_file = os.path.join(output_dir, "train.jsonl")
    valid_file = os.path.join(output_dir, "valid.jsonl")

    # Determine which splits are available
    splits = list(dataset.keys())
    lab.log(f"Available dataset splits: {splits}")

    # Use 'train' split if available, otherwise use the first split
    train_split = "train" if "train" in splits else splits[0]
    valid_split = "validation" if "validation" in splits else ("test" if "test" in splits else None)

    # Get column names from the first example to help users understand available fields
    train_data = dataset[train_split]
    if len(train_data) > 0:
        first_example = train_data[0]
        available_columns = list(first_example.keys())
        lab.log(f"Available columns in dataset: {available_columns}")
        lab.log(f"Using template: {template}")

    # Create Jinja2 template
    try:
        jinja_env = Environment()
        jinja_template = jinja_env.from_string(template)
    except Exception as e:
        lab.log(f"Error parsing Jinja template: {e}")
        raise ValueError(f"Invalid Jinja template: {e}")

    # Process training data
    lab.log(f"Processing {len(train_data)} training examples...")
    processed_count = 0
    error_count = 0

    with open(train_file, "w", encoding="utf-8") as f:
        for example in train_data:
            try:
                # Render template with example data
                text = jinja_template.render(**example)
                # Write as JSONL
                json.dump({"text": text}, f, ensure_ascii=False)
                f.write("\n")
                processed_count += 1
            except TemplateError as e:
                error_count += 1
                lab.log(f"Warning: Template error for example {processed_count + error_count}: {e}")
                # Fallback: try to use the template with string conversion of all values
                try:
                    example_str = {k: str(v) if not isinstance(v, str) else v for k, v in example.items()}
                    text = jinja_template.render(**example_str)
                    json.dump({"text": text}, f, ensure_ascii=False)
                    f.write("\n")
                    processed_count += 1
                    error_count -= 1
                except Exception:
                    # Last resort: skip this example
                    lab.log(f"Warning: Skipping example {processed_count + error_count} due to template error")
            except Exception as e:
                error_count += 1
                lab.log(f"Warning: Error processing example {processed_count + error_count}: {e}")

    lab.log(f"✅ Created {train_file} with {processed_count} examples")
    if error_count > 0:
        lab.log(f"⚠️  Skipped {error_count} examples due to errors")

    # Process validation data if available
    if valid_split:
        valid_data = dataset[valid_split]
        lab.log(f"Processing {len(valid_data)} validation examples...")
        processed_count = 0
        error_count = 0

        with open(valid_file, "w", encoding="utf-8") as f:
            for example in valid_data:
                try:
                    # Render template with example data
                    text = jinja_template.render(**example)
                    json.dump({"text": text}, f, ensure_ascii=False)
                    f.write("\n")
                    processed_count += 1
                except TemplateError as e:
                    error_count += 1
                    lab.log(f"Warning: Template error for validation example {processed_count + error_count}: {e}")
                    # Fallback: try to use the template with string conversion of all values
                    try:
                        example_str = {k: str(v) if not isinstance(v, str) else v for k, v in example.items()}
                        text = jinja_template.render(**example_str)
                        json.dump({"text": text}, f, ensure_ascii=False)
                        f.write("\n")
                        processed_count += 1
                        error_count -= 1
                    except Exception:
                        lab.log(
                            f"Warning: Skipping validation example {processed_count + error_count} due to template error"
                        )
                except Exception as e:
                    error_count += 1
                    lab.log(f"Warning: Error processing validation example {processed_count + error_count}: {e}")

        lab.log(f"✅ Created {valid_file} with {processed_count} examples")
        if error_count > 0:
            lab.log(f"⚠️  Skipped {error_count} validation examples due to errors")
    else:
        # Create a small validation set from training data
        lab.log("No validation split found, creating validation set from training data...")
        valid_size = min(100, len(train_data) // 10)
        valid_data = train_data.select(range(valid_size))
        processed_count = 0
        error_count = 0

        with open(valid_file, "w", encoding="utf-8") as f:
            for example in valid_data:
                try:
                    # Render template with example data
                    text = jinja_template.render(**example)
                    json.dump({"text": text}, f, ensure_ascii=False)
                    f.write("\n")
                    processed_count += 1
                except TemplateError as e:
                    error_count += 1
                    lab.log(f"Warning: Template error for validation example {processed_count + error_count}: {e}")
                    # Fallback: try to use the template with string conversion of all values
                    try:
                        example_str = {k: str(v) if not isinstance(v, str) else v for k, v in example.items()}
                        text = jinja_template.render(**example_str)
                        json.dump({"text": text}, f, ensure_ascii=False)
                        f.write("\n")
                        processed_count += 1
                        error_count -= 1
                    except Exception:
                        lab.log(
                            f"Warning: Skipping validation example {processed_count + error_count} due to template error"
                        )
                except Exception as e:
                    error_count += 1
                    lab.log(f"Warning: Error processing validation example {processed_count + error_count}: {e}")

        lab.log(f"✅ Created {valid_file} with {processed_count} examples")
        if error_count > 0:
            lab.log(f"⚠️  Skipped {error_count} validation examples due to errors")

    return output_dir


def train_mlx_lora():
    """
    Training function using MLX-LM LoRA with lab SDK integration.

    This function reads all training parameters from lab.get_config(), which can be
    set via the UI when creating/launching the task.
    """

    try:
        # Initialize lab (auto-loads parameters from job_data if available)
        lab.init()

        # Get parameters from task configuration (set via UI)
        # These parameters are accessible via lab.get_config() after lab.init()
        config = lab.get_config()

        # Extract parameters with defaults
        # All these can be set in the UI when creating/launching the task
        model_name = config.get("model_name", "Qwen/Qwen3-0.6B")
        dataset = config.get("dataset", "Trelis/touch-rugby-rules")
        output_dir = config.get("output_dir", "./mlx_output")
        adapter_path = config.get("adapter_path", "./mlx_output/adapters")

        # Convert string values to appropriate types (parameters from sweeps may come as strings)
        iters_raw = config.get("iters", 1000)
        iters = int(iters_raw) if isinstance(iters_raw, (str, int, float)) else iters_raw

        batch_size_raw = config.get("batch_size", 2)
        batch_size = int(batch_size_raw) if isinstance(batch_size_raw, (str, int, float)) else batch_size_raw

        learning_rate_raw = config.get("learning_rate", 1e-5)
        learning_rate = (
            float(learning_rate_raw) if isinstance(learning_rate_raw, (str, int, float)) else learning_rate_raw
        )

        lora_layers_raw = config.get("lora_layers", 16)
        lora_layers = int(lora_layers_raw) if isinstance(lora_layers_raw, (str, int, float)) else lora_layers_raw

        lora_rank_raw = config.get("lora_rank", 8)
        lora_rank = int(lora_rank_raw) if isinstance(lora_rank_raw, (str, int, float)) else lora_rank_raw

        lora_alpha_raw = config.get("lora_alpha", 16)
        lora_alpha = int(lora_alpha_raw) if isinstance(lora_alpha_raw, (str, int, float)) else lora_alpha_raw

        steps_per_report_raw = config.get("steps_per_report", 1)
        steps_per_report = (
            int(steps_per_report_raw) if isinstance(steps_per_report_raw, (str, int, float)) else steps_per_report_raw
        )

        steps_per_eval_raw = config.get("steps_per_eval", 200)
        steps_per_eval = (
            int(steps_per_eval_raw) if isinstance(steps_per_eval_raw, (str, int, float)) else steps_per_eval_raw
        )

        save_every_raw = config.get("save_every", 100)
        save_every = int(save_every_raw) if isinstance(save_every_raw, (str, int, float)) else save_every_raw

        max_seq_length_raw = config.get("max_seq_length", 2048)
        max_seq_length = (
            int(max_seq_length_raw) if isinstance(max_seq_length_raw, (str, int, float)) else max_seq_length_raw
        )

        # Get dataset template (Jinja2 template for formatting examples)
        dataset_template = config.get("dataset_template", "{{prompt}}{{completion}}")

        # Build training config for logging and reference
        training_config = {
            "experiment_name": lab.experiment.id,
            "model_name": model_name,
            "dataset": dataset,
            "task": "lora",
            "output_dir": output_dir,
            "adapter_path": adapter_path,
            "dataset_template": dataset_template,
            "_config": {
                "iters": iters,
                "batch_size": batch_size,
                "learning_rate": learning_rate,
                "lora_layers": lora_layers,
                "lora_rank": lora_rank,
                "lora_alpha": lora_alpha,
                "steps_per_report": steps_per_report,
                "steps_per_eval": steps_per_eval,
                "save_every": save_every,
                "max_seq_length": max_seq_length,
            },
        }

        # Store the full config in job_data for reference
        lab.set_config(training_config)

        # Attempt to set up CUDA backend (after lab.init so lab.log is available)
        use_cuda = setup_cuda_backend()
        if use_cuda:
            os.environ["MLX_DEFAULT_BACKEND"] = "cuda"
            lab.log("🎯 Attempting to use MLX CUDA backend")
        else:
            os.environ["MLX_DEFAULT_BACKEND"] = "cpu"
            lab.log("⚠️  CUDA not available, falling back to CPU backend")

        # Check if we should resume from a checkpoint
        checkpoint = lab.get_checkpoint_to_resume()
        resume_adapter_file = None
        if checkpoint:
            lab.log(f"📁 Resuming training from checkpoint: {checkpoint}")
            # Find adapter files in checkpoint directory
            checkpoint_path = Path(checkpoint)
            adapter_files = list(checkpoint_path.glob("*.safetensors"))
            if adapter_files:
                resume_adapter_file = str(adapter_files[0])
                lab.log(f"Found adapter file: {resume_adapter_file}")

        # Log start time
        start_time = datetime.now()
        lab.log(f"🚀 Training started at {start_time}")
        lab.log(f"MLX Backend: {os.environ.get('MLX_DEFAULT_BACKEND', 'cpu')}")
        lab.log(f"Model: {model_name}")
        lab.log(f"Dataset: {dataset}")
        lab.log(f"Iterations: {iters}")
        lab.log(f"Batch size: {batch_size}")
        lab.log(f"Learning rate: {learning_rate}")
        lab.log(f"LoRA rank: {lora_rank}, alpha: {lora_alpha}, layers: {lora_layers}")

        # Create output directories
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(adapter_path, exist_ok=True)
        lab.update_progress(10)

        # Check if MLX-LM is available
        lab.log("Checking MLX-LM availability...")
        try:
            import importlib.util

            # Check if mlx_lm is available
            if importlib.util.find_spec("mlx_lm") is None:
                raise ImportError("mlx_lm not found")

            import mlx.core as mx

            lab.log("✅ MLX-LM is available")

            # Check MLX backend
            backend = os.environ.get("MLX_DEFAULT_BACKEND", "cpu")
            lab.log(f"MLX backend: {backend}")

            # Try to verify CUDA backend if requested
            if backend == "cuda":
                try:
                    # Try to create a simple array to verify CUDA backend works
                    test_array = mx.array([1.0, 2.0, 3.0])
                    mx.eval(test_array)
                    lab.log("✅ MLX CUDA backend is working")
                except RuntimeError as e:
                    error_msg = str(e)
                    if "CUDA_HOME" in error_msg or "CUDA_PATH" in error_msg:
                        lab.log(f"⚠️  CUDA environment not properly configured: {error_msg}")
                        lab.log("Falling back to CPU backend")
                        os.environ["MLX_DEFAULT_BACKEND"] = "cpu"
                        backend = "cpu"
                    else:
                        lab.log(f"⚠️  Warning: MLX CUDA backend error: {error_msg}")
                        lab.log("Falling back to CPU backend")
                        os.environ["MLX_DEFAULT_BACKEND"] = "cpu"
                        backend = "cpu"
                except Exception as e:
                    lab.log(f"⚠️  Warning: MLX CUDA backend may not be working properly: {e}")
                    lab.log("Falling back to CPU backend")
                    os.environ["MLX_DEFAULT_BACKEND"] = "cpu"
                    backend = "cpu"

            # Update config with actual backend being used
            training_config["_config"]["actual_backend"] = backend
            lab.set_config(training_config)
        except ImportError:
            lab.log("⚠️  MLX-LM not available. Install with: pip install 'mlx[cuda]' mlx-lm")
            lab.finish("Training skipped - MLX-LM not available")
            return {"status": "skipped", "reason": "MLX-LM not available"}

        lab.update_progress(20)

        # Prepare dataset
        lab.log("Preparing dataset...")
        data_dir = os.path.join(output_dir, "data")

        try:
            data_path = prepare_dataset_for_mlx(dataset, data_dir, template=dataset_template)
            lab.log(f"✅ Dataset prepared at: {data_path}")
        except Exception as e:
            lab.log(f"Error preparing dataset: {e}")
            import traceback

            traceback.print_exc()
            lab.finish("Training failed - dataset preparation error")
            return {"status": "error", "error": str(e)}

        lab.update_progress(40)

        # Prepare LoRA config file
        config_file = os.path.join(output_dir, "lora_config.yaml")
        lora_scale = lora_alpha / lora_rank

        config_content = f"""lora_parameters:
  rank: {lora_rank}
  alpha: {lora_alpha}
  scale: {lora_scale}
  dropout: 0.0
"""

        with open(config_file, "w") as f:
            f.write(config_content)
        lab.log(f"✅ Created LoRA config: {config_file}")

        lab.update_progress(50)

        # Start training
        lab.log("🚀 Starting MLX LoRA training...")
        lab.log(f"Training for {iters} iterations...")

        # Prepare training command
        # Use the newer format: python -m mlx_lm lora (instead of mlx_lm.lora)
        train_command = [
            "python",
            "-um",
            "mlx_lm",
            "lora",
            "--model",
            model_name,
            "--data",
            data_path,
            "--adapter-path",
            adapter_path,
            "--train",  # Explicitly specify training mode
            "--iters",
            str(iters),
            "--batch-size",
            str(batch_size),
            "--learning-rate",
            str(learning_rate),
            "--num-layers",
            str(lora_layers),
            "--steps-per-report",
            str(steps_per_report),
            "--steps-per-eval",
            str(steps_per_eval),
            "--save-every",
            str(save_every),
            "--max-seq-length",
            str(max_seq_length),
            "--config",
            config_file,
        ]

        if resume_adapter_file:
            train_command.extend(["--resume-adapter-file", resume_adapter_file])

        lab.log(f"Running command: {' '.join(train_command)}")

        # Track training progress
        start_training_time = time.time()
        last_iteration = 0

        try:
            # Run training process
            with subprocess.Popen(
                train_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True,
                env=os.environ.copy(),
            ) as process:
                for line in process.stdout:
                    print(line, end="", flush=True)

                    # Parse iteration progress
                    iter_match = re.search(r"Iter\s+(\d+):", line)
                    if iter_match:
                        iteration = int(iter_match.group(1))
                        last_iteration = iteration
                        percent_complete = min(100, (iteration / iters) * 100)
                        lab.update_progress(50 + int(percent_complete * 0.4))  # 50-90% range

                        # Calculate estimated time remaining
                        if iteration > 0:
                            elapsed_time = time.time() - start_training_time
                            iterations_remaining = iters - iteration
                            if iterations_remaining > 0:
                                avg_time_per_iter = elapsed_time / iteration
                                estimated_time_remaining = avg_time_per_iter * iterations_remaining
                                lab.log(
                                    f"Progress: {iteration}/{iters} iterations "
                                    f"({percent_complete:.1f}%) - ETA: {int(estimated_time_remaining)}s"
                                )

                    # Parse training loss
                    loss_match = re.search(r"Train loss\s+([\d.]+)", line)
                    if loss_match:
                        loss = float(loss_match.group(1))
                        lab.log(f"📈 Training loss: {loss:.4f}")

                    # Parse validation loss
                    val_loss_match = re.search(r"Val loss\s+([\d.]+)", line)
                    if val_loss_match:
                        val_loss = float(val_loss_match.group(1))
                        lab.log(f"📊 Validation loss: {val_loss:.4f}")

                    # Parse learning rate
                    lr_match = re.search(r"Learning Rate\s+([\d.e-]+)", line)
                    if lr_match:
                        lr = float(lr_match.group(1))
                        lab.log(f"📉 Learning rate: {lr}")

            # Check return code
            if process.returncode != 0:
                lab.log(f"⚠️  Training process exited with code: {process.returncode}")
                lab.finish(f"Training failed with return code {process.returncode}")
                return {"status": "error", "error": f"Process exited with code {process.returncode}"}

            lab.log("✅ Training completed successfully")
            lab.update_progress(90)

        except Exception as e:
            lab.log(f"Error during training: {e}")
            import traceback

            traceback.print_exc()
            lab.finish(f"Training failed: {str(e)}")
            return {"status": "error", "error": str(e)}

        # Calculate training time
        end_time = datetime.now()
        training_duration = end_time - start_time
        lab.log(f"Training completed in {training_duration}")

        # Save training artifacts
        lab.log("💾 Saving training artifacts...")

        # Save training configuration
        config_artifact_path = os.path.join(output_dir, "training_config.json")
        with open(config_artifact_path, "w") as f:
            json.dump(training_config, f, indent=2)

        saved_config_path = lab.save_artifact(config_artifact_path, "training_config.json")
        lab.log(f"✅ Saved training config: {saved_config_path}")

        # Save training summary
        summary_file = os.path.join(output_dir, "training_summary.txt")
        with open(summary_file, "w") as f:
            f.write("MLX LoRA Training Summary\n")
            f.write("=========================\n")
            f.write(f"Training Duration: {training_duration}\n")
            f.write(f"Model: {model_name}\n")
            f.write(f"Dataset: {dataset}\n")
            f.write(f"Iterations: {iters}\n")
            f.write(f"Batch Size: {batch_size}\n")
            f.write(f"Learning Rate: {learning_rate}\n")
            f.write(f"LoRA Rank: {lora_rank}\n")
            f.write(f"LoRA Alpha: {lora_alpha}\n")
            f.write(f"Completed at: {end_time}\n")
            f.write(f"Adapter Path: {adapter_path}\n")

        summary_artifact_path = lab.save_artifact(summary_file, "training_summary.txt")
        lab.log(f"✅ Saved training summary: {summary_artifact_path}")

        # Save adapter checkpoints
        adapter_path_obj = Path(adapter_path)
        if adapter_path_obj.exists():
            adapter_files = list(adapter_path_obj.glob("*.safetensors"))
            if adapter_files:
                # Save the adapter checkpoint directory
                try:
                    saved_checkpoint_path = lab.save_checkpoint(adapter_path, f"mlx_lora_adapter_iter_{last_iteration}")
                    lab.log(f"✅ Saved adapter checkpoint: {saved_checkpoint_path}")
                except Exception as e:
                    lab.log(f"⚠️  Could not save checkpoint: {e}")

        # Save the adapter as a model artifact
        if adapter_path_obj.exists():
            try:
                # Create a model description
                model_name_short = model_name.split("/")[-1]
                adapter_name = f"{model_name_short}_lora_adapter"

                saved_model_path = lab.save_model(
                    adapter_path,
                    name=adapter_name,
                    architecture="MLX",
                    pipeline_tag="text-generation",
                    parent_model=model_name,
                )
                lab.log(f"✅ Adapter saved to Model Zoo: {saved_model_path}")
            except Exception as e:
                lab.log(f"⚠️  Could not save adapter as model: {e}")

        lab.update_progress(100)

        # Get final metrics if available (from training logs)
        final_metrics = {
            "backend": os.environ.get("MLX_DEFAULT_BACKEND", "cpu"),
            "iterations": iters,
            "batch_size": batch_size,
            "learning_rate": learning_rate,
        }

        # Complete the job with metrics
        lab.finish(
            "MLX LoRA training completed successfully",
            score=final_metrics,
        )

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(training_duration),
            "output_dir": output_dir,
            "adapter_path": adapter_path,
            "backend": os.environ.get("MLX_DEFAULT_BACKEND", "cpu"),
            "metrics": final_metrics,
        }

    except KeyboardInterrupt:
        lab.error("Training stopped by user")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        print(f"Training failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train a model with MLX LoRA using lab SDK integration.")
    # All training parameters are now read from lab.get_config() (set via UI)

    args = parser.parse_args()

    print("🚀 Starting MLX LoRA training...")
    print("📋 Training parameters will be read from task configuration")

    result = train_mlx_lora()
    print("Training result:", result)
