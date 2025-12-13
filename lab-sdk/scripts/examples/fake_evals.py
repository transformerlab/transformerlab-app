from datetime import datetime
from time import sleep
import pandas as pd

from lab import lab


def run_evaluation():
    """Fake evaluation function that runs locally but reports to TransformerLab"""

    # Evaluation configuration
    eval_config = {
        "experiment_name": "alpha",
        "model_name": "HuggingFaceTB/SmolLM-135M-Instruct",
        "eval_name": "fake-evaluation",
        "template_name": "eval-demo",
        "_config": {
            "model": "HuggingFaceTB/SmolLM-135M-Instruct",
            "dataset": "evaluation_dataset",
            "num_test_cases": 10,
            "metrics": ["accuracy", "f1_score", "bleu"],
        },
    }

    try:
        # Initialize lab with default/simple API
        lab.init()
        lab.set_config(eval_config)

        # Log start time
        start_time = datetime.now()
        lab.log(f"Evaluation started at {start_time}")

        # Simulate loading test cases
        lab.log("Loading test cases...")
        sleep(0.5)
        lab.update_progress(10)

        # Create fake evaluation results with default column names
        lab.log("Running evaluation on test cases...")
        sleep(0.5)

        # Example 1: DataFrame with default column names (input, output, expected_output, score)
        test_cases = []
        for i in range(10):
            test_cases.append(
                {
                    "input": f"What is {i + 1} + {i + 2}?",
                    "output": str((i + 1) + (i + 2)),
                    "expected_output": str((i + 1) + (i + 2)),
                    "score": 1.0 if (i + 1) + (i + 2) == (i + 1) + (i + 2) else 0.0,
                }
            )

        df_default = pd.DataFrame(test_cases)
        lab.log(f"Generated {len(df_default)} test cases with default column names")

        # Save evaluation results with default column names
        lab.log("Saving evaluation results (default columns)...")
        saved_path_default = lab.save_artifact(df_default, name="eval_results_default.csv", type="eval")
        lab.log(f"✅ Saved evaluation results: {saved_path_default}")
        lab.update_progress(50)

        # Example 2: DataFrame with custom column names
        lab.log("Creating evaluation results with custom column names...")
        sleep(0.5)

        test_cases_custom = []
        for i in range(10):
            # Simulate some incorrect answers for variety
            is_correct = i % 3 != 0  # Every 3rd answer is wrong
            correct_answer = str((i + 1) * 2)
            model_answer = correct_answer if is_correct else str((i + 1) * 2 + 1)

            test_cases_custom.append(
                {
                    "question": f"Calculate {i + 1} * 2",
                    "model_response": model_answer,
                    "ground_truth": correct_answer,
                    "accuracy": 1.0 if is_correct else 0.0,
                    "response_time_ms": 50 + i * 5,
                }
            )

        df_custom = pd.DataFrame(test_cases_custom)
        lab.log(f"Generated {len(df_custom)} test cases with custom column names")

        # Save evaluation results with custom column mappings
        lab.log("Saving evaluation results (custom columns)...")
        saved_path_custom = lab.save_artifact(
            df_custom,
            name="eval_results_custom.csv",
            type="eval",
            config={
                "evals": {
                    "input": "question",
                    "output": "model_response",
                    "expected_output": "ground_truth",
                    "score": "accuracy",
                }
            },
        )
        lab.log(f"✅ Saved evaluation results: {saved_path_custom}")
        lab.update_progress(70)

        # Example 3: Multiple metrics evaluation
        lab.log("Creating multi-metric evaluation results...")
        sleep(0.5)

        multi_metric_cases = []
        for i in range(10):
            multi_metric_cases.append(
                {
                    "input": "Translate 'Hello' to Spanish",
                    "output": "Hola" if i % 2 == 0 else "Hallo",
                    "expected_output": "Hola",
                    "bleu_score": 1.0 if i % 2 == 0 else 0.3,
                    "rouge_score": 0.95 if i % 2 == 0 else 0.4,
                    "exact_match": 1.0 if i % 2 == 0 else 0.0,
                }
            )

        df_multi = pd.DataFrame(multi_metric_cases)

        # For multi-metric, we'll use the first score column (bleu_score) as the primary score
        saved_path_multi = lab.save_artifact(
            df_multi,
            name="eval_results_multi_metric.csv",
            type="eval",
            config={
                "evals": {
                    "input": "input",
                    "output": "output",
                    "expected_output": "expected_output",
                    "score": "bleu_score",  # Use bleu_score as the primary score
                }
            },
        )
        lab.log(f"✅ Saved multi-metric evaluation results: {saved_path_multi}")
        lab.update_progress(85)

        # Calculate summary statistics
        lab.log("Calculating evaluation summary...")
        sleep(0.5)

        # Calculate average scores from the default results
        avg_score = df_default["score"].mean()
        total_cases = len(df_default)
        correct_cases = len(df_default[df_default["score"] == 1.0])

        summary = {
            "total_test_cases": total_cases,
            "correct_cases": correct_cases,
            "incorrect_cases": total_cases - correct_cases,
            "average_score": avg_score,
            "accuracy": correct_cases / total_cases,
        }

        lab.log("Evaluation Summary:")
        lab.log(f"  Total test cases: {summary['total_test_cases']}")
        lab.log(f"  Correct: {summary['correct_cases']}")
        lab.log(f"  Incorrect: {summary['incorrect_cases']}")
        lab.log(f"  Average score: {summary['average_score']:.4f}")
        lab.log(f"  Accuracy: {summary['accuracy']:.4f}")

        # Save summary as a regular artifact (not eval results)
        import json

        summary_file = "/tmp/eval_summary.json"
        with open(summary_file, "w") as f:
            json.dump(summary, f, indent=2)

        summary_artifact_path = lab.save_artifact(summary_file, "eval_summary.json")
        lab.log(f"✅ Saved evaluation summary: {summary_artifact_path}")

        # Calculate evaluation time
        end_time = datetime.now()
        eval_duration = end_time - start_time
        lab.log(f"Evaluation completed in {eval_duration}")

        lab.update_progress(100)

        print("Evaluation Complete")

        # Complete the job in TransformerLab via facade
        lab.finish(
            "Evaluation completed successfully",
            score={
                "average_score": avg_score,
                "accuracy": summary["accuracy"],
                "total_cases": total_cases,
            },
        )

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(eval_duration),
            "summary": summary,
            "eval_results_files": [
                saved_path_default,
                saved_path_custom,
                saved_path_multi,
            ],
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        print(f"Evaluation failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    result = run_evaluation()
    print(result)
