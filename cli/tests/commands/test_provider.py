"""Tests for provider commands."""

from unittest.mock import patch, MagicMock

from typer.testing import CliRunner
from transformerlab_cli.main import app

runner = CliRunner()

SAMPLE_PROVIDERS = [
    {
        "id": "p1",
        "name": "local-1",
        "type": "local",
        "disabled": False,
        "created_at": "2025-01-01",
        "updated_at": "2025-01-01",
    },
    {
        "id": "p2",
        "name": "slurm-1",
        "type": "slurm",
        "disabled": False,
        "created_at": "2025-01-02",
        "updated_at": "2025-01-02",
    },
]


def _mock_response(status_code: int = 200, json_data=None):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data if json_data is not None else {}
    mock.text = ""
    return mock


def test_provider_help():
    """Test the provider command help."""
    result = runner.invoke(app, ["provider", "--help"])
    assert result.exit_code == 0
    assert "Compute provider management commands" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_list(mock_check, mock_api):
    """Test listing providers."""
    result = runner.invoke(app, ["provider", "list"])
    assert result.exit_code == 0
    assert "local-1" in result.output
    assert "slurm-1" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS[0]))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_info(mock_check, mock_api):
    """Test getting provider info."""
    result = runner.invoke(app, ["provider", "info", "p1"])
    assert result.exit_code == 0
    assert "local-1" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(404))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_info_not_found(mock_check, mock_api):
    """Test getting info for non-existent provider."""
    result = runner.invoke(app, ["provider", "info", "nonexistent"])
    assert result.exit_code == 1
    assert "not found" in result.output


@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p3"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_non_interactive(mock_check, mock_api):
    """Test adding a provider non-interactively."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "test-provider",
            "--type",
            "local",
            "--config",
            "{}",
        ],
    )
    assert result.exit_code == 0
    assert "p3" in result.output


@patch("transformerlab_cli.commands.provider.api.delete", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_delete(mock_check, mock_api):
    """Test deleting a provider."""
    result = runner.invoke(app, ["provider", "delete", "p1", "--yes"])
    assert result.exit_code == 0
    assert "deleted" in result.output


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_enable(mock_check, mock_api):
    """Test enabling a provider."""
    result = runner.invoke(app, ["provider", "enable", "p1"])
    assert result.exit_code == 0
    assert "enabled" in result.output


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_disable(mock_check, mock_api):
    """Test disabling a provider."""
    result = runner.invoke(app, ["provider", "disable", "p1"])
    assert result.exit_code == 0
    assert "disabled" in result.output
