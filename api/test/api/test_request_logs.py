"""Tests for the request_logs endpoint and provider get_request_logs implementations.

Tests cover:
- API endpoint: missing job, missing provider metadata, missing request ID
- API endpoint: provider that doesn't support request logs (NotImplementedError)
- API endpoint: successful request logs retrieval
- Base class: default raises NotImplementedError
- SkyPilot provider: get_request_logs constructs correct URL and returns text
- SkyPilot provider: handles connection errors gracefully
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.compute_providers.base import ComputeProvider, format_status_snapshot
from transformerlab.compute_providers.models import ClusterStatus, ResourceInfo

try:
    from transformerlab.compute_providers import skypilot as _skypilot_mod  # noqa: F401

    _skypilot_importable = True
except (ImportError, AttributeError):
    _skypilot_importable = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


class MinimalProvider(ComputeProvider):
    """Concrete provider that only implements abstract methods (not get_request_logs)."""

    def launch_cluster(self, cluster_name, config):
        return {}

    def stop_cluster(self, cluster_name):
        return {}

    def get_cluster_status(self, cluster_name):
        return ClusterStatus(name=cluster_name, status="UP")

    def get_clusters_detailed(self):
        return []

    def get_cluster_resources(self, cluster_name):
        return ResourceInfo(gpus=[], cpus=0, memory_gb=0)

    def submit_job(self, cluster_name, job_config):
        return {}

    def get_job_logs(self, cluster_name, job_id, tail_lines=None, follow=False):
        return ""

    def cancel_job(self, cluster_name, job_id):
        return {}

    def list_jobs(self, cluster_name):
        return []

    def check(self):
        return True


def _make_job_dict(
    job_id: str = "test-1",
    experiment_id: str = "exp-1",
    provider_id: str = "prov-1",
    provider_type: str = "skypilot",
    request_id: str = "req-abc-123",
) -> dict:
    job_data = {
        "provider_id": provider_id,
        "provider_type": provider_type,
        "cluster_name": "test-cluster",
    }
    if request_id:
        job_data["provider_launch_result"] = {"request_id": request_id}
    return {
        "id": job_id,
        "type": "REMOTE",
        "status": "COMPLETE",
        "experiment_id": experiment_id,
        "job_data": job_data,
    }


def _make_provider_record(provider_type: str = "skypilot", provider_id: str = "prov-1") -> MagicMock:
    record = MagicMock()
    record.id = provider_id
    record.type = provider_type
    return record


# ---------------------------------------------------------------------------
# Base class tests
# ---------------------------------------------------------------------------


class TestBaseProviderGetRequestLogs:
    def test_default_raises_not_implemented(self):
        """Base class get_request_logs should raise NotImplementedError."""
        provider = MinimalProvider()
        with pytest.raises(NotImplementedError, match="MinimalProvider does not support request logs"):
            provider.get_request_logs("some-request-id")

    def test_default_accepts_tail_lines(self):
        """Verify the signature accepts tail_lines without error before raising."""
        provider = MinimalProvider()
        with pytest.raises(NotImplementedError):
            provider.get_request_logs("some-request-id", tail_lines=100)


# ---------------------------------------------------------------------------
# format_status_snapshot helper tests
# ---------------------------------------------------------------------------


class TestFormatStatusSnapshot:
    def test_renders_title_and_fields(self):
        out = format_status_snapshot("EC2 instance i-123", {"State": "running", "Public IP": "1.2.3.4"})
        assert out.splitlines()[0] == "=== EC2 instance i-123 ==="
        assert "State: running" in out
        assert "Public IP: 1.2.3.4" in out

    def test_skips_empty_values(self):
        out = format_status_snapshot("T", {"A": "x", "B": None, "C": "", "D": 0})
        assert "A: x" in out
        assert "B:" not in out
        assert "C:" not in out
        # 0 is a meaningful value and should be kept
        assert "D: 0" in out

    def test_appends_footer(self):
        out = format_status_snapshot("T", {"A": "x"}, footer="--- Console ---\nboot line")
        assert out.endswith("--- Console ---\nboot line")
        assert "A: x" in out


# ---------------------------------------------------------------------------
# SkyPilot provider tests
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _skypilot_importable, reason="skypilot module not importable in this environment")
class TestSkyPilotGetRequestLogs:
    @patch("transformerlab.compute_providers.skypilot.SKYPILOT_AVAILABLE", True)
    def test_returns_response_text(self):
        """get_request_logs should return response.text on success."""
        from transformerlab.compute_providers.skypilot import SkyPilotProvider

        provider = SkyPilotProvider.__new__(SkyPilotProvider)
        provider.server_url = "http://fake-server:8000"
        provider.api_token = None
        provider.default_env_vars = {}
        provider.default_entrypoint_run = None
        provider.extra_config = {}
        provider._server_common = None

        mock_response = MagicMock()
        mock_response.text = "Launch started\nProvisioning cluster...\nDone."

        with patch.object(provider, "_make_authenticated_request", return_value=mock_response) as mock_req:
            result = provider.get_request_logs("req-abc-123", tail_lines=200)

        assert result == "Launch started\nProvisioning cluster...\nDone."
        mock_req.assert_called_once()
        call_args = mock_req.call_args
        assert call_args[0][0] == "GET"
        assert "request_id=req-abc-123" in call_args[0][1]
        assert "format=plain" in call_args[0][1]
        assert "tail=200" in call_args[0][1]

    @patch("transformerlab.compute_providers.skypilot.SKYPILOT_AVAILABLE", True)
    def test_no_tail_lines_omits_param(self):
        """When tail_lines is None, the tail param should not be in the URL."""
        from transformerlab.compute_providers.skypilot import SkyPilotProvider

        provider = SkyPilotProvider.__new__(SkyPilotProvider)
        provider.server_url = "http://fake-server:8000"
        provider.api_token = None
        provider.default_env_vars = {}
        provider.default_entrypoint_run = None
        provider.extra_config = {}
        provider._server_common = None

        mock_response = MagicMock()
        mock_response.text = "logs"

        with patch.object(provider, "_make_authenticated_request", return_value=mock_response) as mock_req:
            provider.get_request_logs("req-xyz")

        url = mock_req.call_args[0][1]
        assert "tail=" not in url
        assert "request_id=req-xyz" in url

    @patch("transformerlab.compute_providers.skypilot.SKYPILOT_AVAILABLE", True)
    def test_connection_error_returns_message(self):
        """Connection errors should return a user-friendly string, not raise."""
        from transformerlab.compute_providers.skypilot import SkyPilotProvider

        provider = SkyPilotProvider.__new__(SkyPilotProvider)
        provider.server_url = "http://fake-server:8000"
        provider.api_token = None
        provider.default_env_vars = {}
        provider.default_entrypoint_run = None
        provider.extra_config = {}
        provider._server_common = None

        with patch.object(provider, "_make_authenticated_request", side_effect=ConnectionError("refused")):
            result = provider.get_request_logs("req-fail")

        assert "Failed to fetch request logs" in result
        assert "refused" in result

    @patch("transformerlab.compute_providers.skypilot.SKYPILOT_AVAILABLE", True)
    def test_response_with_content_bytes(self):
        """Falls back to response.content when .text is missing."""
        from transformerlab.compute_providers.skypilot import SkyPilotProvider

        provider = SkyPilotProvider.__new__(SkyPilotProvider)
        provider.server_url = "http://fake-server:8000"
        provider.api_token = None
        provider.default_env_vars = {}
        provider.default_entrypoint_run = None
        provider.extra_config = {}
        provider._server_common = None

        mock_response = MagicMock(spec=[])  # empty spec so hasattr(text) is False
        mock_response.content = b"binary log content"

        # Need to make hasattr work correctly
        class FakeResponse:
            content = b"binary log content"

        with patch.object(provider, "_make_authenticated_request", return_value=FakeResponse()):
            result = provider.get_request_logs("req-bytes")

        assert result == "binary log content"


# ---------------------------------------------------------------------------
# API endpoint tests (using the test client)
# ---------------------------------------------------------------------------


class TestRequestLogsEndpoint:
    def test_nonexistent_job_returns_404(self, client):
        """Request logs for a non-existent job should return 404."""
        resp = client.get("/experiment/alpha/jobs/nonexistent-id/request_logs")
        assert resp.status_code == 404

    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_missing_provider_id_returns_400(self, mock_get, client):
        """Job without provider_id in job_data should return 400."""
        mock_get.return_value = {
            "id": "job-1",
            "experiment_id": "alpha",
            "job_data": {},  # no provider_id
        }
        resp = client.get("/experiment/alpha/jobs/job-1/request_logs")
        assert resp.status_code == 400
        assert "provider_id" in resp.json()["detail"].lower()

    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_missing_request_id_returns_400(self, mock_get, client):
        """Job without a request ID should return 400."""
        mock_get.return_value = {
            "id": "job-1",
            "experiment_id": "alpha",
            "job_data": {"provider_id": "prov-1"},  # no provider_launch_result
        }
        resp = client.get("/experiment/alpha/jobs/job-1/request_logs")
        assert resp.status_code == 400
        assert "request id" in resp.json()["detail"].lower()

    @patch("transformerlab.routers.experiment.jobs.get_provider_instance", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.get_team_provider", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_provider_not_supporting_request_logs_returns_400(
        self, mock_get, mock_team_provider, mock_instance, client
    ):
        """Provider that raises NotImplementedError should yield 400."""
        mock_get.return_value = _make_job_dict()
        mock_team_provider.return_value = _make_provider_record()
        mock_provider = MagicMock()
        mock_provider.get_request_logs.side_effect = NotImplementedError("not supported")
        mock_instance.return_value = mock_provider

        resp = client.get("/experiment/exp-1/jobs/test-1/request_logs")
        assert resp.status_code == 400
        assert "does not support request logs" in resp.json()["detail"]

    @patch("transformerlab.routers.experiment.jobs.get_provider_instance", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.get_team_provider", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_successful_request_logs(self, mock_get, mock_team_provider, mock_instance, client):
        """Successful fetch should return 200 with logs and request_id."""
        mock_get.return_value = _make_job_dict()
        mock_team_provider.return_value = _make_provider_record()
        mock_provider = MagicMock()
        mock_provider.get_request_logs.return_value = "Provisioning cluster...\nCluster ready."
        mock_instance.return_value = mock_provider

        resp = client.get("/experiment/exp-1/jobs/test-1/request_logs")
        assert resp.status_code == 200
        data = resp.json()
        assert data["request_id"] == "req-abc-123"
        assert data["logs"] == "Provisioning cluster...\nCluster ready."

    @patch("transformerlab.routers.experiment.jobs.get_provider_instance", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.get_team_provider", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_provider_error_returns_502(self, mock_get, mock_team_provider, mock_instance, client):
        """Provider exception (not NotImplementedError) should return 502."""
        mock_get.return_value = _make_job_dict()
        mock_team_provider.return_value = _make_provider_record()
        mock_provider = MagicMock()
        mock_provider.get_request_logs.side_effect = RuntimeError("connection timed out")
        mock_instance.return_value = mock_provider

        resp = client.get("/experiment/exp-1/jobs/test-1/request_logs")
        assert resp.status_code == 502
        assert "connection timed out" in resp.json()["detail"]

    @patch("transformerlab.routers.experiment.jobs.get_provider_instance", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.get_team_provider", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_falls_back_to_orchestrator_request_id(self, mock_get, mock_team_provider, mock_instance, client):
        """Should use orchestrator_request_id when provider_launch_result has no request_id."""
        job = _make_job_dict(request_id="")  # empty request_id in launch result
        job["job_data"]["provider_launch_result"] = {}  # no request_id key
        job["job_data"]["orchestrator_request_id"] = "orch-fallback-id"
        mock_get.return_value = job
        mock_team_provider.return_value = _make_provider_record()
        mock_provider = MagicMock()
        mock_provider.get_request_logs.return_value = "fallback logs"
        mock_instance.return_value = mock_provider

        resp = client.get("/experiment/exp-1/jobs/test-1/request_logs")
        assert resp.status_code == 200
        assert resp.json()["request_id"] == "orch-fallback-id"
        mock_provider.get_request_logs.assert_called_once_with("orch-fallback-id", tail_lines=400)

    @patch("transformerlab.routers.experiment.jobs.get_provider_instance", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.get_team_provider", new_callable=AsyncMock)
    @patch("transformerlab.routers.experiment.jobs.job_service.job_get_cached", new_callable=AsyncMock)
    def test_tail_lines_query_param(self, mock_get, mock_team_provider, mock_instance, client):
        """tail_lines query param should be forwarded to the provider."""
        mock_get.return_value = _make_job_dict()
        mock_team_provider.return_value = _make_provider_record()
        mock_provider = MagicMock()
        mock_provider.get_request_logs.return_value = "logs"
        mock_instance.return_value = mock_provider

        resp = client.get("/experiment/exp-1/jobs/test-1/request_logs?tail_lines=1000")
        assert resp.status_code == 200
        mock_provider.get_request_logs.assert_called_once_with("req-abc-123", tail_lines=1000)


# ---------------------------------------------------------------------------
# RunPod provider tests
# ---------------------------------------------------------------------------


class TestRunPodGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.runpod import RunpodProvider

        p = RunpodProvider.__new__(RunpodProvider)
        p.api_key = "k"
        p.api_base_url = "https://rest.runpod.io/v1"
        return p

    def test_returns_snapshot(self):
        p = self._provider()
        resp = MagicMock()
        resp.json.return_value = {
            "id": "pod-1",
            "name": "tfl",
            "desiredStatus": "RUNNING",
            "gpuTypeId": "NVIDIA A100",
            "runtime": {"publicIp": "9.9.9.9"},
        }
        with patch.object(p, "_make_request", return_value=resp) as mock_req:
            out = p.get_request_logs("pod-1")
        mock_req.assert_called_once_with("GET", "/pods/pod-1")
        assert "RunPod pod pod-1" in out
        assert "Status: RUNNING" in out
        assert "Public IP: 9.9.9.9" in out

    def test_error_returns_message(self):
        p = self._provider()
        with patch.object(p, "_make_request", side_effect=RuntimeError("boom")):
            out = p.get_request_logs("pod-x")
        assert "Failed to fetch RunPod pod status" in out
        assert "boom" in out


# ---------------------------------------------------------------------------
# VastAI provider tests
# ---------------------------------------------------------------------------


class TestVastAIGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.vastai import VastAIProvider

        p = VastAIProvider.__new__(VastAIProvider)
        p.api_key = "k"
        return p

    def test_returns_snapshot_dict_instance(self):
        p = self._provider()
        resp = MagicMock()
        resp.json.return_value = {
            "instances": {
                "id": 42,
                "label": "tfl",
                "actual_status": "running",
                "status_msg": "ready",
                "gpu_name": "RTX 4090",
                "public_ipaddr": "8.8.8.8",
            }
        }
        with patch.object(p, "_make_request", return_value=resp) as mock_req:
            out = p.get_request_logs("42")
        mock_req.assert_called_once_with("GET", "/instances/42/")
        assert "Vast.ai instance 42" in out
        assert "Status: running" in out
        assert "Public IP: 8.8.8.8" in out

    def test_error_returns_message(self):
        p = self._provider()
        with patch.object(p, "_make_request", side_effect=RuntimeError("nope")):
            out = p.get_request_logs("42")
        assert "Failed to fetch Vast.ai instance status" in out
        assert "nope" in out


# ---------------------------------------------------------------------------
# AWS provider tests
# ---------------------------------------------------------------------------


class TestAWSGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.aws import AWSProvider

        p = AWSProvider.__new__(AWSProvider)
        p.aws_profile = "default"
        p.region = "us-east-1"
        p.team_id = "team-1"
        p.extra_config = {}
        return p

    def test_returns_snapshot_with_console(self):
        p = self._provider()
        ec2 = MagicMock()
        ec2.describe_instances.return_value = {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": "i-123",
                            "State": {"Name": "running"},
                            "StateTransitionReason": "",
                            "InstanceType": "g5.xlarge",
                            "PublicIpAddress": "1.2.3.4",
                        }
                    ]
                }
            ]
        }
        ec2.describe_instance_status.return_value = {
            "InstanceStatuses": [{"SystemStatus": {"Status": "ok"}, "InstanceStatus": {"Status": "ok"}}]
        }
        ec2.get_console_output.return_value = {"Output": "boot line 1\nboot line 2"}
        with patch.object(p, "_get_ec2_client", return_value=ec2):
            out = p.get_request_logs("i-123", tail_lines=1)
        assert "EC2 instance i-123" in out
        assert "State: running" in out
        assert "System status: ok" in out
        # tail_lines=1 keeps only the last console line
        assert "boot line 2" in out
        assert "boot line 1" not in out

    def test_instance_not_found(self):
        p = self._provider()
        ec2 = MagicMock()
        ec2.describe_instances.return_value = {"Reservations": []}
        with patch.object(p, "_get_ec2_client", return_value=ec2):
            out = p.get_request_logs("i-missing")
        assert "not found" in out


# ---------------------------------------------------------------------------
# GCP provider tests
# ---------------------------------------------------------------------------


class TestGCPGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.gcp import GCPProvider

        p = GCPProvider.__new__(GCPProvider)
        p.project_id = "proj"
        p.zone = "us-central1-a"
        p.team_id = "team-1"
        return p

    def test_operation_then_instance_then_serial(self):
        p = self._provider()
        base = "https://compute.googleapis.com/compute/v1/projects/proj/zones/us-central1-a"

        def fake_request(method, url, **kwargs):
            if url.endswith("/operations/op-1"):
                return {
                    "name": "op-1",
                    "status": "DONE",
                    "operationType": "insert",
                    "targetLink": f"{base}/instances/tfl-vm",
                }
            if url.endswith("/instances/tfl-vm"):
                return {"name": "tfl-vm", "status": "RUNNING", "machineType": f"{base}/machineTypes/a2"}
            if url.endswith("/instances/tfl-vm/serialPort"):
                return {"contents": "line1\nline2\nline3"}
            raise AssertionError(f"unexpected url {url}")

        with patch.object(p, "_request", side_effect=fake_request):
            out = p.get_request_logs("op-1", tail_lines=2)
        assert "GCP launch op-1" in out
        assert "Operation status: DONE" in out
        assert "Instance status: RUNNING" in out
        assert "line3" in out
        assert "line1" not in out  # tail_lines=2

    def test_request_id_is_instance_name_when_no_operation(self):
        p = self._provider()

        def fake_request(method, url, **kwargs):
            if "/operations/" in url:
                raise FileNotFoundError("no such operation")
            if url.endswith("/instances/tfl-vm"):
                return {"name": "tfl-vm", "status": "PROVISIONING"}
            if url.endswith("/serialPort"):
                return {"contents": ""}
            raise AssertionError(f"unexpected url {url}")

        with patch.object(p, "_request", side_effect=fake_request):
            out = p.get_request_logs("tfl-vm")
        assert "Instance status: PROVISIONING" in out


# ---------------------------------------------------------------------------
# Azure provider tests
# ---------------------------------------------------------------------------


class TestAzureGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.azure import AzureProvider

        p = AzureProvider.__new__(AzureProvider)
        p.resource_group = "rg"
        p.subscription_id = "sub"
        p.team_id = "team-1"
        return p

    def test_returns_snapshot_with_statuses(self):
        p = self._provider()

        status1 = MagicMock(code="ProvisioningState/succeeded", display_status="Provisioning succeeded", message=None)
        status1.time = "2026-05-27T00:00:00Z"
        status2 = MagicMock(code="PowerState/running", display_status="VM running", message=None)
        status2.time = None
        vm = MagicMock()
        vm.name = "tfl-vm"
        vm.id = "/subscriptions/sub/.../tfl-vm"
        vm.provisioning_state = "Succeeded"
        vm.location = "eastus"
        vm.hardware_profile.vm_size = "Standard_NC24"
        vm.instance_view.statuses = [status1, status2]

        compute = MagicMock()
        compute.virtual_machines.get.return_value = vm
        with (
            patch.object(p, "_get_compute_client", return_value=compute),
            patch.object(p, "_get_vm_power_state", return_value="PowerState/running"),
        ):
            out = p.get_request_logs("tfl-vm")
        compute.virtual_machines.get.assert_called_once_with("rg", "tfl-vm", expand="instanceView")
        assert "Azure VM tfl-vm" in out
        assert "Provisioning state: Succeeded" in out
        assert "PowerState/running | VM running" in out

    def test_error_returns_message(self):
        p = self._provider()
        compute = MagicMock()
        compute.virtual_machines.get.side_effect = RuntimeError("auth failed")
        with patch.object(p, "_get_compute_client", return_value=compute):
            out = p.get_request_logs("tfl-vm")
        assert "Failed to fetch Azure VM" in out
        assert "auth failed" in out


# ---------------------------------------------------------------------------
# Nebius provider tests
# ---------------------------------------------------------------------------


class TestNebiusGetRequestLogs:
    def _provider(self):
        from transformerlab.compute_providers.nebius import NebiusProvider

        p = NebiusProvider.__new__(NebiusProvider)
        p.parent_id = "project-1"
        p.team_id = "team-1"
        return p

    def test_returns_snapshot(self):
        p = self._provider()
        instance = {
            "metadata": {"id": "inst-1", "name": "tfl", "created_at": "2026-05-27T00:00:00Z"},
            "status": {"state": "RUNNING"},
            "spec": {"resources": {"platform": "gpu-h100-sxm", "preset": "1gpu-16vcpu-200gb"}},
        }
        with patch.object(p, "_get_instance", return_value=instance) as mock_get:
            out = p.get_request_logs("inst-1")
        mock_get.assert_called_once_with("inst-1")
        assert "Nebius instance inst-1" in out
        assert "State: RUNNING" in out
        assert "Platform: gpu-h100-sxm" in out

    def test_error_returns_message(self):
        p = self._provider()
        with patch.object(p, "_get_instance", side_effect=RuntimeError("cli down")):
            out = p.get_request_logs("inst-1")
        assert "Failed to fetch Nebius instance" in out
        assert "cli down" in out
