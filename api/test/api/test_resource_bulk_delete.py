"""Tests for the bulk-list form of BaseLabResource.delete(ids=..., loader=...)."""

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
async def test_delete_with_ids_deletes_each(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    ids = [f"task_{uuid.uuid4().hex[:8]}" for _ in range(3)]
    for tid in ids:
        _seed_task(tmp_experiments_dir, exp_id, tid)

    # Load one resource as the receiver of the bulk call; supply a loader for the rest.
    first = await task_service.task_service.get(ids[0], experiment_id=exp_id)

    async def loader(rid):
        return await task_service.task_service.get(rid, experiment_id=exp_id)

    result = await first.delete(ids=ids, loader=loader)

    assert sorted(result["succeeded"]) == sorted(ids)
    assert result["failed"] == []
    for tid in ids:
        assert not (tmp_experiments_dir / exp_id / "tasks" / tid).exists()


@pytest.mark.asyncio
async def test_delete_with_ids_reports_missing(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    real_id = f"task_{uuid.uuid4().hex[:8]}"
    missing_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, real_id)
    real = await task_service.task_service.get(real_id, experiment_id=exp_id)

    async def loader(rid):
        return await task_service.task_service.get(rid, experiment_id=exp_id)

    result = await real.delete(ids=[real_id, missing_id], loader=loader)

    assert result["succeeded"] == [real_id]
    assert result["failed"] == [{"id": missing_id, "error": "not found"}]


@pytest.mark.asyncio
async def test_delete_with_ids_dedups(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)
    resource = await task_service.task_service.get(task_id, experiment_id=exp_id)

    async def loader(rid):
        return await task_service.task_service.get(rid, experiment_id=exp_id)

    result = await resource.delete(ids=[task_id, task_id, task_id], loader=loader)

    assert result["succeeded"] == [task_id]
    assert result["failed"] == []


@pytest.mark.asyncio
async def test_delete_without_ids_still_deletes_self(tmp_experiments_dir):
    """Back-compat: existing single-delete callers (no args) must still work."""
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)
    resource = await task_service.task_service.get(task_id, experiment_id=exp_id)

    result = await resource.delete()

    assert result is None
    assert not (tmp_experiments_dir / exp_id / "tasks" / task_id).exists()
