import os
import importlib


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


def test_env_override_existing_paths(monkeypatch, tmp_path):
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
    assert dirs_workspace.WORKSPACE_DIR == str(ws)


def test_org_scoped_workspace_dir(monkeypatch, tmp_path):
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
    ws = dirs_workspace.get_workspace_dir()
    expected = os.path.join(dirs_workspace.HOME_DIR, "orgs", "acme", "workspace")
    assert ws == expected
    assert os.path.isdir(ws)

    # Reset organization_id → should fall back to default single-tenant path
    dirs_workspace.set_organization_id(None)
    ws_default = dirs_workspace.get_workspace_dir()
    expected_default = os.path.join(dirs_workspace.HOME_DIR, "workspace")
    assert ws_default == expected_default
    assert os.path.isdir(ws_default)
