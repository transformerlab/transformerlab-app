"""Tests for GCP provider spot scheduling."""

from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.gcp import GCPProvider
from transformerlab.compute_providers.models import ClusterConfig


@pytest.fixture
def provider():
    return GCPProvider(
        project_id="proj-1",
        zone="us-central1-a",
        region="us-central1",
        team_id="abc",
    )


class TestSpotScheduling:
    def test_spot_sets_scheduling_provisioning_model(self, provider):
        mock_request = MagicMock(return_value={"name": "op-1"})
        with (
            patch("transformerlab.compute_providers.gcp.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(provider, "_build_startup_script", return_value="#!/bin/bash"),
            patch.object(provider, "_ensure_ssh_firewall_rule"),
            patch.object(provider, "_request", mock_request),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", cpus=2, use_spot=True))
        body = mock_request.call_args.kwargs["json"]
        assert body["scheduling"]["provisioningModel"] == "SPOT"
        assert body["scheduling"]["automaticRestart"] is False

    def test_no_spot_scheduling_for_cpu_on_demand(self, provider):
        mock_request = MagicMock(return_value={"name": "op-1"})
        with (
            patch("transformerlab.compute_providers.gcp.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(provider, "_build_startup_script", return_value="#!/bin/bash"),
            patch.object(provider, "_ensure_ssh_firewall_rule"),
            patch.object(provider, "_request", mock_request),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", cpus=2))
        body = mock_request.call_args.kwargs["json"]
        assert "provisioningModel" not in body.get("scheduling", {})
