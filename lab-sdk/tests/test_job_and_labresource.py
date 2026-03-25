import os
import json
import importlib
import pytest


@pytest.mark.asyncio
async def test_baselabresource_create_get(tmp_path, monkeypatch):
    # Create a simple subclass inline by importing Job which uses BaseLabResource
    for mod in ["lab.job", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)

    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    job = await Job.create("123", "test_exp")
    job_dir = await job.get_dir()
    assert os.path.isdir(job_dir)
    assert "experiments/test_exp/jobs/123" in job_dir
    index_file = os.path.join(job_dir, "index.json")
    assert os.path.isfile(index_file)

    job2 = await Job.get("123", "test_exp")
    assert isinstance(job2, Job)


@pytest.mark.asyncio
async def test_job_default_json_and_updates(tmp_path, monkeypatch):
    for mod in ["lab.job", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)

    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    job = await Job.create("1", "test_exp")
    # On create, defaults are written to index.json
    job_dir = await job.get_dir()
    data_path = os.path.join(job_dir, "index.json")
    with open(data_path) as f:
        data = json.load(f)
    assert data["status"] == "NOT_STARTED"
    assert data["progress"] == 0

    await job.update_status("RUNNING")
    await job.update_progress(50)
    await job.update_job_data_field("k", "v")

    # After updates, read using BaseLabResource helper (prefers latest snapshot)
    data = await job.get_json_data()
    assert data["status"] == "RUNNING"
    assert data["progress"] == 50
    assert data["job_data"]["k"] == "v"


@pytest.mark.asyncio
async def test_job_data_field_updates(tmp_path, monkeypatch):
    for mod in ["lab.job", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)

    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    job = await Job.create("2", "test_exp")

    # Test updating job data fields directly
    await job.update_job_data_field("completion_status", "success")
    await job.update_job_data_field("completion_details", "ok")
    await job.update_job_data_field("score", {"acc": 1})

    data = await job.get_json_data()
    assert data["job_data"]["completion_status"] == "success"
    assert data["job_data"]["completion_details"] == "ok"
    assert data["job_data"]["score"] == {"acc": 1}


@pytest.mark.asyncio
async def test_job_create_and_get_with_experiment(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    job = await Job.create("job-uuid-1", "exp1")
    job_dir = await job.get_dir()
    assert "experiments/exp1/jobs/job-uuid-1" in job_dir
    assert os.path.isdir(job_dir)

    # index.json must have experiment_id and created_at
    index_file = os.path.join(job_dir, "index.json")
    with open(index_file) as f:
        data = json.load(f)
    assert data["experiment_id"] == "exp1"
    assert "created_at" in data

    # Job.get also requires experiment_id
    job2 = await Job.get("job-uuid-1", "exp1")
    assert isinstance(job2, Job)
    assert job2.experiment_id == "exp1"


@pytest.mark.asyncio
async def test_job_get_missing_raises(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    with pytest.raises(FileNotFoundError):
        await Job.get("nonexistent", "exp1")


@pytest.mark.asyncio
async def test_count_running_jobs_cross_experiment(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.job import Job

    j1 = await Job.create("job-a", "exp1")
    await j1.update_status("RUNNING")
    j2 = await Job.create("job-b", "exp2")
    await j2.update_status("RUNNING")
    j3 = await Job.create("job-c", "exp1")
    await j3.update_status("COMPLETE")

    count = await Job.count_running_jobs()
    assert count == 2


@pytest.mark.asyncio
async def test_get_next_queued_job_sorted_by_created_at(tmp_path, monkeypatch):
    for mod in list(importlib.sys.modules.keys()):
        if mod.startswith("lab."):
            importlib.sys.modules.pop(mod)

    ws = tmp_path / "ws"
    ws.mkdir()
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    import asyncio

    from lab.job import Job

    j1 = await Job.create("job-first", "exp1")
    await j1.update_status("QUEUED")
    await asyncio.sleep(0.01)  # ensure different created_at
    j2 = await Job.create("job-second", "exp2")
    await j2.update_status("QUEUED")

    result = await Job.get_next_queued_job()
    assert result is not None
    assert result["id"] == "job-first"
