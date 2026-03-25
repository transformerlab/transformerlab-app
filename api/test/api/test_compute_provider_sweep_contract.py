import pytest
from fastapi import HTTPException

from transformerlab.routers import compute_provider


@pytest.mark.asyncio
async def test_check_sweep_status_all_contract(monkeypatch):
    async def fake_jobs_get_all(experiment_id, type="", status=""):
        assert experiment_id == "exp-1"
        assert type == "SWEEP"
        return [
            {"id": "101", "type": "SWEEP", "status": "RUNNING", "job_data": {}},
            {"id": "102", "type": "SWEEP", "status": "COMPLETE", "job_data": {}},
        ]

    monkeypatch.setattr(compute_provider.job_service, "jobs_get_all", fake_jobs_get_all)

    response = await compute_provider.check_sweep_status_all(
        experiment_id="exp-1",
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["experiment_id"] == "exp-1"
    assert isinstance(response["jobs"], list)
    assert response["total"] == 2


@pytest.mark.asyncio
async def test_check_sweep_status_contract(monkeypatch):
    async def fake_job_get(job_id, experiment_id=None):
        assert job_id == "123"
        assert experiment_id == "exp-1"
        return {
            "id": "123",
            "type": "SWEEP",
            "status": "RUNNING",
            "experiment_id": "exp-1",
            "job_data": {
                "sweep_parent": True,
                "sweep_total": 8,
                "sweep_completed": 3,
                "sweep_running": 2,
                "sweep_failed": 1,
                "sweep_queued": 2,
                "sweep_progress": 37,
            },
        }

    monkeypatch.setattr(compute_provider.job_service, "job_get", fake_job_get)

    response = await compute_provider.check_sweep_status(
        job_id="123",
        experiment_id="exp-1",
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["job_id"] == "123"
    assert response["sweep_total"] == 8
    assert response["sweep_completed"] == 3
    assert response["sweep_running"] == 2
    assert response["sweep_failed"] == 1
    assert response["sweep_queued"] == 2
    assert response["sweep_progress"] == 37
    assert response["all_complete"] is False
    assert response["job"]["id"] == "123"


@pytest.mark.asyncio
async def test_check_sweep_status_non_sweep_raises(monkeypatch):
    async def fake_job_get(_job_id, experiment_id=None):
        assert experiment_id == "exp-1"
        return {
            "id": "456",
            "type": "REMOTE",
            "status": "RUNNING",
            "experiment_id": "exp-1",
            "job_data": {},
        }

    monkeypatch.setattr(compute_provider.job_service, "job_get", fake_job_get)

    with pytest.raises(HTTPException) as exc_info:
        await compute_provider.check_sweep_status(
            job_id="456",
            experiment_id="exp-1",
            user_and_team={"team_id": "team-1"},
            session=None,
        )

    assert exc_info.value.status_code == 400
    assert "not a SWEEP job" in str(exc_info.value.detail)


@pytest.mark.asyncio
async def test_check_sweep_status_all_complete_true(monkeypatch):
    async def fake_job_get(job_id, experiment_id=None):
        assert job_id == "789"
        assert experiment_id == "exp-1"
        return {
            "id": "789",
            "type": "SWEEP",
            "status": "COMPLETE",
            "experiment_id": "exp-1",
            "job_data": {
                "sweep_parent": True,
                "sweep_total": 4,
                "sweep_completed": 3,
                "sweep_failed": 1,
                "sweep_running": 0,
                "sweep_queued": 0,
                "sweep_progress": 75,
            },
        }

    monkeypatch.setattr(compute_provider.job_service, "job_get", fake_job_get)

    response = await compute_provider.check_sweep_status(
        job_id="789",
        experiment_id="exp-1",
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["all_complete"] is True
