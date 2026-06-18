"""Tests for config command and utility functions."""

import json
import os
from typer.testing import CliRunner
from transformerlab_cli.main import app
from transformerlab_cli.util.config import (
    _validate_url,
    load_config,
    set_config,
    get_config,
    delete_config,
)

runner = CliRunner()


def test_config_help():
    """Test the config command help."""
    result = runner.invoke(app, ["config", "--help"])
    assert result.exit_code == 0
    assert "View, get, and set configuration values" in result.output


def test_config_with_key_fetches_value(tmp_config_dir):
    """Test that config with key fetches value."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"server": "http://localhost:8338"}))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["config", "server"])
        assert result.exit_code == 0
        assert "http://localhost:8338" in result.output


def test_config_error_helper_uses_generic_name():
    """Ensure helper name reflects both get/set error handling."""
    import transformerlab_cli.commands.config as config_cmd

    assert hasattr(config_cmd, "_print_error_and_exit")
    assert not hasattr(config_cmd, "_print_get_error")


# --- URL validation ---


def test_validate_url_valid_http():
    assert _validate_url("http://localhost:8338") == "http://localhost:8338"


def test_validate_url_valid_https():
    assert _validate_url("https://example.com/") == "https://example.com"


def test_validate_url_strips_trailing_slash():
    assert _validate_url("http://host:8338/") == "http://host:8338"


def test_validate_url_invalid_scheme():
    assert _validate_url("ftp://example.com") is None


def test_validate_url_no_scheme():
    assert _validate_url("example.com") is None


def test_validate_url_empty():
    assert _validate_url("") is None


# --- Config CRUD with temp files ---


def _patch_config_paths(config_dir: str, config_file: str):
    """Return a context manager that points the default-profile paths at a tmp dir."""
    import transformerlab_cli.util.config as config_mod
    import transformerlab_cli.util.shared as shared_mod

    class _Patcher:
        def __enter__(self):
            self._orig_dir = shared_mod.CONFIG_DIR
            self._orig_file = shared_mod.CONFIG_FILE
            self._orig_cache = config_mod.cached_config
            shared_mod.CONFIG_DIR = config_dir
            shared_mod.CONFIG_FILE = config_file
            config_mod.cached_config = None
            return self

        def __exit__(self, *args):
            shared_mod.CONFIG_DIR = self._orig_dir
            shared_mod.CONFIG_FILE = self._orig_file
            config_mod.cached_config = self._orig_cache

    return _Patcher()


def test_set_and_get_config(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        assert set_config("server", "http://localhost:8338") is True
        assert get_config("server") == "http://localhost:8338"


def test_set_config_invalid_key(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["config", "set", "invalid_key", "value"])
        assert result.exit_code == 1
        assert "Invalid config key 'invalid_key'" in result.output


def test_delete_config(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        set_config("server", "http://localhost:8338")
        assert delete_config("server") is True
        assert get_config("server") is None


def test_delete_config_missing_key(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        assert delete_config("server") is False


def test_load_config_empty(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        config = load_config()
        assert config == {}


def test_load_config_with_data(tmp_config_dir):
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"server": "http://test:8338"}))
    with _patch_config_paths(config_dir, config_file):
        config = load_config()
        assert config["server"] == "http://test:8338"


def test_load_config_corrupt_moves_aside_and_returns_empty(tmp_config_dir):
    """A corrupt config must not silently resolve to {}; it must be renamed aside."""
    import glob

    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write("{not: valid json,,")
    with _patch_config_paths(config_dir, config_file):
        config = load_config()
        assert config == {}
    assert not os.path.exists(config_file), "corrupt config should have been renamed aside"
    backups = glob.glob(f"{config_file}.corrupt-*")
    assert len(backups) == 1, f"expected one backup, got {backups}"


def test_set_config_does_not_wipe_existing_keys_when_file_is_fine(tmp_config_dir):
    """Regression: a set_config call must merge, never wipe unrelated keys."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "server": "http://localhost:8338",
                    "team_id": "abc-123",
                    "user_email": "u@example.com",
                    "current_experiment": "alpha",
                }
            )
        )
    with _patch_config_paths(config_dir, config_file):
        assert set_config("current_experiment", "beta") is True
        with open(config_file, "r", encoding="utf-8") as f:
            data = json.loads(f.read())
    assert data["server"] == "http://localhost:8338"
    assert data["team_id"] == "abc-123"
    assert data["user_email"] == "u@example.com"
    assert data["current_experiment"] == "beta"


def test_set_server_clears_current_experiment_when_server_changes(tmp_config_dir):
    """Switching servers should clear experiment context from the old server."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "server": "http://localhost:8338",
                    "team_id": "abc-123",
                    "user_email": "u@example.com",
                    "current_experiment": "alpha",
                }
            )
        )
    with _patch_config_paths(config_dir, config_file):
        assert set_config("server", "http://otherhost:8338") is True
        with open(config_file, "r", encoding="utf-8") as f:
            data = json.loads(f.read())

    assert data["server"] == "http://otherhost:8338"
    assert data["team_id"] == "abc-123"
    assert data["user_email"] == "u@example.com"
    assert "current_experiment" not in data


def test_set_server_keeps_current_experiment_when_server_unchanged(tmp_config_dir):
    """Re-setting the same server value must preserve current_experiment."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(
            json.dumps(
                {
                    "server": "http://localhost:8338",
                    "current_experiment": "alpha",
                }
            )
        )
    with _patch_config_paths(config_dir, config_file):
        assert set_config("server", "http://localhost:8338/") is True
        with open(config_file, "r", encoding="utf-8") as f:
            data = json.loads(f.read())

    assert data["server"] == "http://localhost:8338"
    assert data["current_experiment"] == "alpha"


