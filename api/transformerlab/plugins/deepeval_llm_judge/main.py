import importlib
import json
import sys
import traceback

import numpy as np
import pandas as pd

# Import DeepEval dependencies
from deepeval import evaluate
from deepeval.dataset import EvaluationDataset
from deepeval.evaluate.configs import AsyncConfig
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from transformerlab.sdk.v1.evals import tlab_evals

# # Add specific arguments needed for DeepEval metrics
# tlab_evals.add_argument("--threshold", default=0.5, type=float, help="Score threshold for metrics")
# tlab_evals.add_argument("--geval_name", default="", type=str, help="Name for custom GEval metrics")
# tlab_evals.add_argument("--tasks", default="[]", type=str, help="JSON array of custom evaluation tasks")
# tlab_evals.add_argument(
#     "--predefined_tasks", default="", type=str, help="Comma-separated list of predefined DeepEval metrics"
# )
# tlab_evals.add_argument("--dataset_split", default="train", type=str, help="Dataset split to use for evaluation")


def get_metric_class(metric_name: str):
    """
    Import the metric class based on the metric name
    :param metric_name: Name of the metric
    :return: Metric class
    """
    module = importlib.import_module("deepeval.metrics")
    try:
        metric_class = getattr(module, metric_name)
        return metric_class
    except AttributeError:
        print(f"Metric {metric_name} not found in deepeval.metrics")
        sys.exit(1)


