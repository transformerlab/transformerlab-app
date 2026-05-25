from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.lambda_labs import LambdaProvider, LAMBDA_RUN_LOG_PATH
from transformerlab.compute_providers.models import ClusterConfig


@pytest.fixture
def provider():
    return LambdaProvider(api_key="test-api-key", default_region="us-east-1", team_id="team-123")


def _json_response(payload):
    resp = MagicMock()
    resp.json.return_value = payload
    return resp


class TestEnsureOrgSshKey:
    def test_creates_key_when_missing(self, provider):
        # No existing keys -> should POST the org public key.
        responses = {
            ("GET", "/ssh-keys"): _json_response({"data": []}),
            ("POST", "/ssh-keys"): _json_response({"data": {"name": "transformerlab-team-123"}}),
        }

        def fake_request(method, endpoint, **kwargs):
            return responses[(method, endpoint)]

        with (
            patch.object(provider, "_make_request", side_effect=fake_request) as mock_req,
            patch(
                "transformerlab.services.ssh_key_service.get_or_create_org_ssh_key_pair",
                return_value=("/k", "/k.pub"),
            ),
            patch(
                "transformerlab.services.ssh_key_service.get_org_ssh_public_key",
                return_value="ssh-rsa AAAAB3 org-key",
            ),
        ):
            key_name = provider._ensure_org_ssh_key()

        assert key_name == "transformerlab-team-123"
        post_call = [c for c in mock_req.call_args_list if c.args[0] == "POST"][0]
        assert post_call.kwargs["json_data"] == {
            "name": "transformerlab-team-123",
            "public_key": "ssh-rsa AAAAB3 org-key",
        }

    def test_reuses_existing_key_without_creating(self, provider):
        responses = {
            ("GET", "/ssh-keys"): _json_response({"data": [{"name": "transformerlab-team-123"}]}),
        }

        def fake_request(method, endpoint, **kwargs):
            return responses[(method, endpoint)]

        with (
            patch.object(provider, "_make_request", side_effect=fake_request) as mock_req,
            patch(
                "transformerlab.services.ssh_key_service.get_or_create_org_ssh_key_pair",
                return_value=("/k", "/k.pub"),
            ),
            patch(
                "transformerlab.services.ssh_key_service.get_org_ssh_public_key",
                return_value="ssh-rsa AAAAB3 org-key",
            ),
        ):
            key_name = provider._ensure_org_ssh_key()

        assert key_name == "transformerlab-team-123"
        assert not any(c.args[0] == "POST" for c in mock_req.call_args_list)


class TestLaunchInjectsOrgKey:
    def test_org_key_added_to_user_keys(self, provider):
        config = ClusterConfig(accelerators="A100:1", region="us-east-1")
        config.provider_config = {"ssh_key_names": ["my-personal-key"]}

        launch_resp = _json_response({"data": {"instance_ids": ["i-1"]}})
        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="transformerlab-team-123"),
            patch.object(provider, "_make_request", return_value=launch_resp) as mock_req,
        ):
            provider.launch_cluster("my-cluster", config)

        payload = mock_req.call_args.kwargs["json_data"]
        assert payload["ssh_key_names"] == ["my-personal-key", "transformerlab-team-123"]

    def test_org_key_alone_when_no_user_keys(self, provider):
        config = ClusterConfig(accelerators="A100:1", region="us-east-1")
        config.provider_config = {}

        launch_resp = _json_response({"data": {"instance_ids": ["i-1"]}})
        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="transformerlab-team-123"),
            patch.object(provider, "_make_request", return_value=launch_resp) as mock_req,
        ):
            provider.launch_cluster("my-cluster", config)

        payload = mock_req.call_args.kwargs["json_data"]
        assert payload["ssh_key_names"] == ["transformerlab-team-123"]


class TestGetJobLogs:
    def test_ssh_reads_run_log(self, provider):
        with (
            patch.object(provider, "_find_instance_by_name", return_value={"ip": "1.2.3.4"}),
            patch(
                "transformerlab.services.ssh_key_service.get_org_ssh_private_key",
                return_value=b"PRIVATE",
            ),
            patch(
                "transformerlab.compute_providers.lambda_labs._ssh_read_file",
                return_value="hello logs",
            ) as mock_read,
        ):
            result = provider.get_job_logs("my-cluster", "job-1")

        assert result == "hello logs"
        args = mock_read.call_args.args
        assert args[0] == "1.2.3.4"
        assert args[1] == b"PRIVATE"
        assert args[2] == LAMBDA_RUN_LOG_PATH

    def test_handles_missing_instance(self, provider):
        with patch.object(provider, "_find_instance_by_name", return_value=None):
            result = provider.get_job_logs("my-cluster", "job-1")
        assert "not found" in result

    def test_handles_no_ip_yet(self, provider):
        with patch.object(provider, "_find_instance_by_name", return_value={"ip": None}):
            result = provider.get_job_logs("my-cluster", "job-1")
        assert "no IP" in result
