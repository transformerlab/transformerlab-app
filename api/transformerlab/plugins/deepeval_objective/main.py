import json

import nltk
import pandas as pd
from deepeval.metrics import BaseMetric
from deepeval.scorer import Scorer
from deepeval.test_case import LLMTestCase
from transformerlab.sdk.v1.evals import tlab_evals

nltk.download("punkt_tab")


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


# Use the job_wrapper decorator to handle job status updates
@tlab_evals.job_wrapper()
def run_evaluation():
    # Parse tasks
    if isinstance(tlab_evals.params.tasks, str):
        try:
            tasks_list = json.loads(tlab_evals.params.tasks)
            if isinstance(tasks_list, list):
                tlab_evals.params.tasks = tasks_list
            else:
                raise ValueError("Tasks should be a list of task names.")
        except json.JSONDecodeError:
            # assuming older tasks which were sent as a comma-separated string
            tlab_evals.params.tasks = tlab_evals.params.tasks.split(",")

    tasks = tlab_evals.params.tasks
    tasks = [metric.lower().replace(" ", "_") for metric in tasks]

    # Get the dataset split
    dataset_split = tlab_evals.params.get("dataset_split", "train")
    if dataset_split not in ["train", "valid", "test"]:
        raise ValueError(
            f"Invalid dataset split: {dataset_split}. Must be one of 'train', 'valid', or 'test'."
        )

    # Load the dataset
    dataset = tlab_evals.load_dataset([dataset_split])
    df = dataset[dataset_split].to_pandas()

    print(f"Loaded dataset with {len(df)} rows for split '{dataset_split}'")

    # Check required columns
    assert "input" in df.columns, "Input column not found in the dataset"
    assert "output" in df.columns, "Output column not found in the dataset"
    assert "expected_output" in df.columns, "Expected output column not found in the dataset"

    # Create a list of test cases
    test_cases = []
    for _, row in df.iterrows():
        test_case = LLMTestCase(
            input=row["input"], actual_output=row["output"], expected_output=row["expected_output"]
        )
        test_cases.append(test_case)

    if tlab_evals.params.limit and float(tlab_evals.params.limit) < 1.0:
        num_samples = int(len(test_cases) * float(tlab_evals.params.limit))
        if num_samples < 1:
            num_samples = 1
        test_cases = test_cases[:num_samples]

    print(f"Test cases loaded successfully: {len(test_cases)}")
    tlab_evals.progress_update(20)

    if tlab_evals.params.threshold is None:
        tlab_evals.params.threshold = 0.5
    # Calculate metrics for each test case
    metrics = []
    for metric_name in tasks:
        metric = metric_classes[metric_name](threshold=float(tlab_evals.params.threshold))
        for idx, test_case in enumerate(test_cases):
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
                        "actual_output": test_case.actual_output,
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
                        "actual_output": test_case.actual_output,
                        "expected_output": test_case.expected_output,
                    }
                )

    tlab_evals.progress_update(60)

    # Create DataFrame and save results
    metrics_df = pd.DataFrame(metrics)
    tlab_evals.save_evaluation_results(metrics_df)

    tlab_evals.progress_update(80)

    # Log metrics to TensorBoard
    for metric_name in tasks:
        avg_score = metrics_df[metrics_df["metric_name"] == metric_name]["score"].mean()
        tlab_evals.log_metric(metric_name, avg_score)

    return True


# Run the evaluation when script is executed
run_evaluation()
