import pytest
from unittest.mock import AsyncMock
from fastapi import HTTPException
from transformerlab.routers import compute_provider
from transformerlab.schemas.task import GroupLaunchRequest, GroupChildConfig


@pytest.mark.asyncio
async def test_check_group_status_all_contract(monkeypatch):
    async def fake_jobs_get_all(experiment_id, type="", status=""):
        assert type == "GROUP"
        return [
            {"id": "g1", "type": "GROUP", "status": "RUNNING", "job_data": {}},
        ]

    monkeypatch.setattr(compute_provider.job_service, "jobs_get_all", fake_jobs_get_all)

    response = await compute_provider.check_group_status_all(
        experiment_id="exp-1",
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["experiment_id"] == "exp-1"
    assert response["total"] == 1


@pytest.mark.asyncio
async def test_check_group_status_contract(monkeypatch):
    async def fake_job_get(job_id):
        return {
            "id": "g1",
            "type": "GROUP",
            "status": "RUNNING",
            "experiment_id": "exp-1",
            "job_data": {
                "group_parent": True,
                "group_total": 3,
                "group_completed": 1,
                "group_running": 1,
                "group_failed": 0,
                "group_queued": 1,
                "group_progress": 33,
                "failure_policy": "continue",
            },
        }

    monkeypatch.setattr(compute_provider.job_service, "job_get", fake_job_get)

    response = await compute_provider.check_group_status(
        job_id="g1",
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["job_id"] == "g1"
    assert response["group_total"] == 3
    assert response["group_completed"] == 1
    assert response["all_complete"] is False
    assert response["failure_policy"] == "continue"


@pytest.mark.asyncio
async def test_check_group_status_non_group_raises(monkeypatch):
    async def fake_job_get(_job_id):
        return {"id": "x", "type": "REMOTE", "status": "RUNNING", "job_data": {}}

    monkeypatch.setattr(compute_provider.job_service, "job_get", fake_job_get)

    with pytest.raises(HTTPException) as exc_info:
        await compute_provider.check_group_status(
            job_id="x",
            user_and_team={"team_id": "team-1"},
            session=None,
        )
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_launch_group_returns_parent_job_id(monkeypatch):
    """launch_group creates parent job immediately and returns it."""
    import asyncio as _asyncio

    monkeypatch.setattr(
        compute_provider,
        "_create_group_parent_job",
        AsyncMock(return_value="parent-job-1"),
    )

    async def fake_launch(*args, **kwargs):
        pass

    monkeypatch.setattr(compute_provider, "_launch_group_jobs", fake_launch)
    monkeypatch.setattr(_asyncio, "create_task", lambda coro: coro.close() or None)

    request = GroupLaunchRequest(
        experiment_id="exp-1",
        failure_policy="continue",
        jobs=[
            GroupChildConfig(name="job-a", run="python a.py"),
            GroupChildConfig(name="job-b", run="python b.py"),
        ],
    )
    response = await compute_provider.launch_group(
        provider_id="prov-1",
        request=request,
        user_and_team={"team_id": "team-1"},
        session=None,
    )

    assert response["status"] == "success"
    assert response["job_id"] == "parent-job-1"
    assert response["job_type"] == "GROUP"
    assert response["total_jobs"] == 2
