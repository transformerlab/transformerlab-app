"""Tests for the lab team namespace, setup wizard, and global non-interactive flag."""

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


def test_no_interactive_flag_sets_state():
    """The global --no-interactive flag sets cli_state.no_interactive."""
    runner.invoke(app, ["--no-interactive", "version"])
    assert cli_state.no_interactive is True


def test_json_format_implies_no_interactive():
    """--format json implies non-interactive mode."""
    runner.invoke(app, ["--format", "json", "version"])
    assert cli_state.no_interactive is True


def test_default_is_interactive():
    """Without flags, no_interactive defaults to False."""
    runner.invoke(app, ["version"])
    assert cli_state.no_interactive is False


def test_team_help_lists_subcommands():
    result = runner.invoke(app, ["team", "--help"])
    assert result.exit_code == 0
    assert "setup" in result.output
    assert "secret" in result.output


def test_team_secret_keys_works():
    """`lab team secret keys` resolves to the moved secret command."""
    result = runner.invoke(app, ["team", "secret", "keys"])
    assert result.exit_code == 0
    assert "_HF_TOKEN" in result.output


def test_top_level_secret_removed():
    """`lab secret` is no longer registered."""
    result = runner.invoke(app, ["secret", "keys"])
    assert result.exit_code != 0
    assert "No such command" in result.output or "Usage" in result.output


@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.create_provider_interactively", return_value="prov-1")
@patch("transformerlab_cli.commands.team.check_configs")
def test_wizard_non_interactive_json(_mock_check, _mock_create, mock_api):
    """Non-interactive JSON wizard creates a provider, sets default, sets secrets, checks."""
    mock_api.patch.return_value = _mock_response(200, {"status": "success"})
    mock_api.put_json.return_value = _mock_response(200, {"status": "success"})
    mock_api.get.return_value = _mock_response(200, {"status": True})
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--set-default",
            "--secret",
            "_HF_TOKEN=hf_abc",
            "--check",
        ],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["provider_id"] == "prov-1"
    assert data["default_set"] is True
    assert data["secrets_set"] == ["_HF_TOKEN"]
    assert data["check"]["ok"] is True
    assert any(c.kwargs["json_data"].get("is_default") is True for c in mock_api.patch.call_args_list)
    assert any("special_secrets" in c.args[0] for c in mock_api.put_json.call_args_list)


@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.create_provider_interactively", return_value="prov-2")
@patch("transformerlab_cli.commands.team.check_configs")
def test_wizard_no_check_no_default(_mock_check, _mock_create, mock_api):
    """--no-check and --no-set-default skip those steps."""
    mock_api.put_json.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--no-set-default",
            "--no-check",
        ],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["default_set"] is False
    assert data["check"] is None
    mock_api.get.assert_not_called()


def test_setup_help():
    # Widen the terminal so rich does not wrap/truncate the option names.
    result = runner.invoke(app, ["team", "setup", "--help"], env={"COLUMNS": "200"})
    assert result.exit_code == 0
    assert "--set-default" in result.output
    assert "--secret" in result.output


@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.create_provider_interactively", return_value="prov-3")
@patch("transformerlab_cli.commands.team.check_configs")
def test_wizard_normal_secret_merges(_mock_check, _mock_create, mock_api):
    """A non-special --secret is merged into team secrets via GET+PUT."""
    mock_api.get.return_value = _mock_response(200, {"secrets": {"EXISTING": "v"}})
    mock_api.put_json.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--no-set-default",
            "--no-check",
            "--secret",
            "MYKEY=val",
        ],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output)
    assert data["secrets_set"] == ["MYKEY"]
    saved = [c for c in mock_api.put_json.call_args_list if "MYKEY" in str(c.kwargs.get("json_data"))]
    assert saved, "expected a put_json saving MYKEY"
    assert saved[-1].kwargs["json_data"]["secrets"]["MYKEY"] == "val"
    assert saved[-1].kwargs["json_data"]["secrets"]["EXISTING"] == "v"


@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.create_provider_interactively", return_value="prov-4")
@patch("transformerlab_cli.commands.team.check_configs")
def test_wizard_bad_secret_format_errors(_mock_check, _mock_create, mock_api):
    """--secret without '=' errors out."""
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--no-set-default",
            "--no-check",
            "--secret",
            "BADFORMAT",
        ],
    )
    assert result.exit_code == 1
    assert "KEY=VALUE" in result.output


@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.create_provider_interactively", return_value="prov-5")
@patch("transformerlab_cli.commands.team.check_configs")
def test_wizard_set_default_failure_exits(_mock_check, _mock_create, mock_api):
    """A non-200 from set-default surfaces an error and exits non-zero."""
    mock_api.patch.return_value = _mock_response(500, {})
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--set-default",
            "--no-check",
        ],
    )
    assert result.exit_code == 1
    assert "default" in result.output.lower()


@patch("transformerlab_cli.commands.provider.api")
@patch("transformerlab_cli.commands.team.api")
@patch("transformerlab_cli.commands.team.check_configs")
@patch("transformerlab_cli.commands.provider.check_configs")
def test_wizard_json_output_is_clean(_pcheck, _tcheck, team_api, provider_api):
    """In --format json mode, stdout must be parseable JSON with no console noise."""
    # create_provider_interactively (real) posts to create the provider:
    provider_api.post_json.return_value = _mock_response(200, {"id": "prov-clean"})
    team_api.get.return_value = _mock_response(200, {"status": True})
    result = runner.invoke(
        app,
        [
            "--format",
            "json",
            "team",
            "setup",
            "--name",
            "p",
            "--type",
            "local",
            "--config",
            "{}",
            "--no-set-default",
            "--check",
        ],
    )
    assert result.exit_code == 0, result.output
    data = json.loads(result.output.strip())  # must parse cleanly — no leading console lines
    assert data["provider_id"] == "prov-clean"
