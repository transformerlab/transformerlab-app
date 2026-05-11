"""Tests for GET /experiment/{experimentId}/jobs/{job_id}/metrics."""

import asyncio
import json
import os


def _create_job(client, experiment_id: str = "alpha") -> str:
    """Create a job through the API and return its id as a string."""
    resp = client.get(f"/experiment/{experiment_id}/jobs/create?type=TRAIN&status=CREATED&data=%7B%7D")
    assert resp.status_code == 200
    body = resp.json()
    # job_create returns either the id directly or a dict; handle both
    if isinstance(body, dict):
        job_id = body.get("id") or body.get("job_id") or body.get("message")
    else:
        job_id = body
    assert job_id is not None
    return str(job_id)


def _seed_metrics_file(job_id: str, experiment_id: str, rows: list[dict]) -> str:
    """Resolve the job dir via the same helper the route uses and write metrics.jsonl."""
    from lab.dirs import get_job_dir

    job_dir = asyncio.run(get_job_dir(job_id, experiment_id))
    os.makedirs(job_dir, exist_ok=True)
    metrics_path = os.path.join(job_dir, "metrics.jsonl")
    with open(metrics_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    return metrics_path


def test_get_job_metrics_returns_all_rows(client):
    experiment_id = "alpha"
    job_id = _create_job(client, experiment_id)

    rows = [
        {"t": "2026-05-11T00:00:00Z", "progress": 10, "step": 0, "metrics": {"loss": 1.5}},
        {"t": "2026-05-11T00:00:01Z", "progress": 20, "step": 1, "metrics": {"loss": 1.2}},
    ]
    _seed_metrics_file(job_id, experiment_id, rows)

    resp = client.get(f"/experiment/{experiment_id}/jobs/{job_id}/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    assert data["rows"] == rows


def test_get_job_metrics_since_filter(client):
    experiment_id = "alpha"
    job_id = _create_job(client, experiment_id)

    rows = [
        {"t": f"2026-05-11T00:00:0{i}Z", "progress": i * 10, "step": i, "metrics": {"loss": 1.0 - i * 0.1}}
        for i in range(5)
    ]
    _seed_metrics_file(job_id, experiment_id, rows)

    resp = client.get(f"/experiment/{experiment_id}/jobs/{job_id}/metrics?since=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert data["rows"][0]["step"] == 2
    assert data["rows"][-1]["step"] == 4


def test_get_job_metrics_no_file(client):
    experiment_id = "alpha"
    job_id = _create_job(client, experiment_id)

    resp = client.get(f"/experiment/{experiment_id}/jobs/{job_id}/metrics")
    assert resp.status_code == 200
    assert resp.json() == {"count": 0, "rows": []}
