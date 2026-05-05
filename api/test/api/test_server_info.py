import pytest


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


def test_healthz_includes_storage_provider_only(client, monkeypatch, tmp_path):
    """healthz exposes the storage provider but NOT the URI.

    /healthz is unauthenticated, so leaking the bucket/path would be infra
    reconnaissance fuel for any caller. The full URI is operator-visible
    in the startup banner only.
    """
    monkeypatch.setenv("TFL_STORAGE_URI", str(tmp_path / "storage_root"))

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert "storage" in data
    assert "provider" in data["storage"]
    assert "uri" not in data["storage"], "URI must not be exposed via /healthz (unauthenticated endpoint)"


def test_healthz_storage_reports_localfs_when_remote_not_enabled(client, monkeypatch):
    """When TFL_STORAGE_PROVIDER is cloud but TFL_REMOTE_STORAGE_ENABLED is unset,
    the SDK falls back to the local filesystem — /healthz must reflect that
    rather than reporting the configured-but-inactive cloud backend.
    """
    # STORAGE_PROVIDER is captured at lab.storage import time, so setenv on
    # TFL_STORAGE_PROVIDER would be a no-op here — patch the module attribute.
    import lab.storage

    monkeypatch.setattr(lab.storage, "STORAGE_PROVIDER", "aws")
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["storage"]["provider"] == "localfs"


@pytest.mark.parametrize("provider", ["aws", "gcp", "azure"])
def test_healthz_storage_reports_cloud_when_remote_enabled(client, monkeypatch, provider):
    """When TFL_REMOTE_STORAGE_ENABLED=true, /healthz reports the configured cloud provider."""
    import lab.storage

    monkeypatch.setattr(lab.storage, "STORAGE_PROVIDER", provider)
    monkeypatch.setenv("TFL_REMOTE_STORAGE_ENABLED", "true")

    response = client.get("/healthz")
    assert response.status_code == 200
    data = response.json()
    assert data["storage"]["provider"] == provider
