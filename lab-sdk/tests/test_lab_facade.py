import os
import json
import importlib


def _fresh(monkeypatch):
    for mod in ["lab.lab_facade", "lab.experiment", "lab.job", "lab.dirs", "lab.dataset", "lab.model"]:
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
    assert lab._job.get_status() == "RUNNING"
    
    # Verify job data has start_time
    job_data = lab._job.get_job_data()
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
    exp = Experiment.create("test_exp")
    job = exp.create_job()
    job_id = str(job.id)

    # Set environment variable to use existing job
    monkeypatch.setenv("_TFL_JOB_ID", str(job_id))

    lab = Lab()
    lab.init(experiment_id="test_exp")
    
    # Verify it's using the existing job
    assert lab._job.id == job_id
    assert lab._job.get_status() == "RUNNING"


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
    
    job_data = lab._job.get_job_data()
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
    
    job_data = lab._job.get_job_data()
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
    log_path = lab._job.get_log_path()
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
    assert lab._job.get_progress() == 50
    
    lab.update_progress(100)
    assert lab._job.get_progress() == 100


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
    
    assert lab._job.get_status() == "COMPLETE"
    assert lab._job.get_progress() == 100
    job_data = lab._job.get_job_data()
    assert job_data["completion_status"] == "success"
    assert job_data["completion_details"] == "Job completed"
    assert job_data["score"] == {"accuracy": 0.95}


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
        plot_data_path="/path/to/plot"
    )
    
    job_data = lab._job.get_job_data()
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
    
    assert lab._job.get_status() == "COMPLETE"
    job_data = lab._job.get_job_data()
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
    job_data = lab._job.get_job_data()
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
    job_data = lab._job.get_job_data()
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
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, 'write'):
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
    assert output_path.endswith("test_dataset.json")
    
    # Verify dataset metadata was created
    from lab.dataset import Dataset
    ds = Dataset.get("test_dataset")
    metadata = ds.get_metadata()
    assert metadata["dataset_id"] == "test_dataset"
    assert metadata["location"] == "local"
    assert metadata["json_data"]["generated"] is True
    assert metadata["json_data"]["sample_count"] == 2
    
    # Verify dataset is tracked in job_data
    job_data = lab._job.get_job_data()
    assert job_data["dataset_id"] == "test_dataset"


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
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, 'write'):
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
    ds = Dataset.get("test_dataset_meta")
    metadata = ds.get_metadata()
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
            # Handle both file-like objects and path strings (like real pandas)
            if hasattr(path_or_buf, 'write'):
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
    Dataset.create("existing_dataset")
    
    class MockDataFrame:
        def __init__(self, data):
            self.data = data
        
        def __len__(self):
            return len(self.data)
        
        def to_json(self, path, orient, lines):
            with open(path, "w") as f:
                json.dump(self.data, f)
    
    df = MockDataFrame([{"a": 1}])
    
    try:
        lab.save_dataset(df, "existing_dataset")
        assert False, "Should have raised FileExistsError"
    except FileExistsError:
        pass


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
    
    job_data = lab._job.get_job_data()
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

