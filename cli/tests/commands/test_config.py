"""Tests for config command and utility functions."""

import json
from pathlib import Path

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
    assert "View or set configuration values" in result.output


def test_config_requires_both_key_and_value():
    """Test that config errors when only key is provided."""
    result = runner.invoke(app, ["config", "server"])
    assert result.exit_code == 1
    assert "Both key and value are required" in result.output


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


def _patch_config_paths(config_dir: Path, config_file: Path):
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
        assert set_config("invalid_key", "value") is False


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
    config_file.write_text(json.dumps({"server": "http://test:8338"}))
    with _patch_config_paths(config_dir, config_file):
        config = load_config()
        assert config["server"] == "http://test:8338"
