#!/usr/bin/env python3
"""
Basic Evaluation Metrics Script using TransformerLab integration.

This script demonstrates:
- Using lab.get_config() to read parameters from task configuration
- Evaluating LLM outputs using regex patterns and custom Python code
- Saving evaluation results as artifacts with proper formatting
"""

import os
import json
import re
from datetime import datetime

import pandas as pd
from RestrictedPython import compile_restricted, safe_builtins, limited_builtins, utility_builtins

from lab import lab

# Login to huggingface
from huggingface_hub import login

if os.getenv("HF_TOKEN"):
    login(token=os.getenv("HF_TOKEN"))


# Get Predefined tasks
pre_defined = {
    "Is Valid JSON": {
        "expression": None,
        "return_type": "json",
        "name": "Is Valid JSON",
    },
    "Word Count": {
        "expression": r"\w+",
        "return_type": "number",
        "name": "Word Count",
    },
    "Contains bulleted lists": {
        "expression": r"\n([*-])\s",
        "return_type": "boolean",
        "name": "Contains bulleted lists",
    },
    "Contains headings": {
        "expression": r"#+\s+.+",
        "return_type": "boolean",
        "name": "Contains headings",
    },
    "Contains URLs": {
        "expression": r"https?://[-a-zA-Z0-9&@#/%?=+~_|!:,.;]*[-a-zA-Z0-9&@#/%=+~_|]",
        "return_type": "boolean",
        "name": "Contains URLs",
    },
    "Contains code blocks": {
        "expression": r"```",
        "return_type": "boolean",
        "name": "Contains code blocks",
    },
    "Contains tables": {
        "expression": r"\|",
        "return_type": "boolean",
        "name": "Contains tables",
    },
    "Contains images": {
        "expression": r"!\[.*\]\(.*\)",
        "return_type": "boolean",
        "name": "Contains images",
    },
    "Contains numbered lists": {
        "expression": r"\n([0-9]+)\.\s",
        "return_type": "boolean",
        "name": "Contains numbered lists",
    },
    "Contains bold text": {
        "expression": r"\*\*",
        "return_type": "boolean",
        "name": "Contains bold text",
    },
    "Contains italic text": {
        "expression": r"\*",
        "return_type": "boolean",
        "name": "Contains italic text",
    },
    "Contains underline text": {
        "expression": r"_",
        "return_type": "boolean",
        "name": "Contains underline text",
    },
    "Contains strikethrough text": {
        "expression": r"~~",
        "return_type": "boolean",
        "name": "Contains strikethrough text",
    },
    "Contains blockquotes": {
        "expression": r">",
        "return_type": "boolean",
        "name": "Contains blockquotes",
    },
    "Contains inline code": {
        "expression": r"`",
        "return_type": "boolean",
        "name": "Contains inline code",
    },
    "Contains emojis": {
        "expression": r"(:\w+:)",
        "return_type": "boolean",
        "name": "Contains emojis",
    },
    "Contains email addresses": {
        "expression": r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
        "return_type": "boolean",
        "name": "Contains email addresses",
    },
    "Contains phone numbers": {
        "expression": r"\+?([0-9]{1,3})\)?([0-9]{3})\)?([0-9]{3})\)?([0-9]{4})",
        "return_type": "boolean",
        "name": "Contains phone numbers",
    },
    "Contains dates": {
        "expression": r"\d{2}[-/]\d{2}[-/]\d{4}",
        "return_type": "boolean",
        "name": "Contains dates",
    },
    "Contains times": {
        "expression": r"\d{2}:\d{2}(:\d{2})?",
        "return_type": "boolean",
        "name": "Contains times",
    },
    "Contains numbers": {
        "expression": r"\d+",
        "return_type": "boolean",
        "name": "Contains numbers",
    },
}


