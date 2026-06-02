"""Tests for RunPod custom image resolution in launch_cluster."""

from unittest.mock import MagicMock

from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.compute_providers.runpod import RunpodProvider


def _provider():
    return RunpodProvider(api_key="test-key")


def _capture_pod_data(provider):
    """Patch _make_request and return the json payload passed to POST /pods."""
    captured = {}

    def fake_make_request(method, endpoint, json_data=None, timeout=30):
        if method == "POST" and endpoint == "/pods":
            captured["pod_data"] = json_data
        resp = MagicMock()
        resp.json.return_value = {"id": "pod-123"}
        resp.status_code = 200
        return resp

    provider._make_request = MagicMock(side_effect=fake_make_request)
    # Avoid live GPU-type lookups; echo the parsed GPU name back.
    provider._map_gpu_type_to_runpod = lambda _accel: "NVIDIA A100-SXM4-80GB"
    return captured


def test_image_name_overrides_default_for_gpu_pod():
    provider = _provider()
    captured = _capture_pod_data(provider)
    config = ClusterConfig(
        accelerators="A100:1",
        provider_config={"image_name": "my-org/custom:latest"},
    )
    provider.launch_cluster("clust-1", config)
    assert captured["pod_data"]["imageName"] == "my-org/custom:latest"


def test_template_id_still_supported_as_fallback():
    provider = _provider()
    captured = _capture_pod_data(provider)
    config = ClusterConfig(
        accelerators="A100:1",
        provider_config={"template_id": "legacy/image:1.0"},
    )
    provider.launch_cluster("clust-1", config)
    assert captured["pod_data"]["imageName"] == "legacy/image:1.0"


def test_default_image_when_no_override():
    provider = _provider()
    captured = _capture_pod_data(provider)
    config = ClusterConfig(accelerators="A100:1")
    provider.launch_cluster("clust-1", config)
    assert captured["pod_data"]["imageName"] == "runpod/pytorch:1.0.3-cu1281-torch290-ubuntu2204"
