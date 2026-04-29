"""Tests for the Azure compute provider."""

from transformerlab.shared.models.models import ProviderType
from transformerlab.schemas.compute_providers import ProviderConfigBase, mask_sensitive_config


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


import pytest
from transformerlab.compute_providers.azure import _resolve_gpu_vm_size, _resolve_cpu_vm_size


class TestResolveGpuVmSize:
    def test_t4_single(self):
        assert _resolve_gpu_vm_size("T4:1") == "Standard_NC4as_T4_v3"

    def test_t4_four(self):
        assert _resolve_gpu_vm_size("T4:4") == "Standard_NC16as_T4_v3"

    def test_a100_eight(self):
        assert _resolve_gpu_vm_size("A100:8") == "Standard_ND96asr_v4"

    def test_h100_eight(self):
        assert _resolve_gpu_vm_size("H100:8") == "Standard_ND96isr_H100_v5"

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