def execute_custom_function_regexp(output_text: str, expression: str, return_type: str):
    """Execute custom regex-based evaluation functions"""
    if return_type.lower() == "number":
        # Occurrence: Count all matches with the global-like flag
        matches = re.findall(expression, output_text.strip())
        return len(matches) if matches is not None else 0
    elif return_type.lower() == "boolean":
        # Existence: Check if at least one match exists
        match = re.search(expression, output_text.strip())
        return True if match is not None else False
    elif return_type.lower() == "json":
        # Check if the output is a valid JSON
        try:
            json.loads(output_text.strip())
            return True
        except Exception:
            return False
    elif return_type.lower() == "isequals":
        # Check if the output is equal to the expression
        return output_text.strip() == expression
    elif return_type.lower() == "contains":
        # Check if the output contains the expression
        return expression in output_text.strip()
    elif return_type.lower() == "code":
        # Execute custom Python function
        try:
            # Create a namespace for the evaluation
            local_namespace = {"output_text": output_text}

            restricted_globals = {
                "__builtins__": {**safe_builtins, **limited_builtins, **utility_builtins},
                "re": re,
                "json": json,
            }

            # Execute the code with the output_text variable available
            byte_code = compile_restricted(expression, filename="<inline>", mode="exec")

            exec(byte_code, restricted_globals, local_namespace)

            # The code should define an evaluate() function
            if "evaluate" not in local_namespace:
                lab.log("Error: Python code must have an evaluate() function which controls everything")
                raise ValueError("evaluate() function not found in the code.")

            # Call the evaluate function
            result = local_namespace["evaluate"]()

            # Validate that the result is either a numeric score or a boolean
            if not isinstance(result, (int, float, bool)):
                lab.log(
                    f"Error: evaluate() function must return a numeric score (int/float) or a boolean, got {type(result).__name__}"
                )
                raise ValueError("evaluate() function must return a numeric score (int/float) or a boolean.")

            return result

        except Exception as e:
            lab.log(f"Error executing custom code: {str(e)}")
            return None
    else:
        lab.log("Invalid return type.")
        return None


