#!/usr/bin/env python3
"""
EleutherAI LM Evaluation Harness script with TransformerLab integration.

This script demonstrates:
- Using lab.get_config() to read parameters from task configuration
- Running evaluations on language models using the EleutherAI LM Evaluation Harness
- Saving detailed evaluation results as artifacts
"""

import os
import json
import subprocess
import re
from datetime import datetime

from lab import lab

# Login to huggingface
from huggingface_hub import login

if os.getenv("HF_TOKEN"):
    login(token=os.getenv("HF_TOKEN"))


def get_detailed_file_names(output_file_path, prefix="samples_", suffix=".jsonl"):
    """This function fetches all the .jsonl files that EleutherAI LM Evaluation Harness
    generates so we can process the results for each test case"""
    try:
        matching_files = []
        for root, _dirs, files in os.walk(output_file_path):
            for file in files:
                if file.startswith(prefix) and file.endswith(suffix):
                    matching_files.append(os.path.join(root, file))
        return matching_files
    except Exception as e:
        lab.log(f"An error occurred while getting the output file name: {e}")
        return []


def run_evaluation():
    """Run the EleutherAI LM Evaluation Harness"""

    # Configure GPU usage - use only GPU 0
    os.environ["CUDA_VISIBLE_DEVICES"] = "0"

    try:
        # Initialize lab (auto-loads parameters from job_data if available)
        lab.init()

        # Get parameters from task configuration
        config = lab.get_config()

        # Extract parameters with defaults
        model_name = config.get("model_name", "HuggingFaceTB/SmolLM-135M-Instruct")
        model_path = config.get("model_path", "")
        model_adapter = config.get("model_adapter", "")
        tasks = config.get("tasks", "mmlu_abstract_algebra")
        limit = config.get("limit", "1.0")

        # Validate parameters
        if not model_name or model_name == "":
            lab.error("No model provided. Please re-run after setting a model name.")
            return {"status": "error", "error": "No model provided"}

        # If tasks is a JSON string of list of tasks, convert to comma-separated string
        if isinstance(tasks, str):
            try:
                tasks_list = json.loads(tasks)
                if isinstance(tasks_list, list):
                    tasks = ",".join(tasks_list)
            except json.JSONDecodeError:
                # assuming tasks is already a comma-separated string
                pass

        # Validate limit
        if limit:
            try:
                limit_val = float(limit)
                if limit_val < 0:
                    lab.error("Limit must be a positive number.")
                    return {"status": "error", "error": "Invalid limit value"}
                if limit_val > 1:
                    lab.error("Limit should be between 0 and 1.")
                    return {"status": "error", "error": "Invalid limit value"}
                if limit_val == 1:
                    limit = None
            except ValueError:
                lab.error("Limit must be a number.")
                return {"status": "error", "error": "Invalid limit value"}

        # Use model_path as model_name if provided
        if model_path and model_path.strip() != "":
            model_name = model_path
            lab.log(f"Model path provided. Using model path as model name: {model_name}")

        # Log start time
        start_time = datetime.now()
        lab.log(f"Evaluation started at {start_time}")
        lab.log(f"Model: {model_name}")
        lab.log(f"Tasks: {tasks}")
        lab.log(f"Limit: {limit if limit else 'No limit (all samples)'}")
        lab.log(f"Using GPU: {os.environ.get('CUDA_VISIBLE_DEVICES', 'All available')}")

        # Prepare output directory
        output_dir = "./eval_output"
        os.makedirs(output_dir, exist_ok=True)

        lab.update_progress(10)

        # Determine which model backend to use based on CUDA availability
        try:
            import torch

            use_cuda = torch.cuda.is_available()
        except ImportError:
            use_cuda = False
            lab.log("⚠️  PyTorch not available, attempting CPU-based evaluation")

        if not use_cuda:
            lab.log("CUDA is not available. Running CPU-based evaluation.")

            # Build model args for CPU-based evaluation
            model_args = f"model={model_name},trust_remote_code=True"

            if model_adapter and model_adapter.strip() != "":
                adapter_path = os.path.abspath(model_adapter)
                model_args += f",peft={adapter_path}"
                lab.log(f"Using adapter: {adapter_path}")

            command = [
                "python",
                "-m",
                "lm_eval",
                "--model",
                "hf",
                "--model_args",
                model_args,
                "--tasks",
                tasks,
                "--log_samples",
            ]
        else:
            # Build model args for CUDA-based evaluation
            model_args = f"pretrained={model_name},trust_remote_code=True"

            if model_adapter and model_adapter.strip() != "":
                adapter_path = os.path.abspath(model_adapter)
                model_args += f",peft={adapter_path}"
                lab.log(f"Using adapter: {adapter_path}")

            command = [
                "python",
                "-m",
                "lm_eval",
                "--model",
                "hf",
                "--model_args",
                model_args,
                "--tasks",
                tasks,
                "--device",
                "cuda:0",
                "--trust_remote_code",
                "--log_samples",
            ]

        # Add limit if provided
        if limit and float(limit) != 1.0:
            command.extend(["--limit", str(limit)])

        # Add output path
        command.extend(["--output_path", output_dir])

        lab.log("Running command: $ " + " ".join(command))
        lab.log("--Beginning to run evaluations (please wait)...")

        lab.update_progress(20)

        # Run subprocess
        with subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            bufsize=1,
            universal_newlines=True,
        ) as process:
            for line in process.stdout:
                line_stripped = line.strip()
                lab.log(line_stripped)

                # Parse progress from output
                pattern = r"^Running.*?(\d+)%\|"
                match = re.search(pattern, line_stripped)
                if match:
                    progress = int(match.group(1))
                    # Map to 20-80% range for evaluation progress
                    lab.update_progress(20 + int(progress * 0.6))

            process.wait()
            if process.returncode != 0:
                lab.log(f"⚠️  Evaluation returned non-zero exit code: {process.returncode}")
                lab.error(f"Evaluation failed with exit code: {process.returncode}")
                return {"status": "error", "error": f"Exit code {process.returncode}"}

        lab.update_progress(80)

        # Get detailed report files
        detailed_report_files = get_detailed_file_names(output_dir)
        lab.log(f"Found {len(detailed_report_files)} detailed report files")

        # Parse evaluation results
        results_file = None
        samples_files = {}

        # Search for both results.json and samples.jsonl files
        if os.path.exists(output_dir):
            for root, dirs, files in os.walk(output_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    if file.startswith("results_") and file.endswith(".json") and results_file is None:
                        results_file = file_path
                    elif file.startswith("samples_") and file.endswith(".jsonl"):
                        # Extract task name from filename
                        task_name = file.replace("samples_", "").replace(".jsonl", "")
                        samples_files[task_name] = file_path

        # Parse aggregated results from JSON file
        if results_file and os.path.exists(results_file):
            lab.log(f"Found results file: {results_file}")
            try:
                with open(results_file, "r") as f:
                    eval_results_data = json.load(f)

                # Save the full results as an artifact
                results_artifact_path = lab.save_artifact(results_file, name="evaluation_results.json", type="evals")
                lab.log(f"✅ Saved full results: {results_artifact_path}")

                # Extract aggregated metrics for each task
                if "results" in eval_results_data:
                    for task_name, task_results in eval_results_data["results"].items():
                        lab.log(f"Processing task: {task_name}")

                        # Extract metrics data for DataFrame
                        metrics_data = []
                        for key, value in task_results.items():
                            if isinstance(value, (int, float)):
                                metrics_data.append(
                                    {
                                        "test_case_id": "aggregated",
                                        "metric_name": key,
                                        "score": value,
                                        "input": task_name,
                                        "output": "",
                                        "expected_output": "",
                                    }
                                )

                        if metrics_data:
                            import pandas as pd

                            df_metrics = pd.DataFrame(metrics_data)

                            # Extract main accuracy metric for logging
                            acc_key = None
                            for key in task_results.keys():
                                if key.startswith("acc") and not key.endswith("stderr"):
                                    acc_key = key
                                    break

                            if acc_key:
                                acc_value = task_results.get(acc_key, 0.0)
                                lab.log(f"✅ {task_name}: {acc_key} = {acc_value}")

                            # Save aggregated metrics as eval artifact
                            saved_metrics_path = lab.save_artifact(
                                df_metrics,
                                name=f"eval_metrics_{task_name}.csv",
                                type="evals",
                                config={
                                    "evals": {
                                        "input": "input",
                                        "output": "output",
                                        "expected_output": "expected_output",
                                        "score": "score",
                                    }
                                },
                            )
                            lab.log(f"✅ Saved metrics for {task_name}: {saved_metrics_path}")

                else:
                    lab.log("⚠️  No 'results' key found in results file")

            except Exception as e:
                lab.log(f"⚠️  Error parsing results file: {e}")
                import traceback

                traceback.print_exc()

        # Parse detailed samples from JSONL files
        for task_name, samples_file in samples_files.items():
            if os.path.exists(samples_file):
                lab.log(f"Processing samples file for task: {task_name}")
                try:
                    import pandas as pd

                    # Read JSONL file line by line
                    samples_data = []
                    with open(samples_file, "r") as f:
                        for line in f:
                            if line.strip():
                                sample = json.loads(line.strip())

                                # Extract relevant fields for eval DataFrame
                                doc = sample.get("doc", {})

                                # Get the model response from filtered_resps or resps
                                filtered_resps = sample.get("filtered_resps", [])
                                output = ""
                                if filtered_resps:
                                    # Extract the actual response
                                    for resp in filtered_resps:
                                        if len(resp) >= 2 and resp[1] is True:
                                            output = str(resp[0])
                                            break
                                    # Fallback to first response if no True found
                                    if not output and filtered_resps:
                                        output = str(filtered_resps[0][0]) if len(filtered_resps[0]) > 0 else ""

                                samples_data.append(
                                    {
                                        "test_case_id": f"test_case_{sample.get('doc_id', 0)}",
                                        "metric_name": task_name,
                                        "score": sample.get("acc", 0.0),
                                        "input": doc.get("question", "") if isinstance(doc, dict) else str(doc),
                                        "output": output,
                                        "expected_output": str(sample.get("target", "")),
                                    }
                                )

                    if samples_data:
                        df_samples = pd.DataFrame(samples_data)
                        lab.log(f"Parsed {len(df_samples)} detailed samples for {task_name}")

                        # Save detailed samples as eval artifact
                        saved_samples_path = lab.save_artifact(
                            df_samples,
                            name=f"eval_samples_{task_name}.csv",
                            type="evals",
                            config={
                                "evals": {
                                    "input": "input",
                                    "output": "output",
                                    "expected_output": "expected_output",
                                    "score": "score",
                                }
                            },
                        )
                        lab.log(f"✅ Saved detailed samples for {task_name}: {saved_samples_path}")

                except Exception as e:
                    lab.log(f"⚠️  Error parsing samples file for {task_name}: {e}")
                    import traceback

                    traceback.print_exc()

        lab.update_progress(90)

        # Calculate evaluation time
        end_time = datetime.now()
        eval_duration = end_time - start_time
        lab.log(f"Evaluation completed in {eval_duration}")

        # Save evaluation summary
        summary_file = os.path.join(output_dir, "evaluation_summary.json")
        summary_data = {
            "evaluation_type": "EleutherAI LM Evaluation Harness",
            "model_name": model_name,
            "tasks": tasks,
            "limit": limit if limit else "all samples",
            "duration": str(eval_duration),
            "completed_at": end_time.isoformat(),
            "gpu_used": os.environ.get("CUDA_VISIBLE_DEVICES", "all"),
        }

        with open(summary_file, "w") as f:
            json.dump(summary_data, f, indent=2)

        summary_artifact_path = lab.save_artifact(summary_file, "evaluation_summary.json")
        lab.log(f"Saved evaluation summary: {summary_artifact_path}")

        lab.update_progress(95)

        # Complete the job
        lab.finish("Evaluation completed successfully!")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(eval_duration),
            "output_dir": output_dir,
            "tasks": tasks,
            "gpu_used": os.environ.get("CUDA_VISIBLE_DEVICES", "all"),
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id if hasattr(lab, "job") else None}

    except Exception as e:
        error_msg = str(e)
        lab.log(f"Evaluation failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id if hasattr(lab, "job") else None, "error": error_msg}


if __name__ == "__main__":
    result = run_evaluation()
    print("Evaluation result:", result)
