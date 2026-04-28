from unittest.mock import patch

from transformerlab.shared import remote_workspace


def test_validate_azure_credentials_missing_env_exits(monkeypatch):
    monkeypatch.delenv("AZURE_STORAGE_CONNECTION_STRING", raising=False)
    monkeypatch.delenv("AZURE_STORAGE_ACCOUNT", raising=False)
    monkeypatch.setenv("TFL_REMOTE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "azure")
    # Ensure the remote_workspace module follows the Azure path regardless of how
    # lab.storage.STORAGE_PROVIDER was initialised at import time.
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "azure", raising=False)

    # Reload module state if needed (validate_cloud_credentials reads STORAGE_PROVIDER at import)
    with patch("sys.stderr") as mock_stderr:
        try:
            remote_workspace.validate_cloud_credentials()
        except SystemExit as exc:
            # Should exit with error when no Azure env is defined
            assert exc.code == 1
        else:
            raise AssertionError("Expected SystemExit for missing Azure env")

        # Ensure an error message mentioning Azure is printed
        joined = "".join(call.args[0] for call in mock_stderr.write.call_args_list)
        assert "Azure" in joined or "AZURE_STORAGE" in joined


def test_create_bucket_for_team_azure_calls_helper(monkeypatch):
    monkeypatch.setenv("TFL_REMOTE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_STORAGE_CONNECTION_STRING", "UseDevelopmentStorage=true")
    # Force the Azure branch in create_bucket_for_team even if STORAGE_PROVIDER
    # was resolved earlier from a different default.
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "azure", raising=False)

    called = {}

    def fake_create_azure_container(container_name, team_id):
        called["container_name"] = container_name
        called["team_id"] = team_id
        return True

    monkeypatch.setattr(remote_workspace, "_create_azure_container", fake_create_azure_container)

    assert remote_workspace.create_bucket_for_team("My-Team") is True
    assert called["team_id"] == "My-Team"
    # Name should be normalised and prefixed
    assert called["container_name"].startswith("workspace-")


def test_create_bucket_for_team_aws_uses_env_profile(monkeypatch):
    monkeypatch.setenv("TFL_REMOTE_STORAGE_ENABLED", "true")
    monkeypatch.setenv("TFL_STORAGE_PROVIDER", "aws")
    monkeypatch.setenv("AWS_PROFILE", "my-aws-profile")
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "aws", raising=False)

    called = {}

    def fake_create_s3_bucket(bucket_name, team_id, profile_name):
        called["bucket_name"] = bucket_name
        called["team_id"] = team_id
        called["profile_name"] = profile_name
        return True

    monkeypatch.setattr(remote_workspace, "_create_s3_bucket", fake_create_s3_bucket)

    assert remote_workspace.create_bucket_for_team("team-123") is True
    assert called["team_id"] == "team-123"
    assert called["profile_name"] == "my-aws-profile"
