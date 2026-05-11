"""Tests for GET /experiment/{experimentId}/jobs/{job_id}/metrics."""

import json
import os

import pytest

import lab.dirs as lab_dirs


@pytest.fixture()
def tmp_workspace(monkeypatch, tmp_path):
    """Point workspace dirs to a temporary directory for isolation."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()

    jobs_dir = workspace / "jobs"
    jobs_dir.mkdir()

    async def mock_get_workspace_dir():
        return str(workspace)

    async def mock_get_jobs_dir(experiment_id: str):
        return str(jobs_dir)

    monkeypatch.setattr(lab_dirs, "get_workspace_dir", mock_get_workspace_dir)
    monkeypatch.setattr(lab_dirs, "get_jobs_dir", mock_get_jobs_dir)

    return {"workspace": workspace, "jobs_dir": jobs_dir}


def _seed_metrics(tmp_workspace, job_id: str, rows: list[dict]) -> str:
    """Write a metrics.jsonl file inside the seeded job directory."""
    job_dir = tmp_workspace["jobs_dir"] / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = job_dir / "metrics.jsonl"
    with open(metrics_path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")
    return str(metrics_path)


def test_get_job_metrics_returns_all_rows(client, tmp_workspace):
    job_id = "metrics-job-1"
    rows = [
        {"t": "2026-05-11T00:00:00Z", "progress": 10, "step": 0, "metrics": {"loss": 1.5}},
        {"t": "2026-05-11T00:00:01Z", "progress": 20, "step": 1, "metrics": {"loss": 1.2}},
    ]
    _seed_metrics(tmp_workspace, job_id, rows)

    resp = client.get(f"/experiment/alpha/jobs/{job_id}/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    assert data["rows"] == rows


def test_get_job_metrics_since_filter(client, tmp_workspace):
    job_id = "metrics-job-2"
    rows = [
        {"t": f"2026-05-11T00:00:0{i}Z", "progress": i * 10, "step": i, "metrics": {"loss": 1.0 - i * 0.1}}
        for i in range(5)
    ]
    _seed_metrics(tmp_workspace, job_id, rows)

    resp = client.get(f"/experiment/alpha/jobs/{job_id}/metrics?since=2")
    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 3
    assert data["rows"][0]["step"] == 2
    assert data["rows"][-1]["step"] == 4


def test_get_job_metrics_no_file(client, tmp_workspace):
    job_id = "metrics-job-missing"
    # Do not create a metrics.jsonl file.
    # Ensure the job dir doesn't even exist to confirm the "missing file" path.
    job_dir = tmp_workspace["jobs_dir"] / job_id
    assert not (job_dir / "metrics.jsonl").exists()
    # Touch the parent so get_job_dir's parent exists (not strictly required).
    os.makedirs(job_dir, exist_ok=True)

    resp = client.get(f"/experiment/alpha/jobs/{job_id}/metrics")
    assert resp.status_code == 200
    assert resp.json() == {"count": 0, "rows": []}
