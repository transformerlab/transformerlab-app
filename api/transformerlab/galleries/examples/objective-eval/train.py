#!/usr/bin/env python3
"""
Objective Metrics Evaluation Script using DeepEval Framework with TransformerLab integration.

This script demonstrates:
- Using lab.get_config() to read parameters from task configuration
- Using lab SDK for progress tracking and artifact saving
- Evaluation using DeepEval objective metrics (Rouge, BLEU, Exact Match, etc.)
- Saving evaluation results as lab artifacts
"""

import os
import json
import pandas as pd
import nltk
from datetime import datetime

from deepeval.metrics import BaseMetric
from deepeval.scorer import Scorer
from deepeval.test_case import LLMTestCase

from lab import lab

# Login to huggingface if token is provided
from huggingface_hub import login

if os.getenv("HF_TOKEN"):
    login(token=os.getenv("HF_TOKEN"))

# Download required NLTK data
nltk.download("punkt_tab", quiet=True)


# Define the metric classes
class RougeMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5, score_type: str = "rouge1"):
        self.threshold = threshold
        self.score_type = score_type
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.rouge_score(
            prediction=test_case.actual_output,
            target=test_case.expected_output,
            score_type=self.score_type,
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Rouge Metric"


class SentenceBleuMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5, score_type: str = "bleu1"):
        self.threshold = threshold
        self.score_type = score_type
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.sentence_bleu_score(
            prediction=test_case.actual_output,
            references=test_case.expected_output,
            bleu_type=self.score_type,
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Sentence Bleu Metric"


class ExactMatchScore(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.exact_match_score(
            prediction=test_case.actual_output,
            target=test_case.expected_output,
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Exact Match Score Metric"


class QuasiExactMatchScore(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.quasi_exact_match_score(
            prediction=test_case.actual_output,
            target=test_case.expected_output,
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Quasi Exact Match Score Metric"


class QuasiContainsScore(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.quasi_contains_score(
            prediction=test_case.actual_output,
            targets=test_case.expected_output,
        )
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Quasi Contains Score Metric"


class BertScoreMetric(BaseMetric):
    def __init__(self, threshold: float = 0.5):
        self.threshold = threshold
        self.scorer = Scorer()

    def measure(self, test_case: LLMTestCase):
        self.score = self.scorer.bertscore_score(
            prediction=test_case.actual_output,
            reference=test_case.expected_output,
        )
        self.success = self.score["bert-f1"] >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "BertScore Metric"


# Define the metric classes dictionary
metric_classes = {
    "rouge": RougeMetric,
    "bleu": SentenceBleuMetric,
    "exact_match": ExactMatchScore,
    "quasi_exact_match": QuasiExactMatchScore,
    "quasi_contains": QuasiContainsScore,
    "bert_score": BertScoreMetric,
}


def run_objective_evaluation():
    """Run objective metrics evaluation using DeepEval with TransformerLab integration"""

    try:
        # Initialize lab (auto-loads parameters from job_data if available)
        lab.init()

        # Get parameters from task configuration
        config = lab.get_config()

        # Extract parameters with defaults
        tasks_param = config.get("tasks", "Rouge")
        threshold = float(config.get("threshold", 0.5))
        limit = float(config.get("limit", 1.0))
        dataset_split = config.get("dataset_split", "train")
        output = config.get("output", "./output")
        os.makedirs(output, exist_ok=True)

        # Parse tasks parameter
        if isinstance(tasks_param, str):
            try:
                tasks_list = json.loads(tasks_param)
                if isinstance(tasks_list, list):
                    tasks = tasks_list
                else:
                    raise ValueError("Tasks should be a list of task names.")
            except json.JSONDecodeError:
                # Assuming older tasks which were sent as a comma-separated string
                tasks = tasks_param.split(",")
        else:
            tasks = tasks_param if isinstance(tasks_param, list) else [tasks_param]

        # Normalize task names
        tasks = [metric.strip().lower().replace(" ", "_") for metric in tasks]

        # Log start time
        start_time = datetime.now()
        lab.log(f"Evaluation started at {start_time}")
        lab.log(f"Tasks: {tasks}")
        lab.log(f"Threshold: {threshold}")
        lab.log(f"Dataset split: {dataset_split}")
        lab.log(f"Limit: {limit}")

        # Validate dataset split
        if dataset_split not in ["train", "valid", "test"]:
            error_msg = f"Invalid dataset split: {dataset_split}. Must be one of 'train', 'valid', or 'test'."
            lab.log(f"❌ {error_msg}")
            lab.error(error_msg)
            return {"status": "error", "error": error_msg}

        lab.update_progress(10)

        # Load the dataset
        lab.log("Loading dataset...")
        try:
            from datasets import load_dataset

            # Get dataset path from config
            dataset_path = config.get("dataset")
            if not dataset_path:
                lab.log("⚠️ No dataset specified. Creating sample dataset with 5 examples...")

                # Create sample dataset with 5 examples
                sample_data = {
                    "input": [
                        "What is the capital of France?",
                        "How many sides does a triangle have?",
                        "What is 2 + 2?",
                        "What is the largest planet in our solar system?",
                        "What is the chemical symbol for gold?",
                    ],
                    "output": [
                        "Paris is the capital of France.",
                        "A triangle has three sides.",
                        "2 + 2 equals 4.",
                        "Jupiter is the largest planet in our solar system.",
                        "The chemical symbol for gold is Au.",
                    ],
                    "expected_output": ["Paris", "3", "4", "Jupiter", "Au"],
                }

                df = pd.DataFrame(sample_data)
                lab.log(f"✅ Created sample dataset with {len(df)} examples")
            else:
                # Load dataset from specified path
                dataset = load_dataset(dataset_path)

                if dataset_split not in dataset:
                    error_msg = f"Dataset split '{dataset_split}' not found. Available splits: {list(dataset.keys())}"
                    lab.log(f"❌ {error_msg}")
                    lab.error(error_msg)
                    return {"status": "error", "error": error_msg}

                df = dataset[dataset_split].to_pandas()
                lab.log(f"✅ Loaded dataset with {len(df)} rows for split '{dataset_split}'")

        except Exception as e:
            error_msg = f"Error loading dataset: {e}"
            lab.log(f"❌ {error_msg}")
            lab.error(error_msg)
            return {"status": "error", "error": error_msg}

        lab.update_progress(20)

        # Check required columns
        if "input" not in df.columns:
            error_msg = "Input column not found in the dataset"
            lab.log(f"❌ {error_msg}")
            lab.error(error_msg)
            return {"status": "error", "error": error_msg}

        if "output" not in df.columns:
            error_msg = "Output column not found in the dataset"
            lab.log(f"❌ {error_msg}")
            lab.error(error_msg)
            return {"status": "error", "error": error_msg}

        if "expected_output" not in df.columns:
            error_msg = "Expected output column not found in the dataset"
            lab.log(f"❌ {error_msg}")
            lab.error(error_msg)
            return {"status": "error", "error": error_msg}

        # Create a list of test cases
        test_cases = []
        for _, row in df.iterrows():
            test_case = LLMTestCase(
                input=row["input"],
                actual_output=row["output"],
                expected_output=row["expected_output"],
            )
            test_cases.append(test_case)

        # Apply limit
        if limit < 1.0:
            num_samples = int(len(test_cases) * limit)
            if num_samples < 1:
                num_samples = 1
            test_cases = test_cases[:num_samples]
            lab.log(f"Limited to {num_samples} test cases ({limit * 100}%)")

        lab.log(f"✅ Test cases loaded successfully: {len(test_cases)}")
        lab.update_progress(30)

        # Calculate metrics for each test case
        lab.log("Running evaluation metrics...")
        metrics = []
        total_evaluations = len(tasks) * len(test_cases)
        current_evaluation = 0

        for metric_name in tasks:
            if metric_name not in metric_classes:
                lab.log(f"⚠️  Unknown metric: {metric_name}, skipping")
                continue

            lab.log(f"Evaluating with {metric_name} metric...")
            metric = metric_classes[metric_name](threshold=threshold)

            for idx, test_case in enumerate(test_cases):
                try:
                    score = metric.measure(test_case)

                    if metric_name == "bert_score":
                        metrics.append(
                            {
                                "test_case_id": f"test_case_{idx}",
                                "metric_name": metric_name,
                                "score": score["bert-f1"],
                                "bert_precision": score["bert-precision"],
                                "bert_recall": score["bert-recall"],
                                "bert_f1": score["bert-f1"],
                                "input": test_case.input,
                                "output": test_case.actual_output,
                                "expected_output": test_case.expected_output,
                            }
                        )
                    else:
                        metrics.append(
                            {
                                "test_case_id": f"test_case_{idx}",
                                "metric_name": metric_name,
                                "score": score,
                                "input": test_case.input,
                                "output": test_case.actual_output,
                                "expected_output": test_case.expected_output,
                            }
                        )

                    current_evaluation += 1
                    progress = 30 + int((current_evaluation / total_evaluations) * 50)
                    lab.update_progress(progress)

                except Exception as e:
                    lab.log(f"⚠️  Error evaluating test case {idx} with {metric_name}: {e}")

            avg_score = sum([m["score"] for m in metrics if m["metric_name"] == metric_name]) / len(
                [m for m in metrics if m["metric_name"] == metric_name]
            )
            lab.log(f"✅ {metric_name} average score: {avg_score:.4f}")

        lab.update_progress(80)

        # Create DataFrame and save results
        lab.log("Saving evaluation results...")
        metrics_df = pd.DataFrame(metrics)

        # Save evaluation results as artifact with proper eval config
        saved_path = lab.save_artifact(
            metrics_df,
            name="evaluation_results.csv",
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
        lab.log(f"✅ Saved evaluation results: {saved_path}")

        lab.update_progress(90)

        # Create summary of results
        summary = {
            "tasks": tasks,
            "threshold": threshold,
            "dataset_split": dataset_split,
            "num_test_cases": len(test_cases),
            "limit": limit,
            "metrics": {},
        }

        for metric_name in tasks:
            if metric_name not in metric_classes:
                continue
            metric_scores = metrics_df[metrics_df["metric_name"] == metric_name]["score"]
            if len(metric_scores) > 0:
                summary["metrics"][metric_name] = {
                    "mean": float(metric_scores.mean()),
                    "std": float(metric_scores.std()),
                    "min": float(metric_scores.min()),
                    "max": float(metric_scores.max()),
                }

        # Save summary as artifact
        summary_file_path = os.path.join(output, "evaluation_summary.json")
        with open(summary_file_path, "w") as f:
            json.dump(summary["metrics"], f, indent=2)

        summary_path = lab.save_artifact(
            summary_file_path,
            name="evaluation_summary.json",
            type="json",
        )
        lab.log(f"✅ Saved evaluation summary: {summary_path}")

        # Calculate training time
        end_time = datetime.now()
        evaluation_duration = end_time - start_time
        lab.log(f"Evaluation completed in {evaluation_duration}")

        # Log summary to console
        lab.log("=" * 50)
        lab.log("Evaluation Summary:")
        lab.log(f"  Tasks: {', '.join(tasks)}")
        lab.log(f"  Test cases: {len(test_cases)}")
        lab.log(f"  Duration: {evaluation_duration}")
        for metric_name, stats in summary["metrics"].items():
            lab.log(f"  {metric_name}:")
            lab.log(f"    Mean: {stats['mean']:.4f}")
            lab.log(f"    Std: {stats['std']:.4f}")
            lab.log(f"    Min: {stats['min']:.4f}")
            lab.log(f"    Max: {stats['max']:.4f}")
        lab.log("=" * 50)

        lab.update_progress(100)

        # Complete the job in TransformerLab
        lab.finish("Evaluation completed successfully!")

        return {
            "status": "success",
            "job_id": lab.job.id,
            "duration": str(evaluation_duration),
            "summary": summary,
        }

    except KeyboardInterrupt:
        lab.error("Stopped by user or remotely")
        return {"status": "stopped", "job_id": lab.job.id}

    except Exception as e:
        error_msg = str(e)
        lab.log(f"❌ Evaluation failed: {error_msg}")

        import traceback

        traceback.print_exc()
        lab.error(error_msg)
        return {"status": "error", "job_id": lab.job.id, "error": error_msg}


if __name__ == "__main__":
    result = run_objective_evaluation()
    print("Evaluation result:", result)
