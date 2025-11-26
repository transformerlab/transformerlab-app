"""Provider router for managing and routing to provider instances."""

import asyncio
from typing import Dict, Optional
from .base import Provider
from .config import load_providers_config, create_provider, ProviderConfig


class ProviderRouter:
    """Router that manages provider instances and routes requests."""

    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize the provider router.

        Note: YAML config file is optional. Providers can be loaded from
        the database via the providers API router, or added manually via add_provider().

        Args:
            config_path: Path to providers config file. If None, uses default.
                        If file doesn't exist, router starts with no providers.
        """
        self._providers: Dict[str, Provider] = {}
        self._configs: Dict[str, ProviderConfig] = {}
        self._provider_errors: Dict[str, str] = {}
        self._load_providers(config_path)

    def _load_providers(self, config_path: Optional[str] = None):
        """Load providers from configuration. YAML file is optional."""
        try:
            configs = load_providers_config(config_path)
            self._configs = configs

            for name, config in configs.items():
                try:
                    provider = create_provider(config)
                    self._providers[name] = provider
                except Exception as e:
                    print(f"Warning: Failed to create provider '{name}': {e}")
                    # Store the error for better error messages later
                    self._provider_errors[name] = str(e)
        except Exception as e:
            # If YAML loading fails, just continue with empty providers
            # Providers can be added manually via add_provider() or loaded from database
            print(f"Note: No providers.yaml file found or error loading it: {e}")
            self._configs = {}

    def get_provider(self, provider_name: str) -> Provider:
        """
        Get a provider instance by name.
        First checks the database, then falls back to YAML config.

        Args:
            provider_name: Name of the provider

        Returns:
            Provider instance

        Raises:
            ValueError: If provider not found
        """
        # First check if already loaded
        if provider_name in self._providers:
            return self._providers[provider_name]

        # Try to load from database first
        try:
            provider = _try_load_from_database(provider_name)
            if provider:
                self._providers[provider_name] = provider
                return provider
        except Exception:
            # Database lookup failed, continue to YAML fallback
            pass

        # Fall back to YAML config
        if provider_name not in self._providers:
            # Check if provider exists in config but failed to initialize
            if provider_name in self._configs:
                error_msg = self._provider_errors.get(provider_name, "Unknown error during initialization")
                raise ValueError(
                    f"Provider '{provider_name}' is configured but failed to initialize: {error_msg}\n"
                    f"Available providers: {list(self._providers.keys())}"
                )
            else:
                raise ValueError(
                    f"Provider '{provider_name}' not found. Available providers: {list(self._providers.keys())}"
                )
        return self._providers[provider_name]

    def list_providers(self) -> list[str]:
        """List all available provider names."""
        return list(self._providers.keys())

    def reload(self, config_path: Optional[str] = None):
        """Reload providers from configuration."""
        self._providers.clear()
        self._configs.clear()
        self._provider_errors.clear()
        self._load_providers(config_path)

    def add_provider(self, name: str, provider: Provider):
        """
        Manually add a provider instance.

        Args:
            name: Provider name
            provider: Provider instance
        """
        self._providers[name] = provider


# Global router instance
_global_router: Optional[ProviderRouter] = None


def _try_load_from_database(provider_name: str) -> Optional[Provider]:
    """
    Try to load a provider from the database by name.
    This is a helper function that attempts async database access from sync context.

    Args:
        provider_name: Name of the provider to load

    Returns:
        Provider instance if found, None otherwise
    """
    try:
        # Import here to avoid circular dependencies
        from transformerlab.db.session import async_session
        from transformerlab.services.provider_service import (
            get_provider_instance,
        )
        from sqlalchemy import select
        from transformerlab.shared.models.models import TeamComputeProvider

        # Try to get an async session and query the database
        async def _async_load():
            try:
                async with async_session() as session:
                    # Search for provider by name across all teams
                    # Note: In a real scenario, you might want to filter by team_id
                    stmt = select(TeamComputeProvider).where(TeamComputeProvider.name == provider_name)
                    result = await session.execute(stmt)
                    provider_record = result.scalar_one_or_none()

                    if provider_record:
                        return get_provider_instance(provider_record)
                    return None
            except Exception:
                return None

        # Try to run the async function
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # We're in an async context, can't use asyncio.run()
                # Return None and let caller fall back to YAML
                return None
            else:
                return asyncio.run(_async_load())
        except RuntimeError:
            # No event loop, create one
            return asyncio.run(_async_load())
    except Exception:
        # Database access failed, return None to fall back to YAML
        return None


def get_provider(provider_name: str, config_path: Optional[str] = None) -> Provider:
    """
    Get a provider instance (convenience function using global router).

    Args:
        provider_name: Name of the provider
        config_path: Optional config path (only used on first call)

    Returns:
        Provider instance
    """
    global _global_router
    if _global_router is None:
        _global_router = ProviderRouter(config_path)
    return _global_router.get_provider(provider_name)


def get_router(config_path: Optional[str] = None) -> ProviderRouter:
    """
    Get the global router instance.

    Args:
        config_path: Optional config path (only used on first call)

    Returns:
        ProviderRouter instance
    """
    global _global_router
    if _global_router is None:
        _global_router = ProviderRouter(config_path)
    return _global_router
