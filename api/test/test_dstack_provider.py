"""Tests for the dstack compute provider."""

from unittest.mock import MagicMock, patch
import pytest

from transformerlab.compute_providers.dstack import DstackProvider
from transformerlab.compute_providers.models import (
    ClusterConfig,
    ClusterState,
    JobConfig,
    JobState,
)


@pytest.fixture
def provider():
    return DstackProvider(
        server_url="http://localhost:3000",
        api_token="test-token",
        project_name="test-project",
    )


def _mock_response(json_data, status_code=200):
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data
    mock.raise_for_status.return_value = None
    return mock


# --- check() ---


class TestCheck:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_true_on_success(self, mock_request, provider):
        mock_request.return_value = _mock_response([])
        status, reason = provider.check()
        assert status is True
        assert reason is None
        call_kwargs = mock_request.call_args
        assert call_kwargs[1]["url"] == "http://localhost:3000/api/runs/list"
        assert call_kwargs[1]["json"] == {"project_name": "test-project", "only_active": False, "limit": 1}

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_false_on_connection_error(self, mock_request, provider):
        import requests as req_lib

        mock_request.side_effect = req_lib.exceptions.ConnectionError("unreachable")
        status, reason = provider.check()
        assert status is False
        assert "Unable to list dstack runs" in reason


# --- _parse_accelerators() ---


class TestParseAccelerators:
    def test_name_and_count(self, provider):
        result = provider._parse_accelerators("A100:2")
        assert result == {"name": ["A100"], "count": {"min": 2, "max": 2}}

    def test_name_only_defaults_to_count_1(self, provider):
        result = provider._parse_accelerators("H100")
        assert result == {"name": ["H100"], "count": {"min": 1, "max": 1}}

    def test_none_returns_none(self, provider):
        assert provider._parse_accelerators(None) is None

    def test_empty_string_returns_none(self, provider):
        assert provider._parse_accelerators("") is None


# --- _build_run_spec() ---


class TestBuildRunSpec:
    def test_task_type_default(self, provider):
        config = ClusterConfig(run="python train.py", env_vars={"LR": "1e-4"})
        spec = provider._build_run_spec("my-run", config)
        assert spec["run_name"] == "my-run"
        assert spec["repo_data"] == {"repo_type": "virtual"}
        cfg = spec["configuration"]
        assert cfg["type"] == "task"
        assert "python train.py" in cfg["commands"][0]
        assert cfg["env"]["LR"] == "1e-4"

    def test_dev_environment_type(self, provider):
        config = ClusterConfig(
            run="python server.py",
            provider_config={"run_type": "dev-environment", "ide": "vscode"},
        )
        spec = provider._build_run_spec("my-ide", config)
        cfg = spec["configuration"]
        assert cfg["type"] == "dev-environment"
        assert cfg["ide"] == "vscode"
        assert "python server.py" in cfg["init"][0]

    def test_resource_requirements_path(self, provider):
        config = ClusterConfig(run="train.py", accelerators="A100:1", memory="32GB", disk_size=200)
        spec = provider._build_run_spec("gpu-run", config)
        res = spec["configuration"]["resources"]
        assert res["gpu"] == {"name": ["A100"], "count": {"min": 1, "max": 1}}
        assert res["memory"] == "32GB"
        assert res["disk"] == {"size": "200GB"}

    def test_fleet_name_path(self, provider):
        config = ClusterConfig(run="train.py", provider_config={"fleet_name": "my-fleet"})
        spec = provider._build_run_spec("fleet-run", config)
        cfg = spec["configuration"]
        assert cfg.get("fleets") == ["my-fleet"]
        assert "resources" not in cfg

    def test_setup_script_prepended(self, provider):
        config = ClusterConfig(run="python train.py", setup="pip install mylib")
        spec = provider._build_run_spec("setup-run", config)
        commands = spec["configuration"]["commands"]
        assert commands[0] == "pip install mylib"
        assert "python train.py" in commands[1]

    def test_env_vars_merged_with_provider_defaults(self):
        p = DstackProvider(
            server_url="http://localhost:3000",
            api_token="tok",
            project_name="proj",
            extra_config={"default_env_vars": {"BASE": "base_val"}},
        )
        config = ClusterConfig(run="train.py", env_vars={"JOB": "1"})
        spec = p._build_run_spec("env-run", config)
        env = spec["configuration"]["env"]
        assert env["BASE"] == "base_val"
        assert env["JOB"] == "1"

    def test_job_env_overrides_provider_default(self):
        p = DstackProvider(
            server_url="http://localhost:3000",
            api_token="tok",
            project_name="proj",
            extra_config={"default_env_vars": {"KEY": "old"}},
        )
        config = ClusterConfig(run="train.py", env_vars={"KEY": "new"})
        spec = p._build_run_spec("override-run", config)
        assert spec["configuration"]["env"]["KEY"] == "new"


