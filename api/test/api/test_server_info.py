def test_server_info(client):
    response = client.get("/server/info")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert "cpu" in data
    assert "memory" in data and isinstance(data["memory"], dict)
    assert "disk" in data and isinstance(data["disk"], dict)
    assert "gpu" in data
    mem = data["memory"]
    for key in ("total", "available", "percent", "used", "free"):
        assert key in mem
    disk = data["disk"]
    for key in ("total", "used", "free", "percent"):
        assert key in disk


def test_server_info_keys(client):
    response = client.get("/server/info")
    assert response.status_code == 200
    data = response.json()
    # Check for some extra keys
    for key in ["pytorch_version", "device", "device_type", "os", "python_version"]:
        assert key in data
    # If running on Mac, check for mac_metrics (may be None)
    import sys

    if sys.platform == "darwin":
        # mac_metrics may or may not be present, but if present, should be a dict
        if "mac_metrics" in data:
            assert isinstance(data["mac_metrics"], dict)


def test_server_python_libraries(client):
    response = client.get("/server/python_libraries")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    for package in data:
        assert isinstance(package, dict)
        assert "name" in package and isinstance(package["name"], str) and package["name"]
        assert "version" in package and isinstance(package["version"], str) and package["version"]


def test_server_pytorch_collect_env(client):
    response = client.get("/server/pytorch_collect_env")
    assert response.status_code == 200
    data = response.text
    assert "PyTorch" in data


def test_is_wsl_false(monkeypatch):
    # Simulate subprocess.CalledProcessError
    import subprocess

    def fake_check_output(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "uname")

    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    from transformerlab.routers import serverinfo

    assert serverinfo.is_wsl() is False


def test_healthz_local_mode(client, monkeypatch):
    """Test healthz endpoint in local mode"""
    # Ensure TFL_REMOTE_STORAGE_ENABLED is not set
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "local"


def test_healthz_s3_mode(client, monkeypatch):
    """Test healthz endpoint in s3 mode"""
    # Set TFL_REMOTE_STORAGE_ENABLED to enable s3 mode
    monkeypatch.setenv("TFL_REMOTE_STORAGE_ENABLED", "true")

    # The healthz endpoint reads env vars at request time, so monkeypatch should work
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "s3"


def test_healthz_localfs_mode(client, monkeypatch, tmp_path):
    """Test healthz endpoint in localfs mode"""
    # Ensure cloud mode is disabled
    monkeypatch.delenv("TFL_API_STORAGE_URI", raising=False)
    # Configure NFS-style storage provider pointing at a temp dir
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    monkeypatch.setenv("TFL_STORAGE_URI", str(tmp_path / "localfs_root"))

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "localfs"
