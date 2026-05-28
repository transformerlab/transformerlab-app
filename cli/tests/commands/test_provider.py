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


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS))
@patch("transformerlab_cli.commands.provider.api.delete", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_delete(_mock_check, mock_delete, _mock_get):
    """Test deleting a provider by id."""
    result = runner.invoke(app, ["provider", "delete", "p1", "--no-interactive"])
    assert result.exit_code == 0
    assert "deleted" in result.output
    mock_delete.assert_called_once_with("/compute_provider/providers/p1")


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS))
@patch("transformerlab_cli.commands.provider.api.delete", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_delete_by_name(_mock_check, mock_delete, _mock_get):
    """Test deleting a provider by name resolves to its id."""
    result = runner.invoke(app, ["provider", "delete", "slurm-1", "--no-interactive"])
    assert result.exit_code == 0
    assert "deleted" in result.output
    mock_delete.assert_called_once_with("/compute_provider/providers/p2")


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, SAMPLE_PROVIDERS))
@patch("transformerlab_cli.commands.provider.api.delete", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_delete_not_found(_mock_check, mock_delete, _mock_get):
    """Test deleting a nonexistent provider errors before confirming or calling delete."""
    result = runner.invoke(app, ["provider", "delete", "nope"])
    assert result.exit_code == 1
    assert "not found" in result.output
    mock_delete.assert_not_called()


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
def test_provider_add_aws_uploads_credentials(_mock_check, mock_post, _mock_get, tmp_path):
    """`provider add --type aws` with creds-file posts to the AWS credentials endpoint after create."""
    creds_path = tmp_path / "aws.json"
    creds_path.write_text(json.dumps({"aws_access_key_id": "AKIATEST", "aws_secret_access_key": "secret-value"}))
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
            "--credentials-file",
            str(creds_path),
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
def test_provider_add_aws_partial_creds_rejected(_mock_check, _mock_post, _mock_get, tmp_path):
    """`provider add --type aws` must not accept just one of the AWS credential fields."""
    creds_path = tmp_path / "aws.json"
    creds_path.write_text(json.dumps({"aws_access_key_id": "AKIATEST"}))
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
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 1
    normalized_output = " ".join(result.output.split())
    assert "aws_access_key_id" in normalized_output and "aws_secret_access_key" in normalized_output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p7b"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_aws_no_interactive_requires_credentials(_mock_check, mock_post, _mock_get):
    """`provider add --type aws --no-interactive` without --credentials-file should error before creating the provider."""
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
        ],
    )
    assert result.exit_code == 1
    assert "AWS providers require credentials" in result.output
    mock_post.assert_not_called()


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "p8"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_gcp_uploads_service_account(_mock_check, mock_post, _mock_get, tmp_path):
    """`provider add --type gcp --credentials-file` reads the SA JSON and uploads it."""
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
            "--credentials-file",
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
    normalized_output = " ".join(result.output.split())
    assert "service account JSON" in normalized_output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "pcf1"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_credentials_file_merges_into_config(_mock_check, mock_post, _mock_get, tmp_path):
    """--credentials-file values merge into --config and take precedence."""
    creds_path = tmp_path / "creds.json"
    creds_path.write_text(json.dumps({"api_token": "secret-token", "dstack_project": "from-file"}))

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
            '{"server_url": "http://0.0.0.0:3000", "dstack_project": "from-flag"}',
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 0
    create_call = mock_post.call_args_list[0]
    sent_config = create_call.kwargs["json_data"]["config"]
    assert sent_config["api_token"] == "secret-token"
    assert sent_config["server_url"] == "http://0.0.0.0:3000"
    assert sent_config["dstack_project"] == "from-file"


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_credentials_file_invalid_json(_mock_check, tmp_path):
    """An invalid JSON credentials file should be rejected before any API call."""
    bad_path = tmp_path / "creds.json"
    bad_path.write_text("not-json")
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
            "{}",
            "--credentials-file",
            str(bad_path),
        ],
    )
    assert result.exit_code == 1
    normalized_output = " ".join(result.output.split())
    assert "not valid JSON" in normalized_output


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_credentials_file_must_be_object(_mock_check, tmp_path):
    """A credentials file that is not a JSON object should be rejected."""
    bad_path = tmp_path / "creds.json"
    bad_path.write_text("[1, 2, 3]")
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
            "{}",
            "--credentials-file",
            str(bad_path),
        ],
    )
    assert result.exit_code == 1
    normalized_output = " ".join(result.output.split())
    assert "must contain a JSON object" in normalized_output


