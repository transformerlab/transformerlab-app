"""Service layer for bridging database provider records to ProviderConfig."""

import asyncio
import logging
import os
import platform
import re
import sys
from typing import Any, List, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.db import team as db_team
from transformerlab.db import user as db_user
from transformerlab.db.session import async_session
from transformerlab.compute_providers.base import ComputeProvider
from transformerlab.compute_providers.config import ComputeProviderConfig, create_compute_provider
from transformerlab.compute_providers.local import _check_amd_gpu, _check_nvidia_gpu
from transformerlab.shared.models.models import AcceleratorType, ProviderType, TeamComputeProvider

logger = logging.getLogger(__name__)


def normalize_provider_check_result(check_result: Any) -> tuple[bool, str | None]:
    """Normalize provider.check() output to (status, reason).

    Providers' check() returns tuple[bool, str | None]; older callers may still
    receive a bare bool, so accept both shapes.
    """
    if isinstance(check_result, tuple) and len(check_result) == 2:
        is_active, reason = check_result
        return bool(is_active), str(reason) if reason else None
    return bool(check_result), None


def _short_identifier(value: str, max_len: int = 8) -> str:
    """Return a compact, stable identifier segment for names like AWS profiles."""
    normalized = re.sub(r"[^A-Za-z0-9_-]", "-", str(value).lower())
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    if not normalized:
        return "id"
    if len(normalized) <= max_len:
        return normalized
    return normalized[:max_len].rstrip("-") or normalized[:max_len]


def build_aws_profile_name(team_id: str, provider_identifier: str) -> str:
    """Generate a stable AWS profile name unique per org/provider."""
    short_team = _short_identifier(team_id)
    short_provider = _short_identifier(provider_identifier)
    return f"tlab-compute-{short_team}-{short_provider}"


def _local_providers_disabled() -> bool:
    """
    Return True when local providers are globally disabled.

    Controlled by DISABLE_LOCAL_PROVIDERS env var:
    - "true" (case-insensitive): no local provider creation (automatic or manual).
    - any other value (including unset): local providers are enabled.
    """
    return os.getenv("DISABLE_LOCAL_PROVIDERS", "").lower().strip() == "true"


async def validate_team_exists(session: AsyncSession, team_id: str) -> None:
    """
    Validate that a team exists in the database.

    Args:
        session: Database session
        team_id: Team ID to validate

    Raises:
        HTTPException: If team does not exist
    """
    team = await db_team.get_team_by_id(session, team_id)
    if not team:
        raise HTTPException(status_code=404, detail=f"Team with id '{team_id}' not found")


async def validate_user_exists(session: AsyncSession, user_id: str) -> None:
    """
    Validate that a user exists in the database.

    Args:
        session: Database session
        user_id: User ID to validate

    Raises:
        HTTPException: If user does not exist
    """
    user = await db_user.get_user_by_id(session, user_id)
    if not user:
        raise HTTPException(status_code=404, detail=f"User with id '{user_id}' not found")


async def validate_user_team_membership(session: AsyncSession, user_id: str, team_id: str) -> None:
    """
    Validate that a user is a member of the specified team.

    Args:
        session: Database session
        user_id: User ID to validate
        team_id: Team ID to validate membership for

    Raises:
        HTTPException: If user is not a member of the team
    """
    membership = await db_team.get_user_team_membership(session, user_id, team_id)
    if not membership:
        raise HTTPException(status_code=403, detail=f"User '{user_id}' is not a member of team '{team_id}'")


async def validate_provider_data(
    session: AsyncSession, team_id: str, created_by_user_id: str, validate_membership: bool = True
) -> None:
    """
    Validate all referential integrity constraints for provider creation.

    Args:
        session: Database session
        team_id: Team ID to validate
        created_by_user_id: User ID to validate
        validate_membership: Whether to validate user is a team member (default: True)

    Raises:
        HTTPException: If any validation fails
    """
    await validate_team_exists(session, team_id)
    await validate_user_exists(session, created_by_user_id)
    if validate_membership:
        await validate_user_team_membership(session, created_by_user_id, team_id)


