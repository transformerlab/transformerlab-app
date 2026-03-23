import os
import json
import importlib
import asyncio
import pytest


def _fresh(monkeypatch):
    for mod in ["lab.experiment", "lab.job", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)


@pytest.mark.asyncio
async def test_experiment_dir_and_jobs_index(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    exp = await Experiment.create("exp1")
    exp_dir = await exp.get_dir()
    assert exp_dir.endswith(os.path.join("experiments", "exp1"))
    assert os.path.isdir(exp_dir)

    # Create two jobs via experiment API and ensure they are discoverable.
    j1 = await exp.create_job()
    j2 = await exp.create_job()

    all_jobs = await exp.get_jobs()
    job_ids = {j.get("id") for j in all_jobs}
    assert str(j1.id) in job_ids
    assert str(j2.id) in job_ids


@pytest.mark.asyncio
async def test_get_jobs_filters(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    exp = await Experiment.create("exp2")

    j1 = await exp.create_job()
    await j1.update_status("RUNNING")

    j2 = await exp.create_job()
    await j2.update_status("NOT_STARTED")

    # get all
    jobs = await exp.get_jobs()
    assert isinstance(jobs, list)
    # filter by status
    running = await exp.get_jobs(status="RUNNING")
    assert all(j.get("status") == "RUNNING" for j in running)


@pytest.mark.asyncio
async def test_experiment_create_and_get(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    # Create experiment and verify it exists
    exp = await Experiment.create("test_experiment")
    assert exp is not None

    # Get the experiment and verify its properties
    exp_data = await exp.get_json_data()
    assert exp_data["name"] == "test_experiment"

    # Try to get an experiment that doesn't exist
    try:
        nonexistent = await Experiment.get("999999")
        # If we get here, the experiment should be None or indicate it doesn't exist
        assert nonexistent is None
    except Exception:
        # Getting a nonexistent experiment might raise an exception, which is also acceptable
        pass


@pytest.mark.asyncio
async def test_experiment_config_validation(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    # Test creating experiment with valid config
    exp = await Experiment.create_with_config("test_experiment_config", {"key": "value"})
    assert exp is not None

    # Test creating experiment with invalid config (string instead of dict)
    try:
        await Experiment.create_with_config("test_experiment_invalid", "not_a_dict")
        assert False, "Should have raised an exception for invalid config"
    except TypeError:
        # Expected behavior - should raise TypeError for non-dict config
        pass


@pytest.mark.asyncio
async def test_update_cached_job_is_safe_under_concurrent_writes(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    exp = await Experiment.create("exp-concurrent")

    original_read = Experiment._read_jobs_json_file
    gate = asyncio.Event()
    counter = {"count": 0}

    async def delayed_read(self, jobs_json_path, max_retries=5):
        result = await original_read(self, jobs_json_path, max_retries=max_retries)
        counter["count"] += 1
        if counter["count"] <= 2:
            if counter["count"] == 2:
                gate.set()
            try:
                await asyncio.wait_for(gate.wait(), timeout=0.2)
            except TimeoutError:
                pass
        return result

    monkeypatch.setattr(Experiment, "_read_jobs_json_file", delayed_read)

    await asyncio.gather(
        exp._update_cached_job("job-1", {"id": "job-1", "status": "COMPLETE"}),
        exp._update_cached_job("job-2", {"id": "job-2", "status": "COMPLETE"}),
    )

    jobs_json_path = await exp._jobs_json_file()
    with open(jobs_json_path, encoding="utf-8") as f:
        jobs_data = json.load(f)
    cached_jobs = jobs_data.get("cached_jobs", {})
    assert set(cached_jobs.keys()) >= {"job-1", "job-2"}


@pytest.mark.asyncio
async def test_create_job_uses_uuid_and_experiment_dir(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    exp = Experiment("alpha")
    job = await exp.create_job("TRAIN")

    # Job ID should be a UUID string
    import uuid

    uuid.UUID(str(job.id))  # raises ValueError if not valid UUID

    # Job directory should be under the experiment
    job_dir = await job.get_dir()
    assert "experiments/alpha/jobs/" in job_dir

    # index.json should have experiment_id and created_at
    import os

    with open(os.path.join(job_dir, "index.json")) as f:
        data = json.load(f)
    assert data["experiment_id"] == "alpha"
    assert "created_at" in data


@pytest.mark.asyncio
async def test_get_jobs_lists_from_directory(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment

    exp = Experiment("alpha")
    j1 = await exp.create_job("TRAIN")
    await j1.update_status("COMPLETE")
    j2 = await exp.create_job("DOWNLOAD_MODEL")
    await j2.update_status("RUNNING")

    all_jobs = await exp.get_jobs()
    assert len(all_jobs) == 2

    train_jobs = await exp.get_jobs(type="TRAIN")
    assert len(train_jobs) == 1
    assert train_jobs[0]["type"] == "TRAIN"

    running_jobs = await exp.get_jobs(status="RUNNING")
    assert len(running_jobs) == 1


@pytest.mark.asyncio
async def test_delete_all_jobs(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment
    from lab.dirs import get_jobs_dir

    exp = Experiment("alpha")
    await exp.create_job("TRAIN")
    await exp.create_job("TRAIN")

    jobs_before = await exp.get_jobs()
    assert len(jobs_before) == 2

    await exp.delete_all_jobs()

    jobs_after = await exp.get_jobs()
    assert len(jobs_after) == 0
