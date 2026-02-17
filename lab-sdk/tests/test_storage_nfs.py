import importlib

import pytest


@pytest.mark.asyncio
async def test_storage_debug_info_localfs(monkeypatch, tmp_path):
    # Configure localfs storage: provider flag + local mount path
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    localfs_root = tmp_path / "localfs_root"
    localfs_root.mkdir()
    monkeypatch.setenv("TFL_STORAGE_URI", str(localfs_root))

    # Ensure fresh import so env is re-read
    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")

    from lab import storage

    info = await storage.debug_info()
    # Root URI should be our localfs root path
    assert info["root_uri"] == str(localfs_root)
    # Provider should be reported as localfs
    assert info["STORAGE_PROVIDER"] == "localfs"

    fs = await storage.filesystem()
    # localfs is mounted as a local filesystem, so we expect LocalFileSystem
    from fsspec.implementations.local import LocalFileSystem

    assert isinstance(fs, LocalFileSystem)
