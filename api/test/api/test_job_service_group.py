import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_job_create_group_type_allowed():
    """GROUP is a valid job type."""
    from transformerlab.services import job_service
    mock_job = AsyncMock()
    mock_job.id = "job-1"
    mock_exp = AsyncMock()
    mock_exp.create_job = AsyncMock(return_value=mock_job)
    with patch("transformerlab.services.job_service.Experiment", return_value=mock_exp):
        job_id = await job_service.job_create(
            type="GROUP",
            status="RUNNING",
            experiment_id="exp-1",
        )
    assert job_id == "job-1"


@pytest.mark.asyncio
async def test_jobs_get_group_children_returns_children():
    from transformerlab.services import job_service

    parent_job_mock = AsyncMock()
    parent_job_mock.get_experiment_id = AsyncMock(return_value="exp-1")
    parent_job_mock.get_job_data = AsyncMock(return_value={"group_job_ids": ["c1", "c2"]})

    child1 = AsyncMock()
    child1.get_json_data = AsyncMock(return_value={"id": "c1", "status": "COMPLETE"})
    child2 = AsyncMock()
    child2.get_json_data = AsyncMock(return_value={"id": "c2", "status": "RUNNING"})

    with patch("transformerlab.services.job_service.Job") as MockJob:
        MockJob.get = AsyncMock(side_effect=lambda jid: (
            parent_job_mock if jid == "parent-1"
            else (child1 if jid == "c1" else child2)
        ))
        children = await job_service.jobs_get_group_children("parent-1", experiment_id="exp-1")

    assert len(children) == 2
    assert children[0]["id"] == "c1"


@pytest.mark.asyncio
async def test_job_get_group_parent_returns_parent():
    from transformerlab.services import job_service

    child_mock = AsyncMock()
    child_mock.get_experiment_id = AsyncMock(return_value="exp-1")
    child_mock.get_job_data = AsyncMock(return_value={"parent_group_job_id": "parent-1"})

    parent_mock = AsyncMock()
    parent_mock.get_json_data = AsyncMock(return_value={"id": "parent-1", "type": "GROUP"})

    with patch("transformerlab.services.job_service.Job") as MockJob:
        MockJob.get = AsyncMock(side_effect=lambda jid: (
            child_mock if jid == "child-1" else parent_mock
        ))
        result = await job_service.job_get_group_parent("child-1", experiment_id="exp-1")

    assert result["id"] == "parent-1"


@pytest.mark.asyncio
async def test_job_get_group_parent_returns_none_when_no_parent():
    from transformerlab.services import job_service

    child_mock = AsyncMock()
    child_mock.get_experiment_id = AsyncMock(return_value="exp-1")
    child_mock.get_job_data = AsyncMock(return_value={})

    with patch("transformerlab.services.job_service.Job") as MockJob:
        MockJob.get = AsyncMock(return_value=child_mock)
        result = await job_service.job_get_group_parent("child-1", experiment_id="exp-1")

    assert result is None
