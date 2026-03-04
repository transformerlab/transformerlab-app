def test_is_wsl_false(monkeypatch):
    # Simulate subprocess.CalledProcessError
    import subprocess

    def fake_check_output(*args, **kwargs):
        raise subprocess.CalledProcessError(1, "uname")

    monkeypatch.setattr(subprocess, "check_output", fake_check_output)
    from transformerlab.routers import serverinfo

    assert serverinfo.is_wsl() is False


def test_healthz_multiuser_mode(client, monkeypatch):
    """Test healthz endpoint in multiuser mode"""
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "multiuser"


def test_healthz_local_mode(client, monkeypatch):
    """Test healthz endpoint in local mode"""
    # Set MULTIUSER to enable multiuser mode
    monkeypatch.setenv("MULTIUSER", "false")

    # The healthz endpoint reads env vars at request time, so monkeypatch should work
    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "local"


def test_healthz_localfs_mode(client, monkeypatch, tmp_path):
    """Test healthz endpoint in localfs mode"""
    # Ensure cloud mode is disabled
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)
    # Configure NFS-style storage provider pointing at a temp dir
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    monkeypatch.setenv("TFL_STORAGE_URI", str(tmp_path / "localfs_root"))

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["message"] == "OK"
    assert data["mode"] == "multiuser"
