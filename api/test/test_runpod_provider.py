"""Tests for the RunPod provider against REST v2."""

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
    def test_use_spot_is_rejected(self, provider):
        # REST v2 has no interruptible pods; never fall back to on-demand silently.
        with patch.object(provider, "_make_request") as mock_req:
            with pytest.raises(ValueError, match="spot"):
                provider.launch_cluster(
                    "my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1", use_spot=True)
                )
        mock_req.assert_not_called()

    def test_interruptible_never_sent(self, provider):
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1"))
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert "interruptible" not in pod_data


class TestCloudType:
    def test_defaults_to_secure(self, provider):
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="H100:8"))
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert pod_data["cloud"] == "SECURE"

    def test_honors_extra_config_override(self):
        provider = RunpodProvider(api_key="test-key", extra_config={"cloud_type": "community"})
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1"))
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert pod_data["cloud"] == "COMMUNITY"

    def test_falls_back_to_secure_on_invalid_value(self, caplog):
        provider = RunpodProvider(api_key="test-key", extra_config={"cloud_type": "bogus"})
        with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
            with caplog.at_level("WARNING", logger="transformerlab.compute_providers.runpod"):
                provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="RTX3090:1"))
        pod_data = mock_req.call_args.kwargs["json_data"]
        assert pod_data["cloud"] == "SECURE"
        assert any("bogus" in r.getMessage() and "SECURE" in r.getMessage() for r in caplog.records)


def _launch_body(provider, config):
    """Launch with GPU-type resolution stubbed and return the POST /pods body."""
    provider._map_gpu_type_to_runpod = lambda _accel: "NVIDIA GeForce RTX 4090"
    with patch.object(provider, "_make_request", return_value=_mock_response({"id": "pod-1"})) as mock_req:
        provider.launch_cluster("my-cluster", config)
    assert mock_req.call_args.args == ("POST", "/pods")
    return mock_req.call_args.kwargs["json_data"]


class TestV2CreateBody:
    def test_gpu_pod_shape(self, provider):
        body = _launch_body(
            provider,
            ClusterConfig(
                setup="pip install x",
                run="python train.py",
                accelerators="RTX4090:2",
                disk_size=100,
                env_vars={"A": "1"},
            ),
        )
        assert body["gpu"] == {"id": "NVIDIA GeForce RTX 4090", "count": 2}
        assert "cpu" not in body
        assert body["image"] == "runpod/pytorch:1.0.3-cu1281-torch290-ubuntu2204"
        assert body["disk"] == 100
        assert body["mounts"] == {"persistent": {"size": 100, "path": "/workspace"}}
        assert body["env"] == {"A": "1"}
        assert body["ports"] == ["22/tcp"]
        assert body["cmd"][:2] == ["sh", "-c"]
        assert "pip install x && python train.py" in body["cmd"][2]
        for v1_field in (
            "imageName",
            "gpuTypeIds",
            "gpuCount",
            "computeType",
            "cloudType",
            "containerDiskInGb",
            "volumeInGb",
            "dockerStartCmd",
            "networkVolumeId",
            "vcpuCount",
            "region",
        ):
            assert v1_field not in body

    def test_gpu_count_defaults_to_one(self, provider):
        body = _launch_body(provider, ClusterConfig(run="x", accelerators="RTX4090"))
        assert body["gpu"]["count"] == 1

    def test_cpu_pod_uses_flavor_and_power_of_two_vcpus(self, provider):
        body = _launch_body(provider, ClusterConfig(run="x", cpus=3, disk_size=20))
        assert body["cpu"] == {"id": "cpu3c", "vcpuCount": 4}
        assert "gpu" not in body
        assert body["image"] == "runpod/base:1.0.2-ubuntu2204"
        assert body["disk"] == 20
        # CPU pods reject a persistent pod volume.
        assert "mounts" not in body

    def test_cpu_flavor_override(self):
        provider = RunpodProvider(api_key="k", extra_config={"cpu_flavor": "cpu5g"})
        body = _launch_body(provider, ClusterConfig(run="x"))
        assert body["cpu"] == {"id": "cpu5g", "vcpuCount": 2}

    def test_network_volume_replaces_pod_volume(self):
        provider = RunpodProvider(api_key="k", default_network_volume_id="nv-default")
        body = _launch_body(provider, ClusterConfig(run="x", accelerators="RTX4090:1", disk_size=50))
        assert body["mounts"] == {"network": [{"volumeId": "nv-default", "path": "/workspace"}]}
        assert body["disk"] == 50

    def test_network_volume_per_launch_override(self, provider):
        body = _launch_body(
            provider,
            ClusterConfig(run="x", accelerators="RTX4090:1", provider_config={"network_volume_id": "nv-job"}),
        )
        assert body["mounts"]["network"][0]["volumeId"] == "nv-job"

    def test_region_maps_to_data_center(self, provider):
        provider._data_center_ids = lambda: frozenset({"US-NC-1"})
        body = _launch_body(provider, ClusterConfig(run="x", accelerators="RTX4090:1", region="US-NC-1"))
        assert body["dataCenterIds"] == ["US-NC-1"]

    def test_non_runpod_region_is_ignored(self, provider):
        provider._data_center_ids = lambda: frozenset({"US-NC-1"})
        body = _launch_body(provider, ClusterConfig(run="x", accelerators="RTX4090:1", region="us-east-1"))
        assert "dataCenterIds" not in body