def run_evaluation():
    """Run basic evaluations using regex and simple metrics"""

    try:
        # Initialize lab (auto-loads parameters from job_data if available)
        lab.init()

        # Get parameters from task configuration (set via UI)
        config = lab.get_config()

        # Extract parameters with defaults
        dataset_name = config.get("dataset_name", "openai/gsm8k")
        input_col = config.get("input_col", "question")
        output_col = config.get("output_col", "answer")
        limit = config.get("limit", 1.0)
        predefined_tasks_param = config.get("predefined_tasks", "Word Count,Is Valid JSON,Contains code blocks")
        tasks_param = config.get("tasks", "[]")

        # Convert string values to appropriate types
        limit = float(limit) if limit else 1.0

        # Log start time
        start_time = datetime.now()
        lab.log(f"Evaluation started at {start_time}")
        lab.log(f"Dataset: {dataset_name}")
        lab.log(f"Input column: {input_col}")
        lab.log(f"Output column: {output_col}")
        lab.log(f"Limit: {limit}")

        # Parse tasks
        tasks = []
        lab.log(f"Tasks parameter: {tasks_param}, type: {type(tasks_param)}")
        lab.log(f"Predefined tasks parameter: {predefined_tasks_param}, type: {type(predefined_tasks_param)}")

        # First try to parse the tasks JSON
        try:
            if tasks_param and str(tasks_param).strip() != "" and str(tasks_param).strip() != "[]":
                if isinstance(tasks_param, str):
                    tasks = eval(tasks_param)
                elif isinstance(tasks_param, list):
                    tasks = tasks_param
        except Exception as e:
            lab.log(f"Error parsing tasks JSON: {e}")
            raise ValueError(f"Invalid tasks JSON format: {tasks_param}")

        # Add predefined tasks if specified
        predefined_tasks = []
        if predefined_tasks_param and not isinstance(predefined_tasks_param, list):
            try:
                if predefined_tasks_param.strip():
                    predefined_tasks = json.loads(predefined_tasks_param)
            except json.JSONDecodeError:
                lab.log(f"Invalid JSON format for predefined tasks: {predefined_tasks_param}")
                predefined_tasks = predefined_tasks_param.split(",") if predefined_tasks_param else []
        elif isinstance(predefined_tasks_param, list):
            predefined_tasks = predefined_tasks_param

        if len(predefined_tasks) == 0:
            lab.log("No valid predefined tasks found.")

        for task in predefined_tasks:
            if task in pre_defined:
                tasks.append(pre_defined[task])
            else:
                lab.log(f"Predefined task {task} not found.")

        if not tasks:
            raise ValueError("No tasks specified. Please provide tasks or predefined_tasks.")

        lab.update_progress(10)

        # Load dataset
        try:
            from datasets import load_dataset

            dataset = load_dataset(dataset_name, "main")
            df = dataset["train"].to_pandas()
            lab.log("Dataset loaded successfully")
        except Exception as e:
            lab.log(f"Error loading dataset: {e}")
            raise ValueError(f"Failed to load dataset {dataset_name}: {str(e)}")

        # Verify required columns exist
        if input_col not in df.columns:
            raise ValueError(f"Input column '{input_col}' not found in the dataset.")

        if output_col not in df.columns:
            raise ValueError(f"Output column '{output_col}' not found in the dataset.")

        # Apply limit if specified
        if limit and float(limit) != 1.0:
            num_samples = max(int(len(df) * float(limit)), 1)
            df_limited = df.iloc[:num_samples].copy()
        else:
            df_limited = df.copy()

        lab.log(f"Test cases loaded successfully: {len(df_limited)}")
        lab.update_progress(20)

        # Apply evaluations
        for task in tasks:
            df_limited[f"eval_{task['name']}"] = df_limited[output_col].apply(
                lambda x: execute_custom_function_regexp(x, task["expression"], task["return_type"].lower())
            )

        lab.update_progress(40)

        # Generate metrics data
        metrics = []

        for task in tasks:
            metric_name = task["name"]
            metric_avg = df_limited[f"eval_{metric_name}"].mean()

            lab.log(f"Metric '{metric_name}': average score = {metric_avg:.4f}")

            # Create individual metrics entries
            for idx, row in df_limited.iterrows():
                metrics.append(
                    {
                        "test_case_id": f"test_case_{idx}",
                        "metric_name": metric_name,
                        "score": float(row[f"eval_{metric_name}"]),
                        "input": row[input_col],
                        "output": row[output_col],
                        "expected_output": "",  # No expected output for basic metrics
                    }
                )

        lab.update_progress(60)

        # Create metrics DataFrame
        metrics_df = pd.DataFrame(metrics)

        # Save results using lab's artifact system
        lab.log(f"Saving evaluation results with {len(metrics_df)} metrics...")

        # Save as eval artifact with proper configuration
        saved_metrics_path = lab.save_artifact(
            metrics_df,
            name="eval_results.csv",
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

        lab.log(f"✅ Evaluation results saved: {saved_metrics_path}")

        lab.update_progress(80)

        # Save summary statistics
        summary_stats = {}
        for task in tasks:
            metric_name = task["name"]
            avg_score = df_limited[f"eval_{metric_name}"].mean()
            summary_stats[metric_name] = avg_score

        summary_file_path = "./eval_summary.json"
        with open(summary_file_path, "w") as f:
            json.dump(
                {
                    "dataset": dataset_name,
                    "num_samples": len(df_limited),
                    "metrics": summary_stats,
                    "completed_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

        summary_artifact_path = lab.save_artifact(summary_file_path, "eval_summary.json")
        lab.log(f"✅ Evaluation summary saved: {summary_artifact_path}")

        lab.update_progress(95)

        # Calculate evaluation time
        end_time = datetime.now()
        evaluation_duration = end_time - start_time
        lab.log(f"Evaluation completed in {evaluation_duration}")

        lab.update_progress(100)

        print("Complete")

        # Complete the job in TransformerLab
        lab.finish("Evaluation completed successfully!")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(evaluation_duration),
            "num_metrics": len(tasks),
            "num_samples": len(df_limited),
            "saved_metrics_path": saved_metrics_path,
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        lab.log(f"Evaluation failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    result = run_evaluation()
    print("Evaluation result:", result)
