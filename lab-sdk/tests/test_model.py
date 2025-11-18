import os
import importlib


def test_model_get_dir(tmp_path, monkeypatch):
    for mod in ["lab.model", "lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)

    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    from lab.model import Model

    m = Model("mixtral-8x7b")
    d = m.get_dir()
    assert d.endswith(os.path.join("models", "mixtral-8x7b"))