class TestV2BaseUrl:
    def test_defaults_to_v2(self):
        assert RunpodProvider(api_key="k").api_base_url == "https://api.runpod.io/v2"

    def test_upgrades_saved_v1_default(self):
        assert RunpodProvider(api_key="k", api_base_url="https://rest.runpod.io/v1/").api_base_url == (
            "https://api.runpod.io/v2"
        )

    def test_keeps_custom_url(self):
        assert RunpodProvider(api_key="k", api_base_url="https://proxy.example/v2/").api_base_url == (
            "https://proxy.example/v2"
        )


class TestV2Reads:
    def test_list_pods_follows_cursor(self, provider):
        pages = [
            _mock_response({"pods": [{"id": "a", "name": "one"}], "pagination": {"nextCursor": "c1"}}),
            _mock_response({"pods": [{"id": "b", "name": "two"}], "pagination": {"nextCursor": None}}),
        ]
        with patch.object(provider, "_make_request", side_effect=pages) as mock_req:
            pod = provider._find_pod_by_name("two")
        assert pod["id"] == "b"
        assert mock_req.call_args_list[1].kwargs["params"] == {"cursor": "c1"}

    @pytest.mark.parametrize(
        "status,state",
        [
            ("PROVISIONING", "INIT"),
            ("STARTING", "INIT"),
            ("RUNNING", "UP"),
            ("EXITED", "STOPPED"),
            ("ERROR", "FAILED"),
            ("TERMINATED", "DOWN"),
        ],
    )
    def test_status_mapping(self, provider, status, state):
        assert provider._map_runpod_status_to_cluster_state(status).name == state

    def test_cluster_status_and_resources_from_v2_pod(self, provider):
        pod = {
            "id": "p1",
            "name": "my-cluster",
            "status": "RUNNING",
            "gpu": {"id": "NVIDIA GeForce RTX 4090", "count": 2, "vcpuCount": 12, "memory": 62},
            "disk": 100,
            "createdAt": "2026-10-14T00:00:00Z",
            "startedAt": "2026-10-14T00:01:00Z",
            "ssh": {"direct": {"host": "1.2.3.4", "port": 40022}},
        }
        with patch.object(provider, "_find_pod_by_name", return_value=pod):
            status = provider.get_cluster_status("my-cluster")
            resources = provider.get_cluster_resources("my-cluster")
        assert status.state.name == "UP"
        assert status.resources_str == "NVIDIA GeForce RTX 4090"
        assert status.launched_at == "2026-10-14T00:00:00Z"
        assert resources.gpus == [{"gpu": "NVIDIA GeForce RTX 4090", "count": 2}]
        assert (resources.cpus, resources.memory_gb, resources.disk_gb) == (12, 62, 100)

    def test_gpu_resolution_uses_catalog(self, provider):
        catalog = _mock_response({"gpus": [{"id": "AMD Instinct MI300X OAM", "name": "MI300X"}]})
        with patch.object(provider, "_make_request", return_value=catalog) as mock_req:
            assert provider._map_gpu_type_to_runpod("MI300X:1") == "AMD Instinct MI300X OAM"
        mock_req.assert_called_once_with("GET", "/catalog/gpus")


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
