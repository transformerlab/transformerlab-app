"""Tests for secret commands."""

import json
from unittest.mock import patch, MagicMock

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


SAMPLE_SECRETS_RESPONSE = {
    "status": "success",
    "secrets": {"API_KEY": "***", "DB_PASSWORD": "***"},
    "secret_keys": ["API_KEY", "DB_PASSWORD"],
}

SAMPLE_SECRETS_WITH_VALUES = {
    "status": "success",
    "secrets": {"API_KEY": "sk-123", "DB_PASSWORD": "hunter2"},
    "secret_keys": ["API_KEY", "DB_PASSWORD"],
}

SAMPLE_EMPTY_SECRETS = {
    "status": "success",
    "secrets": {},
    "secret_keys": [],
}


def _mock_response(status_code: int = 200, json_data=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data if json_data is not None else {}
    mock.text = ""
    return mock


def test_secret_help():
    """Test the secret command help."""
    result = runner.invoke(app, ["team", "secret", "--help"])
    assert result.exit_code == 0
    assert "Secret management commands" in result.output


def test_secret_keys():
    """Test listing platform-recognized keys."""
    result = runner.invoke(app, ["team", "secret", "keys"])
    assert result.exit_code == 0
    assert "_HF_TOKEN" in result.output
    assert "_GITHUB_PAT_TOKEN" in result.output
    assert "_WANDB_API_KEY" in result.output
    assert "_NGROK_AUTH_TOKEN" in result.output


def test_secret_keys_json():
    """Test listing platform keys in JSON format."""
    result = runner.invoke(app, ["--format", "json", "team", "secret", "keys"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert len(data) == 4
    keys = [row["key"] for row in data]
    assert "_HF_TOKEN" in keys


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_RESPONSE))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_list(_mock_config, _mock_check, _mock_api):
    """Test listing secrets."""
    result = runner.invoke(app, ["team", "secret", "list"])
    assert result.exit_code == 0
    assert "API_KEY" in result.output
    assert "DB_PASSWORD" in result.output


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_WITH_VALUES))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_list_show_values(_mock_config, _mock_check, _mock_api):
    """Test listing secrets with values visible."""
    result = runner.invoke(app, ["team", "secret", "list", "--show-values"])
    assert result.exit_code == 0
    assert "sk-123" in result.output
    assert "hunter2" in result.output


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_EMPTY_SECRETS))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_list_empty(_mock_config, _mock_check, _mock_api):
    """Test listing secrets when none exist."""
    result = runner.invoke(app, ["team", "secret", "list"])
    assert result.exit_code == 2
    assert "No secrets found" in result.output


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_RESPONSE))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_list_json(_mock_config, _mock_check, _mock_api):
    """Test listing secrets in JSON format."""
    result = runner.invoke(app, ["--format", "json", "team", "secret", "list"])
    assert result.exit_code == 0
    data = json.loads(result.output)
    assert isinstance(data, list)
    assert data[0]["name"] == "API_KEY"


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_WITH_VALUES))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_set_prompts_for_value(_mock_config, _mock_check, mock_get, mock_put):
    """Test that omitting value prompts with hidden input."""
    mock_put.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(app, ["team", "secret", "set", "MY_KEY"], input="secret-from-prompt\n")
    assert result.exit_code == 0
    assert "saved" in result.output

    put_call = mock_put.call_args
    payload = put_call.kwargs["json_data"]
    assert payload["secrets"]["MY_KEY"] == "secret-from-prompt"


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_WITH_VALUES))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_set(_mock_config, _mock_check, mock_get, mock_put):
    """Test setting a secret."""
    mock_put.return_value = _mock_response(200, {"status": "success", "message": "Team secrets saved successfully"})
    result = runner.invoke(app, ["team", "secret", "set", "NEW_KEY", "new-value"])
    assert result.exit_code == 0
    assert "NEW_KEY" in result.output
    assert "saved" in result.output

    put_call = mock_put.call_args
    payload = put_call.kwargs["json_data"]
    assert payload["secrets"]["NEW_KEY"] == "new-value"
    assert payload["secrets"]["API_KEY"] == "sk-123"


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_set_special(_mock_config, _mock_check, mock_put):
    """Test setting a special secret routes to special_secrets endpoint."""
    mock_put.return_value = _mock_response(200, {"status": "success", "secret_type": "_HF_TOKEN"})
    result = runner.invoke(app, ["team", "secret", "set", "_HF_TOKEN", "hf_abc123"])
    assert result.exit_code == 0
    assert "_HF_TOKEN" in result.output

    put_call = mock_put.call_args
    assert "special_secrets" in put_call.args[0]
    assert put_call.kwargs["json_data"]["secret_type"] == "_HF_TOKEN"
    assert put_call.kwargs["json_data"]["value"] == "hf_abc123"


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_WITH_VALUES))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_delete(_mock_config, _mock_check, mock_get, mock_put):
    """Test deleting a secret."""
    mock_put.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(app, ["team", "secret", "delete", "API_KEY", "--no-interactive"])
    assert result.exit_code == 0
    assert "deleted" in result.output

    put_call = mock_put.call_args
    payload = put_call.kwargs["json_data"]
    assert "API_KEY" not in payload["secrets"]
    assert "DB_PASSWORD" in payload["secrets"]


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_WITH_VALUES))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_delete_not_found(_mock_config, _mock_check, _mock_get):
    """Test deleting a secret that doesn't exist."""
    result = runner.invoke(app, ["team", "secret", "delete", "NONEXISTENT", "--no-interactive"])
    assert result.exit_code == 1
    assert "not found" in result.output


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_delete_special(_mock_config, _mock_check, mock_put):
    """Test deleting a special secret sends empty value."""
    mock_put.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(app, ["team", "secret", "delete", "_HF_TOKEN", "--no-interactive"])
    assert result.exit_code == 0

    put_call = mock_put.call_args
    assert "special_secrets" in put_call.args[0]
    assert put_call.kwargs["json_data"]["value"] == ""


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_SECRETS_RESPONSE))
@patch("transformerlab_cli.commands.secret.check_configs")
def test_secret_list_user(_mock_check, mock_get):
    """Test listing user-level secrets."""
    result = runner.invoke(app, ["team", "secret", "list", "--user"])
    assert result.exit_code == 0
    mock_get.assert_called_once()
    assert "/users/me/secrets" in mock_get.call_args.args[0]


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_EMPTY_SECRETS))
@patch("transformerlab_cli.commands.secret.check_configs")
def test_secret_set_user(_mock_check, mock_get, mock_put):
    """Test setting a user-level secret."""
    mock_put.return_value = _mock_response(200, {"status": "success"})
    result = runner.invoke(app, ["team", "secret", "set", "MY_KEY", "my-val", "--user"])
    assert result.exit_code == 0
    assert "/users/me/secrets" in mock_get.call_args.args[0]
    assert "/users/me/secrets" in mock_put.call_args.args[0]