# --- _map_status() ---


class TestMapStatus:
    @pytest.mark.parametrize(
        "dstack_status,expected",
        [
            ("PENDING", ClusterState.INIT),
            ("SUBMITTED", ClusterState.INIT),
            ("PROVISIONING", ClusterState.INIT),
            ("RUNNING", ClusterState.UP),
            ("TERMINATING", ClusterState.STOPPED),
            ("TERMINATED", ClusterState.DOWN),
            ("DONE", ClusterState.DOWN),
            ("FAILED", ClusterState.FAILED),
            ("WEIRD_UNKNOWN", ClusterState.UNKNOWN),
        ],
    )
    def test_status_mapping(self, provider, dstack_status, expected):
        assert provider._map_status(dstack_status) == expected


# --- launch_cluster() ---


class TestLaunchCluster:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_posts_to_apply_endpoint(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_spec": {"run_name": "my-job"}, "status": "SUBMITTED"})
        config = ClusterConfig(run="python train.py")
        result = provider.launch_cluster("my-job", config)
        call_kwargs = mock_request.call_args
        assert call_kwargs[1]["url"] == "http://localhost:3000/api/project/test-project/runs/apply"
        assert call_kwargs[0][0] == "POST"
        assert call_kwargs[1]["json"]["plan"]["run_spec"]["run_name"] == "my-job"
        assert call_kwargs[1]["json"]["force"] is False
        assert result["run_name"] == "my-job"

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_includes_auth_header(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "x", "status": "SUBMITTED"})
        provider.launch_cluster("x", ClusterConfig(run="echo hi"))
        headers = mock_request.call_args[1]["headers"]
        assert headers["Authorization"] == "Bearer test-token"


# --- stop_cluster() ---


class TestStopCluster:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_posts_to_stop_endpoint(self, mock_request, provider):
        mock_request.return_value = _mock_response({})
        provider.stop_cluster("my-job")
        call_kwargs = mock_request.call_args
        assert "/runs/stop" in call_kwargs[1]["url"]
        body = call_kwargs[1]["json"]
        assert body["runs_names"] == ["my-job"]
        assert body["abort"] is False


# --- list_clusters() ---


class TestListClusters:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_posts_to_legacy_list_endpoint(self, mock_request, provider):
        mock_request.return_value = _mock_response([])
        provider.list_clusters()
        call_kwargs = mock_request.call_args
        assert call_kwargs[1]["url"] == "http://localhost:3000/api/runs/list"
        assert call_kwargs[0][0] == "POST"
        assert call_kwargs[1]["json"] == {
            "project_name": "test-project",
            "only_active": False,
            "limit": 100,
        }


# --- get_cluster_status() ---


class TestGetClusterStatus:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_maps_running_status(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "j", "status": "RUNNING", "status_message": None})
        status = provider.get_cluster_status("j")
        assert status.state == ClusterState.UP
        assert status.cluster_name == "j"

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_maps_done_status(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "j", "status": "DONE", "status_message": None})
        status = provider.get_cluster_status("j")
        assert status.state == ClusterState.DOWN


