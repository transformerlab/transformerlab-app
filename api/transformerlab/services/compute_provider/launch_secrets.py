"""Template launch: detect missing secret placeholders."""

from typing import Any, Dict, Set

from transformerlab.schemas.compute_providers import ProviderTemplateLaunchRequest
from transformerlab.shared.secret_utils import extract_secret_names_from_data


def find_missing_secrets_for_template_launch(
    request: ProviderTemplateLaunchRequest, secrets: Dict[str, Any]
) -> Set[str]:
    """Return secret names referenced by the launch request that are not in `secrets`."""
    referenced: set[str] = set()

    referenced.update(extract_secret_names_from_data(request.run))
    if request.setup:
        referenced.update(extract_secret_names_from_data(request.setup))
    if request.env_vars:
        referenced.update(extract_secret_names_from_data(request.env_vars))
    if request.parameters:
        referenced.update(extract_secret_names_from_data(request.parameters))
    if request.config:
        referenced.update(extract_secret_names_from_data(request.config))
    if request.sweep_config:
        referenced.update(extract_secret_names_from_data(request.sweep_config))

    if not referenced:
        return set()

    return {name for name in referenced if name not in secrets}