@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(403))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_list_error(_mock_config, _mock_check, _mock_get):
    """Test error handling when API returns failure."""
    result = runner.invoke(app, ["team", "secret", "list"])
    assert result.exit_code == 1
    assert "Error" in result.output


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_set_picker_special_key(_mock_config, _mock_check, mock_put):
    """Bare `team secret set` shows a picker; choosing item 2 maps to _HF_TOKEN."""
    mock_put.return_value = _mock_response(200, {"status": "success", "secret_type": "_HF_TOKEN"})
    # SPECIAL_SECRET_KEYS order: _GITHUB_PAT_TOKEN(1), _HF_TOKEN(2), _WANDB_API_KEY(3), _NGROK_AUTH_TOKEN(4)
    result = runner.invoke(app, ["team", "secret", "set"], input="2\nhf_abc123\n")
    assert result.exit_code == 0
    put_call = mock_put.call_args
    assert "special_secrets" in put_call.args[0]
    assert put_call.kwargs["json_data"]["secret_type"] == "_HF_TOKEN"
    assert put_call.kwargs["json_data"]["value"] == "hf_abc123"


@patch("transformerlab_cli.commands.secret.api.put_json")
@patch("transformerlab_cli.commands.secret.api.get", return_value=_mock_response(200, SAMPLE_EMPTY_SECRETS))
@patch("transformerlab_cli.commands.secret.check_configs")
@patch("transformerlab_cli.commands.secret.get_config", return_value="team-123")
def test_secret_set_picker_custom_key(_mock_config, _mock_check, mock_get, mock_put):
    """Picking the custom option prompts for an arbitrary key and value."""
    mock_put.return_value = _mock_response(200, {"status": "success"})
    # Custom is the last menu item (index 5). Then key name, then value.
    result = runner.invoke(app, ["team", "secret", "set"], input="5\nMY_CUSTOM\ncustomval\n")
    assert result.exit_code == 0
    put_call = mock_put.call_args
    assert put_call.kwargs["json_data"]["secrets"]["MY_CUSTOM"] == "customval"


def test_secret_set_no_key_non_interactive_errors():
    """In non-interactive mode, a missing key is an error (no prompt)."""
    result = runner.invoke(app, ["--no-interactive", "team", "secret", "set"])
    assert result.exit_code == 1
    assert "required" in result.output.lower()
