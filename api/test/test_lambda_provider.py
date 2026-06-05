import py_compile
import subprocess
import tempfile
from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.lambda_labs import (
    LambdaProvider,
    LAMBDA_RUN_LOG_PATH,
    _PUSH_LOGS_PY,
)
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


class TestRegionCapacity:
    def _launch_with_capacity(self, provider, instance_types_payload, requested_region):
        config = ClusterConfig(accelerators="A10:1", region=requested_region)
        config.provider_config = {}

        def fake_request(method, endpoint, **kwargs):
            if endpoint == "/instance-types":
                return _json_response({"data": instance_types_payload})
            return _json_response({"data": {"instance_ids": ["i-1"]}})

        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="org-key"),
            patch.object(provider, "_make_request", side_effect=fake_request) as mock_req,
        ):
            provider.launch_cluster("my-cluster", config)

        launch_call = [c for c in mock_req.call_args_list if c.args[1] == "/instance-operations/launch"][0]
        return launch_call.kwargs["json_data"]

    def test_uses_requested_region_when_it_has_capacity(self, provider):
        payload = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-east-1"}, {"name": "us-west-1"}]}}
        launch_payload = self._launch_with_capacity(provider, payload, "us-east-1")
        assert launch_payload["region_name"] == "us-east-1"

    def test_falls_back_to_region_with_capacity(self, provider):
        # Requested us-east-1 has no capacity; us-west-3 does.
        payload = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-west-3"}]}}
        launch_payload = self._launch_with_capacity(provider, payload, "us-east-1")
        assert launch_payload["region_name"] == "us-west-3"

    def test_raises_when_no_capacity_anywhere_and_no_requested_region(self):
        # No default_region, and the type has capacity nowhere -> clear error.
        provider = LambdaProvider(api_key="k", team_id="team-123")
        config = ClusterConfig(accelerators="A10:1")
        config.provider_config = {}

        def fake_request(method, endpoint, **kwargs):
            if endpoint == "/instance-types":
                return _json_response({"data": {"gpu_1x_a10": {"regions_with_capacity_available": []}}})
            return _json_response({"data": {"instance_ids": ["i-1"]}})

        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="org-key"),
            patch.object(provider, "_make_request", side_effect=fake_request),
            pytest.raises(ValueError, match="no available capacity"),
        ):
            provider.launch_cluster("my-cluster", config)

    def test_raises_when_no_capacity_anywhere_even_with_requested_region(self, provider):
        # The API affirmatively reports zero capacity -> fail fast instead of
        # launching into the requested region and getting a 400.
        config = ClusterConfig(accelerators="A10:1", region="us-east-1")
        config.provider_config = {}

        def fake_request(method, endpoint, **kwargs):
            if endpoint == "/instance-types":
                return _json_response({"data": {"gpu_1x_a10": {"regions_with_capacity_available": []}}})
            return _json_response({"data": {"instance_ids": ["i-1"]}})

        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="org-key"),
            patch.object(provider, "_make_request", side_effect=fake_request),
            pytest.raises(ValueError, match="no available capacity"),
        ):
            provider.launch_cluster("my-cluster", config)

    def test_falls_back_to_requested_region_when_capacity_unknown(self, provider):
        # Instance type missing from the response -> capacity unknown -> use the
        # requested region and let the launch surface any error.
        launch_payload = self._launch_with_capacity(provider, {}, "us-east-1")
        assert launch_payload["region_name"] == "us-east-1"