@patch(
    "transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"id": "p1", "type": "skypilot"})
)
@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_merges_into_config(_mock_check, mock_patch, _mock_get, tmp_path):
    """`provider update --credentials-file` merges the file into the config patch for non-aws/gcp providers."""
    creds_path = tmp_path / "creds.json"
    creds_path.write_text(json.dumps({"api_token": "rotated-token"}))

    result = runner.invoke(
        app,
        [
            "provider",
            "update",
            "p1",
            "--config",
            '{"server_url": "http://new.example.com"}',
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 0
    call_kwargs = mock_patch.call_args.kwargs
    assert call_kwargs["json_data"]["config"] == {
        "server_url": "http://new.example.com",
        "api_token": "rotated-token",
    }


@patch(
    "transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"id": "p1", "type": "skypilot"})
)
@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_only(_mock_check, mock_patch, _mock_get, tmp_path):
    """`provider update --credentials-file` alone is a valid update."""
    creds_path = tmp_path / "creds.json"
    creds_path.write_text(json.dumps({"api_token": "rotated-token"}))

    result = runner.invoke(
        app,
        [
            "provider",
            "update",
            "p1",
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 0
    call_kwargs = mock_patch.call_args.kwargs
    assert call_kwargs["json_data"] == {"config": {"api_token": "rotated-token"}}


@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"id": "p1", "type": "aws"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_aws_routes_to_dedicated_endpoint(
    _mock_check, _mock_get, mock_patch, mock_post, tmp_path
):
    """For aws providers, --credentials-file uploads via /aws/credentials, not into config."""
    creds_path = tmp_path / "creds.json"
    creds_path.write_text(json.dumps({"aws_access_key_id": "AKIA...", "aws_secret_access_key": "secret"}))

    result = runner.invoke(app, ["provider", "update", "p1", "--credentials-file", str(creds_path)])
    assert result.exit_code == 0
    # No PATCH should fire (nothing else to update).
    mock_patch.assert_not_called()
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args.args[0] == "/compute_provider/providers/p1/aws/credentials"
    assert call_args.kwargs["json_data"] == {"access_key_id": "AKIA...", "secret_access_key": "secret"}


@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"id": "p1", "type": "aws"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_aws_requires_both_keys(_mock_check, _mock_get, _mock_post, tmp_path):
    """aws --credentials-file with only one of the key pair should error."""
    creds_path = tmp_path / "creds.json"
    creds_path.write_text(json.dumps({"aws_access_key_id": "AKIA..."}))

    result = runner.invoke(app, ["provider", "update", "p1", "--credentials-file", str(creds_path)])
    assert result.exit_code == 1
    normalized_output = " ".join(result.output.split())
    assert "must contain both" in normalized_output


@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"id": "p1", "type": "gcp"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_gcp_routes_to_dedicated_endpoint(
    _mock_check, _mock_get, mock_patch, mock_post, tmp_path
):
    """For gcp providers, --credentials-file uploads the raw JSON via /gcp/credentials."""
    sa_path = tmp_path / "sa.json"
    sa_contents = json.dumps({"type": "service_account", "project_id": "p", "client_email": "x@y.iam"})
    sa_path.write_text(sa_contents)

    result = runner.invoke(app, ["provider", "update", "p1", "--credentials-file", str(sa_path)])
    assert result.exit_code == 0
    mock_patch.assert_not_called()
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args.args[0] == "/compute_provider/providers/p1/gcp/credentials"
    assert call_args.kwargs["json_data"] == {"service_account_json": sa_contents}


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
            "--credentials-file",
            str(bad_path),
        ],
    )
    assert result.exit_code == 1
    # Rich's console may wrap the long path across newlines; collapse whitespace before asserting.
    normalized_output = " ".join(result.output.split())
    assert "not valid JSON" in normalized_output


@patch("transformerlab_cli.commands.provider.api.get", return_value=_mock_response(200, {"status": True}))
@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200, {"id": "pn1"}))
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_nebius_uploads_credentials(_mock_check, mock_post, _mock_get, tmp_path):
    """`provider add --type nebius --credentials-file` posts the key pair to /nebius/credentials."""
    creds_path = tmp_path / "nebius.json"
    creds_path.write_text(
        json.dumps(
            {
                "service_account_id": "serviceaccount-abc",
                "public_key_id": "publickey-xyz",
                "private_key": "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
            }
        )
    )

    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-nebius",
            "--type",
            "nebius",
            "--config",
            '{"parent_id": "project-123"}',
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 0
    assert len(mock_post.call_args_list) == 2
    create_call, creds_call = mock_post.call_args_list
    assert create_call.args[0] == "/compute_provider/providers/"
    assert create_call.kwargs["json_data"]["type"] == "nebius"
    # Secrets must not leak into the create payload's config.
    assert "private_key" not in create_call.kwargs["json_data"]["config"]
    assert create_call.kwargs["json_data"]["config"]["parent_id"] == "project-123"
    assert creds_call.args[0] == "/compute_provider/providers/pn1/nebius/credentials"
    assert creds_call.kwargs["json_data"]["service_account_id"] == "serviceaccount-abc"
    assert creds_call.kwargs["json_data"]["public_key_id"] == "publickey-xyz"
    assert "Nebius credentials saved" in result.output


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_nebius_requires_credentials_non_interactive(_mock_check):
    """Non-interactive `provider add --type nebius` without credentials should fail before create."""
    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-nebius",
            "--type",
            "nebius",
            "--config",
            '{"parent_id": "project-123"}',
        ],
    )
    assert result.exit_code == 1
    assert "Nebius providers require service-account credentials" in result.output


