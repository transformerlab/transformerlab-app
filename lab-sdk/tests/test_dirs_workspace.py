import os
import importlib
import pytest


def test_default_dirs_created(monkeypatch, tmp_path):
    # Unset env to test defaults and ensure fresh import
    monkeypatch.delenv("TFL_HOME_DIR", raising=False)
    monkeypatch.delenv("TFL_WORKSPACE_DIR", raising=False)

    # Ensure fresh import
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    # HOME is already isolated via conftest

    from lab import dirs as dirs_workspace

    assert os.path.isdir(dirs_workspace.HOME_DIR)
    assert os.path.isdir(dirs_workspace.WORKSPACE_DIR)
    # Default home is ~/.transformerlab under our isolated HOME
    assert dirs_workspace.HOME_DIR.startswith(str(tmp_path))


@pytest.mark.asyncio
async def test_env_override_existing_paths(monkeypatch, tmp_path):
    # Create explicit dirs and set env
    home = tmp_path / "custom_home"
    ws = tmp_path / "custom_ws"
    home.mkdir()
    ws.mkdir()

    # Ensure defaults are not set by previous tests
    monkeypatch.delenv("TFL_HOME_DIR", raising=False)
    monkeypatch.delenv("TFL_WORKSPACE_DIR", raising=False)

    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    # Fresh import
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    from lab import dirs as dirs_workspace

    assert dirs_workspace.HOME_DIR == str(home)
    # WORKSPACE_DIR is a legacy placeholder, use get_workspace_dir() instead
    workspace_dir = await dirs_workspace.get_workspace_dir()
    assert workspace_dir == str(ws)


@pytest.mark.asyncio
async def test_org_scoped_workspace_dir(monkeypatch, tmp_path):
    # Ensure no explicit WS override and set a custom home
    monkeypatch.delenv("TFL_WORKSPACE_DIR", raising=False)
    home = tmp_path / "tfl_home"
    home.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))

    # Fresh import
    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")

    from lab import dirs as dirs_workspace

    # Set organization id → should route to org-scoped workspace
    dirs_workspace.set_organization_id("acme")
    ws = await dirs_workspace.get_workspace_dir()
    expected = os.path.join(dirs_workspace.HOME_DIR, "orgs", "acme", "workspace")
    assert ws == expected
    assert os.path.isdir(ws)

    # Reset organization_id → should fall back to default single-tenant path
    dirs_workspace.set_organization_id(None)
    ws_default = await dirs_workspace.get_workspace_dir()
    expected_default = os.path.join(dirs_workspace.HOME_DIR, "workspace")
    assert ws_default == expected_default
    assert os.path.isdir(ws_default)


@pytest.mark.asyncio
async def test_localfs_mode_uses_storage_uri_as_home_per_org(monkeypatch, tmp_path):
    """In localfs mode, workspace_dir = TFL_STORAGE_URI/orgs/<org_id>/workspace and
    root_uri() returns TFL_STORAGE_URI/orgs/<org_id>. HOME_DIR stays the app home (not TFL_STORAGE_URI)."""
    monkeypatch.delenv("TFL_HOME_DIR", raising=False)
    monkeypatch.delenv("TFL_WORKSPACE_DIR", raising=False)
    localfs_root = tmp_path / "localfs_root"
    localfs_root.mkdir()
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "localfs")
    monkeypatch.setenv("TFL_STORAGE_URI", str(localfs_root))

    if "lab.dirs" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.dirs")
    if "lab.storage" in list(importlib.sys.modules.keys()):
        importlib.sys.modules.pop("lab.storage")

    from lab import dirs as dirs_workspace
    from lab import storage as lab_storage

    # HOME_DIR remains app home (default), not TFL_STORAGE_URI
    assert dirs_workspace.HOME_DIR != str(localfs_root)

    dirs_workspace.set_organization_id("team1")
    root = await lab_storage.root_uri()
    assert root == os.path.join(localfs_root, "orgs", "team1")
    ws = await dirs_workspace.get_workspace_dir()
    expected = os.path.join(localfs_root, "orgs", "team1", "workspace")
    assert ws == expected
    assert os.path.isdir(ws)

    dirs_workspace.set_organization_id("team2")
    root2 = await lab_storage.root_uri()
    assert root2 == os.path.join(localfs_root, "orgs", "team2")
    ws2 = await dirs_workspace.get_workspace_dir()
    expected2 = os.path.join(localfs_root, "orgs", "team2", "workspace")
    assert ws2 == expected2
    assert os.path.isdir(ws2)

    dirs_workspace.set_organization_id(None)
    root_default = await lab_storage.root_uri()
    assert root_default == str(localfs_root)
    ws_default = await dirs_workspace.get_workspace_dir()
    expected_default = os.path.join(localfs_root, "workspace")
    assert ws_default == expected_default
    assert os.path.isdir(ws_default)
