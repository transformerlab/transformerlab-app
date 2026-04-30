import pytest
from unittest.mock import MagicMock, patch

from transformerlab.compute_providers.aws import AWSProvider, _resolve_cpu_instance_type, _resolve_gpu_instance_type
from transformerlab.compute_providers.models import ClusterConfig
from transformerlab.shared.models.models import ProviderType


def test_aws_provider_type_value():
    assert ProviderType.AWS == "aws"
    assert ProviderType("aws") == ProviderType.AWS


class TestResolveGpuInstanceType:
    def test_t4_single(self):
        assert _resolve_gpu_instance_type("T4:1") == "g4dn.xlarge"

    def test_t4_four(self):
        assert _resolve_gpu_instance_type("T4:4") == "g4dn.12xlarge"

    def test_a100_eight(self):
        assert _resolve_gpu_instance_type("A100:8") == "p4d.24xlarge"

    def test_h100_eight(self):
        assert _resolve_gpu_instance_type("H100:8") == "p5.48xlarge"

    def test_radon_v520_two(self):
        assert _resolve_gpu_instance_type("RadeonV520:2") == "g4ad.8xlarge"

    def test_implicit_count_one(self):
        assert _resolve_gpu_instance_type("T4") == "g4dn.xlarge"

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unsupported accelerator"):
            _resolve_gpu_instance_type("H200X:1")

    def test_unsupported_count_raises(self):
        with pytest.raises(ValueError, match="Unsupported accelerator"):
            _resolve_gpu_instance_type("T4:3")


class TestResolveCpuInstanceType:
    def test_no_requirements_returns_minimum(self):
        assert _resolve_cpu_instance_type(None, None) == "c5.large"

    def test_exact_match(self):
        assert _resolve_cpu_instance_type(2, 4) == "c5.large"

    def test_rounds_up_cpus(self):
        # 3 cpus → next is c5.xlarge (4 vcpus, 8 GB)
        assert _resolve_cpu_instance_type(3, 4) == "c5.xlarge"

    def test_memory_pushes_to_higher_family(self):
        # 4 cpus, 20 GB memory → m5.xlarge (4, 16) not enough → r5.xlarge (4, 32)
        assert _resolve_cpu_instance_type(4, 20) == "r5.xlarge"

    def test_string_memory(self):
        # "16GB" should parse to 16.0
        assert _resolve_cpu_instance_type(4, "16GB") == "m5.xlarge"

    def test_exceeds_max_raises(self):
        with pytest.raises(ValueError, match="No EC2 CPU instance"):
            _resolve_cpu_instance_type(200, 0)


@pytest.fixture
def provider():
    return AWSProvider(aws_profile="transformerlab-compute-abc", region="us-east-1", team_id="abc")


class TestCheck:
    def test_returns_true_when_sts_succeeds(self, provider):
        mock_sts = MagicMock()
        mock_sts.get_caller_identity.return_value = {"Account": "123456789"}
        with patch.object(provider, "_get_sts_client", return_value=mock_sts):
            assert provider.check() == (True, None)

    def test_returns_false_on_exception(self, provider):
        mock_sts = MagicMock()
        mock_sts.get_caller_identity.side_effect = Exception("NoCredentialProviders")
        with patch.object(provider, "_get_sts_client", return_value=mock_sts):
            ok, reason = provider.check()
            assert ok is False
            assert reason == "AWS provider check failed: NoCredentialProviders"


