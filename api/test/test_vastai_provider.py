import pytest
from unittest.mock import MagicMock, patch

import requests

from transformerlab.compute_providers.vastai import VastAIProvider
from transformerlab.compute_providers.models import ClusterConfig, ClusterState


@pytest.fixture
def provider():
    return VastAIProvider(api_key="test-api-key")


class TestCheck:
    def test_returns_true_on_success(self, provider):
        with patch.object(provider, "_make_request") as mock_req:
            mock_req.return_value = MagicMock()
            result, reason = provider.check()
        assert result is True
        assert reason is None

    def test_returns_false_on_exception(self, provider):
        with patch.object(provider, "_make_request") as mock_req:
            mock_req.side_effect = Exception("connection refused")
            result, reason = provider.check()
        assert result is False
        assert "connection refused" in reason


class TestFindBestOffer:
    def test_normalizes_compact_gpu_name_variants(self, provider):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"offers": [{"id": 77, "dph_total": 0.8}]}
        with patch.object(provider, "_make_request", return_value=mock_resp) as mock_make_request:
            provider._find_best_offer("RTX5090", 1)

        _, kwargs = mock_make_request.call_args
        gpu_filter = kwargs["json_data"]["gpu_name"]
        assert gpu_filter == {"in": ["RTX5090", "RTX 5090", "RTX_5090"]}

    def test_sends_documented_bundles_payload_shape(self, provider):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"offers": [{"id": 42, "dph_total": 0.5}]}
        with patch.object(provider, "_make_request", return_value=mock_resp) as mock_make_request:
            provider._find_best_offer("RTX_4090", 1)

        _, kwargs = mock_make_request.call_args
        assert kwargs["json_data"] == {
            "gpu_name": {"in": ["RTX_4090", "RTX 4090"]},
            "num_gpus": {"eq": 1},
            "rentable": {"eq": True},
            "order": [["dph_total", "asc"]],
            "limit": 10,
        }

    def test_returns_first_offer_id(self, provider):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "offers": [
                {"id": 42, "dph_total": 0.5},
                {"id": 99, "dph_total": 1.0},
            ]
        }
        with patch.object(provider, "_make_request", return_value=mock_resp):
            offer_id = provider._find_best_offer("RTX_3090", 1)
        assert offer_id == 42

    def test_raises_when_no_offers(self, provider):
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"offers": []}
        with patch.object(provider, "_make_request", return_value=mock_resp):
            with pytest.raises(RuntimeError, match="No Vast.ai offers found"):
                provider._find_best_offer("RTX_9999", 1)


