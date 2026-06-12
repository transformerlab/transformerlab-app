"""CLI tests for profile selection and the `lab profile` command group."""

import json
import os

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def _write_profile_config(lab_home, name, data):
    if name == "default":
        pdir = lab_home
    else:
        pdir = os.path.join(lab_home, "profiles", name)
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, "config.json"), "w", encoding="utf-8") as f:
        f.write(json.dumps(data))


def _full_config(server):
    return {
        "server": server,
        "team_id": "team-1",
        "user_email": "u@example.com",
        "current_experiment": "alpha",
    }


def test_flag_selects_named_profile(tmp_path, monkeypatch):
    import transformerlab_cli.util.shared as shared

    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(shared, "CONFIG_FILE", os.path.join(str(tmp_path), "config.json"))
    _write_profile_config(str(tmp_path), "default", _full_config("http://default:8338"))
    _write_profile_config(str(tmp_path), "prod", _full_config("http://prod:8338"))

    result = runner.invoke(app, ["--profile", "prod", "--format=json", "config", "get", "server"])
    assert result.exit_code == 0
    assert json.loads(result.output.strip())["value"] == "http://prod:8338"


def test_env_var_selects_named_profile(tmp_path, monkeypatch):
    import transformerlab_cli.util.shared as shared

    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(shared, "CONFIG_FILE", os.path.join(str(tmp_path), "config.json"))
    monkeypatch.setenv("LAB_PROFILE", "prod")
    _write_profile_config(str(tmp_path), "default", _full_config("http://default:8338"))
    _write_profile_config(str(tmp_path), "prod", _full_config("http://prod:8338"))

    result = runner.invoke(app, ["--format=json", "config", "get", "server"])
    assert result.exit_code == 0
    assert json.loads(result.output.strip())["value"] == "http://prod:8338"


def test_default_used_when_unset(tmp_path, monkeypatch):
    import transformerlab_cli.util.shared as shared

    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(shared, "CONFIG_FILE", os.path.join(str(tmp_path), "config.json"))
    monkeypatch.delenv("LAB_PROFILE", raising=False)
    _write_profile_config(str(tmp_path), "default", _full_config("http://default:8338"))

    result = runner.invoke(app, ["--format=json", "config", "get", "server"])
    assert result.exit_code == 0
    assert json.loads(result.output.strip())["value"] == "http://default:8338"


def test_invalid_profile_name_errors(tmp_path, monkeypatch):
    import transformerlab_cli.util.shared as shared

    monkeypatch.setattr(shared, "CONFIG_DIR", str(tmp_path))
    monkeypatch.setattr(shared, "CONFIG_FILE", os.path.join(str(tmp_path), "config.json"))

    result = runner.invoke(app, ["--profile", "../escape", "--format=json", "config", "get", "server"])
    assert result.exit_code == 1
    assert "error" in json.loads(result.output.strip())
