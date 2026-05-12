"""Tests for provider commands."""

import json
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


@patch("transformerlab_cli.commands.provider.render_table")
@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_list_disables_name_wrapping(_mock_check, _mock_api, mock_render_table):
    """Provider list should keep names as a single token in pretty output."""
    result = runner.invoke(app, ["provider", "list"])
    assert result.exit_code == 0

    call_kwargs = mock_render_table.call_args.kwargs
    assert call_kwargs["column_options"]["name"] == {"no_wrap": True, "overflow": "crop"}


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


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_rejects_unknown_type(_mock_check):
    """`provider add --no-interactive --type foo` should fail with a helpful error."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "test",
            "--type",
            "not-a-real-type",
            "--config",
            "{}",
        ],
    )
    assert result.exit_code == 1
    assert "Invalid type" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p4"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_dstack(_mock_check, mock_post, _mock_get):
    """`provider add` accepts the dstack provider type."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-dstack",
            "--type",
            "dstack",
            "--config",
            '{"server_url": "http://0.0.0.0:3000", "api_token": "tok", "dstack_project": "main"}',
        ],
    )
    assert result.exit_code == 0
    assert "p4" in result.output
    # The create call should have gone to the providers endpoint with type=dstack.
    create_call = mock_post.call_args_list[0]
    assert create_call.args[0] == "/compute_provider/providers/"
    assert create_call.kwargs["json_data"]["type"] == "dstack"


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p5"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_azure(_mock_check, mock_post, _mock_get):
    """`provider add` accepts the azure provider type with required config."""
    config = {
        "azure_subscription_id": "sub",
        "azure_tenant_id": "tenant",
        "azure_client_id": "client",
        "azure_client_secret": "secret",
        "azure_location": "eastus",
    }
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-azure",
            "--type",
            "azure",
            "--config",
            json.dumps(config),
        ],
    )
    assert result.exit_code == 0
    create_call = mock_post.call_args_list[0]
    assert create_call.kwargs["json_data"]["type"] == "azure"
    assert create_call.kwargs["json_data"]["config"] == config


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p6"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_aws_uploads_credentials(_mock_check, mock_post, _mock_get):
    """`provider add --type aws` with creds posts to the AWS credentials endpoint after create."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-aws",
            "--type",
            "aws",
            "--config",
            '{"region": "us-east-1"}',
            "--aws-access-key-id",
            "AKIATEST",
            "--aws-secret-access-key",
            "secret-value",
        ],
    )
    assert result.exit_code == 0
    # First POST creates the provider, second uploads credentials.
    assert len(mock_post.call_args_list) == 2
    create_call, creds_call = mock_post.call_args_list
    assert create_call.args[0] == "/compute_provider/providers/"
    assert creds_call.args[0] == "/compute_provider/providers/p6/aws/credentials"
    assert creds_call.kwargs["json_data"] == {
        "access_key_id": "AKIATEST",
        "secret_access_key": "secret-value",
    }
    assert "AWS credentials saved" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p7"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_aws_partial_creds_rejected(_mock_check, _mock_post, _mock_get):
    """`provider add --type aws` must not accept just one of the AWS credential flags."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-aws",
            "--type",
            "aws",
            "--config",
            '{"region": "us-east-1"}',
            "--aws-access-key-id",
            "AKIATEST",
        ],
    )
    assert result.exit_code == 1
    assert "both --aws-access-key-id and --aws-secret-access-key" in result.output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p8"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_gcp_uploads_service_account(_mock_check, mock_post, _mock_get, tmp_path):
    """`provider add --type gcp` reads the service account JSON file and uploads it."""
    sa_path = tmp_path / "sa.json"
    sa_payload = {
        "project_id": "proj",
        "client_email": "sa@proj.iam.gserviceaccount.com",
        "private_key": "fake",
    }
    sa_path.write_text(json.dumps(sa_payload))

    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-gcp",
            "--type",
            "gcp",
            "--config",
            '{"region": "us-central1"}',
            "--gcp-service-account-file",
            str(sa_path),
        ],
    )
    assert result.exit_code == 0
    assert len(mock_post.call_args_list) == 2
    create_call, creds_call = mock_post.call_args_list
    assert create_call.args[0] == "/compute_provider/providers/"
    assert creds_call.args[0] == "/compute_provider/providers/p8/gcp/credentials"
    assert json.loads(creds_call.kwargs["json_data"]["service_account_json"]) == sa_payload
    assert "GCP service account saved" in result.output


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_gcp_requires_service_account_non_interactive(_mock_check):
    """Non-interactive `provider add --type gcp` without service account file should fail."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-gcp",
            "--type",
            "gcp",
            "--config",
            '{"region": "us-central1"}',
        ],
    )
    assert result.exit_code == 1
    assert "service account JSON" in result.output


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_gcp_invalid_service_account_file(_mock_check, tmp_path):
    """A service account file with invalid JSON should be rejected before any API call."""
    bad_path = tmp_path / "bad.json"
    bad_path.write_text("not-json")
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-gcp",
            "--type",
            "gcp",
            "--config",
            '{"region": "us-central1"}',
            "--gcp-service-account-file",
            str(bad_path),
        ],
    )
    assert result.exit_code == 1
    assert "not valid JSON" in result.output
