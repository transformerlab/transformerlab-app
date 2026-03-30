"""Tests for lab server setup command."""

from unittest.mock import patch

from typer.testing import CliRunner

from transformerlab_cli.main import app
from tests.helpers import strip_ansi


runner = CliRunner()


def test_setup_help_shows_command():
    result = runner.invoke(app, ["server", "setup", "--help"])
    assert result.exit_code == 0
    # Just assert the command exists.
    out = strip_ansi(result.output)
    assert "Usage: lab server setup" in out


def test_setup_invalid_server_url_exits():
    # Provide an invalid URL to ensure we exit with a helpful error.
    with patch("transformerlab_cli.commands.setup.load_config", return_value={}):
        result = runner.invoke(app, ["server", "setup"], input="not-a-url\n")
    assert result.exit_code != 0
    out = strip_ansi(result.output)
    assert "Invalid URL" in out


def test_setup_health_check_failure_exits(tmp_path):
    # Valid server URL, but health check fails.
    def _fake_get(server: str, path: str, timeout: float = 10.0):
        import httpx

        return httpx.Response(status_code=500, text="boom")

    with patch("transformerlab_cli.commands.setup._server_get", _fake_get):
        result = runner.invoke(app, ["server", "setup"], input="http://example.com\n")

    assert result.exit_code != 0
    out = strip_ansi(result.output)
    assert "health check failed" in out.lower()
