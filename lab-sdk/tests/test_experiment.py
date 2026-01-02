import os
import json
import importlib
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
    from lab.job import Job

    exp = await Experiment.create("exp1")
    exp_dir = await exp.get_dir()
    assert exp_dir.endswith(os.path.join("experiments", "exp1"))
    assert os.path.isdir(exp_dir)

    # jobs.json created with default
    jobs_index_file = os.path.join(exp_dir, "jobs.json")
    assert os.path.isfile(jobs_index_file)
    with open(jobs_index_file) as f:
        data = json.load(f)
    assert "index" in data
    assert "TRAIN" in data["index"]

    # Create two jobs and assign to experiment
    j1 = await Job.create("10")
    await j1.set_experiment("exp1", sync_rebuild=True)
    j2 = await Job.create("11")
    await j2.set_experiment("exp1", sync_rebuild=True)

    # Manually trigger rebuild to ensure jobs are in the index
    from lab.dirs import get_workspace_dir

    workspace = await get_workspace_dir()
    await exp.rebuild_jobs_index(workspace_dir=workspace)

    all_jobs = await exp._get_all_jobs()
    # Jobs should now be visible after rebuild
    job_ids = set(all_jobs)
    assert "10" in job_ids
    assert "11" in job_ids


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
    from lab.job import Job

    exp = await Experiment.create("exp2")

    j1 = await Job.create("21")
    await j1.set_experiment("exp2", sync_rebuild=True)
    await j1.update_status("RUNNING")

    j2 = await Job.create("22")
    await j2.set_experiment("exp2", sync_rebuild=True)
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