async def get_provider_by_id(session: AsyncSession, provider_id: str) -> Optional[TeamComputeProvider]:
    """Get a provider record by ID only (without team filter)."""
    stmt = select(TeamComputeProvider).where(TeamComputeProvider.id == provider_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_team_provider(session: AsyncSession, team_id: str, provider_id: str) -> Optional[TeamComputeProvider]:
    """
    Get a provider record by ID, ensuring it belongs to the team.
    Explicitly validates team membership for security.
    """
    # First get the provider by ID
    provider = await get_provider_by_id(session, provider_id)
    if not provider:
        return None

    # Explicitly check team membership
    if provider.team_id != team_id:
        raise HTTPException(
            status_code=403, detail=f"Provider '{provider_id}' belongs to a different team. Access denied."
        )

    return provider


async def list_team_providers(session: AsyncSession, team_id: str) -> list[TeamComputeProvider]:
    """List all providers for a team."""
    stmt = (
        select(TeamComputeProvider)
        .where(TeamComputeProvider.team_id == team_id)
        .order_by(TeamComputeProvider.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def list_enabled_team_providers(session: AsyncSession, team_id: str) -> list[TeamComputeProvider]:
    """List only enabled (non-disabled) providers for a team."""
    stmt = (
        select(TeamComputeProvider)
        .where(TeamComputeProvider.team_id == team_id)
        .where(~TeamComputeProvider.disabled)
        .order_by(TeamComputeProvider.created_at.desc())
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


def detect_local_supported_accelerators() -> List[str]:
    """
    Detect accelerators available on the current machine for the local provider.

    Returns:
        List of AcceleratorType enum values (as strings) that are supported.
    """
    accelerators: List[str] = []

    # CPU is always available
    accelerators.append(AcceleratorType.CPU.value)

    # Apple Silicon detection (arm64 macOS)
    try:
        if sys.platform == "darwin":
            machine = platform.machine().lower()
            if machine in ("arm64", "aarch64"):
                accelerators.append(AcceleratorType.APPLE_SILICON.value)
    except Exception:
        # Best-effort detection; ignore failures
        pass

    # NVIDIA GPU detection
    try:
        if _check_nvidia_gpu():
            accelerators.append(AcceleratorType.NVIDIA.value)
    except Exception:
        pass

    # AMD GPU (ROCm) detection
    try:
        if _check_amd_gpu():
            accelerators.append(AcceleratorType.AMD.value)
    except Exception:
        pass

    # De-duplicate while preserving order
    seen = set()
    unique_accelerators: List[str] = []
    for acc in accelerators:
        if acc not in seen:
            seen.add(acc)
            unique_accelerators.append(acc)

    return unique_accelerators


def db_record_to_provider_config(
    record: TeamComputeProvider,
    user_slurm_user: Optional[str] = None,
    user_ssh_key_path: Optional[str] = None,
    user_sbatch_flags: Optional[str] = None,
) -> ComputeProviderConfig:
    """
    Convert a database TeamComputeProvider record to a ComputeProviderConfig object.

    Args:
        record: TeamComputeProvider database record
        user_slurm_user: Optional user-specific SLURM username to override provider's ssh_user
        user_ssh_key_path: Optional path to user's SSH private key (used for SLURM when user has uploaded a key)

    Returns:
        ComputeProviderConfig object ready for create_compute_provider()
    """
    config_dict = record.config or {}

    # Use user-specific slurm_user if provided, otherwise use provider's default
    ssh_user = user_slurm_user if user_slurm_user else config_dict.get("ssh_user")

    # Use user's key path when provided (user uploaded private key in Provider Settings); else provider config
    ssh_key_path = user_ssh_key_path if user_ssh_key_path else config_dict.get("ssh_key_path")

    # Build extra_config, merging in any user-specific settings that should flow through
    base_extra_config = config_dict.get("extra_config", {}) or {}
    extra_config: dict = dict(base_extra_config)
    if user_sbatch_flags:
        extra_config["user_sbatch_flags"] = user_sbatch_flags

    # Build ComputeProviderConfig from database record
    provider_config = ComputeProviderConfig(
        type=record.type,
        name=record.name,
        server_url=config_dict.get("server_url"),
        api_token=config_dict.get("api_token"),
        dstack_project=config_dict.get("dstack_project"),
        default_env_vars=config_dict.get("default_env_vars", {}),
        default_entrypoint_run=config_dict.get("default_entrypoint_run"),
        mode=config_dict.get("mode"),
        rest_url=config_dict.get("rest_url"),
        ssh_host=config_dict.get("ssh_host"),
        ssh_user=ssh_user,
        ssh_key_path=ssh_key_path,
        ssh_port=config_dict.get("ssh_port", 22),
        # Runpod-specific config
        api_key=config_dict.get("api_key"),
        api_base_url=config_dict.get("api_base_url"),
        default_gpu_type=config_dict.get("default_gpu_type"),
        default_region=config_dict.get("default_region"),
        default_template_id=config_dict.get("default_template_id"),
        default_network_volume_id=config_dict.get("default_network_volume_id"),
        supported_accelerators=config_dict.get("supported_accelerators"),
        aws_profile=config_dict.get("aws_profile"),
        region=config_dict.get("region"),
        project_id=config_dict.get("project_id"),
        zone=config_dict.get("zone"),
        credentials_path=config_dict.get("credentials_path"),
        service_account_json=config_dict.get("service_account_json"),
        service_account_email=config_dict.get("service_account_email"),
        lambda_file_system_names=config_dict.get("lambda_file_system_names"),
        nebius_profile=config_dict.get("nebius_profile"),
        nebius_config_path=config_dict.get("nebius_config_path"),
        parent_id=config_dict.get("parent_id"),
        subnet_id=config_dict.get("subnet_id"),
        default_platform=config_dict.get("default_platform"),
        default_preset=config_dict.get("default_preset"),
        boot_image_family=config_dict.get("boot_image_family"),
        disk_size_gib=config_dict.get("disk_size_gib"),
        extra_config=extra_config,
        # Azure-specific config
        azure_subscription_id=config_dict.get("azure_subscription_id"),
        azure_tenant_id=config_dict.get("azure_tenant_id"),
        azure_client_id=config_dict.get("azure_client_id"),
        azure_client_secret=config_dict.get("azure_client_secret"),
        azure_location=config_dict.get("azure_location"),
        azure_resource_group=config_dict.get("azure_resource_group"),
        # team_id: config value (or record fallback) for AWS/GCP/Azure/Nebius/Lambda; None otherwise.
        team_id=(
            config_dict.get("team_id") or record.team_id
            if record.type
            in {
                ProviderType.AWS.value,
                ProviderType.GCP.value,
                ProviderType.AZURE.value,
                ProviderType.NEBIUS.value,
                ProviderType.LAMBDA.value,
            }
            else None
        ),
    )
    # Local provider has no extra required config; workspace_dir is set at launch from get_workspace_dir()

    return provider_config


async def get_provider_instance(
    record: TeamComputeProvider,
    user_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> ComputeProvider:
    """
    Get an instantiated ComputeProvider from a database record.

    When user_id and team_id are provided and the provider is SLURM, looks up
    the user's SLURM username from config (User Settings → Provider Settings)
    and uses it instead of the provider's default ssh_user.

    When user_id and team_id are provided and the provider is SLURM (SSH mode),
    uses the user's uploaded SSH private key (User Settings → Provider Settings)
    if present; otherwise falls back to provider config ssh_key_path.

    Args:
        record: TeamComputeProvider database record
        user_id: Optional user ID; if set with team_id and provider is SLURM, user's slurm_user and SSH key are used
        team_id: Optional team ID; required with user_id for slurm_user and SSH key lookup

    Returns:
        Instantiated ComputeProvider object
    """

    user_slurm_user = None
    user_ssh_key_path = None
    user_sbatch_flags = None

    if record.type == "slurm":
        if user_id and team_id:
            import transformerlab.db.db as db

            slurm_user_key = f"provider:{record.id}:slurm_user"
            user_slurm_user = await db.config_get(key=slurm_user_key, user_id=user_id, team_id=team_id)

            custom_flags_key = f"provider:{record.id}:slurm_custom_sbatch_flags"
            user_sbatch_flags = await db.config_get(key=custom_flags_key, user_id=user_id, team_id=team_id)

            # Use user's uploaded SSH private key (SSH mode) when available
            if record.config and record.config.get("mode") == "ssh":
                try:
                    from transformerlab.services.user_slurm_key_service import (
                        get_user_slurm_key_path,
                        user_slurm_key_exists,
                    )

                    if await user_slurm_key_exists(team_id, record.id, user_id):
                        user_ssh_key_path = await get_user_slurm_key_path(team_id, record.id, user_id)
                except Exception:
                    pass

    config = db_record_to_provider_config(
        record,
        user_slurm_user=user_slurm_user,
        user_ssh_key_path=user_ssh_key_path,
        user_sbatch_flags=user_sbatch_flags,
    )
    return create_compute_provider(config)


async def create_team_provider(
    session: AsyncSession,
    team_id: str,
    name: str,
    provider_type: str,
    config: dict,
    created_by_user_id: str,
    validate: bool = True,
) -> TeamComputeProvider:
    """
    Create a new team compute provider record with referential integrity validation.

    Args:
        session: Database session
        team_id: Team ID
        name: Provider name
        provider_type: Provider type (slurm or skypilot)
        config: Provider configuration dictionary
        created_by_user_id: User ID who created the provider
        validate: Whether to validate referential integrity (default: True)

    Returns:
        Created TeamComputeProvider record

    Raises:
        HTTPException: If validation fails or local providers are disabled
    """
    # Validate referential integrity before creating
    if validate:
        await validate_provider_data(session, team_id, created_by_user_id, validate_membership=True)

    # Respect global disable flag for local providers
    if provider_type == ProviderType.LOCAL.value and _local_providers_disabled():
        raise HTTPException(status_code=400, detail="Local providers are disabled by server configuration.")

    provider = TeamComputeProvider(
        team_id=team_id, name=name, type=provider_type, config=config, created_by_user_id=created_by_user_id
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)

    # NOTE: Local provider setup can be slow (uv venv + dependency install).
    # We intentionally do not run it synchronously during provider creation.
    # The API layer exposes a dedicated setup endpoint that runs in the background
    # and reports progress to the UI.

    return provider


async def initialize_team_local_provider(
    session: AsyncSession,
    team_id: str,
    created_by_user_id: str,
    provider_name: str = "Local",
) -> Optional[TeamComputeProvider]:
    """
    Ensure that a default local compute provider exists for the given team.

    If a local provider with the same name already exists for the team, this
    function is a no-op.

    Args:
        session: Database session
        team_id: Team ID
        created_by_user_id: User ID to attribute as creator of the provider
        provider_name: Name for the local provider (default: "Local")

    Returns:
        The created TeamComputeProvider record, or None if one already existed or local providers are disabled.
    """
    # Respect global setup: disabled = no local providers at all.
    if _local_providers_disabled():
        return None

    # Check for any existing local provider (name does not matter)
    existing_providers = await list_team_providers(session, team_id)
    for provider in existing_providers:
        if provider.type == ProviderType.LOCAL.value:
            return None

    # Detect accelerators for this machine without blocking the event loop
    supported_accelerators = await asyncio.to_thread(detect_local_supported_accelerators)
    config: dict = {"supported_accelerators": supported_accelerators}

    provider = await create_team_provider(
        session=session,
        team_id=team_id,
        name=provider_name,
        provider_type=ProviderType.LOCAL.value,
        config=config,
        created_by_user_id=created_by_user_id,
        # Validation ensures the creating user is a member of the team
        validate=True,
    )

    # Run setup in the background so bootstrap-created local providers are
    # actually usable without requiring a manual setup click in the UI.
    async def _run_local_setup_background() -> None:
        try:
            provider_instance = await get_provider_instance(provider, user_id=created_by_user_id, team_id=team_id)
            await asyncio.to_thread(provider_instance.setup)
            # Re-detect accelerators after setup: setup installs CUDA (including nvidia-smi)
            # via conda, so detection here gives the correct result on machines where CUDA
            # was not yet installed when the provider was first created.
            post_setup_accelerators = await asyncio.to_thread(detect_local_supported_accelerators)
            async with async_session() as background_session:
                fresh_provider = await get_provider_by_id(background_session, provider.id)
                if fresh_provider is None:
                    logger.warning(
                        "Skipping post-setup local provider update because provider no longer exists: %s",
                        provider.id,
                    )
                    return

                post_setup_config = dict(fresh_provider.config or {})
                post_setup_config["supported_accelerators"] = post_setup_accelerators
                await update_team_provider(background_session, fresh_provider, config=post_setup_config)
        except Exception:
            # Best-effort bootstrap: do not fail startup if setup fails.
            logger.warning("Background local provider setup failed", exc_info=True)

    asyncio.create_task(_run_local_setup_background())

    return provider


async def update_team_provider(
    session: AsyncSession,
    provider: TeamComputeProvider,
    name: Optional[str] = None,
    config: Optional[dict] = None,
    disabled: Optional[bool] = None,
    is_default: Optional[bool] = None,
) -> TeamComputeProvider:
    """Update an existing team provider record."""
    if name is not None:
        provider.name = name
    if config is not None:
        provider.config = config
    if disabled is not None:
        provider.disabled = disabled
    if is_default is not None:
        if is_default:
            await _clear_default_for_team(session, provider.team_id, exclude_provider_id=provider.id)
        provider.is_default = is_default
    await session.commit()
    await session.refresh(provider)
    return provider


async def _clear_default_for_team(
    session: AsyncSession, team_id: str, exclude_provider_id: Optional[str] = None
) -> None:
    """Clear is_default on all providers for a team (optionally excluding one)."""
    stmt = select(TeamComputeProvider).where(
        TeamComputeProvider.team_id == team_id,
        TeamComputeProvider.is_default,  # noqa: E712 -- truthy check works for boolean column
    )
    if exclude_provider_id is not None:
        stmt = stmt.where(TeamComputeProvider.id != exclude_provider_id)
    result = await session.execute(stmt)
    for other in result.scalars().all():
        other.is_default = False


async def get_default_team_provider(session: AsyncSession, team_id: str) -> Optional[TeamComputeProvider]:
    """Return the default enabled provider for a team, if one is marked as default."""
    stmt = (
        select(TeamComputeProvider)
        .where(TeamComputeProvider.team_id == team_id)
        .where(~TeamComputeProvider.disabled)
        .where(TeamComputeProvider.is_default)
    )
    result = await session.execute(stmt)
    return result.scalars().first()


async def delete_team_provider(session: AsyncSession, provider: TeamComputeProvider) -> None:
    """Delete a team provider record."""
    await session.delete(provider)
    await session.commit()
