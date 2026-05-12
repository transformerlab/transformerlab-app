"""Tests for the iterable form of BaseLabResource.delete(id=...)."""

import json
import uuid

import pytest

import lab.dirs as lab_dirs
from transformerlab.services.task_service import task_service


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
async def test_delete_with_iterable_deletes_each(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    ids = [f"task_{uuid.uuid4().hex[:8]}" for _ in range(3)]
    for tid in ids:
        _seed_task(tmp_experiments_dir, exp_id, tid)

    first = await task_service.task_service.get(ids[0], experiment_id=exp_id)
    result = await first.delete(ids)

    assert sorted(result["succeeded"]) == sorted(ids)
    assert result["failed"] == []
    for tid in ids:
        assert not (tmp_experiments_dir / exp_id / "tasks" / tid).exists()


@pytest.mark.asyncio
async def test_delete_with_iterable_reports_missing(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    real_id = f"task_{uuid.uuid4().hex[:8]}"
    missing_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, real_id)
    real = await task_service.task_service.get(real_id, experiment_id=exp_id)

    result = await real.delete([real_id, missing_id])

    assert result["succeeded"] == [real_id]
    assert result["failed"] == [{"id": missing_id, "error": "not found"}]


@pytest.mark.asyncio
async def test_delete_with_iterable_dedups(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)
    resource = await task_service.task_service.get(task_id, experiment_id=exp_id)

    result = await resource.delete([task_id, task_id, task_id])

    assert result["succeeded"] == [task_id]
    assert result["failed"] == []


@pytest.mark.asyncio
async def test_delete_with_string_id_deletes_sibling(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    a_id = f"task_{uuid.uuid4().hex[:8]}"
    b_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, a_id)
    _seed_task(tmp_experiments_dir, exp_id, b_id)

    a = await task_service.task_service.get(a_id, experiment_id=exp_id)
    result = await a.delete(b_id)

    assert result is None
    assert (tmp_experiments_dir / exp_id / "tasks" / a_id).exists()
    assert not (tmp_experiments_dir / exp_id / "tasks" / b_id).exists()


@pytest.mark.asyncio
async def test_delete_without_args_still_deletes_self(tmp_experiments_dir):
    """Back-compat: existing single-delete callers (no args) must still work."""
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)
    resource = await task_service.task_service.get(task_id, experiment_id=exp_id)

    result = await resource.delete()

    assert result is None
    assert not (tmp_experiments_dir / exp_id / "tasks" / task_id).exists()