class TestLaunchCluster:
    def test_raises_without_accelerators(self, provider):
        config = ClusterConfig(run="python train.py")
        with pytest.raises(ValueError, match="accelerators"):
            provider.launch_cluster("my-cluster", config)

    def test_creates_instance_and_caches_id(self, provider):
        config = ClusterConfig(accelerators="RTX_3090:1", run="python train.py")
        mock_create_resp = MagicMock()
        mock_create_resp.json.return_value = {"id": 123}
        with (
            patch.object(provider, "_find_best_offer", return_value=42),
            patch.object(provider, "_make_request", return_value=mock_create_resp),
        ):
            result = provider.launch_cluster("my-cluster", config)
        assert result["instance_id"] == 123
        assert provider._cluster_name_to_instance_id["my-cluster"] == 123

    def test_raises_on_http_error(self, provider):
        config = ClusterConfig(accelerators="RTX_3090:1", run="python train.py")
        http_err = requests.exceptions.HTTPError(response=MagicMock(text="Bad Request"))
        with (
            patch.object(provider, "_find_best_offer", return_value=42),
            patch.object(provider, "_make_request", side_effect=http_err),
        ):
            with pytest.raises(RuntimeError, match="Failed to create Vast.ai instance"):
                provider.launch_cluster("my-cluster", config)

    def test_sends_env_as_json_object_not_docker_string(self, provider):
        config = ClusterConfig(
            accelerators="RTX_3090:1",
            run="python train.py",
            env_vars={"HF_TOKEN": "abc 123", "MODEL_ID": "meta-llama/Llama-3-8B"},
        )
        mock_create_resp = MagicMock()
        mock_create_resp.json.return_value = {"id": 123}
        with (
            patch.object(provider, "_find_best_offer", return_value=42),
            patch.object(provider, "_make_request", return_value=mock_create_resp) as mock_make_request,
        ):
            provider.launch_cluster("my-cluster", config)

        _, kwargs = mock_make_request.call_args
        payload = kwargs["json_data"]
        assert payload["env"] == {"HF_TOKEN": "abc 123", "MODEL_ID": "meta-llama/Llama-3-8B"}

    def test_onstart_contains_exit_trap_for_self_termination(self, provider):
        config = ClusterConfig(accelerators="RTX_3090:1", run="python train.py")
        mock_create_resp = MagicMock()
        mock_create_resp.json.return_value = {"id": 123}

        with (
            patch.object(provider, "_find_best_offer", return_value=42),
            patch.object(provider, "_make_request", return_value=mock_create_resp) as mock_make_request,
        ):
            provider.launch_cluster("my-cluster", config)

        _, kwargs = mock_make_request.call_args
        payload = kwargs["json_data"]
        onstart = payload["onstart"]
        assert "trap _tfl_self_terminate EXIT" in onstart
        assert 'DELETE "https://console.vast.ai/api/v0/instances/${CONTAINER_ID}/"' in onstart
        assert "Authorization: Bearer ${CONTAINER_API_KEY}" in onstart

    def test_onstart_runs_setup_before_run_and_tees_logs(self, provider):
        config = ClusterConfig(
            accelerators="RTX_3090:1",
            setup="echo setup",
            run="python train.py",
        )
        mock_create_resp = MagicMock()
        mock_create_resp.json.return_value = {"id": 123}

        with (
            patch.object(provider, "_find_best_offer", return_value=42),
            patch.object(provider, "_make_request", return_value=mock_create_resp) as mock_make_request,
        ):
            provider.launch_cluster("my-cluster", config)

        _, kwargs = mock_make_request.call_args
        payload = kwargs["json_data"]
        onstart = payload["onstart"]
        assert "(echo setup && python train.py)" in onstart
        assert "tee /workspace/run_logs.txt" in onstart


class TestStopCluster:
    def test_returns_success_and_clears_cache(self, provider):
        provider._cluster_name_to_instance_id["my-cluster"] = 123
        mock_instance = {"id": 123, "label": "my-cluster"}
        with (
            patch.object(provider, "_find_instance_by_name", return_value=mock_instance),
            patch.object(provider, "_make_request"),
        ):
            result = provider.stop_cluster("my-cluster")
        assert result["status"] == "success"
        assert "my-cluster" not in provider._cluster_name_to_instance_id

    def test_returns_error_when_not_found(self, provider):
        with patch.object(provider, "_find_instance_by_name", return_value=None):
            result = provider.stop_cluster("missing-cluster")
        assert result["status"] == "error"
        assert "not found" in result["message"]


class TestGetClusterStatus:
    def test_maps_running_to_up(self, provider):
        mock_instance = {"id": 123, "actual_status": "running", "gpu_name": "RTX 3090"}
        with patch.object(provider, "_find_instance_by_name", return_value=mock_instance):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.UP
        assert status.cluster_name == "my-cluster"

    def test_maps_loading_to_init(self, provider):
        mock_instance = {"id": 123, "actual_status": "loading", "gpu_name": "RTX 3090"}
        with patch.object(provider, "_find_instance_by_name", return_value=mock_instance):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.INIT

    def test_maps_exited_to_down(self, provider):
        mock_instance = {"id": 123, "actual_status": "exited", "gpu_name": "RTX 3090"}
        with patch.object(provider, "_find_instance_by_name", return_value=mock_instance):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.DOWN

    def test_maps_stopped_to_stopped(self, provider):
        mock_instance = {"id": 123, "actual_status": "stopped", "gpu_name": "RTX 3090"}
        with patch.object(provider, "_find_instance_by_name", return_value=mock_instance):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.STOPPED

    def test_maps_failed_to_failed(self, provider):
        mock_instance = {"id": 123, "actual_status": "failed", "gpu_name": "RTX 3090"}
        with patch.object(provider, "_find_instance_by_name", return_value=mock_instance):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.FAILED

    def test_returns_unknown_when_instance_not_found(self, provider):
        with patch.object(provider, "_find_instance_by_name", return_value=None):
            status = provider.get_cluster_status("missing-cluster")
        assert status.state == ClusterState.UNKNOWN