@tlab_evals.job_wrapper()
def run_evaluation():
    """Run DeepEval metrics for LLM-as-judge evaluation"""

    # Setup logging for the evaluation
    tlab_evals.setup_eval_logging(wandb_project_name="TLab_Evaluations")

    # Parse metrics and tasks
    if isinstance(tlab_evals.params.predefined_tasks, str):
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
    formatted_predefined_tasks = [
        task.strip().replace(" ", "") + "Metric" for task in predefined_tasks
    ]

    try:
        geval_tasks = json.loads(tlab_evals.params.tasks) if tlab_evals.params.tasks else []
    except Exception as e:
        print(f"Error parsing tasks JSON: {e}")
        raise ValueError(f"Invalid tasks JSON format: {tlab_evals.params.tasks}")

    # Classification of metrics
    two_input_metrics = ["AnswerRelevancyMetric", "BiasMetric", "ToxicityMetric"]
    three_input_metrics = [
        "FaithfulnessMetric",
        "ContextualPrecisionMetric",
        "ContextualRecallMetric",
        "ContextualRelevancyMetric",
        "HallucinationMetric",
    ]

    # Analyze custom metrics requirements
    three_input_custom_metric = []
    two_input_custom_metric = []
    custom_geval_metrics = []

    for task in geval_tasks:
        if task["include_context"] == "Yes":
            three_input_custom_metric.append(task["name"])
        else:
            two_input_custom_metric.append(task["name"])
        custom_geval_metrics.append(task["name"])

    tlab_evals.progress_update(5)

    # Load the model for evaluation
    try:
        # Use tlab_evals built-in model loading functionality
        trlab_model = tlab_evals.load_evaluation_model(field_name="generation_model")
        print("Model loaded successfully")
    except Exception as e:
        print(f"An error occurred while loading the model: {e}")
        raise ValueError(f"Failed to load model: {e!s}")

    tlab_evals.progress_update(10)

    # Load the dataset
    try:
        dataset_dict = tlab_evals.load_dataset([tlab_evals.params.dataset_split])
        df = dataset_dict[tlab_evals.params.dataset_split].to_pandas()
        print("Dataset loaded successfully")
    except Exception as e:
        print(f"Error loading dataset: {e}")
        raise ValueError(f"Failed to load dataset {tlab_evals.params.dataset_name}: {e!s}")

    tlab_evals.progress_update(15)

    # Verify required columns exist
    required_columns = ["input", "output", "expected_output"]
    if not all(col in df.columns for col in required_columns):
        raise ValueError(
            "The dataset should have the columns `input`, `output` and `expected_output`. "
            "Please re-upload the dataset with the correct columns."
        )

    # Check context requirements
    if (
        any(elem in three_input_metrics for elem in formatted_predefined_tasks)
        or len(three_input_custom_metric) > 0
    ):
        if "context" not in df.columns:
            print("Using expected_output column as the context")
            df["context"] = df["expected_output"]

        # Verify non-null values
        if not df["context"].notnull().all():
            raise ValueError(
                f"The dataset should have all non-null values in the 'context' column for metrics: "
                f"{formatted_predefined_tasks + three_input_custom_metric}"
            )

    # Verify non-null values in required columns
    for col in required_columns:
        if not df[col].notnull().all():
            raise ValueError(f"The dataset should have all non-null values in the '{col}' column")

    tlab_evals.progress_update(20)

    # Initialize metrics
    metrics_arr = []
    try:
        # Initialize predefined metrics
        for met in formatted_predefined_tasks:
            print("CHECKING FOR METRIC:", met)
            metric_class = get_metric_class(met)
            metric = metric_class(
                model=trlab_model,
                threshold=tlab_evals.params.get("threshold", 0.5),
                include_reason=True,
            )
            metrics_arr.append(metric)

        # Initialize custom GEval metrics
        for met in geval_tasks:
            evaluation_params = [
                LLMTestCaseParams.INPUT,
                LLMTestCaseParams.ACTUAL_OUTPUT,
                LLMTestCaseParams.EXPECTED_OUTPUT,
            ]
            if met["include_context"] == "Yes":
                evaluation_params.append(LLMTestCaseParams.RETRIEVAL_CONTEXT)

            evaluation_steps = None

            if isinstance(met["evaluation_steps"], str):
                try:
                    met["evaluation_steps"] = json.loads(met["evaluation_steps"])
                except json.JSONDecodeError:
                    print(
                        f"Invalid JSON format for evaluation steps: {met['evaluation_steps']}. Considering the description field only."
                    )

            if isinstance(met["evaluation_steps"], list):
                evaluation_steps = met["evaluation_steps"]
                if len(evaluation_steps) == 0:
                    evaluation_steps = None
                elif len(evaluation_steps) > 0 and evaluation_steps[0] == "":
                    evaluation_steps = None

            if evaluation_steps is not None:
                print(f"Using evaluation steps: {evaluation_steps}")
                metric = GEval(
                    name=met["name"],
                    evaluation_steps=evaluation_steps,
                    evaluation_params=evaluation_params,
                    model=trlab_model,
                )
            else:
                print("No evaluation steps provided, using description.")
                metric = GEval(
                    name=met["name"],
                    criteria=met["description"],
                    evaluation_params=evaluation_params,
                    model=trlab_model,
                )

            metrics_arr.append(metric)
        print("Metrics loaded successfully")
    except Exception as e:
        print(f"An error occurred while loading the metrics: {e}")
        raise ValueError(f"Failed to initialize metrics: {e!s}")

    tlab_evals.progress_update(30)

    # Create test cases
    test_cases = []
    try:
        if (
            all(elem in two_input_metrics for elem in formatted_predefined_tasks)
            and len(three_input_custom_metric) == 0
        ):
            # Two-input test cases
            for _, row in df.iterrows():
                test_cases.append(
                    LLMTestCase(
                        input=row["input"],
                        actual_output=row["output"],
                        expected_output=row["expected_output"],
                    )
                )
        elif (
            any(elem in three_input_metrics for elem in formatted_predefined_tasks)
            or len(three_input_custom_metric) > 0
        ):
            # Three-input test cases
            if "HallucinationMetric" not in formatted_predefined_tasks:
                for _, row in df.iterrows():
                    if isinstance(row["context"], list):
                        context = row["context"]
                    elif isinstance(row["context"], np.ndarray):
                        context = row["context"].tolist()
                    elif (
                        isinstance(row["context"], str)
                        and row["context"].startswith("[")
                        and row["context"].endswith("]")
                    ):
                        try:
                            context = eval(row["context"])
                        except Exception:
                            context = [row["context"]]
                    else:
                        context = [row["context"]]
                    test_cases.append(
                        LLMTestCase(
                            input=row["input"],
                            actual_output=row["output"],
                            expected_output=row["expected_output"],
                            retrieval_context=context,
                        )
                    )
            else:
                # Special case for HallucinationMetric
                for _, row in df.iterrows():
                    if isinstance(row["context"], list):
                        context = row["context"]
                    elif (
                        isinstance(row["context"], str)
                        and row["context"].startswith("[")
                        and row["context"].endswith("]")
                    ):
                        try:
                            context = eval(row["context"])
                        except Exception:
                            context = [row["context"]]
                    else:
                        context = [row["context"]]
                    test_cases.append(
                        LLMTestCase(
                            input=row["input"],
                            actual_output=row["output"],
                            expected_output=row["expected_output"],
                            context=context,  # Uses 'context' instead of 'retrieval_context'
                        )
                    )
    except Exception as e:
        print(f"An error occurred while creating test cases: {e}")
        raise ValueError(f"Failed to create test cases: {e!s}")

    # Apply limit if specified
    if tlab_evals.params.limit and float(tlab_evals.params.limit) != 1.0:
        num_samples = max(int(len(test_cases) * float(tlab_evals.params.limit)), 1)
        test_cases = test_cases[:num_samples]

    print(f"Test cases created: {len(test_cases)}")
    tlab_evals.progress_update(40)

    # Create evaluation dataset and run evaluation
    dataset = EvaluationDataset(test_cases)

    try:
        # Set the plugin to use sync mode if on macOS
        # as MLX doesn't support async mode currently
        async_mode = True
        if "local" in tlab_evals.params.get("generation_model", "").lower():
            async_mode = sys.platform != "darwin"
        # Run the evaluation
        async_config = AsyncConfig(run_async=async_mode)
        output = evaluate(dataset, metrics_arr, async_config=async_config)
        tlab_evals.progress_update(80)

        # Process results
        metrics_data = []
        for test_case in output.test_results:
            for metric in test_case.metrics_data:
                metrics_data.append(
                    {
                        "test_case_id": test_case.name,
                        "metric_name": metric.name,
                        "score": metric.score,
                        "input": test_case.input,
                        "output": test_case.actual_output,
                        "expected_output": test_case.expected_output,
                        "reason": metric.reason,
                    }
                )

        # Create metrics DataFrame
        metrics_df = pd.DataFrame(metrics_data)

        # Log metrics to TensorBoard
        for metric in metrics_df["metric_name"].unique():
            avg_score = metrics_df[metrics_df["metric_name"] == metric]["score"].mean()
            tlab_evals.log_metric(metric, avg_score)

        # Save evaluation results using the plugin's method
        output_path, plot_data_path = tlab_evals.save_evaluation_results(metrics_df)

        tlab_evals.progress_update(100)
        print(f"Metrics saved to {output_path}")
        print(f"Plotting data saved to {plot_data_path}")
        print("Evaluation completed.")

        return True
    except Exception as e:
        traceback.print_exc()
        print(f"An error occurred during evaluation: {e}")
        raise ValueError(f"Evaluation failed: {e!s}")


# Run the evaluation when script is executed
run_evaluation()
