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
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    from lab import storage
    from lab import dirs

    dirs.set_organization_id("team1")

    try:
        info = await storage.debug_info()
        # Root URI should be our localfs org-scoped root path
        assert info["root_uri"] == str(localfs_root / "orgs" / "team1")
        # Provider should be reported as localfs
        assert info["STORAGE_PROVIDER"] == "localfs"

        fs = await storage.filesystem()
        # localfs is mounted as a local filesystem, so we expect LocalFileSystem
        from fsspec.implementations.local import LocalFileSystem

        assert isinstance(fs, LocalFileSystem)
    finally:
        dirs.set_organization_id(None)


@pytest.mark.asyncio
async def test_localfs_scoped_env_uri_works_without_context(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    localfs_root = tmp_path / "localfs_root"
    localfs_root.mkdir()
    scoped_workspace = localfs_root / "orgs" / "team1" / "workspace"
    scoped_workspace.mkdir(parents=True)
    monkeypatch.setenv("TFL_STORAGE_URI", str(scoped_workspace))

    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    from lab import storage

    # Should not raise even though set_organization_id() was not called.
    root = await storage.root_uri()
    assert root == str(scoped_workspace)


@pytest.mark.asyncio
async def test_localfs_unscoped_env_uri_requires_context(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    localfs_root = tmp_path / "localfs_root"
    localfs_root.mkdir()
    monkeypatch.setenv("TFL_STORAGE_URI", str(localfs_root))

    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    from lab import storage

    with pytest.raises(RuntimeError, match="Organization context is required but not set"):
        await storage.root_uri()
