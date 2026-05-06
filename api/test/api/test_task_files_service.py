import json
import uuid

import pytest
from fastapi import HTTPException

import lab.dirs as lab_dirs
from transformerlab.services.task_service import task_service
from transformerlab.routers.experiment.task import task_list_files


@pytest.fixture
def tmp_experiments_dir(monkeypatch, tmp_path):
    """Redirect the experiments dir to a temp path so tests don't touch the real workspace."""
    experiments_dir = tmp_path / "experiments"
    experiments_dir.mkdir()

    async def mock_get_experiments_dir():
        return str(experiments_dir)

    monkeypatch.setattr(lab_dirs, "get_experiments_dir", mock_get_experiments_dir)
    return experiments_dir


def _seed_task(experiments_dir, exp_id: str, task_id: str, *, with_yaml: bool = True):
    """Create the on-disk layout: experiments/<exp>/tasks/<task>/{index.json[, task.yaml]}."""
    task_dir = experiments_dir / exp_id / "tasks" / task_id
    task_dir.mkdir(parents=True)
    (task_dir / "index.json").write_text(json.dumps({"id": task_id, "name": "test", "type": "TRAIN"}))
    if with_yaml:
        (task_dir / "task.yaml").write_text("name: test\ntype: TRAIN\n")
    return task_dir


@pytest.mark.asyncio
async def test_read_task_yaml_returns_content(tmp_experiments_dir):
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id)

    content = await task_service.read_task_yaml(task_id, experiment_id=exp_id)
    assert "name: test" in content


@pytest.mark.asyncio
async def test_read_task_yaml_missing_yaml_returns_distinct_404(tmp_experiments_dir):
    """Ali #4b: a real task without task.yaml gets the yaml-specific message."""
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    _seed_task(tmp_experiments_dir, exp_id, task_id, with_yaml=False)

    with pytest.raises(HTTPException) as exc:
        await task_service.read_task_yaml(task_id, experiment_id=exp_id)

    assert exc.value.status_code == 404
    assert exc.value.detail == "task.yaml not found for this task"


@pytest.mark.asyncio
async def test_read_task_yaml_missing_task_returns_task_not_found(tmp_experiments_dir):
    """Ali #4b: a nonexistent task gets the task-specific message, not the yaml one."""
    with pytest.raises(HTTPException) as exc:
        await task_service.read_task_yaml(
            f"missing_task_{uuid.uuid4().hex[:8]}",
            experiment_id=f"missing_exp_{uuid.uuid4().hex[:8]}",
        )

    assert exc.value.status_code == 404
    assert exc.value.detail == "Task not found"


@pytest.mark.asyncio
async def test_read_task_yaml_invalid_exp_does_not_leak_dirs(tmp_experiments_dir):
    """Ali #1/#4a: an invalid experiment_id must not leak experiments/<garbage>/."""
    garbage_exp = f"garbage_exp_{uuid.uuid4().hex[:12]}"

    with pytest.raises(HTTPException):
        await task_service.read_task_yaml("anything", experiment_id=garbage_exp)

    assert not (tmp_experiments_dir / garbage_exp).exists()


@pytest.mark.asyncio
async def test_task_list_files_invalid_exp_does_not_leak_dirs(tmp_experiments_dir):
    """Ali #1/#4a: /files on an invalid experiment_id 404s without leaking dirs."""
    garbage_exp = f"garbage_exp_{uuid.uuid4().hex[:12]}"

    with pytest.raises(HTTPException) as exc:
        await task_list_files(experimentId=garbage_exp, task_id="anything")

    assert exc.value.status_code == 404
    assert not (tmp_experiments_dir / garbage_exp).exists()


@pytest.mark.asyncio
async def test_task_list_files_returns_dedup_list_with_local_entries(tmp_experiments_dir):
    """Ali #2(b): valid task returns dedup'd local files; index.json is filtered."""
    exp_id = f"exp_{uuid.uuid4().hex[:8]}"
    task_id = f"task_{uuid.uuid4().hex[:8]}"
    task_dir = _seed_task(tmp_experiments_dir, exp_id, task_id)
    (task_dir / "extra.txt").write_text("hi")

    response = await task_list_files(experimentId=exp_id, task_id=task_id)

    assert response.local_files is not None
    assert "extra.txt" in response.local_files
    assert "index.json" not in response.local_files
