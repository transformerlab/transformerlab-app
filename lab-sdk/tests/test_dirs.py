import os
import importlib


def _fresh_import_dirs(monkeypatch):
    for mod in ["lab.dirs"]:
        if mod in importlib.sys.modules:
            importlib.sys.modules.pop(mod)
    from lab import dirs  # noqa: F401

    return importlib.import_module("lab.dirs")


def test_dirs_structure_created(monkeypatch, tmp_path):
    home = tmp_path / ".tfl_home"
    ws = tmp_path / ".tfl_ws"
    home.mkdir()
    ws.mkdir()
    monkeypatch.setenv("TFL_HOME_DIR", str(home))
    monkeypatch.setenv("TFL_WORKSPACE_DIR", str(ws))

    dirs = _fresh_import_dirs(monkeypatch)

    # Key directories exist
    assert os.path.isdir(dirs.get_experiments_dir())
    assert os.path.isdir(dirs.get_jobs_dir())
    assert os.path.isdir(dirs.get_models_dir())
    assert os.path.isdir(dirs.get_datasets_dir())
    assert os.path.isdir(dirs.get_temp_dir())
    assert os.path.isdir(dirs.get_prompt_templates_dir())
    assert os.path.isdir(dirs.get_tools_dir())
    assert os.path.isdir(dirs.get_batched_prompts_dir())
    assert os.path.isdir(dirs.get_galleries_cache_dir())
