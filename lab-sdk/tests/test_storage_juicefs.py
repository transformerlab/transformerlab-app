"""Tests for JuiceFS-gateway s3fs options in lab.storage."""

import importlib


def _fresh_storage(monkeypatch, **env):
    """Reload lab.storage with the given env so module-level config is re-read."""
    monkeypatch.delenv("TFL_REMOTE_STORAGE_ENABLED", raising=False)
    monkeypatch.delenv("TFL_STORAGE_URI", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    for mod in ("lab.dirs", "lab.storage"):
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)
    from lab import storage as lab_storage

    return lab_storage


def test_get_fs_for_uri_juicefs_uses_gateway_endpoint_and_creds(monkeypatch):
    lab_storage = _fresh_storage(
        monkeypatch,
        TFL_STORAGE_PROVIDER="juicefs",
        TFL_JUICEFS_GATEWAY_ENDPOINT="http://127.0.0.1:9999",
        TFL_JUICEFS_GATEWAY_ACCESS_KEY="gw-access",
        TFL_JUICEFS_GATEWAY_SECRET_KEY="gw-secret",
    )

    captured = {}

    def fake_filesystem(protocol, **kwargs):
        captured["protocol"] = protocol
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(lab_storage.fsspec, "filesystem", fake_filesystem)

    fs, root = lab_storage._get_fs_for_uri("s3://workspace-team1")

    assert captured["protocol"] == "s3"
    assert captured["kwargs"]["client_kwargs"]["endpoint_url"] == "http://127.0.0.1:9999"
    assert captured["kwargs"]["key"] == "gw-access"
    assert captured["kwargs"]["secret"] == "gw-secret"
    assert "profile" not in captured["kwargs"]
    assert root == "s3://workspace-team1"


def test_get_fs_for_uri_juicefs_default_endpoint(monkeypatch):
    monkeypatch.delenv("TFL_JUICEFS_GATEWAY_ENDPOINT", raising=False)
    monkeypatch.delenv("TFL_JUICEFS_GATEWAY_ACCESS_KEY", raising=False)
    monkeypatch.delenv("TFL_JUICEFS_GATEWAY_SECRET_KEY", raising=False)
    lab_storage = _fresh_storage(monkeypatch, TFL_STORAGE_PROVIDER="juicefs")

    captured = {}

    def fake_filesystem(protocol, **kwargs):
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(lab_storage.fsspec, "filesystem", fake_filesystem)

    lab_storage._get_fs_for_uri("s3://workspace-team1")

    assert captured["kwargs"]["client_kwargs"]["endpoint_url"] == "http://127.0.0.1:9000"


def test_aws_mode_unaffected_by_gateway_vars(monkeypatch):
    """aws provider must keep using the profile, never the gateway endpoint."""
    lab_storage = _fresh_storage(
        monkeypatch,
        TFL_STORAGE_PROVIDER="aws",
        AWS_PROFILE="transformerlab-s3",
        TFL_JUICEFS_GATEWAY_ENDPOINT="http://127.0.0.1:9999",
    )

    captured = {}

    def fake_filesystem(protocol, **kwargs):
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(lab_storage.fsspec, "filesystem", fake_filesystem)

    lab_storage._get_fs_for_uri("s3://workspace-team1")

    assert captured["kwargs"].get("profile") == "transformerlab-s3"
    assert "client_kwargs" not in captured["kwargs"]
