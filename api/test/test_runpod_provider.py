"""Tests for RunPod provider spot (interruptible) support."""

from unittest.mock import MagicMock, patch

import pytest
import requests

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


def _http_error(status_code):
    """Build an HTTPError whose response carries the given status code (as raise_for_status does)."""
    response = MagicMock()
    response.status_code = status_code
    response.text = "Internal Server Error"
    return requests.exceptions.HTTPError(f"{status_code} Server Error", response=response)


class TestCreateRecovery:
    """RunPod's create-pod endpoint can return a 5xx even though the pod was created (broken
    server-side read-back). We recover by looking the pod up by name."""

    def test_recovers_pod_on_500(self, provider):
        with (
            patch.object(provider, "_make_request", side_effect=_http_error(500)),
            patch.object(provider, "_find_pod_by_name", return_value={"id": "pod-recovered"}) as mock_find,
        ):
            result = provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="H100:8"))

        assert result["pod_id"] == "pod-recovered"
        assert result["request_id"] == "pod-recovered"
        mock_find.assert_called_with("my-cluster")
        # Recovered pod should be cached for later lookups.
        assert provider._cluster_name_to_pod_id["my-cluster"] == "pod-recovered"

    def test_raises_on_500_when_pod_not_found(self, provider):
        with (
            patch.object(provider, "_make_request", side_effect=_http_error(500)),
            patch.object(provider, "_find_pod_by_name", return_value=None),
            patch("transformerlab.compute_providers.runpod.time.sleep"),
        ):
            with pytest.raises(RuntimeError, match="Failed to create pod"):
                provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="H100:8"))

    def test_does_not_attempt_recovery_on_4xx(self, provider):
        with (
            patch.object(provider, "_make_request", side_effect=_http_error(400)),
            patch.object(provider, "_find_pod_by_name") as mock_find,
        ):
            with pytest.raises(RuntimeError, match="Failed to create pod"):
                provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="H100:8"))
        mock_find.assert_not_called()