class TestEnsureSecurityGroup:
    def test_returns_existing_group_id(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_security_groups.return_value = {"SecurityGroups": [{"GroupId": "sg-existing123"}]}
        result = provider._ensure_security_group(mock_ec2)
        assert result == "sg-existing123"
        mock_ec2.create_security_group.assert_not_called()

    def test_creates_group_when_missing(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_security_groups.return_value = {"SecurityGroups": []}
        mock_ec2.create_security_group.return_value = {"GroupId": "sg-new456"}
        result = provider._ensure_security_group(mock_ec2)
        assert result == "sg-new456"
        mock_ec2.authorize_security_group_ingress.assert_called_once()

    def test_new_group_name_includes_team_id(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_security_groups.return_value = {"SecurityGroups": []}
        mock_ec2.create_security_group.return_value = {"GroupId": "sg-x"}
        provider._ensure_security_group(mock_ec2)
        call_kwargs = mock_ec2.create_security_group.call_args[1]
        assert "abc" in call_kwargs["GroupName"]


class TestEnsureKeyPair:
    def test_returns_existing_key_name(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_key_pairs.return_value = {"KeyPairs": [{"KeyName": "transformerlab-abc"}]}
        result = provider._ensure_key_pair(mock_ec2, b"ssh-ed25519 AAAA...")
        assert result == "transformerlab-abc"
        mock_ec2.import_key_pair.assert_not_called()

    def test_imports_key_when_missing(self, provider):
        mock_ec2 = MagicMock()
        from botocore.exceptions import ClientError

        mock_ec2.describe_key_pairs.side_effect = ClientError(
            {"Error": {"Code": "InvalidKeyPair.NotFound", "Message": ""}}, "DescribeKeyPairs"
        )
        result = provider._ensure_key_pair(mock_ec2, b"ssh-ed25519 AAAA...")
        assert result == "transformerlab-abc"
        mock_ec2.import_key_pair.assert_called_once()


class TestEnsureIamInstanceProfile:
    def _make_mock_iam(self, role_exists: bool = True, profile_exists: bool = True, role_in_profile: bool = True):
        from botocore.exceptions import ClientError

        mock_iam = MagicMock()

        if role_exists:
            mock_iam.get_role.return_value = {"Role": {"RoleName": "transformerlab-ec2-role-abc"}}
        else:
            mock_iam.get_role.side_effect = ClientError({"Error": {"Code": "NoSuchEntity", "Message": ""}}, "GetRole")
            mock_iam.create_role.return_value = {"Role": {"RoleName": "transformerlab-ec2-role-abc"}}

        if profile_exists:
            roles_in_profile = [{"RoleName": "transformerlab-ec2-role-abc"}] if role_in_profile else []
            mock_iam.get_instance_profile.return_value = {
                "InstanceProfile": {
                    "InstanceProfileName": "transformerlab-ec2-profile-abc",
                    "Arn": "arn:aws:iam::123456789:instance-profile/transformerlab-ec2-profile-abc",
                    "Roles": roles_in_profile,
                }
            }
        else:
            mock_iam.get_instance_profile.side_effect = ClientError(
                {"Error": {"Code": "NoSuchEntity", "Message": ""}}, "GetInstanceProfile"
            )
            mock_iam.create_instance_profile.return_value = {
                "InstanceProfile": {
                    "InstanceProfileName": "transformerlab-ec2-profile-abc",
                    "Arn": "arn:aws:iam::123456789:instance-profile/transformerlab-ec2-profile-abc",
                    "Roles": [],
                }
            }

        return mock_iam

    def test_returns_existing_profile_arn_without_creating(self, provider):
        mock_iam = self._make_mock_iam(role_exists=True, profile_exists=True, role_in_profile=True)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            arn = provider._ensure_iam_instance_profile()
        assert arn.startswith("arn:aws:iam::")
        assert "transformerlab-ec2-profile-abc" in arn
        mock_iam.create_role.assert_not_called()
        mock_iam.create_instance_profile.assert_not_called()
        mock_iam.add_role_to_instance_profile.assert_not_called()
        mock_iam.put_role_policy.assert_called_once()

    def test_creates_role_when_missing(self, provider):
        mock_iam = self._make_mock_iam(role_exists=False, profile_exists=True, role_in_profile=True)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            provider._ensure_iam_instance_profile()
        mock_iam.create_role.assert_called_once()
        call_kwargs = mock_iam.create_role.call_args[1]
        assert "transformerlab-ec2-role-abc" in call_kwargs["RoleName"]

    def test_creates_profile_when_missing(self, provider):
        mock_iam = self._make_mock_iam(role_exists=True, profile_exists=False)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            provider._ensure_iam_instance_profile()
        mock_iam.create_instance_profile.assert_called_once()

    def test_adds_role_to_profile_when_not_already_attached(self, provider):
        mock_iam = self._make_mock_iam(role_exists=True, profile_exists=True, role_in_profile=False)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            provider._ensure_iam_instance_profile()
        mock_iam.add_role_to_instance_profile.assert_called_once()

    def test_role_name_and_profile_name_include_team_id(self, provider):
        mock_iam = self._make_mock_iam(role_exists=False, profile_exists=False)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            provider._ensure_iam_instance_profile()
        role_name = mock_iam.create_role.call_args[1]["RoleName"]
        profile_name = mock_iam.create_instance_profile.call_args[1]["InstanceProfileName"]
        assert "abc" in role_name
        assert "abc" in profile_name

    def test_inline_policy_scoped_to_team_id(self, provider):
        import json

        mock_iam = self._make_mock_iam(role_exists=False, profile_exists=False)
        with patch.object(provider, "_get_iam_client", return_value=mock_iam):
            provider._ensure_iam_instance_profile()
        call_kwargs = mock_iam.put_role_policy.call_args[1]
        policy = json.loads(call_kwargs["PolicyDocument"])
        stmt = policy["Statement"][0]
        assert stmt["Action"] == "ec2:TerminateInstances"
        assert stmt["Condition"]["StringEquals"]["ec2:ResourceTag/transformerlab-team-id"] == "abc"


class TestLaunchCluster:
    def _make_mock_ec2(self):
        mock_ec2 = MagicMock()
        mock_ec2.describe_security_groups.return_value = {"SecurityGroups": [{"GroupId": "sg-123"}]}
        mock_ec2.describe_key_pairs.return_value = {"KeyPairs": [{"KeyName": "transformerlab-abc"}]}
        mock_ec2.describe_images.return_value = {
            "Images": [{"ImageId": "ami-0123456789", "CreationDate": "2024-01-01T00:00:00Z"}]
        }
        mock_ec2.run_instances.return_value = {"Instances": [{"InstanceId": "i-0abc123"}]}
        return mock_ec2

    def test_returns_instance_id(self, provider):
        mock_ec2 = self._make_mock_ec2()
        # get_org_ssh_public_key returns str; .encode() is called on it inside launch_cluster
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
        ):
            result = provider.launch_cluster("my-cluster", ClusterConfig(run="python train.py"))
        assert result["instance_id"] == "i-0abc123"
        assert result["request_id"] == "i-0abc123"

    def test_passes_disk_size_to_block_device(self, provider):
        mock_ec2 = self._make_mock_ec2()
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", disk_size=200))
        call_kwargs = mock_ec2.run_instances.call_args[1]
        assert call_kwargs["BlockDeviceMappings"][0]["Ebs"]["VolumeSize"] == 200

    def test_no_block_device_when_disk_size_not_set(self, provider):
        mock_ec2 = self._make_mock_ec2()
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        call_kwargs = mock_ec2.run_instances.call_args[1]
        assert "BlockDeviceMappings" not in call_kwargs

    def test_tags_include_team_id_and_cluster_name(self, provider):
        mock_ec2 = self._make_mock_ec2()
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        tags = mock_ec2.run_instances.call_args[1]["TagSpecifications"][0]["Tags"]
        tag_map = {t["Key"]: t["Value"] for t in tags}
        assert tag_map["transformerlab-team-id"] == "abc"
        assert tag_map["transformerlab-cluster-name"] == "my-cluster"

    def test_attaches_iam_instance_profile(self, provider):
        mock_ec2 = self._make_mock_ec2()
        mock_ensure_iam = MagicMock(return_value="arn:aws:iam::123:instance-profile/transformerlab-ec2-profile-abc")
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(provider, "_ensure_iam_instance_profile", mock_ensure_iam),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="python train.py"))
        call_kwargs = mock_ec2.run_instances.call_args[1]
        assert (
            call_kwargs["IamInstanceProfile"]["Arn"]
            == "arn:aws:iam::123:instance-profile/transformerlab-ec2-profile-abc"
        )
        mock_ensure_iam.assert_called_once()

    def test_raises_runtime_error_when_iam_profile_fails(self, provider):
        with (
            patch.object(provider, "_get_ec2_client", return_value=self._make_mock_ec2()),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider,
                "_ensure_iam_instance_profile",
                side_effect=RuntimeError("IAM permission denied"),
            ),
        ):
            with pytest.raises(RuntimeError, match="IAM instance profile"):
                provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))

    def test_retries_run_instances_on_iam_propagation_error(self, provider):
        from botocore.exceptions import ClientError

        mock_ec2 = self._make_mock_ec2()
        propagation_error = ClientError(
            {
                "Error": {
                    "Code": "InvalidParameterValue",
                    "Message": "Value (arn:...) for parameter iamInstanceProfile.arn is invalid. Invalid IAM Instance Profile ARN",
                }
            },
            "RunInstances",
        )
        # Fail once with propagation error, then succeed.
        mock_ec2.run_instances.side_effect = [propagation_error, mock_ec2.run_instances.return_value]
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
            patch("transformerlab.compute_providers.aws.time.sleep") as mock_sleep,
        ):
            result = provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        assert result["instance_id"] == "i-0abc123"
        assert mock_ec2.run_instances.call_count == 2
        mock_sleep.assert_called_once_with(10)

    def test_uses_cpu_ami_for_cpu_only_launches(self, provider):
        mock_ec2 = self._make_mock_ec2()
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
            patch.object(provider, "_get_latest_cpu_ami", return_value="ami-cpu") as mock_cpu_ami,
            patch.object(provider, "_get_latest_dl_ami", return_value="ami-gpu") as mock_gpu_ami,
        ):
            provider.launch_cluster("cpu-cluster", ClusterConfig(run="train.py"))
        assert mock_cpu_ami.call_count == 1
        assert mock_gpu_ami.call_count == 0
        assert mock_ec2.run_instances.call_args[1]["ImageId"] == "ami-cpu"

    def test_uses_dl_ami_for_gpu_launches(self, provider):
        mock_ec2 = self._make_mock_ec2()
        with (
            patch.object(provider, "_get_ec2_client", return_value=mock_ec2),
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value="ssh-ed25519 AAAA"),
            patch.object(
                provider, "_ensure_iam_instance_profile", return_value="arn:aws:iam::123:instance-profile/tfl"
            ),
            patch.object(provider, "_get_latest_cpu_ami", return_value="ami-cpu") as mock_cpu_ami,
            patch.object(provider, "_get_latest_dl_ami", return_value="ami-gpu") as mock_gpu_ami,
        ):
            provider.launch_cluster("gpu-cluster", ClusterConfig(run="train.py", accelerators="T4:1"))
        assert mock_gpu_ami.call_count == 1
        assert mock_cpu_ami.call_count == 0
        assert mock_ec2.run_instances.call_args[1]["ImageId"] == "ami-gpu"