class TestFileSystemRegion:
    def _launch(self, provider, instance_types_payload, file_systems_payload, requested_region, fs_names):
        config = ClusterConfig(accelerators="A10:1", region=requested_region)
        config.provider_config = {"file_system_names": fs_names}

        def fake_request(method, endpoint, **kwargs):
            if endpoint == "/instance-types":
                return _json_response({"data": instance_types_payload})
            if endpoint == "/file-systems":
                return _json_response({"data": file_systems_payload})
            return _json_response({"data": {"instance_ids": ["i-1"]}})

        with (
            patch.object(provider, "_ensure_org_ssh_key", return_value="org-key"),
            patch.object(provider, "_make_request", side_effect=fake_request) as mock_req,
        ):
            provider.launch_cluster("my-cluster", config)

        launch_call = [c for c in mock_req.call_args_list if c.args[1] == "/instance-operations/launch"][0]
        return launch_call.kwargs["json_data"]

    def test_file_system_pins_region(self, provider):
        # Requested us-east-1, but the filesystem lives in us-west-3 -> launch there.
        types = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-east-1"}, {"name": "us-west-3"}]}}
        file_systems = [{"name": "my-fs", "region": {"name": "us-west-3"}}]
        payload = self._launch(provider, types, file_systems, "us-east-1", ["my-fs"])
        assert payload["region_name"] == "us-west-3"
        assert payload["file_system_names"] == ["my-fs"]

    def test_raises_when_no_capacity_in_file_system_region(self, provider):
        types = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-east-1"}]}}
        file_systems = [{"name": "my-fs", "region": {"name": "us-west-3"}}]
        with pytest.raises(ValueError, match="no capacity in region 'us-west-3'"):
            self._launch(provider, types, file_systems, "us-east-1", ["my-fs"])

    def test_raises_when_file_systems_span_regions(self, provider):
        types = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-east-1"}]}}
        file_systems = [
            {"name": "fs-east", "region": {"name": "us-east-1"}},
            {"name": "fs-west", "region": {"name": "us-west-3"}},
        ]
        with pytest.raises(ValueError, match="different regions"):
            self._launch(provider, types, file_systems, "us-east-1", ["fs-east", "fs-west"])

    def test_unknown_file_system_falls_back_to_capacity_logic(self, provider):
        # Filesystem name not found -> region unknown -> normal capacity-based pick.
        types = {"gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-east-1"}]}}
        payload = self._launch(provider, types, [], "us-east-1", ["ghost-fs"])
        assert payload["region_name"] == "us-east-1"
        assert payload["file_system_names"] == ["ghost-fs"]


class TestResolveInstanceType:
    def test_accepts_native_instance_type_default(self):
        provider = LambdaProvider(api_key="k", default_instance_type="gpu_1x_a10")
        assert provider._resolve_instance_type(None) == "gpu_1x_a10"

    def test_resolves_gpu_type_default(self):
        # default_instance_type is fed from the generic default_gpu_type config
        # field, which holds values like "A100" rather than Lambda names.
        provider = LambdaProvider(api_key="k", default_instance_type="A100")
        assert provider._resolve_instance_type(None) == "gpu_1x_a100"

    def test_resolves_gpu_spec_default(self):
        provider = LambdaProvider(api_key="k", default_instance_type="A100:8")
        assert provider._resolve_instance_type(None) == "gpu_8x_a100"

    def test_raises_for_unknown_gpu_type_default(self):
        provider = LambdaProvider(api_key="k", default_instance_type="RTX 3090")
        with pytest.raises(ValueError, match="Unsupported accelerator spec"):
            provider._resolve_instance_type(None)

    def test_explicit_accelerators_take_precedence(self):
        provider = LambdaProvider(api_key="k", default_instance_type="gpu_1x_a10")
        assert provider._resolve_instance_type("H100:8") == "gpu_8x_h100_sxm5"


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


class TestUserData:
    def _build(self, provider):
        config = ClusterConfig(accelerators="A10:1", region="us-east-1")
        config.setup = "uv pip install foo"
        config.run = "tfl-remote-trap -- python train.py"
        config.env_vars = {"_TFL_JOB_ID": "42", "_TFL_EXPERIMENT_ID": "7", "FOO": "bar baz"}
        return provider._build_user_data("mycluster", config)

    def test_embedded_uploader_compiles(self):
        src = _PUSH_LOGS_PY.format(log_path=LAMBDA_RUN_LOG_PATH)
        with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
            f.write(src)
            path = f.name
        py_compile.compile(path, doraise=True)

    def test_generated_script_is_valid_bash(self, provider):
        ud = self._build(provider)
        with tempfile.NamedTemporaryFile("w", suffix=".sh", delete=False) as f:
            f.write(ud)
            path = f.name
        result = subprocess.run(["bash", "-n", path], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr

    def test_script_bootstraps_runtime_and_grace(self, provider):
        ud = self._build(provider)
        # Runtime bootstrap (the bug fix): venv + uv installed before user setup.
        assert "python3 -m venv /opt/transformerlab-venv" in ud
        assert "astral.sh/uv/install.sh" in ud
        # Full output captured from the start, and failure handling present.
        assert f"tee {LAMBDA_RUN_LOG_PATH}" in ud
        assert "TFL_LAMBDA_FAILURE_GRACE_SECONDS" in ud
        assert "_tfl_push_logs.py" in ud
        # Bootstrap precedes user setup.
        assert ud.index("transformerlab-venv") < ud.index("uv pip install foo")
