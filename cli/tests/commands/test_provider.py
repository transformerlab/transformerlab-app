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
def test_provider_list(_mock_check, _mock_api):
    """Test listing providers."""
    result = runner.invoke(app, ["provider", "list"])
    assert result.exit_code == 0
    assert "local-1" in result.output
    assert "slurm-1" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS[0]))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_info(_mock_check, _mock_api):
    """Test getting provider info."""
    result = runner.invoke(app, ["provider", "info", "p1"])
    assert result.exit_code == 0
    assert "local-1" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(404))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_info_not_found(_mock_check, _mock_api):
    """Test getting info for non-existent provider."""
    result = runner.invoke(app, ["provider", "info", "nonexistent"])
    assert result.exit_code == 1
    assert "not found" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p3"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_non_interactive(_mock_check, _mock_api, _mock_get):
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


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p3"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_runs_provider_check(_mock_check, mock_post, mock_get):
    """Test add runs provider health check after creation."""
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
    mock_post.assert_called_once()
    mock_get.assert_called_once_with("/compute_provider/providers/p3/check", timeout=60.0)


@patch(
    "transformerlab_cli.commands.provider.api.get",
    return_value=_mock_response(200, {"status": False, "reason": "Bad API key"}),
)
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p3"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_fails_when_provider_check_unhealthy(_mock_check, _mock_post, _mock_get):
    """Test add surfaces provider check reason when unhealthy."""
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
    assert result.exit_code == 1
    assert "Provider health check failed" in result.output
    assert "Bad API key" in result.output


@patch("transformerlab_cli.commands.provider.api.delete", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_delete(_mock_check, _mock_api):
    """Test deleting a provider."""
    result = runner.invoke(app, ["provider", "delete", "p1", "--no-interactive"])
    assert result.exit_code == 0
    assert "deleted" in result.output


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_enable(_mock_check, _mock_api):
    """Test enabling a provider."""
    result = runner.invoke(app, ["provider", "enable", "p1"])
    assert result.exit_code == 0
    assert "enabled" in result.output


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_disable(_mock_check, _mock_api):
    """Test disabling a provider."""
    result = runner.invoke(app, ["provider", "disable", "p1"])
    assert result.exit_code == 0
    assert "disabled" in result.output


@patch(
    "transformerlab_cli.commands.provider.api.get",
    return_value=_mock_response(200, {"status": False, "reason": "Bad API key"}),
)
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_check_shows_reason_and_fails(_mock_check, _mock_api):
    """Test provider check shows unhealthy reason and exits non-zero."""
    result = runner.invoke(app, ["provider", "check", "p1"])
    assert result.exit_code == 1
    assert "Provider check failed" in result.output
    assert "Bad API key" in result.output


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_set_default(_mock_check, mock_patch):
    """Test marking a provider as the team default."""
    result = runner.invoke(app, ["provider", "set-default", "p1"])
    assert result.exit_code == 0
    assert "default" in result.output.lower()
    # Verify the API was called with is_default=True
    call_kwargs = mock_patch.call_args.kwargs
    assert call_kwargs.get("json_data") == {"is_default": True}


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_clear_default(_mock_check, mock_patch):
    """Test clearing the default flag on a provider."""
    result = runner.invoke(app, ["provider", "clear-default", "p1"])
    assert result.exit_code == 0
    assert "no longer the default" in result.output
    call_kwargs = mock_patch.call_args.kwargs
    assert call_kwargs.get("json_data") == {"is_default": False}


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_default_flag(_mock_check, mock_patch):
    """Test --default flag on `provider update`."""
    result = runner.invoke(app, ["provider", "update", "p1", "--default"])
    assert result.exit_code == 0
    call_kwargs = mock_patch.call_args.kwargs
    assert call_kwargs.get("json_data") == {"is_default": True}


@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(404))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_set_default_not_found(_mock_check, _mock_api):
    """Test set-default on a non-existent provider."""
    result = runner.invoke(app, ["provider", "set-default", "nonexistent"])
    assert result.exit_code == 1
    assert "not found" in result.output
