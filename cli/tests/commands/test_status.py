from unittest.mock import patch
from typer.testing import CliRunner

from transformerlab_cli.main import app

runner = CliRunner()


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_success(mock_check_server_status, mock_check_configs):
    """Test the status command when both config check and server status succeed."""
    # Mock the functions to do nothing (success)
    mock_check_configs.return_value = None
    mock_check_server_status.return_value = None

    result = runner.invoke(app, ["status"])

    assert result.exit_code == 0
    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_called_once()


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_config_failure(mock_check_server_status, mock_check_configs):
    """Test the status command when config check fails."""
    mock_check_configs.side_effect = SystemExit(1)
    mock_check_server_status.return_value = None

    result = runner.invoke(app, ["status"])

    assert result.exit_code == 1
    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_not_called()


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_server_failure(mock_check_server_status, mock_check_configs):
    """Test the status command when server status check fails."""
    mock_check_configs.return_value = None
    mock_check_server_status.side_effect = SystemExit(1)

    result = runner.invoke(app, ["status"])

    assert result.exit_code == 1
    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_called_once()
