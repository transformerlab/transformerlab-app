"""Shared spot-instance resolution utilities."""

from transformerlab.compute_providers.base import SPOT_CAPABLE_PROVIDER_TYPES


def resolve_use_spot(provider_type: str, provider_config: dict | None, request_config: dict | None) -> bool:
    """Resolve whether to launch on spot for any spot-capable provider.

    An explicit per-job value (request_config["use_spot"], True or False)
    overrides the provider-level default (provider_config["use_spot"]). When
    the request omits the key (or passes None), the provider default applies.
    Returns False for providers that don't support spot.
    """
    if provider_type not in SPOT_CAPABLE_PROVIDER_TYPES:
        return False
    request_value = (request_config or {}).get("use_spot")
    if request_value is not None:
        return request_value is True
    return (provider_config or {}).get("use_spot", False) is True
