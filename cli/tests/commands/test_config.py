"""Tests for config command and utility functions."""

import json
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
    """Return a context manager that patches CONFIG_DIR and CONFIG_FILE."""
    import transformerlab_cli.util.config as config_mod

    class _Patcher:
        def __enter__(self):
            self._orig_dir = config_mod.CONFIG_DIR
            self._orig_file = config_mod.CONFIG_FILE
            self._orig_cache = config_mod.cached_config
            config_mod.CONFIG_DIR = config_dir
            config_mod.CONFIG_FILE = config_file
            config_mod.cached_config = None
            return self

        def __exit__(self, *args):
            config_mod.CONFIG_DIR = self._orig_dir
            config_mod.CONFIG_FILE = self._orig_file
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
