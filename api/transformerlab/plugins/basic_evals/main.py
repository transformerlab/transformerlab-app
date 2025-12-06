import json
import re

import pandas as pd
from RestrictedPython import compile_restricted, limited_builtins, safe_builtins, utility_builtins
from transformerlab.sdk.v1.evals import tlab_evals

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
            # exec(expression, {}, local_namespace)
            byte_code = compile_restricted(expression, filename="<inline>", mode="exec")

            exec(byte_code, restricted_globals, local_namespace)

            # The code should define an evaluate() function
            if "evaluate" not in local_namespace:
                print(
                    "Error: Python code must have an evaluate() function which controls everything"
                )
                raise ValueError("evaluate() function not found in the code.")

            # Call the evaluate function
            result = local_namespace["evaluate"]()

            # Validate that the result is either a numeric score or a boolean
            if not isinstance(result, (int, float, bool)):
                print(
                    f"Error: evaluate() function must return a numeric score (int/float) or a boolean, got {type(result).__name__}"
                )
                raise ValueError(
                    "evaluate() function must return a numeric score (int/float) or a boolean."
                )

            return result

        except Exception as e:
            print(f"Error executing custom code: {e!s}")
            return None
    else:
        print("Invalid return type.")
        return None


@tlab_evals.job_wrapper()
def run_evaluation():
    """Run basic evaluations using regex and simple metrics"""

    # Type casting for limit
    tlab_evals.params.limit = float(tlab_evals.params.limit) if tlab_evals.params.limit else 1.0

    # Parse tasks
    tasks = []
    print("TLAB EVALS TASKS:", tlab_evals.params.tasks, type(tlab_evals.params.tasks))
    print(
        "TLAB EVALS PREDEFINEDTASKS:",
        tlab_evals.params.predefined_tasks,
        type(tlab_evals.params.predefined_tasks),
    )

    # First try to parse the tasks JSON
    try:
        if tlab_evals.params.tasks and tlab_evals.params.tasks.strip() != "":
            tasks = eval(tlab_evals.params.tasks)
    except Exception as e:
        print(f"Error parsing tasks JSON: {e}")
        raise ValueError(f"Invalid tasks JSON format: {tlab_evals.params.tasks}")

    # Add predefined tasks if specified
    if tlab_evals.params.predefined_tasks and not isinstance(
        tlab_evals.params.predefined_tasks, list
    ):
        try:
            predefined_tasks = json.loads(tlab_evals.params.predefined_tasks)
        except json.JSONDecodeError:
            print(f"Invalid JSON format for predefined tasks: {tlab_evals.params.predefined_tasks}")
            predefined_tasks = (
                tlab_evals.params.predefined_tasks.split(",")
                if tlab_evals.params.predefined_tasks
                else []
            )
    if len(predefined_tasks) == 0:
        print("No valid predefined tasks found.")

    for task in predefined_tasks:
        if task in pre_defined:
            tasks.append(pre_defined[task])
        else:
            print(f"Predefined task {task} not found.")

    if not tasks:
        raise ValueError("No tasks specified. Please provide tasks or predefined_tasks.")

    tlab_evals.progress_update(10)

    # Load dataset
    try:
        dataset = tlab_evals.load_dataset()
        df = dataset["train"].to_pandas()
        print("Dataset loaded successfully")
    except Exception as e:
        print(f"Error loading dataset: {e}")
        raise ValueError(f"Failed to load dataset {tlab_evals.params.dataset_name}: {e!s}")

    # Verify required columns exist
    if tlab_evals.params.input_col not in df.columns:
        raise ValueError(f"Input column '{tlab_evals.params.input_col}' not found in the dataset.")

    if tlab_evals.params.output_col not in df.columns:
        raise ValueError(
            f"Output column '{tlab_evals.params.output_col}' not found in the dataset."
        )

    # Apply limit if specified
    if tlab_evals.params.limit and float(tlab_evals.limit) != 1.0:
        num_samples = max(int(len(df) * float(tlab_evals.params.limit)), 1)
        df_limited = df.iloc[:num_samples].copy()
    else:
        df_limited = df.copy()

    print(f"Test cases loaded successfully: {len(df_limited)}")
    tlab_evals.progress_update(20)

    # Apply evaluations
    for task in tasks:
        df_limited[f"eval_{task['name']}"] = df_limited[tlab_evals.params.output_col].apply(
            lambda x: execute_custom_function_regexp(
                x, task["expression"], task["return_type"].lower()
            )
        )

    tlab_evals.progress_update(40)

    # Generate metrics data
    metrics = []

    for task in tasks:
        metric_name = task["name"]
        metric_avg = df_limited[f"eval_{metric_name}"].mean()

        # Log metric to TensorBoard
        tlab_evals.log_metric(metric_name, metric_avg)

        # Add to scores list for job data

        # Create individual metrics entries
        for idx, row in df_limited.iterrows():
            metrics.append(
                {
                    "test_case_id": f"test_case_{idx}",
                    "metric_name": metric_name,
                    "score": float(row[f"eval_{metric_name}"]),
                    "input": row[tlab_evals.params.input_col],
                    "output": row[tlab_evals.params.output_col],
                }
            )

    tlab_evals.progress_update(60)

    # Create metrics DataFrame
    metrics_df = pd.DataFrame(metrics)

    # Save results using the plugin's method
    output_path, plot_data_path = tlab_evals.save_evaluation_results(metrics_df)

    tlab_evals.progress_update(100)
    print(f"Metrics saved to {output_path}")
    print(f"Plotting data saved to {plot_data_path}")
    print("Evaluation completed.")

    return True


# Run the evaluation when script is executed
run_evaluation()
