import importlib

import pytest


def _reload_storage_with_env(monkeypatch, **env):
    for key in ["TFL_STORAGE_PROVIDER", "AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_ACCOUNT"]:
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")
    from lab import storage  # type: ignore

    return storage


def test_is_remote_path_abfs():
    from lab import storage

    assert storage.is_remote_path("abfs://workspace-team1") is True
    assert storage.is_remote_path("s3://bucket") is True
    assert storage.is_remote_path("/local/path") is False


@pytest.mark.asyncio
async def test_root_uri_azure_with_org_and_remote_enabled(monkeypatch):
    storage = _reload_storage_with_env(
        monkeypatch,
        TFL_STORAGE_PROVIDER="azure",
        TFL_REMOTE_STORAGE_ENABLED="true",
        # Provide minimal Azure config so the adlfs/abfs filesystem can be
        # constructed without raising, while still avoiding any real network I/O.
        AZURE_STORAGE_ACCOUNT="dummyaccount",
        AZURE_STORAGE_KEY="dummykey",
    )
    from lab import dirs

    dirs.set_organization_id("team1")
    try:
        root = await storage.root_uri()
        # In azure remote mode we expect an abfs://workspace-<org> style root.
        assert root.startswith("abfs://workspace-")
    finally:
        dirs.set_organization_id(None)
