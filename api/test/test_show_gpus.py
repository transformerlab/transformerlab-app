"""Tests for each compute provider's show_gpus() method.

Catalog-only providers (AWS/Azure/GCP/Nebius) read a static module map and
ignore ``self``, so they're exercised as unbound methods with a stub self. Live
providers are constructed minimally and have their HTTP/exec helper mocked to
assert both the live-parse path and the catalog/empty fallback. show_gpus() must
never raise — failures degrade to the catalog (or an empty list).
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from transformerlab.compute_providers.base import gpu_catalog_from_map_keys
from transformerlab.compute_providers.models import GpuInfo
from transformerlab.compute_providers.aws import AWSProvider, _GPU_INSTANCE_MAP
from transformerlab.compute_providers.azure import AzureProvider, _GPU_VM_SIZE_MAP
from transformerlab.compute_providers.gcp import GCPProvider, _ATTACHED_GPU_MAP, _ACCELERATOR_MACHINE_MAP
from transformerlab.compute_providers.nebius import NebiusProvider, _GPU_PLATFORM_PRESET_MAP
from transformerlab.compute_providers.local import LocalProvider
from transformerlab.compute_providers.runpod import RunpodProvider, _RUNPOD_GPU_NAME_MAP
from transformerlab.compute_providers.lambda_labs import LambdaProvider, _GPU_INSTANCE_TYPE_MAP
from transformerlab.compute_providers.vastai import VastAIProvider
from transformerlab.compute_providers.slurm import SLURMProvider

# SkyPilot is an optional dependency: skypilot.py raises ImportError at import time
# when the `sky` SDK isn't installed (e.g. the build CI job). Guard the import so
# the rest of this module still collects, and skip the SkyPilot-specific tests.
try:
    from transformerlab.compute_providers.skypilot import SkyPilotProvider

    SKYPILOT_AVAILABLE = True
except ImportError:
    SkyPilotProvider = None  # type: ignore[assignment,misc]
    SKYPILOT_AVAILABLE = False

requires_skypilot = pytest.mark.skipif(not SKYPILOT_AVAILABLE, reason="sky SDK not installed")


def _names(gpus):
    return {g.gpu for g in gpus}


def _by_name(gpus):
    return {g.gpu: g.count for g in gpus}


# ---------------------------------------------------------------------------
# Shared catalog helper
# ---------------------------------------------------------------------------


def test_gpu_catalog_from_map_keys_collapses_to_max_count():
    keys = [("A100", 1), ("A100", 8), ("T4", 4)]
    result = gpu_catalog_from_map_keys(keys)
    assert all(isinstance(g, GpuInfo) for g in result)
    assert _by_name(result) == {"A100": 8, "T4": 4}
    # Sorted by GPU name for stable output.
    assert [g.gpu for g in result] == ["A100", "T4"]


# ---------------------------------------------------------------------------
# Catalog-only providers (self is unused)
# ---------------------------------------------------------------------------


def test_aws_show_gpus_is_catalog():
    gpus = AWSProvider.show_gpus(None)
    assert _by_name(gpus) == _by_name(gpu_catalog_from_map_keys(_GPU_INSTANCE_MAP.keys()))
    assert "A100" in _names(gpus) and "H100" in _names(gpus)


def test_azure_show_gpus_is_catalog():
    gpus = AzureProvider.show_gpus(None)
    assert _by_name(gpus) == _by_name(gpu_catalog_from_map_keys(_GPU_VM_SIZE_MAP.keys()))


def test_gcp_show_gpus_merges_both_maps():
    gpus = GCPProvider.show_gpus(None)
    expected = gpu_catalog_from_map_keys([*_ATTACHED_GPU_MAP.keys(), *_ACCELERATOR_MACHINE_MAP.keys()])
    assert _by_name(gpus) == _by_name(expected)
    # A100 comes from the accelerator-optimized map (max count 8).
    assert _by_name(gpus)["A100"] == 8


def test_nebius_show_gpus_is_catalog():
    gpus = NebiusProvider.show_gpus(None)
    assert _by_name(gpus) == _by_name(gpu_catalog_from_map_keys(_GPU_PLATFORM_PRESET_MAP.keys()))


# ---------------------------------------------------------------------------
# Local
# ---------------------------------------------------------------------------


def test_local_show_gpus_aggregates_config_gpus():
    cfg = {"gpu": [{"name": "NVIDIA A100"}, {"name": "NVIDIA A100"}, {"name": "cpu"}, {"name": "NVIDIA H100"}]}
    with patch("transformerlab.compute_providers.local._read_local_provider_config", return_value=cfg):
        gpus = LocalProvider().show_gpus()
    assert _by_name(gpus) == {"NVIDIA A100": 2, "NVIDIA H100": 1}


def test_local_show_gpus_empty_without_config():
    with patch("transformerlab.compute_providers.local._read_local_provider_config", return_value=None):
        assert LocalProvider().show_gpus() == []


# ---------------------------------------------------------------------------
# Runpod (live /gpu-types -> catalog fallback)
# ---------------------------------------------------------------------------


def test_runpod_show_gpus_live():
    provider = RunpodProvider(api_key="k")
    resp = MagicMock()
    resp.json.return_value = [
        {"id": "NVIDIA A100", "displayName": "A100", "maxGpuCount": 8},
        {"id": "NVIDIA H100", "displayName": "H100", "maxGpuCount": 4},
    ]
    with patch.object(provider, "_make_request", return_value=resp):
        gpus = provider.show_gpus()
    assert _by_name(gpus) == {"A100": 8, "H100": 4}


def test_runpod_show_gpus_falls_back_to_catalog():
    provider = RunpodProvider(api_key="k")
    with patch.object(provider, "_make_request", side_effect=RuntimeError("boom")):
        gpus = provider.show_gpus()
    assert _names(gpus) == set(_RUNPOD_GPU_NAME_MAP.keys())
    assert all(g.count == 1 for g in gpus)


# ---------------------------------------------------------------------------
# Lambda (live capacity -> catalog fallback)
# ---------------------------------------------------------------------------


def test_lambda_show_gpus_live_only_reports_available():
    provider = LambdaProvider(api_key="k", team_id="t")
    resp = MagicMock()
    resp.json.return_value = {
        "data": {
            "gpu_1x_a10": {"regions_with_capacity_available": [{"name": "us-west-1"}]},
            "gpu_8x_a100": {"regions_with_capacity_available": []},  # no capacity -> excluded
        }
    }
    with patch.object(provider, "_make_request", return_value=resp):
        gpus = provider.show_gpus()
    # gpu_1x_a10 -> ("A10", 1); the empty-capacity A100 entry is dropped.
    assert _by_name(gpus) == {"A10": 1}


def test_lambda_show_gpus_falls_back_to_catalog_on_error():
    provider = LambdaProvider(api_key="k", team_id="t")
    with patch.object(provider, "_make_request", side_effect=RuntimeError("boom")):
        gpus = provider.show_gpus()
    assert _by_name(gpus) == _by_name(gpu_catalog_from_map_keys(_GPU_INSTANCE_TYPE_MAP.keys()))


def test_lambda_show_gpus_falls_back_when_no_capacity_anywhere():
    provider = LambdaProvider(api_key="k", team_id="t")
    resp = MagicMock()
    resp.json.return_value = {"data": {"gpu_1x_a10": {"regions_with_capacity_available": []}}}
    with patch.object(provider, "_make_request", return_value=resp):
        gpus = provider.show_gpus()
    # Nothing available live -> show the full catalog instead of an empty list.
    assert _by_name(gpus) == _by_name(gpu_catalog_from_map_keys(_GPU_INSTANCE_TYPE_MAP.keys()))


# ---------------------------------------------------------------------------
# Vast.ai (live offers -> empty when none)
# ---------------------------------------------------------------------------


def test_vastai_show_gpus_aggregates_max_count_per_type():
    provider = VastAIProvider(api_key="k")
    resp = MagicMock()
    resp.json.return_value = {
        "offers": [
            {"gpu_name": "RTX_4090", "num_gpus": 1},
            {"gpu_name": "RTX_4090", "num_gpus": 4},
            {"gpu_name": "A100", "num_gpus": 8},
            {"gpu_name": "A100", "num_gpus": 0},  # ignored
        ]
    }
    with patch.object(provider, "_make_request", return_value=resp):
        gpus = provider.show_gpus()
    assert _by_name(gpus) == {"RTX_4090": 4, "A100": 8}


def test_vastai_show_gpus_empty_on_error():
    provider = VastAIProvider(api_key="k")
    with patch.object(provider, "_make_request", side_effect=RuntimeError("boom")):
        assert provider.show_gpus() == []


# ---------------------------------------------------------------------------
# SLURM (aggregate free GPUs across nodes; self only used for one helper)
# ---------------------------------------------------------------------------


def test_slurm_show_gpus_sums_free_across_nodes():
    nodes = [
        {"gpus": {"A100": 8}, "gpus_free": {"A100": 5}},
        {"gpus": {"A100": 8}, "gpus_free": {"A100": 2}},
        {"gpus": {"H100": 4}, "gpus_free": {}},  # free unknown -> fall back to total
    ]
    stub = SimpleNamespace(_get_slurm_nodes_detailed=lambda: nodes)
    gpus = SLURMProvider.show_gpus(stub)
    assert _by_name(gpus) == {"A100": 7, "H100": 4}


def test_slurm_show_gpus_empty_on_error():
    def _raise():
        raise RuntimeError("no slurm")

    stub = SimpleNamespace(_get_slurm_nodes_detailed=_raise)
    assert SLURMProvider.show_gpus(stub) == []


# ---------------------------------------------------------------------------
# SkyPilot (server /list_accelerators -> [] on failure)
# ---------------------------------------------------------------------------


@requires_skypilot
def test_skypilot_show_gpus_parses_accelerator_dict():
    info_a100 = SimpleNamespace(accelerator_name="A100", accelerator_count=8)
    info_a100_small = SimpleNamespace(accelerator_name="A100", accelerator_count=1)
    info_h100 = SimpleNamespace(accelerator_name="H100", accelerator_count=4)
    result = {"A100": [info_a100_small, info_a100], "H100": [info_h100]}

    stub = SimpleNamespace(
        _server_common=SimpleNamespace(get_request_id=lambda resp: "rid"),
        _make_authenticated_request=MagicMock(return_value=MagicMock()),
        _get_request_result=lambda rid: result,
    )
    gpus = SkyPilotProvider.show_gpus(stub)
    assert _by_name(gpus) == {"A100": 8, "H100": 4}


@requires_skypilot
def test_skypilot_show_gpus_empty_on_error():
    stub = SimpleNamespace(
        _server_common=SimpleNamespace(get_request_id=lambda resp: "rid"),
        _make_authenticated_request=MagicMock(side_effect=RuntimeError("down")),
        _get_request_result=lambda rid: {},
    )
    assert SkyPilotProvider.show_gpus(stub) == []
