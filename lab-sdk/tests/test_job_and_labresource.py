import os
import json
import importlib


def test_baselabresource_create_get(tmp_path, monkeypatch):
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

    job = Job.create("123")
    assert os.path.isdir(job.get_dir())
    index_file = os.path.join(job.get_dir(), "index.json")
    assert os.path.isfile(index_file)

    job2 = Job.get("123")
    assert isinstance(job2, Job)


def test_job_default_json_and_updates(tmp_path, monkeypatch):
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

    job = Job.create("1")
    # On create, defaults are written to index.json
    data_path = os.path.join(job.get_dir(), "index.json")
    with open(data_path) as f:
        data = json.load(f)
    assert data["status"] == "NOT_STARTED"
    assert data["progress"] == 0

    job.update_status("RUNNING")
    job.update_progress(50)
    job.update_job_data_field("k", "v")

    # After updates, read using BaseLabResource helper (prefers latest snapshot)
    data = job.get_json_data()
    assert data["status"] == "RUNNING"
    assert data["progress"] == 50
    assert data["job_data"]["k"] == "v"


def test_job_data_field_updates(tmp_path, monkeypatch):
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

    job = Job.create("2")
    
    # Test updating job data fields directly
    job.update_job_data_field("completion_status", "success")
    job.update_job_data_field("completion_details", "ok")
    job.update_job_data_field("score", {"acc": 1})

    data = job.get_json_data()
    assert data["job_data"]["completion_status"] == "success"
    assert data["job_data"]["completion_details"] == "ok"
    assert data["job_data"]["score"] == {"acc": 1}

