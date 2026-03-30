"""Tests for the version command."""

import json
from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()

_PYPI = "transformerlab_cli.util.pypi"


def test_version_up_to_date():
    """Test version output when CLI is up to date."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value="0.0.3"),
    ):
        result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "0.0.3" in result.output
    assert "up to date" in result.output.lower()


def test_version_update_available():
    """Test version output when an update is available."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value="0.0.4"),
    ):
        result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "0.0.3" in result.output
    assert "0.0.4" in result.output
    assert "uv tool upgrade transformerlab-cli" in result.output


def test_version_check_failed():
    """Test version output when PyPI check fails."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value=None),
    ):
        result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert "0.0.3" in result.output
    assert "could not check" in result.output.lower()


def test_version_json_up_to_date():
    """Test JSON output when up to date."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value="0.0.3"),
    ):
        result = runner.invoke(app, ["--format", "json", "version"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["installed_version"] == "0.0.3"
    assert data["update_available"] is False
    assert "latest_version" not in data


def test_version_json_update_available():
    """Test JSON output when an update is available."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value="0.0.4"),
    ):
        result = runner.invoke(app, ["--format", "json", "version"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["installed_version"] == "0.0.3"
    assert data["update_available"] is True
    assert data["latest_version"] == "0.0.4"
    assert data["upgrade_command"] == "uv tool upgrade transformerlab-cli"


def test_version_json_check_failed():
    """Test JSON output when PyPI check fails."""
    with (
        patch(f"{_PYPI}.get_installed_version", return_value="0.0.3"),
        patch(f"{_PYPI}.fetch_latest_version", return_value=None),
    ):
        result = runner.invoke(app, ["--format", "json", "version"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["installed_version"] == "0.0.3"
    assert data["update_available"] is False
    assert data["check_succeeded"] is False
