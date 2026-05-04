import os
import asyncio
import json
import importlib
import pytest


def _fresh(monkeypatch):
    for mod in [
        "lab.lab_facade",
        "lab.experiment",
        "lab.job",
        "lab.dirs",
        "lab.dataset",
        "lab.model",
    ]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)


def test_lab_init(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Verify experiment and job are initialized
    assert lab._experiment is not None
    assert lab._job is not None
    assert asyncio.run(lab._job.get_status()) == "RUNNING"

    # Verify job data has start_time
    job_data = lab.get_job_data()
    assert "start_time" in job_data


def test_lab_init_with_existing_job(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.experiment import Experiment

    # Create an experiment and job first
    exp = asyncio.run(Experiment.create("test_exp"))
    job = asyncio.run(exp.create_job())
    job_id = str(job.id)

    # Set environment variable to use existing job
    monkeypatch.setenv("_TFL_JOB_ID", str(job_id))

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Verify it's using the existing job
    assert lab._job.id == job_id
    assert asyncio.run(lab._job.get_status()) == "RUNNING"


def test_lab_init_with_nonexistent_job(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))
    monkeypatch.setenv("_TFL_JOB_ID", "nonexistent_job")

    from lab.lab_facade import Lab

    lab = Lab()
    try:
        lab.init(experiment_id="test_exp")
        assert False, "Should have raised FileNotFoundError or RuntimeError"
    except (FileNotFoundError, RuntimeError):
        pass  # Expected - Job.get() raises FileNotFoundError when job doesn't exist


def test_lab_set_config(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    config = {"epochs": 10, "learning_rate": 0.001}
    lab.set_config(config)

    job_data = lab.get_job_data()
    assert job_data["epochs"] == 10
    assert job_data["learning_rate"] == 0.001
    assert job_data["experiment_name"] == "test_exp"


def test_lab_set_config_merges_existing(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Set initial config
    lab.set_config({"epochs": 10, "batch_size": 32})

    # Update with new config
    lab.set_config({"epochs": 20})

    job_data = lab.get_job_data()
    assert job_data["epochs"] == 20  # Updated
    assert job_data["batch_size"] == 32  # Preserved


def test_lab_log(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.log("Test message")

    # Verify log was written to file
    log_path = asyncio.run(lab._job.get_log_path())
    assert os.path.exists(log_path)
    with open(log_path, "r") as f:
        content = f.read()
        assert "Test message" in content


def test_lab_update_progress(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.update_progress(50)
    assert asyncio.run(lab._job.get_progress()) == 50

    lab.update_progress(100)
    assert asyncio.run(lab._job.get_progress()) == 100


def test_lab_finish(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.finish(message="Job completed", score={"accuracy": 0.95})

    assert asyncio.run(lab._job.get_status()) == "COMPLETE"
    assert asyncio.run(lab._job.get_progress()) == 100
    job_data = lab.get_job_data()
    assert job_data["completion_status"] == "success"
    assert job_data["completion_details"] == "Job completed"
    assert job_data["score"] == {"accuracy": 0.95, "discard": False}


def test_lab_finish_preserves_explicit_discard_value(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.finish(message="Job completed", score={"accuracy": 0.95, "discard": True})

    job_data = lab.get_job_data()
    assert job_data["score"] == {"accuracy": 0.95, "discard": True}


def test_lab_finish_with_paths(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.finish(
        message="Job completed",
        additional_output_path="/path/to/output",
        plot_data_path="/path/to/plot",
    )

    job_data = lab.get_job_data()
    assert job_data["additional_output_path"] == "/path/to/output"
    assert job_data["plot_data_path"] == "/path/to/plot"


def test_lab_error(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    lab.error(message="Job failed")

    assert asyncio.run(lab._job.get_status()) == "FAILED"
    job_data = lab.get_job_data()
    assert job_data["completion_status"] == "failed"
    assert job_data["completion_details"] == "Job failed"
    assert job_data["status"] == "FAILED"


def test_lab_save_artifact_file(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a test file
    test_file = tmp_path / "test_artifact.txt"
    test_file.write_text("test content")

    dest_path = lab.save_artifact(str(test_file))

    assert os.path.exists(dest_path)
    assert os.path.isfile(dest_path)
    with open(dest_path, "r") as f:
        assert f.read() == "test content"

    # Verify artifact is tracked in job_data
    job_data = lab.get_job_data()
    assert "artifacts" in job_data
    assert dest_path in job_data["artifacts"]


def test_lab_save_artifact_directory(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a test directory
    test_dir = tmp_path / "test_artifact_dir"
    test_dir.mkdir()
    (test_dir / "file1.txt").write_text("file1")
    (test_dir / "file2.txt").write_text("file2")

    dest_path = lab.save_artifact(str(test_dir))

    assert os.path.exists(dest_path)
    assert os.path.isdir(dest_path)
    assert os.path.exists(os.path.join(dest_path, "file1.txt"))
    assert os.path.exists(os.path.join(dest_path, "file2.txt"))


def test_lab_save_artifact_with_name(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    test_file = tmp_path / "original_name.txt"
    test_file.write_text("test")

    dest_path = lab.save_artifact(str(test_file), name="custom_name.txt")

    assert os.path.basename(dest_path) == "custom_name.txt"
    assert os.path.exists(dest_path)


def test_lab_save_artifact_invalid_path(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    try:
        lab.save_artifact("")
        assert False, "Should have raised ValueError"
    except ValueError:
        pass

    try:
        lab.save_artifact("/nonexistent/path")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        pass


def test_lab_save_checkpoint(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a test checkpoint file
    test_file = tmp_path / "checkpoint.pt"
    test_file.write_text("checkpoint data")

    dest_path = lab.save_checkpoint(str(test_file))

    assert os.path.exists(dest_path)
    assert os.path.isfile(dest_path)

    # Verify checkpoint is tracked in job_data
    job_data = lab.get_job_data()
    assert "checkpoints" in job_data
    assert dest_path in job_data["checkpoints"]
    assert job_data["latest_checkpoint"] == dest_path


def test_lab_save_checkpoint_directory(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a test checkpoint directory
    test_dir = tmp_path / "checkpoint_dir"
    test_dir.mkdir()
    (test_dir / "model.bin").write_text("model")

    dest_path = lab.save_checkpoint(str(test_dir))

    assert os.path.exists(dest_path)
    assert os.path.isdir(dest_path)
    assert os.path.exists(os.path.join(dest_path, "model.bin"))


def test_lab_capture_trackio_metadata_directory(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a fake Trackio directory representing the local metrics DB
    trackio_src = tmp_path / "trackio_src"
    trackio_src.mkdir()
    (trackio_src / "metrics.sqlite").write_text("db")

    dest_path = lab.capture_trackio_metadata(str(trackio_src), project="my-project")

    assert os.path.exists(dest_path)
    assert os.path.isdir(dest_path)
    # The copied DB file should exist under the destination
    assert os.path.exists(os.path.join(dest_path, "metrics.sqlite"))

    job_data = lab.get_job_data()
    assert job_data.get("trackio_db_artifact_path") == dest_path
    assert job_data.get("trackio_project") == "my-project"


def test_lab_save_dataset(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create a mock pandas DataFrame-like object
    class MockDataFrame:
        def __init__(self, data):
            self.data = data

        def __len__(self):
            return len(self.data)

        def to_json(self, path_or_buf, orient, lines):
            _ = orient
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, "write"):
                # It's a file-like object
                f = path_or_buf
                if lines:
                    for item in self.data:
                        f.write(json.dumps(item) + "\n")
                else:
                    json.dump(self.data, f)
            else:
                # It's a path string
                with open(path_or_buf, "w") as f:
                    if lines:
                        for item in self.data:
                            f.write(json.dumps(item) + "\n")
                    else:
                        json.dump(self.data, f)

    df = MockDataFrame([{"a": 1, "b": 2}, {"a": 3, "b": 4}])

    output_path = lab.save_dataset(df, "test_dataset")

    assert os.path.exists(output_path)
    # Dataset name should be prefixed with job_id
    job_id = lab._job.id
    expected_filename = f"{job_id}_test_dataset.json"
    assert output_path.endswith(expected_filename)

    # Verify dataset metadata was created
    from lab.dataset import Dataset

    prefixed_dataset_id = f"{job_id}_test_dataset"
    ds = asyncio.run(Dataset.get(prefixed_dataset_id, job_id=job_id))
    metadata = asyncio.run(ds.get_metadata())
    assert metadata["dataset_id"] == prefixed_dataset_id
    assert metadata["location"] == "local"
    assert metadata["json_data"]["generated"] is True
    assert metadata["json_data"]["sample_count"] == 2
    assert metadata["json_data"]["job_id"] == job_id

    # Verify dataset is tracked in job_data
    job_data = lab.get_job_data()
    assert job_data["dataset_id"] == prefixed_dataset_id


def test_lab_save_dataset_with_metadata(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    class MockDataFrame:
        def __init__(self, data):
            self.data = data

        def __len__(self):
            return len(self.data)

        def to_json(self, path_or_buf, orient, lines):
            _ = orient
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, "write"):
                # It's a file-like object
                json.dump(self.data, path_or_buf)
            else:
                # It's a path string
                with open(path_or_buf, "w") as f:
                    json.dump(self.data, f)

    df = MockDataFrame([{"a": 1}])
    additional_metadata = {"description": "Test dataset", "source": "synthetic"}

    lab.save_dataset(df, "test_dataset_meta", additional_metadata=additional_metadata)

    from lab.dataset import Dataset

    job_id = lab._job.id
    prefixed_dataset_id = f"{job_id}_test_dataset_meta"
    ds = asyncio.run(Dataset.get(prefixed_dataset_id, job_id=job_id))
    metadata = asyncio.run(ds.get_metadata())
    assert metadata["json_data"]["description"] == "Test dataset"
    assert metadata["json_data"]["source"] == "synthetic"


def test_lab_save_dataset_image_format(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    class MockDataFrame:
        def __init__(self, data):
            self.data = data

        def __len__(self):
            return len(self.data)

        def to_json(self, path_or_buf, orient, lines):
            _ = orient
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, "write"):
                # It's a file-like object
                f = path_or_buf
                for item in self.data:
                    f.write(json.dumps(item) + "\n")
            else:
                # It's a path string
                with open(path_or_buf, "w") as f:
                    for item in self.data:
                        f.write(json.dumps(item) + "\n")

    df = MockDataFrame([{"image": "img1.jpg"}])

    output_path = lab.save_dataset(df, "test_dataset_image", is_image=True)

    assert os.path.basename(output_path) == "metadata.jsonl"


def test_lab_save_dataset_duplicate_error(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.dataset import Dataset

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Create dataset first
    asyncio.run(Dataset.create("existing_dataset"))

    class MockDataFrame:
        def __init__(self, data):
            self.data = data

        def __len__(self):
            return len(self.data)

        def to_json(self, path_or_buf, orient, lines):
            _ = orient
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, "write"):
                # It's a file-like object
                json.dump(self.data, path_or_buf)
            else:
                # It's a path string
                with open(path_or_buf, "w") as f:
                    json.dump(self.data, f)

    df = MockDataFrame([{"a": 1}])

    output_path_1 = lab.save_dataset(df, "existing_dataset")
    assert os.path.exists(output_path_1)
    job_id = lab._job.id
    assert f"{job_id}_existing_dataset.json" in output_path_1

    # Save again with same name in same job - should create with suffix
    output_path_2 = lab.save_dataset(df, "existing_dataset")
    assert os.path.exists(output_path_2)
    assert output_path_1 != output_path_2
    assert f"{job_id}_existing_dataset_1.json" in output_path_2


def test_lab_properties(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Test job property
    job = lab.job
    assert job is not None
    assert job.id == lab._job.id

    # Test experiment property
    experiment = lab.experiment
    assert experiment is not None
    assert experiment.id == lab._experiment.id


def test_lab_properties_uninitialized(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()

    try:
        _ = lab.job
        assert False, "Should have raised RuntimeError"
    except RuntimeError:
        pass

    try:
        _ = lab.experiment
        assert False, "Should have raised RuntimeError"
    except RuntimeError:
        pass


def test_lab_get_checkpoints_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    checkpoints_dir = lab.get_checkpoints_dir()
    assert os.path.exists(checkpoints_dir)
    assert "checkpoints" in checkpoints_dir


def test_lab_get_artifacts_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    artifacts_dir = lab.get_artifacts_dir()
    assert os.path.exists(artifacts_dir)
    assert "artifacts" in artifacts_dir


def test_lab_get_checkpoint_paths(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Save a checkpoint
    test_file = tmp_path / "checkpoint.pt"
    test_file.write_text("data")
    lab.save_checkpoint(str(test_file))

    checkpoint_paths = lab.get_checkpoint_paths()
    assert len(checkpoint_paths) > 0


def test_lab_get_artifact_paths(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    # Save an artifact
    test_file = tmp_path / "artifact.txt"
    test_file.write_text("data")
    lab.save_artifact(str(test_file))

    artifact_paths = lab.get_artifact_paths()
    assert len(artifact_paths) > 0


def test_lab_capture_wandb_url(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    lab.init(experiment_id="test_exp")

    wandb_url = "https://wandb.ai/test/run-123"
    lab.capture_wandb_url(wandb_url)

    job_data = lab.get_job_data()
    assert job_data["wandb_run_url"] == wandb_url


def test_lab_ensure_initialized(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()

    # Try to use methods without initialization
    methods_to_test = [
        lambda: lab.set_config({}),
        lambda: lab.log("test"),
        lambda: lab.update_progress(50),
        lambda: lab.finish(),
        lambda: lab.error("error"),
        lambda: lab.save_artifact("/tmp/test"),
        lambda: lab.save_checkpoint("/tmp/test"),
    ]

    for method in methods_to_test:
        try:
            method()
            assert False, f"Should have raised RuntimeError for {method}"
        except RuntimeError:
            pass  # Expected


def test_lab_list_datasets(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.dataset import Dataset

    # Create test datasets
    ds1 = asyncio.run(Dataset.create("test_dataset_1"))
    asyncio.run(ds1.set_metadata(description="First dataset"))

    ds2 = asyncio.run(Dataset.create("test_dataset_2"))
    asyncio.run(ds2.set_metadata(description="Second dataset"))

    lab = Lab()
    # list_datasets doesn't require initialization
    datasets = lab.list_datasets()

    assert len(datasets) >= 2
    dataset_ids = [d.get("dataset_id") for d in datasets]
    assert "test_dataset_1" in dataset_ids
    assert "test_dataset_2" in dataset_ids


def test_lab_list_datasets_empty(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    datasets = lab.list_datasets()

    assert isinstance(datasets, list)
    assert len(datasets) == 0


def test_lab_get_dataset(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.dataset import Dataset

    # Create a test dataset
    ds = asyncio.run(Dataset.create("test_dataset_get"))
    asyncio.run(ds.set_metadata(description="My Dataset"))

    lab = Lab()
    # get_dataset doesn't require initialization
    retrieved_ds = lab.get_dataset("test_dataset_get")

    assert retrieved_ds.id == "test_dataset_get"
    metadata = asyncio.run(retrieved_ds.get_metadata())
    assert metadata["description"] == "My Dataset"


def test_lab_get_dataset_nonexistent(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    try:
        lab.get_dataset("nonexistent_dataset")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        pass  # Expected


def test_lab_list_and_read_documents(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.experiment import Experiment

    lab = Lab()
    lab.init(experiment_id="test_exp_docs")

    exp = Experiment("test_exp_docs")
    exp_dir = asyncio.run(exp.get_dir())
    docs_dir = os.path.join(exp_dir, "documents")
    os.makedirs(docs_dir, exist_ok=True)

    txt_path = os.path.join(docs_dir, "notes.txt")
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("hello docs")

    listed = lab.list_documents()
    names = [entry["name"] for entry in listed]
    assert "notes.txt" in names

    text_content = lab.get_document_contents("notes.txt")
    assert text_content == "hello docs"

    byte_content = lab.get_document_bytes("notes.txt")
    assert byte_content == b"hello docs"


def test_lab_list_documents_in_folder_with_explicit_experiment_id(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.experiment import Experiment

    exp = asyncio.run(Experiment.create("test_exp_docs_folder"))
    exp_dir = asyncio.run(exp.get_dir())
    folder_path = os.path.join(exp_dir, "documents", "articles")
    os.makedirs(folder_path, exist_ok=True)
    with open(os.path.join(folder_path, "a.txt"), "w", encoding="utf-8") as f:
        f.write("folder doc")

    lab = Lab()
    docs = lab.list_documents(folder="articles", experiment_id="test_exp_docs_folder")
    assert len(docs) == 1
    assert docs[0]["name"] == "a.txt"

    content = lab.get_document_contents(document_name="a.txt", folder="articles", experiment_id="test_exp_docs_folder")
    assert content == "folder doc"


def test_lab_list_documents_filters_internal_files(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.experiment import Experiment

    lab = Lab()
    lab.init(experiment_id="test_exp_docs_filters")

    exp = Experiment("test_exp_docs_filters")
    exp_dir = asyncio.run(exp.get_dir())
    docs_dir = os.path.join(exp_dir, "documents")
    os.makedirs(docs_dir, exist_ok=True)

    with open(os.path.join(docs_dir, ".tlab_markitdown"), "w", encoding="utf-8") as f:
        f.write("internal")
    with open(os.path.join(docs_dir, ".keep"), "w", encoding="utf-8") as f:
        f.write("")
    with open(os.path.join(docs_dir, "visible.txt"), "w", encoding="utf-8") as f:
        f.write("hello")

    listed = lab.list_documents()
    names = [entry["name"] for entry in listed]
    assert "visible.txt" in names
    assert ".tlab_markitdown" not in names
    assert ".keep" not in names


def test_lab_list_models(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.model import Model

    # Create a test model
    model1 = asyncio.run(Model.create("test_model_1"))
    asyncio.run(model1.set_metadata(name="Test Model 1"))

    # Create another test model
    model2 = asyncio.run(Model.create("test_model_2"))
    asyncio.run(model2.set_metadata(name="Test Model 2"))

    lab = Lab()
    # list_models doesn't require initialization
    models = lab.list_models()

    assert len(models) >= 2
    model_ids = [m.get("model_id") for m in models]
    assert "test_model_1" in model_ids
    assert "test_model_2" in model_ids


def test_lab_get_model(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.model import Model

    # Create a test model
    model = asyncio.run(Model.create("test_model_get"))
    asyncio.run(model.set_metadata(name="Test Model"))

    lab = Lab()
    # get_model doesn't require initialization
    retrieved_model = lab.get_model("test_model_get")

    assert retrieved_model.id == "test_model_get"
    metadata = asyncio.run(retrieved_model.get_metadata())
    assert metadata["name"] == "Test Model"


def test_lab_get_model_path(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.model import Model

    # Create a test model
    model = asyncio.run(Model.create("test_model_path"))
    expected_path = asyncio.run(model.get_dir())

    lab = Lab()
    # get_model_path doesn't require initialization
    path = lab.get_model_path("test_model_path")

    assert path == expected_path
    assert os.path.exists(path)


def test_lab_get_model_nonexistent(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab

    lab = Lab()
    try:
        lab.get_model("nonexistent_model")
        assert False, "Should have raised FileNotFoundError"
    except FileNotFoundError:
        pass  # Expected


def test_lab_load_generation_model_smoke(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.lab_facade import Lab
    from lab.generation import LocalHTTPGenerationModel

    lab = Lab()
    # load_generation_model should NOT require lab.init; it's stateless config
    model = lab.load_generation_model(
        {
            "provider": "local",
            "base_url": "http://localhost:9999/v1",
            "model": "test-model",
            "api_key": "test-key",
        }
    )

    assert isinstance(model, LocalHTTPGenerationModel)
    assert model.base_url == "http://localhost:9999/v1"
    assert model.model == "test-model"


def test_run_async_propagates_runtime_error_from_coroutine():
    from lab.lab_facade import _run_async

    async def _raises_runtime_error():
        raise RuntimeError("inner runtime error")

    with pytest.raises(RuntimeError, match="inner runtime error"):
        _run_async(_raises_runtime_error())


def test_lab_save_model_does_not_call_sync_log_in_async_path(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab import lab_facade as lab_facade_module
    from lab.lab_facade import Lab

    async def _raise_metadata_error(self, architecture, model_filename="", json_data=None):
        raise RuntimeError("metadata failed")

    monkeypatch.setattr(lab_facade_module.ModelService, "generate_model_json", _raise_metadata_error)

    lab = Lab()
    lab.init(experiment_id="test_exp")

    model_dir = tmp_path / "model_dir"
    model_dir.mkdir()
    (model_dir / "weights.bin").write_text("weights")

    saved_path = lab.save_model(str(model_dir), name="trained_model", architecture="TestArchitecture")
    assert os.path.exists(saved_path)

    log_path = asyncio.run(lab._job.get_log_path())
    with open(log_path, "r") as f:
        content = f.read()
    assert "Warning: Model saved but metadata creation failed: metadata failed" in content


@pytest.mark.asyncio
async def test_copy_file_mounts_without_lab_init(tmp_path, monkeypatch):
    """Provider setup runs copy_file_mounts without lab.init(); env matches launch_template."""
    _fresh(monkeypatch)
    home = tmp_path / "home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    (home / ".tfl_home").mkdir()
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("TFL_HOME_DIR", str(home / ".tfl_home"))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.experiment import Experiment
    from lab.lab_facade import Lab
    from lab.dirs import get_task_dir
    from lab import storage

    exp = await Experiment.create("exp_mounts")
    job = await exp.create_job()
    await job.update_job_data_field("task_id", "mytask")

    task_root = await get_task_dir()
    task_path = storage.join(task_root, "mytask")
    await storage.makedirs(task_path, exist_ok=True)
    hello = storage.join(task_path, "hello.txt")
    async with await storage.open(hello, "w") as f:
        await f.write("hi")

    monkeypatch.setenv("_TFL_JOB_ID", str(job.id))
    monkeypatch.setenv("_TFL_EXPERIMENT_ID", str(exp.id))

    lab = Lab()
    assert lab._experiment is None
    await lab.async_copy_file_mounts()

    dest = os.path.join(str(home), "hello.txt")
    assert os.path.isfile(dest)
    with open(dest) as f:
        assert f.read() == "hi"


def test_download_registry_model(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    import asyncio
    import os
    import lab.storage as storage_module
    from lab.lab_facade import Lab
    from lab.model import Model

    model_id = "test_registry_model"
    asyncio.run(Model.create(model_id))

    lab = Lab()
    lab.init(experiment_id="test_exp")

    copy_calls = []

    async def fake_copy_dir(src: str, dest: str) -> None:
        copy_calls.append((src, dest))

    monkeypatch.setattr(storage_module, "copy_dir", fake_copy_dir)

    result = lab.download_registry_model(model_id)

    expected_dest = os.path.expanduser(f"~/tmp/{model_id}")
    assert result == expected_dest
    assert len(copy_calls) == 1

    _m = asyncio.run(Model.get(model_id))
    expected_src = asyncio.run(_m.get_dir())
    assert copy_calls[0][0] == expected_src
    assert copy_calls[0][1] == expected_dest
