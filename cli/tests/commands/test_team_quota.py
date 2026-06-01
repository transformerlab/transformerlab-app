"""Tests for `lab team quota` commands."""

import json
from unittest.mock import MagicMock, patch

import pytest
from typer.testing import CliRunner

from transformerlab_cli.main import app
from transformerlab_cli.state import cli_state

runner = CliRunner()


@pytest.fixture(autouse=True)
def _reset_cli_state():
    cli_state.output_format = "pretty"
    cli_state.no_interactive = False
    yield
    cli_state.output_format = "pretty"
    cli_state.no_interactive = False


def _mock_response(status_code: int = 200, json_data=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data if json_data is not None else {}
    mock.text = ""
    return mock


@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_show_json(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(
        200, {"team_id": "team-1", "monthly_quota_minutes": 600, "current_period_start": "2026-05-01"}
    )
    result = runner.invoke(app, ["--format", "json", "team", "quota", "show"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["monthly_quota_minutes"] == 600
    assert mock_api.get.call_args[0][0] == "/quota/team/team-1"


@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_show_pretty_shows_hours(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(200, {"team_id": "team-1", "monthly_quota_minutes": 90})
    result = runner.invoke(app, ["team", "quota", "show"])
    assert result.exit_code == 0, result.output
    assert "90 min (1h 30m)" in result.output


@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_set_patches_minutes(mock_api, _check, _cfg):
    mock_api.patch.return_value = _mock_response(200, {"monthly_quota_minutes": 1200})
    result = runner.invoke(app, ["--format", "json", "team", "quota", "set", "1200"])
    assert result.exit_code == 0, result.output
    assert mock_api.patch.call_args[0][0] == "/quota/team/team-1"
    assert mock_api.patch.call_args.kwargs["json_data"] == {"monthly_quota_minutes": 1200}


@patch("transformerlab_cli.commands.team_quota.check_configs")
def test_quota_set_negative_errors(_check):
    result = runner.invoke(app, ["team", "quota", "set", "-5"])
    assert result.exit_code != 0


@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_usage_json(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(
        200, [{"email": "a@b.com", "total_quota": 600, "used_quota": 100, "available_quota": 500, "overused_quota": 0}]
    )
    result = runner.invoke(app, ["--format", "json", "team", "quota", "usage"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data[0]["email"] == "a@b.com"
    assert mock_api.get.call_args[0][0] == "/quota/team/team-1/users"


@patch("transformerlab_cli.commands.team_quota._resolve_user", return_value="uuid-9")
@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_set_user_resolves_email(mock_api, _check, _cfg, _resolve):
    mock_api.patch.return_value = _mock_response(200, {"monthly_quota_minutes": 60})
    result = runner.invoke(app, ["--format", "json", "team", "quota", "set-user", "a@b.com", "60"])
    assert result.exit_code == 0, result.output
    assert mock_api.patch.call_args[0][0] == "/quota/user/uuid-9/team/team-1"


@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_me_json(mock_api, _check):
    mock_api.get.return_value = _mock_response(200, {"total_quota": 600, "used_quota": 50, "available_quota": 550})
    result = runner.invoke(app, ["--format", "json", "team", "quota", "me"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["total_quota"] == 600
    assert mock_api.get.call_args[0][0] == "/quota/me"


@patch("transformerlab_cli.commands.team_quota.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_quota.check_configs")
@patch("transformerlab_cli.commands.team_quota.api")
def test_quota_show_error_exits(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(403, {"detail": "Only team owners can access this"})
    result = runner.invoke(app, ["team", "quota", "show"])
    assert result.exit_code == 1
    assert "Only team owners" in result.output
