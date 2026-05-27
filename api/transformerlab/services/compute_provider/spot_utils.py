"""Shared spot-instance resolution utilities."""

from transformerlab.compute_providers.base import SPOT_CAPABLE_PROVIDER_TYPES


def _resolve_use_spot(provider_type: str, provider_config: dict | None, request_config: dict | None) -> bool:
    """Resolve whether to launch on spot for any spot-capable provider.

    Provider-level default (provider_config["use_spot"]) is overridden by a
    per-job override (request_config["use_spot"]). Returns False for providers
    that don't support spot.
    """
    if provider_type not in SPOT_CAPABLE_PROVIDER_TYPES:
        return False
    use_spot = (provider_config or {}).get("use_spot", False) is True
    if request_config and request_config.get("use_spot"):
        use_spot = True
    return use_spot
