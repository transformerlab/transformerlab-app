"""Tests for RunPod provider spot (interruptible) support."""

from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.runpod import RunpodProvider
from transformerlab.compute_providers.models import ClusterConfig


@pytest.fixture
def provider():
    return RunpodProvider(api_key="test-key", default_gpu_type="RTX 3090")


def _mock_response(json_data, status_code=200):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    mock.raise_for_status.return_value = None
    return mock


class TestSpot:
    def test_interruptible_set_when_use_spot(self, provider):
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            provider.launch_cluster(
                "my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1", use_spot=True)
            )
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert pod_data["interruptible"] is True

    def test_interruptible_absent_when_on_demand(self, provider):
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1"))
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert "interruptible" not in pod_data
