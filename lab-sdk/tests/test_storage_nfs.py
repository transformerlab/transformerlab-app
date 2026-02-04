import os
import importlib

import pytest


@pytest.mark.asyncio
async def test_storage_debug_info_nfs(monkeypatch, tmp_path):
    # Configure NFS-style storage: provider flag + local mount path
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "nfs")
    nfs_root = tmp_path / "nfs_root"
    nfs_root.mkdir()
    monkeypatch.setenv("TFL_STORAGE_URI", str(nfs_root))

    # Ensure fresh import so env is re-read
    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")

    from lab import storage

    info = await storage.debug_info()
    # Root URI should be our NFS root path
    assert info["root_uri"] == str(nfs_root)
    # Provider should be reported as nfs
    assert info["STORAGE_PROVIDER"] == "nfs"

    fs = await storage.filesystem()
    # NFS is mounted as a local filesystem, so we expect LocalFileSystem
    from fsspec.implementations.local import LocalFileSystem

    assert isinstance(fs, LocalFileSystem)
