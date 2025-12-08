import json
import os
import re
import subprocess

import pandas as pd
from lab import storage
from transformerlab.plugin import get_python_executable
from transformerlab.sdk.v1.evals import tlab_evals


def get_detailed_file_names(output_file_path, prefix="samples_", suffix=".jsonl"):
    """This function is necessary to fetch all the .jsonl files that EleutherAI LM Evaluation Harness
    generates so we can make a metrics_df out of the results for each test case"""
    try:
        matching_files = []
        # Use storage.walk to support fsspec and local uniformly
        try:
            for root, _dirs, files in storage.walk(output_file_path):
                for file in files:
                    if file.startswith(prefix) and file.endswith(suffix):
                        matching_files.append(storage.join(root, file))
            return matching_files
        except Exception:
            # Fallback to local os.walk if storage.walk fails
            for root, _dirs, files in os.walk(output_file_path):
                for file in files:
                    if file.startswith(prefix) and file.endswith(suffix):
                        matching_files.append(os.path.join(root, file))
            return matching_files
    except Exception as e:
        print(f"An error occurred while getting the output file name: {e}")
        return []


@tlab_evals.job_wrapper()
def run_evaluation():
    """Run the Diffusion LLM Evaluation using dllm eval scripts"""

    # Validate parameters
    if not tlab_evals.params.model_name or tlab_evals.params.model_name == "":
        raise ValueError("No model provided. Please re-run after setting a Foundation model.")

    # Validate model_type
    model_type = tlab_evals.params.model_type.lower()
    if isinstance(model_type, list):
        model_type = model_type[0]
    if model_type not in ["bert", "dream", "llada"]:
        raise ValueError(f"Invalid model_type '{model_type}'. Must be one of: bert, dream, llada")

    # If tlab_evals.params.tasks is a json string of list of tasks, convert to comma-separated string
    if isinstance(tlab_evals.params.tasks, str):
        try:
            tasks_list = json.loads(tlab_evals.params.tasks)
            if isinstance(tasks_list, list):
                tlab_evals.params.tasks = ",".join(tasks_list)
            else:
                raise ValueError("Tasks should be a list of task names.")
        except json.JSONDecodeError:
            # assuming older tasks which were sent as a comma-separated string
            pass

    if tlab_evals.params.limit:
        limit_val = float(tlab_evals.params.limit)
        if limit_val < 0:
            raise ValueError("Limit must be a positive number.")
        if limit_val > 1:
            raise ValueError("Limit should be between 0 and 1.")
        if limit_val == 1:
            tlab_evals.params.limit = None

    # Use model_path as model_name if provided
    model_name = tlab_evals.params.model_name
    if tlab_evals.params.model_path and tlab_evals.params.model_path.strip() != "":
        model_name = tlab_evals.params.model_path
        print(f"Model path provided. Using model path as model name: {model_name}")

    # Get plugin directory
    plugin_dir = os.path.realpath(os.path.dirname(__file__))

    # Prepare output directory
    output_path = tlab_evals.get_output_file_path(dir_only=True)

    # Find dllm directory - it should be in the plugin directory (cloned by setup.sh)
    dllm_dir = os.path.join(plugin_dir, "dllm")

    if not os.path.exists(dllm_dir):
        raise RuntimeError(
            f"dllm directory not found at {dllm_dir}. "
            f"Please run the plugin setup script first to clone and install dllm."
        )

    print(f"Using dllm from: {dllm_dir}")

    # Set up environment similar to dllm_trainer_multi_gpu
    def setup_accelerate_environment():
        """Set up the environment for the accelerate launch subprocess"""
        current_dir = os.path.dirname(os.path.abspath(__file__))
        api_dir = os.path.abspath(os.path.join(current_dir, "../../.."))
        env = os.environ.copy()
        python_executable = get_python_executable(plugin_dir)
        env["PATH"] = python_executable.replace("/python", ":") + env["PATH"]
        tlab_source_dir = os.environ.get("_TFL_SOURCE_CODE_DIR")
        python_path = env.get("PYTHONPATH", "")
        paths_to_include = [api_dir]

        if tlab_source_dir:
            tlabab_sdk_path = os.path.join(tlab_source_dir, "transformerlab", "plugin_sdk")
            paths_to_include.append(tlabab_sdk_path)
            plugin_parent = os.path.join(tlab_source_dir, "transformerlab")
            paths_to_include.append(plugin_parent)

        # Add dllm to PYTHONPATH
        # dllm is cloned into the plugin directory by setup.sh
        if os.path.exists(dllm_dir):
            paths_to_include.append(dllm_dir)

        if python_path:
            paths_to_include.append(python_path)

        env["PYTHONPATH"] = ":".join(paths_to_include)
        return env

    # Build model_args based on model_type
    model_args_parts = [f"pretrained={model_name}"]

    # Common parameters
    model_args_parts.append(f"mc_num={tlab_evals.params.mc_num}")
    model_args_parts.append(f"max_new_tokens={tlab_evals.params.max_new_tokens}")
    model_args_parts.append(f"steps={tlab_evals.params.steps}")

    # Model-specific parameters
    if model_type in ["bert", "llada"]:
        model_args_parts.append(f"block_length={tlab_evals.params.block_length}")
        model_args_parts.append(f"cfg={tlab_evals.params.cfg_scale}")
        model_args_parts.append("is_check_greedy=False")
    elif model_type == "dream":
        model_args_parts.append(f"temperature={tlab_evals.params.temperature}")
        model_args_parts.append(f"top_p={tlab_evals.params.top_p}")
        model_args_parts.append("add_bos_token=true")
        model_args_parts.append("escape_until=true")

    model_args = ",".join(model_args_parts)

    # Build command using accelerate launch with the eval.py script directly
    # This matches the pattern from dllm README
    # Use relative path from dllm directory
    eval_script_path = f"dllm/pipelines/{model_type}/eval.py"

    full_eval_script_path = os.path.join(dllm_dir, "dllm", "pipelines", model_type, "eval.py")
    if not os.path.exists(full_eval_script_path):
        raise RuntimeError(
            f"Eval script not found at {full_eval_script_path}. Make sure dllm is properly installed."
        )

    # Use accelerate launch to run the eval script (same as dllm_trainer_multi_gpu)
    command = [
        "accelerate",
        "launch",
        "--num_processes",
        "1",  # Single process for now, can be made configurable
        eval_script_path,
        "--tasks",
        tlab_evals.params.tasks,
        "--model",
        model_type,
        "--model_args",
        model_args,
        "--log_samples",
    ]

    # Add limit if provided
    if tlab_evals.params.limit and float(tlab_evals.params.limit) != 1.0:
        command.extend(["--limit", str(tlab_evals.params.limit)])

    # Add num_fewshot if provided
    if tlab_evals.params.num_fewshot and int(tlab_evals.params.num_fewshot) > 0:
        command.extend(["--num_fewshot", str(tlab_evals.params.num_fewshot)])

    # Add apply_chat_template if requested
    if tlab_evals.params.apply_chat_template:
        command.append("--apply_chat_template")

    # Add batch_size (default to 1 if not specified)
    command.extend(["--batch_size", "1"])

    # Add output path
    command.extend(["--output_path", output_path])

    print("Running command: $ " + " ".join(command))
    print("--Beginning to run evaluations (please wait)...")

    # Set up environment for accelerate
    env = setup_accelerate_environment()

    # Run subprocess
    # The eval script will be run from the dllm directory context
    with subprocess.Popen(
        command,
        cwd=dllm_dir,  # Run from dllm directory so relative imports work
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        bufsize=1,
        universal_newlines=True,
        env=env,
    ) as process:
        for line in process.stdout:
            print(line.strip())
            # Parse progress from output
            pattern = r"^Running.*?(\d+)%\|"
            match = re.search(pattern, line)
            if match:
                tlab_evals.progress_update(int(match.group(1)))

    # Get detailed report files
    detailed_report_files = get_detailed_file_names(output_path)

    # Process results
    metrics_list = []

    # Extract metrics from detailed reports
    for task_name in tlab_evals.params.tasks.split(","):
        for file in detailed_report_files:
            if task_name in file:
                df = pd.read_json(file, lines=True)
                # Try to get accuracy metric, fallback to other metrics
                if "acc" in df.columns:
                    avg_score = df["acc"].mean()
                    score_col = "acc"
                elif "exact_match" in df.columns:
                    avg_score = df["exact_match"].mean()
                    score_col = "exact_match"
                elif "f1" in df.columns:
                    avg_score = df["f1"].mean()
                    score_col = "f1"
                else:
                    # Use first numeric column
                    numeric_cols = df.select_dtypes(include=["number"]).columns
                    if len(numeric_cols) > 0:
                        avg_score = df[numeric_cols[0]].mean()
                        score_col = numeric_cols[0]
                    else:
                        print(f"Warning: No numeric metric found for task {task_name}")
                        continue

                # Log to tensorboard
                tlab_evals.log_metric(task_name, avg_score)

                # Build metrics dataframe
                for index, row in df.iterrows():
                    metrics_list.append(
                        {
                            "test_case_id": f"test_case_{row.get('doc_id', index)}",
                            "metric_name": task_name,
                            "score": row[score_col] if score_col in row else 0.0,
                            "input": row.get("doc", row.get("input", "")),
                            "expected_output": row.get("target", row.get("expected_output", "")),
                        }
                    )

    # Create metrics DataFrame
    metrics_df = pd.DataFrame(metrics_list)

    # Save results using plugin's method
    output_path, plot_data_path = tlab_evals.save_evaluation_results(metrics_df)

    print("--Evaluation task complete")
    return output_path, plot_data_path


# Run the evaluation when script is executed
run_evaluation()
