"""Sweep job list, status, and aggregated results."""

from typing import Any, Dict

from fastapi import HTTPException
from transformerlab.services import job_service
from lab.job_status import JobStatus


async def check_sweep_status_all(experiment_id: str) -> Dict[str, Any]:
    all_sweep_jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="SWEEP", status="")
    return {
        "status": "success",
        "experiment_id": experiment_id,
        "jobs": all_sweep_jobs,
        "total": len(all_sweep_jobs),
    }


async def check_sweep_status(job_id: str, experiment_id: str) -> Dict[str, Any]:
    job = await job_service.job_get(job_id, experiment_id=experiment_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("type") != "SWEEP":
        raise HTTPException(status_code=400, detail="Job is not a SWEEP job")

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        raise HTTPException(status_code=400, detail="Job is not a sweep parent")

    return {
        "status": "success",
        "job_id": job_id,
        "sweep_total": job_data.get("sweep_total", 0),
        "sweep_completed": job_data.get("sweep_completed", 0),
        "sweep_running": job_data.get("sweep_running", 0),
        "sweep_failed": job_data.get("sweep_failed", 0),
        "sweep_queued": job_data.get("sweep_queued", 0),
        "sweep_progress": job_data.get("sweep_progress", 0),
        "all_complete": job_data.get("sweep_completed", 0) + job_data.get("sweep_failed", 0)
        == job_data.get("sweep_total", 0),
        "job": job,
    }


async def get_sweep_results(job_id: str, experiment_id: str) -> Dict[str, Any]:
    job = await job_service.job_get(job_id, experiment_id=experiment_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.get("type") != "SWEEP":
        raise HTTPException(status_code=400, detail="Job is not a SWEEP job")

    job_data = job.get("job_data", {}) or {}
    if not job_data.get("sweep_parent"):
        raise HTTPException(status_code=400, detail="Job is not a sweep parent")

    sweep_job_ids = job_data.get("sweep_job_ids", [])
    sweep_metric = job_data.get("sweep_metric", "eval/loss")
    lower_is_better = job_data.get("lower_is_better", True)
    sweep_config = job_data.get("sweep_config", {})

    results = []
    best_metric_value = float("inf") if lower_is_better else float("-inf")
    best_config = None
    best_job_id = None

    for child_job_id in sweep_job_ids:
        child_job = await job_service.job_get(child_job_id, experiment_id=experiment_id)
        if not child_job:
            continue

        child_job_data = child_job.get("job_data", {}) or {}
        sweep_params = child_job_data.get("sweep_params", {})
        sweep_run_index = child_job_data.get("sweep_run_index", 0)
        child_status = child_job.get("status", "")

        metric_value = None
        metrics = {}

        if "score" in child_job_data:
            score = child_job_data["score"]
            if isinstance(score, dict):
                metrics = score
                metric_value = score.get(sweep_metric)
            elif isinstance(score, (int, float)):
                metric_value = score
                metrics = {sweep_metric: score}

        if metric_value is None and "completion_details" in child_job_data:
            completion_details = child_job_data["completion_details"]
            if isinstance(completion_details, dict) and sweep_metric in completion_details:
                metric_value = completion_details[sweep_metric]
                metrics = {sweep_metric: metric_value}

        result_entry = {
            "job_id": child_job_id,
            "run_index": sweep_run_index,
            "config": sweep_params,
            "status": child_status,
            "metrics": metrics,
            "metric_value": metric_value,
        }
        results.append(result_entry)

        if metric_value is not None and child_status == JobStatus.COMPLETE:
            is_better = (lower_is_better and metric_value < best_metric_value) or (
                not lower_is_better and metric_value > best_metric_value
            )
            if is_better:
                best_metric_value = metric_value
                best_config = sweep_params.copy()
                best_job_id = child_job_id

    results.sort(key=lambda x: x["run_index"])

    aggregated_results = {
        "sweep_config": sweep_config,
        "sweep_metric": sweep_metric,
        "lower_is_better": lower_is_better,
        "results": results,
        "best_config": best_config,
        "best_metric": {sweep_metric: best_metric_value}
        if best_metric_value != float("inf") and best_metric_value != float("-inf")
        else None,
        "best_job_id": best_job_id,
    }

    await job_service.job_update_job_data_insert_key_value(job_id, "sweep_results", aggregated_results, experiment_id)

    return {
        "status": "success",
        "data": aggregated_results,
    }
