"""Configuration loading and provider factory."""

import os
import yaml
import json
from typing import Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, Field


class ComputeProviderConfig(BaseModel):
    """Configuration for a single compute provider."""

    type: str  # "skypilot", "slurm", or "runpod"
    name: str  # Provider name/identifier

    # SkyPilot-specific config
    server_url: Optional[str] = None
    api_token: Optional[str] = None
    default_env_vars: Dict[str, str] = Field(default_factory=dict)
    default_entrypoint_command: Optional[str] = None

    # SLURM-specific config
    mode: Optional[str] = None  # "rest" or "ssh"
    rest_url: Optional[str] = None
    ssh_host: Optional[str] = None
    ssh_user: Optional[str] = None
    ssh_key_path: Optional[str] = None
    ssh_port: int = 22

    # Runpod-specific config
    api_key: Optional[str] = None  # Runpod API key (sensitive)
    api_base_url: Optional[str] = None  # Defaults to https://rest.runpod.io/v1
    default_gpu_type: Optional[str] = None  # Default GPU type (e.g., "RTX 3090", "A100")
    default_region: Optional[str] = None  # Default region
    default_template_id: Optional[str] = None  # Default Docker template ID
    default_network_volume_id: Optional[str] = None  # Default network volume ID

    # Additional provider-specific config
    extra_config: Dict[str, Any] = Field(default_factory=dict)


def load_compute_providers_config(
    config_path: Optional[str] = None,
) -> Dict[str, ComputeProviderConfig]:
    """
    Load compute provider configurations from YAML or JSON file.

    Note: YAML file is optional. If not found, returns empty dict.
    Compute providers are typically loaded from the database via the compute_provider router.

    Args:
        config_path: Path to config file. If None, uses default location
                    or PROVIDERS_CONFIG_PATH env var.

    Returns:
        Dictionary mapping provider names to ComputeProviderConfig objects.
        Returns empty dict if file doesn't exist.
    """
    if config_path is None:
        # Check environment variable first
        env_path = os.getenv("PROVIDERS_CONFIG_PATH")
        if env_path:
            config_path = env_path
        else:
            # Try to find the config file in multiple locations
            current_file = Path(__file__).resolve()

            # 1. Check in the same directory as this file (installed package)
            package_config = current_file.parent / "providers.yaml"

            # 2. Check in source directory (when running from repo)
            # Go up from src/lattice/compute_providers/config.py to find repo root
            # Then look for src/lattice/compute_providers/compute_providers.yaml
            source_config = None
            for parent in [
                current_file.parent.parent.parent.parent,
                current_file.parent.parent.parent.parent.parent,
            ]:
                potential = parent / "src" / "lattice" / "providers" / "providers.yaml"
                if potential.exists():
                    source_config = potential
                    break

            # Prefer source config if it exists (for development)
            if source_config and source_config.exists():
                config_path = str(source_config)
            elif package_config.exists():
                config_path = str(package_config)
            else:
                # Default to package directory location
                config_path = str(package_config)

    config_path = Path(config_path).expanduser().resolve()

    if not config_path.exists():
        # YAML file is optional - return empty dict if not found
        # Providers can be loaded from database instead
        return {}

    with open(config_path, "r") as f:
        if config_path.suffix in [".yaml", ".yml"]:
            config_data = yaml.safe_load(f)
        elif config_path.suffix == ".json":
            config_data = json.load(f)
        else:
            raise ValueError(f"Unsupported config file format: {config_path.suffix}")

    providers = {}
    providers_data = config_data.get("providers", {})

    for name, provider_data in providers_data.items():
        provider_data["name"] = name
        providers[name] = ComputeProviderConfig(**provider_data)

    return providers


def create_compute_provider(config: ComputeProviderConfig):
    """
    Factory function to create a compute provider instance from config.

    Args:
        config: ComputeProviderConfig object

    Returns:
        ComputeProvider instance
    """
    if config.type == "skypilot":
        from .skypilot import SkyPilotProvider

        if not config.server_url:
            raise ValueError("SkyPilot provider requires server_url in config")
        return SkyPilotProvider(
            server_url=config.server_url,
            api_token=config.api_token,
            default_env_vars=config.default_env_vars,
            default_entrypoint_command=config.default_entrypoint_command,
            extra_config=config.extra_config,
        )
    elif config.type == "slurm":
        from .slurm import SLURMProvider

        if config.mode == "rest":
            if not config.rest_url:
                raise ValueError("SLURM provider in REST mode requires rest_url in config")
            return SLURMProvider(
                mode="rest",
                rest_url=config.rest_url,
                api_token=config.api_token,
                extra_config=config.extra_config,
            )
        elif config.mode == "ssh":
            if not config.ssh_host:
                raise ValueError("SLURM provider in SSH mode requires ssh_host in config")
            return SLURMProvider(
                mode="ssh",
                ssh_host=config.ssh_host,
                ssh_user=config.ssh_user or os.getenv("USER", "root"),
                ssh_key_path=config.ssh_key_path,
                ssh_port=config.ssh_port,
                extra_config=config.extra_config,
            )
        else:
            raise ValueError(f"SLURM provider mode must be 'rest' or 'ssh', got: {config.mode}")
    elif config.type == "runpod":
        from .runpod import RunpodProvider

        if not config.api_key:
            raise ValueError("Runpod provider requires api_key in config")
        return RunpodProvider(
            api_key=config.api_key,
            api_base_url=config.api_base_url,
            default_gpu_type=config.default_gpu_type,
            default_region=config.default_region,
            default_template_id=config.default_template_id,
            default_network_volume_id=config.default_network_volume_id,
            extra_config=config.extra_config,
        )
    elif config.type == "local":
        from .local import LocalProvider

        return LocalProvider(extra_config=config.extra_config)
    else:
        raise ValueError(f"Unknown provider type: {config.type}")
