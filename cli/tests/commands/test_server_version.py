"""Tests for the server version command."""

import json
from unittest.mock import patch

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()


def test_server_version_up_to_date():
    """Test output when server is up to date."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value="v0.30.3"),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value="v0.30.3"),
    ):
        result = runner.invoke(app, ["server", "version"])
    assert result.exit_code == 0
    assert "v0.30.3" in result.output
    assert "up to date" in result.output.lower()


def test_server_version_update_available():
    """Test output when a server update is available."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value="v0.30.2"),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value="v0.30.3"),
    ):
        result = runner.invoke(app, ["server", "version"])
    assert result.exit_code == 0
    assert "v0.30.3" in result.output
    assert "lab server update" in result.output


def test_server_version_not_installed():
    """Test output when server is not installed."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value=None),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value="v0.30.3"),
    ):
        result = runner.invoke(app, ["server", "version"])
    assert result.exit_code == 0
    assert "not installed" in result.output.lower()


def test_server_version_cannot_check():
    """Test output when latest version cannot be fetched."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value="v0.30.2"),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value=None),
    ):
        result = runner.invoke(app, ["server", "version"])
    assert result.exit_code == 0
    assert "could not check" in result.output.lower()


def test_server_version_json_up_to_date():
    """Test JSON output when server is up to date."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value="v0.30.3"),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value="v0.30.3"),
    ):
        result = runner.invoke(app, ["--format", "json", "server", "version"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["installed_version"] == "v0.30.3"
    assert data["update_available"] is False


def test_server_version_json_update_available():
    """Test JSON output when an update is available."""
    with (
        patch("transformerlab_cli.commands.server._get_current_version", return_value="v0.30.2"),
        patch("transformerlab_cli.commands.server._get_latest_version", return_value="v0.30.3"),
    ):
        result = runner.invoke(app, ["--format", "json", "server", "version"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert data["installed_version"] == "v0.30.2"
    assert data["latest_version"] == "v0.30.3"
    assert data["update_available"] is True
    assert data["upgrade_command"] == "lab server update"
