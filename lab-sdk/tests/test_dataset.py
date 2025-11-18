import os
import importlib


def _fresh(monkeypatch):
    for mod in ["lab.dataset", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)


def test_dataset_get_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    ds = Dataset("test-dataset")
    d = ds.get_dir()
    assert d.endswith(os.path.join("datasets", "test-dataset"))


def test_dataset_create_and_get(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    # Create dataset and verify it exists
    ds = Dataset.create("test_dataset")
    assert ds is not None
    assert os.path.isdir(ds.get_dir())
    index_file = os.path.join(ds.get_dir(), "index.json")
    assert os.path.isfile(index_file)

    # Get the dataset and verify its properties
    ds2 = Dataset.get("test_dataset")
    assert isinstance(ds2, Dataset)
    data = ds2.get_json_data()
    assert data["dataset_id"] == "test_dataset"
    assert data["location"] == "local"


def test_dataset_default_json(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    ds = Dataset.create("test_dataset_default")
    data = ds.get_json_data()
    assert data["dataset_id"] == "test_dataset_default"
    assert data["location"] == "local"
    assert data["description"] == ""
    assert data["size"] == -1
    assert data["json_data"] == {}


def test_dataset_set_metadata(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    ds = Dataset.create("test_dataset_metadata")
    
    # Test setting individual metadata fields
    ds.set_metadata(location="remote", description="Test dataset", size=1000)
    data = ds.get_json_data()
    assert data["location"] == "remote"
    assert data["description"] == "Test dataset"
    assert data["size"] == 1000

    # Test setting json_data
    ds.set_metadata(json_data={"key1": "value1", "key2": "value2"})
    data = ds.get_json_data()
    assert data["json_data"]["key1"] == "value1"
    assert data["json_data"]["key2"] == "value2"

    # Test merging json_data (shallow merge)
    ds.set_metadata(json_data={"key2": "updated", "key3": "value3"})
    data = ds.get_json_data()
    assert data["json_data"]["key1"] == "value1"  # Preserved
    assert data["json_data"]["key2"] == "updated"  # Updated
    assert data["json_data"]["key3"] == "value3"  # New key


def test_dataset_get_metadata(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    ds = Dataset.create("test_dataset_get")
    ds.set_metadata(description="My dataset", size=500)
    metadata = ds.get_metadata()
    assert metadata["dataset_id"] == "test_dataset_get"
    assert metadata["description"] == "My dataset"
    assert metadata["size"] == 500


def test_dataset_list_all(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    # Create multiple datasets
    ds1 = Dataset.create("dataset1")
    ds1.set_metadata(description="First dataset")
    ds2 = Dataset.create("dataset2")
    ds2.set_metadata(description="Second dataset")

    # List all datasets
    all_datasets = Dataset.list_all()
    assert isinstance(all_datasets, list)
    assert len(all_datasets) >= 2
    
    # Verify datasets are in the list
    dataset_ids = [d["dataset_id"] for d in all_datasets]
    assert "dataset1" in dataset_ids
    assert "dataset2" in dataset_ids


def test_dataset_list_all_empty_dir(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    # List all datasets when none exist
    all_datasets = Dataset.list_all()
    assert isinstance(all_datasets, list)
    assert len(all_datasets) == 0


def test_dataset_secure_filename(tmp_path, monkeypatch):
    _fresh(monkeypatch)
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.dataset import Dataset

    # Test that secure_filename sanitizes the dataset ID
    # secure_filename converts "/" to "_" and ".." to "__"
    ds = Dataset.create("test/../dataset")
    # The directory should be sanitized
    dir_path = ds.get_dir()
    # Should not contain actual path traversal (../ as a path component)
    # secure_filename converts "test/../dataset" to "test_.._dataset"
    # which is safe because ".." is part of the filename, not a path separator
    assert os.path.sep + ".." + os.path.sep not in dir_path
    assert dir_path.endswith("test_.._dataset") or "test_.._dataset" in dir_path

