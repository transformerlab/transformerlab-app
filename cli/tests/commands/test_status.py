import pytest
from unittest.mock import patch

from transformerlab_cli.commands.status import status


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_success(mock_check_server_status, mock_check_configs):
    """Test the status command when both config check and server status succeed."""
    # Mock the functions to do nothing (success)
    mock_check_configs.return_value = None
    mock_check_server_status.return_value = None

    status()

    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_called_once()


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_config_failure(mock_check_server_status, mock_check_configs):
    """Test the status command when config check fails."""
    mock_check_configs.side_effect = SystemExit(1)
    mock_check_server_status.return_value = None

    with pytest.raises(SystemExit) as excinfo:
        status()

    assert excinfo.value.code == 1
    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_not_called()


@patch("transformerlab_cli.commands.status.check_configs")
@patch("transformerlab_cli.commands.status.check_server_status")
def test_status_command_server_failure(mock_check_server_status, mock_check_configs):
    """Test the status command when server status check fails."""
    mock_check_configs.return_value = None
    mock_check_server_status.side_effect = SystemExit(1)

    with pytest.raises(SystemExit) as excinfo:
        status()

    assert excinfo.value.code == 1
    mock_check_configs.assert_called_once_with(output_format="json")
    mock_check_server_status.assert_called_once()