@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_add_nebius_partial_credentials_rejected(_mock_check, tmp_path):
    """A Nebius credentials file missing one of the key-pair fields should be rejected."""
    creds_path = tmp_path / "nebius.json"
    creds_path.write_text(json.dumps({"service_account_id": "serviceaccount-abc"}))

    result = runner.invoke(
        app,
        [
            "provider",
            "add",
            "--no-interactive",
            "--name",
            "my-nebius",
            "--type",
            "nebius",
            "--config",
            "{}",
            "--credentials-file",
            str(creds_path),
        ],
    )
    assert result.exit_code == 1
    normalized_output = " ".join(result.output.split())
    assert "public_key_id" in normalized_output and "private_key" in normalized_output


@patch("transformerlab_cli.commands.provider.api.post_json", return_value=_mock_response(200))
@patch("transformerlab_cli.commands.provider.api.patch", return_value=_mock_response(200))
@patch(
    "transformerlab_cli.commands.provider.api.get",
    return_value=_mock_response(200, {"id": "p1", "type": "nebius"}),
)
@patch("transformerlab_cli.commands.provider.check_configs")
def test_provider_update_credentials_file_nebius_routes_to_dedicated_endpoint(
    _mock_check, _mock_get, mock_patch, mock_post, tmp_path
):
    """For nebius providers, --credentials-file uploads the key pair via /nebius/credentials."""
    creds_path = tmp_path / "nebius.json"
    creds_path.write_text(
        json.dumps(
            {
                "service_account_id": "serviceaccount-abc",
                "public_key_id": "publickey-xyz",
                "private_key": "fake-key",
            }
        )
    )

    result = runner.invoke(app, ["provider", "update", "p1", "--credentials-file", str(creds_path)])
    assert result.exit_code == 0
    mock_patch.assert_not_called()
    mock_post.assert_called_once()
    call_args = mock_post.call_args
    assert call_args.args[0] == "/compute_provider/providers/p1/nebius/credentials"
    assert call_args.kwargs["json_data"] == {
        "service_account_id": "serviceaccount-abc",
        "public_key_id": "publickey-xyz",
        "private_key": "fake-key",
    }
