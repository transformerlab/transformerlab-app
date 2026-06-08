"""Tests for the Azure compute provider."""

import sys
from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.azure import AzureProvider, _resolve_cpu_vm_size, _resolve_gpu_vm_size
from transformerlab.compute_providers.config import ComputeProviderConfig, create_compute_provider
from transformerlab.compute_providers.models import ClusterConfig, ClusterState
from transformerlab.schemas.compute_providers import ProviderConfigBase, mask_sensitive_config
from transformerlab.shared.models.models import ProviderType


def test_azure_provider_type_value():
    assert ProviderType.AZURE == "azure"
    assert ProviderType("azure") == ProviderType.AZURE


def test_provider_config_base_accepts_azure_fields():
    cfg = ProviderConfigBase(
        azure_subscription_id="sub-123",
        azure_tenant_id="tenant-456",
        azure_client_id="client-789",
        azure_client_secret="my-secret",
        azure_location="eastus",
    )
    assert cfg.azure_subscription_id == "sub-123"
    assert cfg.azure_client_secret == "my-secret"


def test_mask_sensitive_config_masks_client_secret():
    config = {"azure_client_secret": "real-secret", "azure_client_id": "client-123"}
    masked = mask_sensitive_config(config, "azure")
    assert masked["azure_client_secret"] == "***"
    assert masked["azure_client_id"] == "client-123"


class TestResolveGpuVmSize:
    def test_t4_single(self):
        assert _resolve_gpu_vm_size("T4:1") == "Standard_NC4as_T4_v3"

    def test_t4_four(self):
        assert _resolve_gpu_vm_size("T4:4") == "Standard_NC16as_T4_v3"

    def test_a100_eight(self):
        assert _resolve_gpu_vm_size("A100:8") == "Standard_ND96asr_v4"

    def test_h100_eight(self):
        assert _resolve_gpu_vm_size("H100:8") == "Standard_ND96isr_H100_v5"

    def test_b200_four(self):
        assert _resolve_gpu_vm_size("B200:4") == "Standard_ND128isr_NDR_GB200_v6"

    def test_v100_four(self):
        assert _resolve_gpu_vm_size("V100:4") == "Standard_NC24s_v3"

    def test_a10_one(self):
        assert _resolve_gpu_vm_size("A10:1") == "Standard_NV36ads_A10_v5"

    def test_implicit_count_one(self):
        assert _resolve_gpu_vm_size("T4") == "Standard_NC4as_T4_v3"

    def test_unknown_type_raises(self):
        with pytest.raises(ValueError, match="Unsupported accelerator"):
            _resolve_gpu_vm_size("RTX4090:1")

    def test_unsupported_count_raises(self):
        with pytest.raises(ValueError, match="Unsupported accelerator"):
            _resolve_gpu_vm_size("T4:3")


class TestResolveCpuVmSize:
    def test_no_requirements_returns_minimum(self):
        assert _resolve_cpu_vm_size(None, None) == "Standard_F2s_v2"

    def test_exact_match(self):
        assert _resolve_cpu_vm_size(2, 4) == "Standard_F2s_v2"

    def test_rounds_up_cpus(self):
        # 3 cpus → next is Standard_F4s_v2 (4 vcpus, 8 GB)
        assert _resolve_cpu_vm_size(3, 4) == "Standard_F4s_v2"

    def test_memory_pushes_to_higher_family(self):
        # 4 cpus, 20 GB → Standard_D4s_v3 (4, 16) not enough → Standard_E4s_v3 (4, 32)
        assert _resolve_cpu_vm_size(4, 20) == "Standard_E4s_v3"

    def test_string_memory(self):
        # "16GB" should parse to 16.0 → Standard_D4s_v3 (4, 16)
        assert _resolve_cpu_vm_size(4, "16GB") == "Standard_D4s_v3"

    def test_exceeds_max_raises(self):
        with pytest.raises(ValueError, match="No Azure CPU VM"):
            _resolve_cpu_vm_size(200, 0)


@pytest.fixture
def provider():
    return AzureProvider(
        subscription_id="sub-123",
        tenant_id="tenant-456",
        client_id="client-789",
        client_secret="secret",
        location="eastus",
        resource_group="transformerlab-abc",
        team_id="abc",
    )