# --- get_job_logs() ---


class TestGetJobLogs:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_waiting_when_no_submission_id(self, mock_request, provider):
        mock_request.return_value = _mock_response(
            {"run_name": "j", "status": "PROVISIONING", "latest_job_submission": None}
        )
        logs = provider.get_job_logs("j", "j")
        assert "Waiting" in logs

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_decodes_base64_log_messages(self, mock_request, provider):
        import base64

        encoded = base64.b64encode(b"Hello from training\n").decode()
        # First call: get run; Second call: poll logs
        mock_request.side_effect = [
            _mock_response(
                {
                    "run_name": "j",
                    "status": "RUNNING",
                    "latest_job_submission": {"id": "aaaaaaaa-0000-0000-0000-000000000000"},
                }
            ),
            _mock_response({"logs": [{"message": encoded}]}),
        ]
        logs = provider.get_job_logs("j", "j")
        assert "Hello from training" in logs

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_waiting_when_log_list_empty(self, mock_request, provider):
        mock_request.side_effect = [
            _mock_response(
                {
                    "run_name": "j",
                    "status": "RUNNING",
                    "latest_job_submission": {"id": "aaaaaaaa-0000-0000-0000-000000000000"},
                }
            ),
            _mock_response({"logs": []}),
        ]
        logs = provider.get_job_logs("j", "j")
        assert "Waiting" in logs


# --- _parse_accelerators() invalid count ---


class TestParseAcceleratorsInvalid:
    def test_invalid_count_raises_value_error(self, provider):
        with pytest.raises(ValueError, match="Invalid accelerator format"):
            provider._parse_accelerators("A100:two")


# --- _build_run_spec() empty command guard ---


class TestBuildRunSpecEmptyGuard:
    def test_raises_if_no_run_and_no_setup(self, provider):
        config = ClusterConfig(run=None)
        with pytest.raises(ValueError, match="requires at least"):
            provider._build_run_spec("bad-run", config)


# --- submit_job() ---


class TestSubmitJob:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_forwards_num_nodes_and_provider_config(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "j", "status": "SUBMITTED"})
        job_config = JobConfig(
            run="python train.py",
            num_nodes=2,
            timeout=3600,
            provider_config={"fleet_name": "my-fleet"},
        )
        provider.submit_job("j", job_config)
        body = mock_request.call_args[1]["json"]
        cfg = body["plan"]["run_spec"]["configuration"]
        assert cfg.get("fleets") == ["my-fleet"]


# --- cancel_job() ---


class TestCancelJob:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_delegates_to_stop_cluster(self, mock_request, provider):
        mock_request.return_value = _mock_response({})
        result = provider.cancel_job("my-job", "my-job")
        assert result["status"] == "stopped"
        body = mock_request.call_args[1]["json"]
        assert body["runs_names"] == ["my-job"]


# --- list_jobs() ---


class TestListJobs:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_single_job_matching_cluster_status(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "j", "status": "RUNNING", "status_message": None})
        jobs = provider.list_jobs("j")
        assert len(jobs) == 1
        assert jobs[0].job_id == "j"
        assert jobs[0].state == JobState.RUNNING

    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_empty_list_on_error(self, mock_request, provider):
        import requests as req_lib

        mock_request.side_effect = req_lib.exceptions.ConnectionError("down")
        jobs = provider.list_jobs("j")
        assert jobs == []


# --- get_cluster_resources() ---


class TestGetClusterResources:
    @patch("transformerlab.compute_providers.dstack.requests.request")
    def test_returns_resource_info_with_no_gpus_when_jobs_empty(self, mock_request, provider):
        mock_request.return_value = _mock_response({"run_name": "j", "status": "RUNNING", "jobs": []})
        resources = provider.get_cluster_resources("j")
        assert resources.cluster_name == "j"
        assert resources.gpus == []
