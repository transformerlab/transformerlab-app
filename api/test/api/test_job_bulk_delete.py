import uuid

import pytest

import lab.dirs as lab_dirs
import transformerlab.services.job_service as job_service
from lab import Job
from lab.job_status import JobStatus


@pytest.fixture
def tmp_workspace(monkeypatch, tmp_path):
    """Redirect the workspace + experiments dirs to a temp path."""
    workspace = tmp_path / "workspace"
    experiments_dir = workspace / "experiments"
    experiments_dir.mkdir(parents=True)

    async def mock_get_experiments_dir():
        return str(experiments_dir)

    async def mock_get_workspace_dir():
        return str(workspace)

    monkeypatch.setattr(lab_dirs, "get_experiments_dir", mock_get_experiments_dir)
    monkeypatch.setattr(lab_dirs, "get_workspace_dir", mock_get_workspace_dir)
    return experiments_dir


async def _seed_job(exp_id: str) -> str:
    job_id = uuid.uuid4().hex
    await Job.create(job_id, exp_id)
    return job_id


@pytest.mark.asyncio
async def test_bulk_delete_jobs_marks_each_as_deleted(tmp_workspace):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    job_ids = [await _seed_job(exp_id) for _ in range(3)]

    resp = await job_service.bulk_delete_jobs(job_ids, experiment_id=exp_id)

    assert sorted(resp["succeeded"]) == sorted(job_ids)
    assert resp["failed"] == []

    for jid in job_ids:
        job = await Job.get(jid, exp_id)
        assert (await job.get_status()) == JobStatus.DELETED


@pytest.mark.asyncio
async def test_bulk_delete_jobs_reports_missing(tmp_workspace):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    real_id = await _seed_job(exp_id)
    missing_id = uuid.uuid4().hex

    resp = await job_service.bulk_delete_jobs([real_id, missing_id], experiment_id=exp_id)

    assert resp["succeeded"] == [real_id]
    assert len(resp["failed"]) == 1
    assert resp["failed"][0]["id"] == missing_id
    assert resp["failed"][0]["error"] == "not found"


@pytest.mark.asyncio
async def test_bulk_delete_jobs_dedups(tmp_workspace):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    job_id = await _seed_job(exp_id)

    resp = await job_service.bulk_delete_jobs([job_id, job_id, job_id], experiment_id=exp_id)

    assert resp["succeeded"] == [job_id]
    assert resp["failed"] == []