class TestCheck:
    def _patch_subscription_client(self, mock_sub_client):
        """Inject a fake azure.mgmt.resource module with SubscriptionClient into sys.modules."""
        fake_module = MagicMock()
        fake_module.SubscriptionClient = MagicMock(return_value=mock_sub_client)
        return patch.dict(sys.modules, {"azure.mgmt.resource": fake_module})

    def test_returns_true_when_resource_client_succeeds(self, provider):
        mock_sub_client = MagicMock()
        mock_sub_client.subscriptions.get.return_value = MagicMock()
        with self._patch_subscription_client(mock_sub_client):
            with patch.object(provider, "_get_credential", return_value=MagicMock()):
                assert provider.check() == (True, None)

    def test_returns_false_on_exception(self, provider):
        mock_sub_client = MagicMock()
        mock_sub_client.subscriptions.get.side_effect = Exception("AuthError")
        with self._patch_subscription_client(mock_sub_client):
            with patch.object(provider, "_get_credential", return_value=MagicMock()):
                ok, reason = provider.check()
                assert ok is False
                assert reason == "Azure provider check failed: AuthError"


class TestEnsureNetworking:
    def _make_mock_clients(self):
        mock_nc = MagicMock()
        mock_rc = MagicMock()
        mock_nc.network_security_groups.get.side_effect = Exception("NotFound")
        mock_nc.network_security_groups.begin_create_or_update.return_value = MagicMock(
            result=MagicMock(return_value=MagicMock(id="nsg-id-1"))
        )
        mock_nc.virtual_networks.begin_create_or_update.return_value = MagicMock(result=MagicMock(return_value=None))
        mock_nc.subnets.get.side_effect = [Exception("NotFound"), MagicMock(id="subnet-id-1")]
        return mock_nc, mock_rc

    def test_creates_nsg_and_vnet_when_missing(self, provider):
        mock_nc, mock_rc = self._make_mock_clients()
        subnet_id, nsg_id = provider._ensure_networking(mock_nc, mock_rc)
        mock_rc.resource_groups.create_or_update.assert_called_once_with("transformerlab-abc", {"location": "eastus"})
        mock_nc.network_security_groups.begin_create_or_update.assert_called_once()
        mock_nc.virtual_networks.begin_create_or_update.assert_called_once()
        assert nsg_id == "nsg-id-1"
        assert subnet_id == "subnet-id-1"

    def test_returns_existing_nsg_without_creating(self, provider):
        mock_nc = MagicMock()
        mock_rc = MagicMock()
        existing_nsg = MagicMock(id="existing-nsg")
        mock_nc.network_security_groups.get.return_value = existing_nsg
        existing_subnet = MagicMock(id="existing-subnet")
        mock_nc.subnets.get.return_value = existing_subnet
        subnet_id, nsg_id = provider._ensure_networking(mock_nc, mock_rc)
        mock_nc.network_security_groups.begin_create_or_update.assert_not_called()
        assert nsg_id == "existing-nsg"
        assert subnet_id == "existing-subnet"