class TestDeepLearningAmiLookup:
    def test_uses_fallback_name_pattern_when_primary_has_no_results(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_images.side_effect = [
            {"Images": []},
            {"Images": [{"ImageId": "ami-fallback", "CreationDate": "2024-05-01T00:00:00Z"}]},
        ]

        ami_id = provider._get_latest_dl_ami(mock_ec2)

        assert ami_id == "ami-fallback"
        assert mock_ec2.describe_images.call_count == 2

    def test_raises_when_no_patterns_match(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_images.return_value = {"Images": []}

        with pytest.raises(RuntimeError, match="No Deep Learning AMI found"):
            provider._get_latest_dl_ami(mock_ec2)


class TestCpuAmiLookup:
    def test_uses_fallback_name_pattern_when_primary_has_no_results(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_images.side_effect = [
            {"Images": []},
            {"Images": [{"ImageId": "ami-cpu-fallback", "CreationDate": "2024-05-01T00:00:00Z"}]},
        ]

        ami_id = provider._get_latest_cpu_ami(mock_ec2)

        assert ami_id == "ami-cpu-fallback"
        assert mock_ec2.describe_images.call_count == 2

    def test_raises_when_no_patterns_match(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_images.return_value = {"Images": []}

        with pytest.raises(RuntimeError, match="No CPU Ubuntu AMI found"):
            provider._get_latest_cpu_ami(mock_ec2)


class TestUserDataScript:
    def test_bootstraps_dedicated_python_venv(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        assert "apt-get install -y -qq python3 python3-venv python3-pip" in user_data
        assert "python3 -m venv /opt/transformerlab-venv" in user_data
        assert 'export PATH="/opt/transformerlab-venv/bin:$PATH"' in user_data

    def test_installs_uv_and_exports_path(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        assert "curl -LsSf https://astral.sh/uv/install.sh | sh" in user_data
        assert 'export PATH="$HOME/.local/bin:/root/.local/bin:/home/ubuntu/.local/bin:$PATH"' in user_data
        assert "cp /root/.local/bin/uv /usr/local/bin/uv && chmod +x /usr/local/bin/uv" in user_data

    def test_includes_self_termination_trap(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        assert "trap" in user_data
        assert "_tfl_self_terminate" in user_data

    def test_self_termination_uses_imdsv2(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        assert "169.254.169.254/latest/api/token" in user_data
        assert "169.254.169.254/latest/meta-data/instance-id" in user_data

    def test_self_termination_uses_correct_region(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="eu-west-1")
        assert "eu-west-1" in user_data

    def test_trap_fires_on_exit_not_only_success(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        assert "trap _tfl_self_terminate EXIT" in user_data

    def test_self_termination_aws_call_suppresses_errors(self):
        user_data = AWSProvider._build_user_data(ClusterConfig(run="echo hello"), region="us-east-1")
        term_lines = [line for line in user_data.splitlines() if "terminate-instances" in line]
        assert len(term_lines) == 1
        assert "|| true" in term_lines[0]


class TestStopCluster:
    def test_terminates_instance_by_cluster_name(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {
            "Reservations": [{"Instances": [{"InstanceId": "i-0abc123", "State": {"Name": "running"}}]}]
        }
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            result = provider.stop_cluster("my-cluster")
        mock_ec2.terminate_instances.assert_called_once_with(InstanceIds=["i-0abc123"])
        assert result["status"] == "success"

    def test_returns_error_when_instance_not_found(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {"Reservations": []}
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            result = provider.stop_cluster("my-cluster")
        assert result["status"] == "error"


class TestGetClusterStatus:
    def test_maps_running_to_up(self, provider):
        from transformerlab.compute_providers.models import ClusterState

        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": "i-0abc123",
                            "State": {"Name": "running"},
                            "PublicIpAddress": "1.2.3.4",
                        }
                    ]
                }
            ]
        }
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.UP

    def test_maps_terminated_to_down(self, provider):
        from transformerlab.compute_providers.models import ClusterState

        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {
            "Reservations": [{"Instances": [{"InstanceId": "i-0abc123", "State": {"Name": "terminated"}}]}]
        }
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.DOWN

    def test_returns_unknown_when_not_found(self, provider):
        from transformerlab.compute_providers.models import ClusterState

        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {"Reservations": []}
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.UNKNOWN


class TestGetJobLogs:
    def test_returns_log_content_via_ssh(self, provider):
        with (
            patch("transformerlab.compute_providers.aws.asyncio.run", return_value=b"PRIVATE_KEY"),
            patch("transformerlab.compute_providers.aws._ssh_read_file", return_value="training loss: 0.5"),
        ):
            mock_ec2 = MagicMock()
            mock_ec2.describe_instances.return_value = {
                "Reservations": [
                    {
                        "Instances": [
                            {"InstanceId": "i-0abc", "State": {"Name": "running"}, "PublicIpAddress": "1.2.3.4"}
                        ]
                    }
                ]
            }
            with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
                logs = provider.get_job_logs("my-cluster", "job-1")
        assert "training loss" in logs

    def test_returns_message_when_instance_not_running(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {"Reservations": []}
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            logs = provider.get_job_logs("my-cluster", "job-1")
        assert "not found" in logs.lower() or "no" in logs.lower()


class TestListClusters:
    def test_returns_cluster_statuses(self, provider):
        mock_ec2 = MagicMock()
        mock_ec2.describe_instances.return_value = {
            "Reservations": [
                {
                    "Instances": [
                        {
                            "InstanceId": "i-0abc",
                            "State": {"Name": "running"},
                            "Tags": [
                                {"Key": "transformerlab-cluster-name", "Value": "cluster-1"},
                                {"Key": "transformerlab-team-id", "Value": "abc"},
                            ],
                        }
                    ]
                }
            ]
        }
        with patch.object(provider, "_get_ec2_client", return_value=mock_ec2):
            clusters = provider.list_clusters()
        assert len(clusters) == 1
        assert clusters[0].cluster_name == "cluster-1"


def test_factory_creates_aws_provider():
    from transformerlab.compute_providers.config import ComputeProviderConfig, create_compute_provider

    config = ComputeProviderConfig(
        type="aws",
        name="my-aws",
        aws_profile="transformerlab-compute-abc",
        region="us-east-1",
        team_id="abc",
    )
    provider = create_compute_provider(config)
    assert isinstance(provider, AWSProvider)
    assert provider.region == "us-east-1"
    assert provider.team_id == "abc"


def test_factory_raises_without_aws_profile():
    from transformerlab.compute_providers.config import ComputeProviderConfig, create_compute_provider

    config = ComputeProviderConfig(type="aws", name="my-aws", team_id="abc")
    with pytest.raises(ValueError, match="aws_profile"):
        create_compute_provider(config)
