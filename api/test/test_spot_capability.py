"""Tests for spot-instance capability surfacing."""

from types import SimpleNamespace

from transformerlab.compute_providers.base import SPOT_CAPABLE_PROVIDER_TYPES
from transformerlab.services.compute_provider.team_provider_endpoints import _provider_to_read
from transformerlab.shared.models.models import ProviderType


def test_spot_capable_set_contents():
    assert SPOT_CAPABLE_PROVIDER_TYPES == {
        ProviderType.SKYPILOT.value,
        ProviderType.NEBIUS.value,
        ProviderType.AWS.value,
        ProviderType.GCP.value,
        ProviderType.AZURE.value,
        ProviderType.DSTACK.value,
        ProviderType.RUNPOD.value,
    }
    assert ProviderType.VASTAI.value not in SPOT_CAPABLE_PROVIDER_TYPES
    assert ProviderType.SLURM.value not in SPOT_CAPABLE_PROVIDER_TYPES
    assert ProviderType.LOCAL.value not in SPOT_CAPABLE_PROVIDER_TYPES


def _fake_provider(provider_type: str):
    return SimpleNamespace(
        id="p1",
        team_id="t1",
        name="prov",
        type=provider_type,
        config={},
        created_by_user_id="u1",
        created_at=None,
        updated_at=None,
        disabled=False,
        is_default=False,
    )


def test_supports_spot_true_for_aws():
    read = _provider_to_read(_fake_provider(ProviderType.AWS.value))
    assert read.supports_spot is True


def test_supports_spot_false_for_vastai():
    read = _provider_to_read(_fake_provider(ProviderType.VASTAI.value))
    assert read.supports_spot is False


def test_resolve_use_spot_helper_for_non_skypilot():
    from transformerlab.services.compute_provider.launch_template import resolve_use_spot

    # provider default off, per-job override on -> True
    assert resolve_use_spot("aws", provider_config={}, request_config={"use_spot": True}) is True
    # provider default on, no override -> True
    assert resolve_use_spot("aws", provider_config={"use_spot": True}, request_config=None) is True
    # provider default on, explicit per-job opt-out -> False
    assert resolve_use_spot("aws", provider_config={"use_spot": True}, request_config={"use_spot": False}) is False
    # provider default on, request omits the key -> provider default applies
    assert resolve_use_spot("aws", provider_config={"use_spot": True}, request_config={}) is True
    # provider default on, request passes None -> treated as "not specified"
    assert resolve_use_spot("aws", provider_config={"use_spot": True}, request_config={"use_spot": None}) is True
    # capable provider, nothing set -> False
    assert resolve_use_spot("aws", provider_config={}, request_config={}) is False
    # NOT capable -> always False even if requested
    assert resolve_use_spot("vastai", provider_config={"use_spot": True}, request_config={"use_spot": True}) is False


def test_resolve_use_spot_recovers_persisted_value_on_resume():
    """Checkpoint-resume reuses the persisted cluster_config.use_spot through the same helper.

    Mirrors the call shape in resume_remote_job_from_checkpoint, which passes the
    original run's persisted use_spot as the per-job override.
    """
    from transformerlab.services.compute_provider.spot_utils import resolve_use_spot

    def recover(provider_type: str, provider_config: dict, persisted_cluster_config: dict) -> bool:
        return resolve_use_spot(
            provider_type,
            provider_config,
            {"use_spot": persisted_cluster_config.get("use_spot")},
        )

    # Original run used spot on a capable provider -> preserved on resume.
    assert recover("aws", {}, {"use_spot": True}) is True
    # Original run was on-demand -> stays on-demand.
    assert recover("aws", {}, {"use_spot": False}) is False
    # Original run was on-demand -> stays on-demand even if the provider default is spot.
    assert recover("aws", {"use_spot": True}, {"use_spot": False}) is False
    # Missing persisted value (older jobs) -> falls back to the provider default.
    assert recover("aws", {}, {}) is False
    assert recover("aws", {"use_spot": True}, {}) is True
    # Provider no longer spot-capable -> safely drops spot even if originally set.
    assert recover("vastai", {}, {"use_spot": True}) is False
