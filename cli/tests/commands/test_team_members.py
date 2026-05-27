"""Tests for `lab team members` and `lab team invitations` commands."""

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


MEMBERS = {
    "team_id": "team-1",
    "members": [
        {"user_id": "11111111-1111-1111-1111-111111111111", "email": "alice@example.com", "role": "owner"},
        {"user_id": "22222222-2222-2222-2222-222222222222", "email": "bob@example.com", "role": "member"},
    ],
}


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_list_json(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(200, MEMBERS)
    result = runner.invoke(app, ["--format", "json", "team", "members", "list"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert {m["email"] for m in data} == {"alice@example.com", "bob@example.com"}


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_invite(mock_api, _check, _cfg):
    mock_api.post_json.return_value = _mock_response(200, {"status": "invited"})
    result = runner.invoke(
        app, ["--format", "json", "team", "members", "invite", "new@example.com", "--role", "member"]
    )
    assert result.exit_code == 0, result.output
    assert mock_api.post_json.call_args[0][0] == "/teams/team-1/members"
    assert mock_api.post_json.call_args.kwargs["json_data"] == {"email": "new@example.com", "role": "member"}


@patch("transformerlab_cli.commands.team_members.check_configs")
def test_members_invite_bad_role(_check):
    result = runner.invoke(app, ["team", "members", "invite", "new@example.com", "--role", "boss"])
    assert result.exit_code == 1
    assert "role" in result.output.lower()


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_remove_resolves_email(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(200, MEMBERS)
    mock_api.delete.return_value = _mock_response(200, {"status": "removed"})
    result = runner.invoke(
        app, ["--format", "json", "--no-interactive", "team", "members", "remove", "bob@example.com"]
    )
    assert result.exit_code == 0, result.output
    assert mock_api.delete.call_args[0][0] == "/teams/team-1/members/22222222-2222-2222-2222-222222222222"


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_remove_passes_uuid_through(mock_api, _check, _cfg):
    mock_api.delete.return_value = _mock_response(200, {"status": "removed"})
    uid = "33333333-3333-3333-3333-333333333333"
    result = runner.invoke(app, ["--format", "json", "--no-interactive", "team", "members", "remove", uid])
    assert result.exit_code == 0, result.output
    # UUID should pass through without a members lookup
    mock_api.get.assert_not_called()
    assert mock_api.delete.call_args[0][0] == f"/teams/team-1/members/{uid}"


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_remove_unknown_email_errors(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(200, MEMBERS)
    result = runner.invoke(app, ["--no-interactive", "team", "members", "remove", "ghost@example.com"])
    assert result.exit_code == 1
    assert "No member found" in result.output


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_members_set_role(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(200, MEMBERS)
    mock_api.put_json.return_value = _mock_response(200, {"status": "ok"})
    result = runner.invoke(app, ["--format", "json", "team", "members", "set-role", "bob@example.com", "owner"])
    assert result.exit_code == 0, result.output
    assert mock_api.put_json.call_args[0][0] == "/teams/team-1/members/22222222-2222-2222-2222-222222222222/role"
    assert mock_api.put_json.call_args.kwargs["json_data"] == {"role": "owner"}


@patch("transformerlab_cli.commands.team_members.check_configs")
def test_members_set_role_bad_role(_check):
    result = runner.invoke(app, ["team", "members", "set-role", "bob@example.com", "boss"])
    assert result.exit_code == 1


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_invitations_list_json(mock_api, _check, _cfg):
    mock_api.get.return_value = _mock_response(
        200,
        {
            "team_id": "team-1",
            "invitations": [
                {
                    "id": "inv-1",
                    "email": "x@example.com",
                    "role": "member",
                    "status": "pending",
                    "invited_by_email": "alice@example.com",
                    "expires_at": "2026-06-01",
                }
            ],
        },
    )
    result = runner.invoke(app, ["--format", "json", "team", "invitations", "list"])
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data[0]["id"] == "inv-1"
    assert mock_api.get.call_args[0][0] == "/teams/team-1/invitations"


@patch("transformerlab_cli.commands.team_members.get_config", return_value="team-1")
@patch("transformerlab_cli.commands.team_members.check_configs")
@patch("transformerlab_cli.commands.team_members.api")
def test_invitations_cancel(mock_api, _check, _cfg):
    mock_api.delete.return_value = _mock_response(200, {"status": "cancelled"})
    result = runner.invoke(app, ["--format", "json", "--no-interactive", "team", "invitations", "cancel", "inv-1"])
    assert result.exit_code == 0, result.output
    assert mock_api.delete.call_args[0][0] == "/teams/team-1/invitations/inv-1"
