"""Tests for Azure provider creation in team_provider_endpoints."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.shared.models.models import ProviderType


def test_create_azure_provider_injects_resource_group_and_team_id():
    """create_provider_for_team must inject azure_resource_group and team_id into config for Azure providers."""
    from transformerlab.services.compute_provider.team_provider_endpoints import create_provider_for_team
    from pydantic import BaseModel

    class FakeConfig(BaseModel):
        azure_subscription_id: str = "sub-123"
        azure_tenant_id: str = "tenant-456"
        azure_client_id: str = "client-789"
        azure_client_secret: str = "secret"
        azure_location: str = "eastus"

        def model_dump(self, **kwargs):
            return {
                "azure_subscription_id": self.azure_subscription_id,
                "azure_tenant_id": self.azure_tenant_id,
                "azure_client_id": self.azure_client_id,
                "azure_client_secret": self.azure_client_secret,
                "azure_location": self.azure_location,
            }

    captured_config = {}

    async def fake_create_team_provider(session, team_id, name, provider_type, config, created_by_user_id):
        captured_config.update(config)
        mock_provider = MagicMock()
        mock_provider.type = "azure"
        mock_provider.id = "prov-1"
        mock_provider.name = name
        mock_provider.config = config
        mock_provider.is_default = False
        mock_provider.disabled = False
        mock_provider.supported_accelerators = []
        mock_provider.team_id = team_id
        mock_provider.created_by_user_id = "user-1"
        mock_provider.created_at = None
        mock_provider.updated_at = None
        return mock_provider

    provider_data = MagicMock()
    provider_data.type = ProviderType.AZURE
    provider_data.name = "my-azure"
    provider_data.config = FakeConfig()

    with (
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.create_team_provider",
            side_effect=fake_create_team_provider,
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

    assert captured_config["azure_resource_group"] == "transformerlab-team-xyz"
    assert captured_config["team_id"] == "team-xyz"


def test_azure_is_in_allowed_provider_types():
    """Azure must be in allowed_provider_types — verifies it no longer raises 400."""
    from transformerlab.services.compute_provider.team_provider_endpoints import create_provider_for_team
    from fastapi import HTTPException
    from pydantic import BaseModel

    class FakeConfig(BaseModel):
        azure_subscription_id: str = "sub-123"

        def model_dump(self, **kwargs):
            return {"azure_subscription_id": self.azure_subscription_id}

    provider_data = MagicMock()
    provider_data.type = ProviderType.AZURE
    provider_data.name = "my-azure"
    provider_data.config = FakeConfig()

    did_raise_type_error = False
    with (
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.list_team_providers",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.create_team_provider",
            new_callable=AsyncMock,
            side_effect=Exception("stop here"),
        ),
        patch(
            "transformerlab.services.compute_provider.team_provider_endpoints.cache.invalidate",
            new_callable=AsyncMock,
        ),
    ):
        try:
            asyncio.run(
                create_provider_for_team(
                    session=MagicMock(),
                    team_id="team-xyz",
                    user=MagicMock(id="user-1"),
                    provider_data=provider_data,
                    force_refresh=False,
                )
            )
        except HTTPException as e:
            if e.status_code == 400 and "Invalid provider type" in str(e.detail):
                did_raise_type_error = True
        except Exception:
            pass

    assert not did_raise_type_error, "Azure should be in allowed_provider_types"