class TestLaunchCluster:
    def _make_mock_clients(self):
        mock_cc = MagicMock()
        mock_nc = MagicMock()
        mock_rc = MagicMock()
        # Networking returns existing resources
        mock_nc.network_security_groups.get.return_value = MagicMock(id="nsg-id")
        mock_nc.subnets.get.return_value = MagicMock(id="subnet-id")
        # Public IP
        mock_nc.public_ip_addresses.begin_create_or_update.return_value = MagicMock(
            result=MagicMock(return_value=MagicMock(id="pip-id"))
        )
        # NIC
        mock_nc.network_interfaces.begin_create_or_update.return_value = MagicMock(
            result=MagicMock(return_value=MagicMock(id="nic-id"))
        )
        # VM creation
        mock_vm = MagicMock(
            id="/subscriptions/sub/resourceGroups/rg/providers/Microsoft.Compute/virtualMachines/my-cluster",
            name="my-cluster",
        )
        mock_cc.virtual_machines.begin_create_or_update.return_value = MagicMock(result=MagicMock(return_value=mock_vm))
        return mock_cc, mock_nc, mock_rc

    def test_returns_vm_id_and_request_id(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch(
                "transformerlab.compute_providers.azure.asyncio.run",
                return_value="ssh-ed25519 AAAA",
            ),
        ):
            result = provider.launch_cluster("my-cluster", ClusterConfig(run="python train.py"))
        assert result["request_id"] == "my-cluster"
        assert "vm_id" in result

    def test_disk_size_is_applied_when_set(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch(
                "transformerlab.compute_providers.azure.asyncio.run",
                return_value="ssh-ed25519 AAAA",
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", disk_size=200))
        call_kwargs = mock_cc.virtual_machines.begin_create_or_update.call_args[0][2]
        assert call_kwargs["storage_profile"]["os_disk"]["disk_size_gb"] == 200

    def test_no_disk_size_override_when_not_set(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch(
                "transformerlab.compute_providers.azure.asyncio.run",
                return_value="ssh-ed25519 AAAA",
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        call_kwargs = mock_cc.virtual_machines.begin_create_or_update.call_args[0][2]
        assert "disk_size_gb" not in call_kwargs["storage_profile"]["os_disk"]
        assert call_kwargs["storage_profile"]["os_disk"]["delete_option"] == "Delete"

    def test_tags_include_team_id_and_cluster_name(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch(
                "transformerlab.compute_providers.azure.asyncio.run",
                return_value="ssh-ed25519 AAAA",
            ),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        call_kwargs = mock_cc.virtual_machines.begin_create_or_update.call_args[0][2]
        tags = call_kwargs["tags"]
        assert tags["transformerlab-team-id"] == "abc"
        assert tags["transformerlab-cluster-name"] == "my-cluster"
        assert call_kwargs["identity"]["type"] == "SystemAssigned"
        assert call_kwargs["network_profile"]["network_interfaces"][0]["delete_option"] == "Delete"

    def test_gpu_launch_falls_back_to_secondary_image(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        mock_cc.virtual_machines.begin_create_or_update.side_effect = [
            Exception("PlatformImageNotFound"),
            MagicMock(result=MagicMock(return_value=MagicMock(id="vm-id", name="my-cluster"))),
        ]
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch("transformerlab.compute_providers.azure.asyncio.run", return_value="ssh-ed25519 AAAA"),
        ):
            result = provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", accelerators="T4:1"))
        assert result["request_id"] == "my-cluster"
        assert mock_cc.virtual_machines.begin_create_or_update.call_count == 2

    def test_assigns_vm_self_delete_role_after_launch(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role") as mock_ensure_role,
            patch("transformerlab.compute_providers.azure.asyncio.run", return_value="ssh-ed25519 AAAA"),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        vm = mock_cc.virtual_machines.begin_create_or_update.return_value.result.return_value
        mock_ensure_role.assert_called_once_with(vm)

    def test_spot_params_set_when_use_spot(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch("transformerlab.compute_providers.azure.asyncio.run", return_value="ssh-ed25519 AAAA"),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py", use_spot=True))
        vm_params = mock_cc.virtual_machines.begin_create_or_update.call_args[0][2]
        assert vm_params["priority"] == "Spot"
        assert vm_params["eviction_policy"] == "Delete"
        assert vm_params["billing_profile"] == {"max_price": -1.0}

    def test_no_spot_params_when_on_demand(self, provider):
        mock_cc, mock_nc, mock_rc = self._make_mock_clients()
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch.object(provider, "_get_resource_client", return_value=mock_rc),
            patch.object(provider, "_ensure_vm_self_delete_role"),
            patch("transformerlab.compute_providers.azure.asyncio.run", return_value="ssh-ed25519 AAAA"),
        ):
            provider.launch_cluster("my-cluster", ClusterConfig(run="train.py"))
        vm_params = mock_cc.virtual_machines.begin_create_or_update.call_args[0][2]
        assert "priority" not in vm_params


class TestBuildUserData:
    def test_includes_run_command_and_setup(self):
        config = ClusterConfig(
            setup="echo setup",
            run="python train.py --epochs 1",
            env_vars={"FOO": "bar"},
        )
        script = AzureProvider._build_user_data(config)
        assert "set -eo pipefail" in script
        assert "add-apt-repository -y ppa:deadsnakes/ppa" in script
        assert "python3.11 -m venv /opt/transformerlab-venv" in script
        assert "curl -LsSf https://astral.sh/uv/install.sh | sh" in script
        assert "trap _tfl_self_terminate EXIT" in script
        assert "metadata/identity/oauth2/token" in script
        assert "providers/Microsoft.Compute/virtualMachines" in script
        assert 'export FOO="bar"' in script
        assert "echo setup" in script
        assert "(python train.py --epochs 1) 2>&1 | tee /workspace/run_logs.txt" in script
        assert "command -v python3.11" in script

    def test_defaults_run_command_to_true(self):
        script = AzureProvider._build_user_data(ClusterConfig())
        assert "(true) 2>&1 | tee /workspace/run_logs.txt" in script


class TestStopCluster:
    def test_deletes_vm_nic_and_pip(self, provider):
        mock_cc = MagicMock()
        mock_nc = MagicMock()
        mock_cc.virtual_machines.begin_delete.return_value = MagicMock(result=MagicMock(return_value=None))
        mock_nc.network_interfaces.begin_delete.return_value = MagicMock(result=MagicMock(return_value=None))
        mock_nc.public_ip_addresses.begin_delete.return_value = MagicMock(result=MagicMock(return_value=None))
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
        ):
            result = provider.stop_cluster("my-cluster")
        mock_cc.virtual_machines.begin_delete.assert_called_once_with("transformerlab-abc", "my-cluster")
        mock_nc.network_interfaces.begin_delete.assert_called_once_with(
            "transformerlab-abc", "transformerlab-nic-my-cluster"
        )
        mock_nc.public_ip_addresses.begin_delete.assert_called_once_with(
            "transformerlab-abc", "transformerlab-pip-my-cluster"
        )
        assert result["status"] == "success"

    def test_returns_error_when_vm_delete_fails(self, provider):
        mock_cc = MagicMock()
        mock_nc = MagicMock()
        mock_cc.virtual_machines.begin_delete.side_effect = Exception("VM not found")
        with (
            patch.object(provider, "_get_compute_client", return_value=mock_cc),
            patch.object(provider, "_get_network_client", return_value=mock_nc),
        ):
            result = provider.stop_cluster("my-cluster")
        assert result["status"] == "error"


class TestImageReferences:
    def test_gpu_images_prefer_ubuntu_2204_with_dsvm_fallback(self, provider):
        images = provider._get_image_references(ClusterConfig(accelerators="T4:1"))
        assert images[0]["publisher"] == "Canonical"
        assert images[0]["sku"] == "22_04-lts-gen2"
        assert images[1]["publisher"] == "microsoft-dsvm"

    def test_cpu_images_use_jammy(self, provider):
        images = provider._get_image_references(ClusterConfig())
        assert len(images) == 1
        assert images[0]["publisher"] == "Canonical"
        assert images[0]["sku"] == "22_04-lts"


class TestGetClusterStatus:
    def _make_running_vm(self):
        vm = MagicMock()
        vm.provisioning_state = "Succeeded"
        vm.instance_view = MagicMock()
        status = MagicMock()
        status.code = "PowerState/running"
        vm.instance_view.statuses = [status]
        return vm

    def test_maps_running_to_up(self, provider):
        mock_cc = MagicMock()
        mock_cc.virtual_machines.get.return_value = self._make_running_vm()
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.UP

    def test_maps_deallocated_to_down(self, provider):
        mock_cc = MagicMock()
        vm = MagicMock()
        vm.provisioning_state = "Succeeded"
        vm.instance_view = MagicMock()
        s = MagicMock()
        s.code = "PowerState/deallocated"
        vm.instance_view.statuses = [s]
        mock_cc.virtual_machines.get.return_value = vm
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.DOWN

    def test_maps_stopping_to_stopped(self, provider):
        mock_cc = MagicMock()
        vm = MagicMock()
        vm.provisioning_state = "Succeeded"
        vm.instance_view = MagicMock()
        s = MagicMock()
        s.code = "PowerState/stopping"
        vm.instance_view.statuses = [s]
        mock_cc.virtual_machines.get.return_value = vm
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.STOPPED

    def test_returns_unknown_when_not_found(self, provider):
        mock_cc = MagicMock()
        mock_cc.virtual_machines.get.side_effect = Exception("ResourceNotFound")
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            status = provider.get_cluster_status("my-cluster")
        assert status.state == ClusterState.UNKNOWN
        assert status.status_message == "ResourceNotFound"


class TestGetJobLogs:
    def test_returns_log_content_via_ssh(self, provider):
        mock_nc = MagicMock()
        mock_nc.public_ip_addresses.get.return_value = MagicMock(ip_address="1.2.3.4")
        with (
            patch.object(provider, "_get_network_client", return_value=mock_nc),
            patch("transformerlab.compute_providers.azure.asyncio.run", return_value=b"PRIVATE_KEY"),
            patch("transformerlab.compute_providers.azure._ssh_read_file", return_value="training loss: 0.5"),
        ):
            logs = provider.get_job_logs("my-cluster", "job-1")
        assert "training loss" in logs

    def test_returns_message_when_no_public_ip(self, provider):
        mock_nc = MagicMock()
        mock_nc.public_ip_addresses.get.return_value = MagicMock(ip_address=None)
        with patch.object(provider, "_get_network_client", return_value=mock_nc):
            logs = provider.get_job_logs("my-cluster", "job-1")
        assert "starting" in logs.lower()

    def test_returns_message_when_pip_not_found(self, provider):
        mock_nc = MagicMock()
        mock_nc.public_ip_addresses.get.side_effect = Exception("ResourceNotFound")
        with patch.object(provider, "_get_network_client", return_value=mock_nc):
            logs = provider.get_job_logs("my-cluster", "job-1")
        assert "not found" in logs.lower()


class TestListClusters:
    def test_returns_cluster_statuses_for_team(self, provider):
        mock_cc = MagicMock()
        vm = MagicMock()
        vm.name = "my-cluster"
        vm.id = "/subscriptions/sub/vms/my-cluster"
        vm.tags = {"transformerlab-team-id": "abc", "transformerlab-cluster-name": "my-cluster"}
        vm.provisioning_state = "Succeeded"
        vm_detail = MagicMock()
        vm_detail.provisioning_state = "Succeeded"
        vm_detail.hardware_profile = MagicMock(vm_size="Standard_NC4as_T4_v3")
        status = MagicMock()
        status.code = "PowerState/running"
        vm_detail.instance_view = MagicMock(statuses=[status])
        mock_cc.virtual_machines.list.return_value = iter([vm])
        mock_cc.virtual_machines.get.return_value = vm_detail
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            clusters = provider.list_clusters()
        assert len(clusters) == 1
        assert clusters[0].cluster_name == "my-cluster"
        assert clusters[0].state == ClusterState.UP

    def test_filters_out_other_team_vms(self, provider):
        mock_cc = MagicMock()
        vm = MagicMock()
        vm.name = "other-cluster"
        vm.tags = {"transformerlab-team-id": "other-team", "transformerlab-cluster-name": "other-cluster"}
        mock_cc.virtual_machines.list.return_value = iter([vm])
        with patch.object(provider, "_get_compute_client", return_value=mock_cc):
            clusters = provider.list_clusters()
        assert len(clusters) == 0


def test_factory_creates_azure_provider():
    config = ComputeProviderConfig(
        type="azure",
        name="my-azure",
        azure_subscription_id="sub-123",
        azure_tenant_id="tenant-456",
        azure_client_id="client-789",
        azure_client_secret="secret",
        azure_location="eastus",
        azure_resource_group="transformerlab-abc",
        team_id="abc",
    )
    provider = create_compute_provider(config)
    assert isinstance(provider, AzureProvider)
    assert provider.location == "eastus"
    assert provider.team_id == "abc"


def test_factory_raises_without_subscription_id():
    config = ComputeProviderConfig(
        type="azure",
        name="my-azure",
        azure_tenant_id="tenant",
        azure_client_id="client",
        azure_client_secret="secret",
        team_id="abc",
    )
    with pytest.raises(ValueError, match="subscription_id"):
        create_compute_provider(config)