class TestGetJobLogs:
    def test_returns_log_text_fetched_from_s3(self, provider):
        mock_instance = {"id": 123, "label": "my-cluster"}
        mock_log_trigger_resp = MagicMock()
        mock_log_trigger_resp.json.return_value = {
            "success": True,
            "result_url": "https://s3.example.com/logs.txt",
        }
        mock_s3_resp = MagicMock()
        mock_s3_resp.text = "Epoch 1/10\nEpoch 2/10\n"

        with (
            patch.object(provider, "_find_instance_by_name", return_value=mock_instance),
            patch.object(provider, "_make_request", return_value=mock_log_trigger_resp),
            patch("transformerlab.compute_providers.vastai.requests.get", return_value=mock_s3_resp),
        ):
            logs = provider.get_job_logs("my-cluster", "0", tail_lines=200)

        assert "Epoch 1/10" in logs

    def test_returns_message_when_no_result_url(self, provider):
        mock_instance = {"id": 123, "label": "my-cluster"}
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"success": True, "result_url": ""}
        with (
            patch.object(provider, "_find_instance_by_name", return_value=mock_instance),
            patch.object(provider, "_make_request", return_value=mock_resp),
        ):
            logs = provider.get_job_logs("my-cluster", "0")
        assert "not yet available" in logs

    def test_returns_message_when_instance_not_found(self, provider):
        with patch.object(provider, "_find_instance_by_name", return_value=None):
            logs = provider.get_job_logs("missing-cluster", "0")
        assert "not found" in logs

    def test_retries_transient_s3_403_then_returns_logs(self, provider):
        mock_instance = {"id": 123, "label": "my-cluster"}
        mock_log_trigger_resp = MagicMock()
        mock_log_trigger_resp.json.return_value = {
            "success": True,
            "result_url": "https://s3.example.com/logs.txt",
        }

        mock_forbidden_resp = MagicMock()
        mock_forbidden_resp.status_code = 403
        mock_forbidden_resp.raise_for_status.side_effect = requests.exceptions.HTTPError(response=mock_forbidden_resp)

        mock_success_resp = MagicMock()
        mock_success_resp.status_code = 200
        mock_success_resp.text = "Epoch 1/10\nEpoch 2/10\n"
        mock_success_resp.raise_for_status.return_value = None

        with (
            patch.object(provider, "_find_instance_by_name", return_value=mock_instance),
            patch.object(provider, "_make_request", return_value=mock_log_trigger_resp),
            patch(
                "transformerlab.compute_providers.vastai.requests.get",
                side_effect=[mock_forbidden_resp, mock_success_resp],
            ),
            patch("transformerlab.compute_providers.vastai.time.sleep") as _mock_sleep,
        ):
            logs = provider.get_job_logs("my-cluster", "0", tail_lines=200)

        assert "Epoch 1/10" in logs

    def test_request_logs_tail_is_sent_as_string(self, provider):
        mock_instance = {"id": 123, "label": "my-cluster"}
        mock_log_trigger_resp = MagicMock()
        mock_log_trigger_resp.json.return_value = {
            "success": True,
            "result_url": "https://s3.example.com/logs.txt",
        }
        mock_s3_resp = MagicMock()
        mock_s3_resp.text = "ok"

        with (
            patch.object(provider, "_find_instance_by_name", return_value=mock_instance),
            patch.object(provider, "_make_request", return_value=mock_log_trigger_resp) as mock_make_request,
            patch("transformerlab.compute_providers.vastai.requests.get", return_value=mock_s3_resp),
        ):
            provider.get_job_logs("my-cluster", "0", tail_lines=200)

        _, kwargs = mock_make_request.call_args
        assert kwargs["json_data"] == {"tail": "200"}


class TestFindInstanceByName:
    def test_handles_single_instance_object_from_instance_detail_endpoint(self, provider):
        provider._cluster_name_to_instance_id["my-cluster"] = 123
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"instances": {"id": 123, "label": "my-cluster", "actual_status": "running"}}

        with patch.object(provider, "_make_request", return_value=mock_resp):
            instance = provider._find_instance_by_name("my-cluster")

        assert instance is not None
        assert instance["id"] == 123
        assert instance["label"] == "my-cluster"
