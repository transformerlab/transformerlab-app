"""Tests for workspace storage diagnostics command."""

import json
from unittest.mock import MagicMock, patch

from typer.testing import CliRunner

from transformerlab_cli.main import app
from tests.helpers import strip_ansi

runner = CliRunner()


def _mock_response(status_code: int = 200, json_data=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data if json_data is not None else {}
    mock.text = ""
    return mock


SAMPLE_DIAG = {
    "ok": True,
    "workspace_dir": "/tmp/orgs/team-1/workspace",
    "storage_root": "/tmp/orgs/team-1",
    "workspace_is_remote": False,
    "storage_provider": "localfs",
    "remote_storage_enabled": False,
    "tfl_storage_uri_configured": False,
    "workspace_requires_cloud_credentials": False,
    "credential_hints": {"tfl_storage_uri_set": False, "tfl_workspace_dir_set": False},
    "credential_validation": None,
    "credential_validation_skipped_reason": "TFL_STORAGE_PROVIDER is localfs.",
    "read_write_probe": {"ok": True, "error": None},
}


@patch("transformerlab_cli.commands.workspace.api.get", return_value=_mock_response(200, SAMPLE_DIAG))
@patch("transformerlab_cli.commands.workspace.check_configs")
def test_workspace_check_ok(mock_check, mock_get):
    result = runner.invoke(app, ["workspace", "check"])
    assert result.exit_code == 0
    out = strip_ansi(result.output)
    assert "PASS" in out
    assert "/tmp/orgs/team-1/workspace" in out
    mock_get.assert_called_once()


@patch("transformerlab_cli.commands.workspace.api.get")
@patch("transformerlab_cli.commands.workspace.check_configs")
def test_workspace_check_probe_fail_exits_1(mock_check, mock_get):
    fail = {**SAMPLE_DIAG, "ok": False, "read_write_probe": {"ok": False, "error": "permission denied"}}
    mock_get.return_value = _mock_response(200, fail)
    result = runner.invoke(app, ["workspace", "check"])
    assert result.exit_code == 1
    assert "FAIL" in strip_ansi(result.output)


@patch("transformerlab_cli.commands.workspace.api.get", return_value=_mock_response(200, SAMPLE_DIAG))
@patch("transformerlab_cli.commands.workspace.check_configs")
def test_workspace_check_json(mock_check, mock_get):
    result = runner.invoke(app, ["--format", "json", "workspace", "check"])
    assert result.exit_code == 0
    parsed = json.loads(result.output.strip())
    assert parsed["ok"] is True
    assert parsed["storage_provider"] == "localfs"


@patch("transformerlab_cli.commands.workspace.api.get", return_value=_mock_response(503))
@patch("transformerlab_cli.commands.workspace.check_configs")
def test_workspace_check_http_error(mock_check, mock_get):
    result = runner.invoke(app, ["workspace", "check"])
    assert result.exit_code == 1


def test_workspace_help():
    result = runner.invoke(app, ["workspace", "--help"])
    assert result.exit_code == 0
    assert "check" in result.output.lower()
