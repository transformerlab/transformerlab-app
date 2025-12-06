import json
import os
import re
import subprocess
import traceback

import pandas as pd
import torch
from lab import storage
from transformerlab.plugin import get_python_executable
from transformerlab.sdk.v1.evals import tlab_evals


def get_detailed_file_names(output_file_path, prefix="samples_", suffix=".jsonl"):
    """This function is necessary to fetch all the .jsonl files that EleutherAI LM Evaluation Harness generates so we can make a metrics_df out of the results for each test case"""
    try:
        matching_files = []
        # Prefer storage.walk (fsspec-compatible), with local fallback
        try:
            for root, _dirs, files in storage.walk(output_file_path):
                for file in files:
                    if file.startswith(prefix) and file.endswith(suffix):
                        matching_files.append(storage.join(root, file))
            return matching_files
        except Exception:
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
    """Run the MLX Evaluation Harness"""
    try:
        # Validate parameters
        if not tlab_evals.params.model_name or tlab_evals.params.model_name == "":
            raise ValueError("No model provided. Please re-run after setting a Foundation model.")

        if tlab_evals.params.limit:
            limit_val = float(tlab_evals.params.limit)
            if limit_val < 0:
                raise ValueError("Limit must be a positive number.")
            if limit_val > 1:
                raise ValueError("Limit should be between 0 and 1.")
            if limit_val == 1:
                limit_val = 1.0

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

        # Use model_path as model_name if provided
        model_name = tlab_evals.params.model_name
        if tlab_evals.params.model_path and tlab_evals.params.model_path.strip() != "":
            model_name = tlab_evals.params.model_path
            print(f"Model path provided. Using model path as model name: {model_name}")

        # Check if CUDA is available
        if torch.cuda.is_available():
            raise ValueError(
                "CUDA is available. Please use the `eleuther-ai-lm-evaluation-harness-plugin`."
            )

        # Get plugin directory
        plugin_dir = os.path.realpath(os.path.dirname(__file__))

        # Get Python executable (from venv if available)
        python_executable = get_python_executable(plugin_dir)

        # Prepare output directory for lm-eval
        output_path = tlab_evals.get_output_file_path(dir_only=True)

        # Build model args
        model_args = f"model={model_name},trust_remote_code=True"

        # Build command
        command = [
            python_executable,
            "-m",
            "lm_eval",
            "--model",
            "mlx",
            "--model_args",
            model_args,
            "--tasks",
            tlab_evals.params.tasks,
            "--log_samples",
        ]

        # Add limit if provided
        if tlab_evals.params.limit and float(tlab_evals.params.limit) != 1.0:
            command.extend(["--limit", str(tlab_evals.params.limit)])

        # Add output path
        command.extend(["--output_path", output_path])

        print("Running command: $ " + " ".join(command))
        print("--Beginning to run evaluations (please wait)...")

        # Run subprocess
        with subprocess.Popen(
            command,
            cwd=plugin_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True,
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
        scores_list = []

        # Extract metrics from detailed reports
        for task_name in tlab_evals.params.tasks.split(","):
            for file in detailed_report_files:
                if task_name in file:
                    df = pd.read_json(file, lines=True)
                    avg_score = df["acc"].mean()

                    # Log to tensorboard
                    tlab_evals.log_metric(task_name, avg_score)
                    scores_list.append({"type": task_name, "score": avg_score})

                    # Build metrics dataframe
                    for _, row in df.iterrows():
                        metrics_list.append(
                            {
                                "test_case_id": f"test_case_{row['doc_id']}",
                                "metric_name": task_name,
                                "score": row["acc"],
                                "input": row["doc"],
                                "expected_output": row.get("target", ""),
                            }
                        )

        # Create metrics DataFrame
        metrics_df = pd.DataFrame(metrics_list)

        # Save results using plugin's method
        tlab_evals.save_evaluation_results(metrics_df)

        print("Evaluation completed successfully.")

        return True

    except Exception as e:
        print(f"An error occurred while running the evaluation harness: {e}")
        traceback.print_exc()
        raise


# Run the evaluation when script is executed
run_evaluation()
