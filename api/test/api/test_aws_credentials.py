import asyncio
import configparser
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.services.compute_provider.launch_credentials import write_aws_credentials_to_profile


def test_write_creates_new_profile(tmp_path):
    creds_file = tmp_path / ".aws" / "credentials"
    with patch(
        "transformerlab.services.compute_provider.launch_credentials._aws_credentials_path",
        return_value=str(creds_file),
    ):
        write_aws_credentials_to_profile("my-profile", "AKIATEST", "secrettest")

    config = configparser.ConfigParser()
    config.read(str(creds_file))
    assert "my-profile" in config
    assert config["my-profile"]["aws_access_key_id"] == "AKIATEST"
    assert config["my-profile"]["aws_secret_access_key"] == "secrettest"


def test_write_overwrites_existing_profile(tmp_path):
    creds_file = tmp_path / ".aws" / "credentials"
    creds_file.parent.mkdir(parents=True)
    creds_file.write_text("[my-profile]\naws_access_key_id = OLD\naws_secret_access_key = OLDSECRET\n")

    with patch(
        "transformerlab.services.compute_provider.launch_credentials._aws_credentials_path",
        return_value=str(creds_file),
    ):
        write_aws_credentials_to_profile("my-profile", "AKIANEW", "newsecret")

    config = configparser.ConfigParser()
    config.read(str(creds_file))
    assert config["my-profile"]["aws_access_key_id"] == "AKIANEW"
    assert config["my-profile"]["aws_secret_access_key"] == "newsecret"


def test_write_preserves_other_profiles(tmp_path):
    creds_file = tmp_path / ".aws" / "credentials"
    creds_file.parent.mkdir(parents=True)
    creds_file.write_text("[other-profile]\naws_access_key_id = OTHER\naws_secret_access_key = OTHERSEC\n")

    with patch(
        "transformerlab.services.compute_provider.launch_credentials._aws_credentials_path",
        return_value=str(creds_file),
    ):
        write_aws_credentials_to_profile("my-profile", "AKIATEST", "secrettest")

    config = configparser.ConfigParser()
    config.read(str(creds_file))
    assert "other-profile" in config
    assert config["other-profile"]["aws_access_key_id"] == "OTHER"


def test_create_aws_provider_injects_aws_profile_and_team_id():
    """create_provider_for_team must persist aws_profile and team_id into config for AWS providers."""
    from transformerlab.services.compute_provider.team_provider_endpoints import create_provider_for_team

    class FakeConfig:
        def model_dump(self, **kwargs):
            return {"region": "us-east-1"}

    captured_create_config = {}
    captured_update_config = {}

    async def fake_create_team_provider(session, team_id, name, provider_type, config, created_by_user_id):
        captured_create_config.update(config)
        mock_provider = MagicMock()
        mock_provider.type = "aws"
        mock_provider.id = "prov-1234"
        mock_provider.name = name
        mock_provider.config = config
        mock_provider.is_default = False
        mock_provider.disabled = False
        mock_provider.supported_accelerators = []
        mock_provider.team_id = team_id
        mock_provider.created_by_user_id = created_by_user_id
        mock_provider.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        mock_provider.updated_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
        return mock_provider

    async def fake_update_team_provider(session, provider, name, config, disabled, is_default):
        captured_update_config.update(config or {})
        provider.config = config
        return provider

    provider_data = MagicMock()
    provider_data.type = "aws"
    provider_data.name = "my-aws"
    provider_data.config = FakeConfig()

    with (
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.create_team_provider",
            side_effect=fake_create_team_provider,
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.update_team_provider",
            side_effect=fake_update_team_provider,
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.list_team_providers",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.cache.invalidate",
            new_callable=AsyncMock,
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.get_provider_read",
            new_callable=AsyncMock,
        ),
    ):
        asyncio.run(
            create_provider_for_team(
                session=MagicMock(),
                team_id="team-xyz",
                user=MagicMock(id="user-1"),
                provider_data=provider_data,
                force_refresh=False,
            )
        )

    assert captured_create_config["team_id"] == "team-xyz"
    assert "aws_profile" not in captured_create_config
    assert captured_update_config["aws_profile"] == "tlab-compute-team-xyz-prov-123"
    assert captured_update_config["team_id"] == "team-xyz"


def test_save_aws_credentials_endpoint():
    """POST /{provider_id}/aws/credentials calls write_aws_credentials_to_profile."""
    mock_provider = MagicMock()
    mock_provider.type = "aws"
    mock_provider.config = {"aws_profile": "tlab-compute-team-abc-provider"}

    with (
        patch(
            "transformerlab.routers.compute_provider.providers.get_team_provider",
            new_callable=AsyncMock,
            return_value=mock_provider,
        ),
        patch("transformerlab.routers.compute_provider.providers.write_aws_credentials_to_profile") as mock_write,
    ):
        from transformerlab.routers.compute_provider.providers import AwsCredentialsRequest, set_aws_credentials

        mock_session = MagicMock()
        mock_owner_info = {"team_id": "team-abc"}

        asyncio.run(
            set_aws_credentials(
                provider_id="prov-123",
                body=AwsCredentialsRequest(access_key_id="AKIATEST", secret_access_key="mysecret"),
                owner_info=mock_owner_info,
                session=mock_session,
            )
        )

        mock_write.assert_called_once_with("tlab-compute-team-abc-provider", "AKIATEST", "mysecret")


def test_update_aws_provider_preserves_missing_profile_without_backfill():
    """update_provider_for_team should not backfill aws_profile for legacy AWS configs."""
    from transformerlab.services.compute_provider.team_provider_endpoints import update_provider_for_team

    provider = MagicMock()
    provider.id = "prov-aws"
    provider.team_id = "team-xyz"
    provider.name = "aws-provider"
    provider.type = "aws"
    provider.config = {"region": "us-east-1"}
    provider.created_by_user_id = "user-1"
    provider.created_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    provider.updated_at = datetime(2024, 1, 1, tzinfo=timezone.utc)
    provider.disabled = False
    provider.is_default = False

    class FakeConfig:
        def model_dump(self, **kwargs):
            return {"region": "us-west-2"}

    provider_update = MagicMock()
    provider_update.name = None
    provider_update.config = FakeConfig()
    provider_update.disabled = None
    provider_update.is_default = None

    captured = {}

    async def fake_update_team_provider(session, provider, name, config, disabled, is_default):
        captured.update(config or {})
        provider.config = config
        return provider

    with (
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.get_team_provider",
            new_callable=AsyncMock,
            return_value=provider,
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.update_team_provider",
            side_effect=fake_update_team_provider,
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.cache.invalidate",
            new_callable=AsyncMock,
        ),
    ):
        asyncio.run(
            update_provider_for_team(
                session=MagicMock(),
                team_id="team-xyz",
                provider_id="prov-aws",
                provider_data=provider_update,
            )
        )

    assert captured["region"] == "us-west-2"
    assert "aws_profile" not in captured
    assert captured["team_id"] == "team-xyz"


def test_db_record_to_provider_config_does_not_backfill_missing_aws_profile():
    """db_record_to_provider_config should not backfill aws_profile for legacy AWS configs."""
    from transformerlab.services.provider_service import db_record_to_provider_config

    record = MagicMock()
    record.type = "aws"
    record.name = "legacy-aws"
    record.team_id = "team-legacy"
    record.config = {"region": "us-west-2"}

    cfg = db_record_to_provider_config(record)

    assert cfg.aws_profile is None
    assert cfg.team_id == "team-legacy"
    assert cfg.region == "us-west-2"
