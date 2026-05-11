import json
import uuid

import pytest

import lab.dirs as lab_dirs
from transformerlab.routers.experiment.task import bulk_delete_tasks
from transformerlab.schemas.task import BulkDeleteTasksRequest


@pytest.fixture
def tmp_experiments_dir(monkeypatch, tmp_path):
    experiments_dir = tmp_path / "experiments"
    experiments_dir.mkdir()

    async def mock_get_experiments_dir():
        return str(experiments_dir)

    monkeypatch.setattr(lab_dirs, "get_experiments_dir", mock_get_experiments_dir)
    return experiments_dir


def _seed_task(experiments_dir, exp_id: str, task_id: str):
    task_dir = experiments_dir / exp_id / "tasks" / task_id
    task_dir.mkdir(parents=True)
    (task_dir / "index.json").write_text(
        json.dumps({"id": task_id, "name": "test", "type": "TRAIN", "experiment_id": exp_id})
    )
    (task_dir / "task.yaml").write_text("name: test\ntype: TRAIN\n")


@pytest.mark.asyncio
async def test_bulk_delete_all_succeed(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    ids = [f"task_{uuid.uuid4().hex[:8]}" for _ in range(3)]
    for tid in ids:
        _seed_task(tmp_experiments_dir, exp_id, tid)

    resp = await bulk_delete_tasks(exp_id, BulkDeleteTasksRequest(task_ids=ids))

    assert sorted(resp.succeeded) == sorted(ids)
    assert resp.failed == []
    for tid in ids:
        assert not (tmp_experiments_dir / exp_id / "tasks" / tid).exists()


@pytest.mark.asyncio
async def test_bulk_delete_partial_failure_reports_missing(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    real_id = f"task_{uuid.uuid4().hex[:8]}"
    missing_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, real_id)

    resp = await bulk_delete_tasks(exp_id, BulkDeleteTasksRequest(task_ids=[real_id, missing_id]))

    assert resp.succeeded == [real_id]
    assert len(resp.failed) == 1
    assert resp.failed[0].task_id == missing_id
    assert resp.failed[0].deleted is False
    assert resp.failed[0].error == "not found"


@pytest.mark.asyncio
async def test_bulk_delete_dedups_input_ids(tmp_experiments_dir):
    """Duplicate IDs in the payload must not race against themselves and must only count once."""
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)

    resp = await bulk_delete_tasks(exp_id, BulkDeleteTasksRequest(task_ids=[task_id, task_id, task_id]))

    assert resp.succeeded == [task_id]
    assert resp.failed == []


@pytest.mark.asyncio
async def test_bulk_delete_empty_list_is_noop(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"

    resp = await bulk_delete_tasks(exp_id, BulkDeleteTasksRequest(task_ids=[]))

    assert resp.succeeded == []
    assert resp.failed == []
