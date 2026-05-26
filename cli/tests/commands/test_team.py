"""Tests for the lab team namespace, setup wizard, and global non-interactive flag."""

from unittest.mock import MagicMock

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
    # TODO(Task 5): assert "setup" in result.output
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