def test_save_config_is_atomic_no_tmp_left_behind(tmp_config_dir):
    """After a successful save, the sibling .tmp file must not exist."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        assert set_config("server", "http://localhost:8338") is True
    assert os.path.exists(config_file)
    assert not os.path.exists(f"{config_file}.tmp")


# --- JSON format output ---


def test_config_list_json_format(tmp_config_dir):
    """Test that --format=json outputs all config keys as JSON."""
    config_dir, config_file = tmp_config_dir
    config_data = {
        "server": "http://localhost:8338",
        "team_id": "abc-123",
        "user_email": "user@example.com",
        "current_experiment": "alpha",
        "team_name": "Test Team",
    }
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(config_data))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config"])
        assert result.exit_code == 0
        output = json.loads(result.output.strip())
        assert len(output) == 5
        keys = {item["Key"] for item in output}
        assert keys == {"server", "team_id", "user_email", "current_experiment", "team_name"}


def test_config_list_json_format_empty(tmp_config_dir):
    """Test that --format=json outputs empty list when no config exists."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config"])
        assert result.exit_code == 0
        output = json.loads(result.output.strip())
        assert output == []


def test_config_set_json_format(tmp_config_dir):
    """Test that setting a config key with --format=json outputs JSON."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config", "set", "server", "http://localhost:8338"])
        assert result.exit_code == 0
        output = json.loads(result.output.strip())
        assert output["key"] == "server"
        assert output["value"] == "http://localhost:8338"


def test_config_set_invalid_key_json_format(tmp_config_dir):
    """Test that setting an invalid key with --format=json outputs JSON error."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config", "set", "bad_key", "value"])
        assert result.exit_code == 1
        output = json.loads(result.output.strip())
        assert "error" in output


def test_config_get_json_format(tmp_config_dir):
    """Test that config key lookup with --format=json returns key/value JSON."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"server": "http://localhost:8338"}))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config", "server"])
        assert result.exit_code == 0
        output = json.loads(result.output.strip())
        assert output["key"] == "server"
        assert output["value"] == "http://localhost:8338"


def test_config_get_subcommand_json_format(tmp_config_dir):
    """Test that config get with --format=json returns key/value JSON."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"server": "http://localhost:8338"}))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config", "get", "server"])
        assert result.exit_code == 0
        output = json.loads(result.output.strip())
        assert output["key"] == "server"
        assert output["value"] == "http://localhost:8338"


def test_config_get_missing_key_json_format(tmp_config_dir):
    """Test that config get for missing key returns JSON error."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["--format=json", "config", "server"])
        assert result.exit_code == 1
        output = json.loads(result.output.strip())
        assert "error" in output


# --- check_configs behavior ---


def test_check_configs_missing_keys_json(tmp_config_dir):
    """check_configs with missing required keys outputs JSON error in json mode."""
    config_dir, config_file = tmp_config_dir
    with _patch_config_paths(config_dir, config_file):
        # No config file written — all required keys missing
        result = runner.invoke(app, ["--format=json", "job", "list"])
        assert result.exit_code == 1
        output = json.loads(result.output.strip())
        assert "error" in output
        assert "server" in output["error"]


def test_check_configs_missing_login_keys_prompts_login(tmp_config_dir):
    """Pretty output should direct users to lab login for auth-derived keys."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"server": "http://localhost:8338"}))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["job", "list"])
        assert result.exit_code == 1
        assert "team_id, user_email" in result.output
        assert "Please run 'lab login'" in result.output


def test_check_configs_missing_server_prompts_config_set(tmp_config_dir):
    """Pretty output should keep config-set guidance for non-login keys."""
    config_dir, config_file = tmp_config_dir
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps({"team_id": "abc-123", "user_email": "user@example.com"}))
    with _patch_config_paths(config_dir, config_file):
        result = runner.invoke(app, ["job", "list"])
        assert result.exit_code == 1
        assert "server" in result.output
        assert "lab config set <key> <value>" in result.output


def test_check_configs_no_banner_in_json_mode(tmp_config_dir):
    """check_configs with all required keys set prints no banner in json mode."""
    from unittest.mock import patch as mock_patch

    config_dir, config_file = tmp_config_dir
    config_data = {
        "server": "http://localhost:8338",
        "team_id": "abc-123",
        "user_email": "user@example.com",
        "current_experiment": "alpha",
    }
    with open(config_file, "w", encoding="utf-8") as f:
        f.write(json.dumps(config_data))
    with _patch_config_paths(config_dir, config_file):
        with mock_patch("transformerlab_cli.util.api.get") as mock_api:
            mock_resp = __import__("unittest.mock", fromlist=["MagicMock"]).MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = []
            mock_api.return_value = mock_resp
            result = runner.invoke(app, ["--format=json", "job", "list"])
        assert result.exit_code == 0
        # Output must be valid JSON with no banner text mixed in
        output = json.loads(result.output.strip())
        assert isinstance(output, list)
