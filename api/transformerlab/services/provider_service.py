"""Service layer for bridging database provider records to ProviderConfig."""

from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException
from transformerlab.shared.models.models import TeamComputeProvider, Team, UserTeam, User
from transformerlab.compute_providers.config import ComputeProviderConfig, create_compute_provider
from transformerlab.compute_providers.base import ComputeProvider


async def validate_team_exists(session: AsyncSession, team_id: str) -> None:
    """
    Validate that a team exists in the database.

    Args:
        session: Database session
        team_id: Team ID to validate

    Raises:
        HTTPException: If team does not exist
    """
    stmt = select(Team).where(Team.id == team_id)
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()
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
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    # The unique() is used to ensure that we only get one user back. The `lazy=joined` in the table definition makes sure it returns a collection and we need to pick a single user.
    user = result.unique().scalar_one_or_none()
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
    stmt = select(UserTeam).where(UserTeam.user_id == user_id, UserTeam.team_id == team_id)
    result = await session.execute(stmt)
    user_team = result.scalar_one_or_none()
    if not user_team:
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


def db_record_to_provider_config(record: TeamComputeProvider) -> ComputeProviderConfig:
    """
    Convert a database TeamComputeProvider record to a ComputeProviderConfig object.

    Args:
        record: TeamComputeProvider database record

    Returns:
        ComputeProviderConfig object ready for create_compute_provider()
    """
    config_dict = record.config or {}

    # Build ComputeProviderConfig from database record
    provider_config = ComputeProviderConfig(
        type=record.type,
        name=record.name,
        server_url=config_dict.get("server_url"),
        api_token=config_dict.get("api_token"),
        default_env_vars=config_dict.get("default_env_vars", {}),
        default_entrypoint_command=config_dict.get("default_entrypoint_command"),
        mode=config_dict.get("mode"),
        rest_url=config_dict.get("rest_url"),
        ssh_host=config_dict.get("ssh_host"),
        ssh_user=config_dict.get("ssh_user"),
        ssh_key_path=config_dict.get("ssh_key_path"),
        ssh_port=config_dict.get("ssh_port", 22),
        # Runpod-specific config
        api_key=config_dict.get("api_key"),
        api_base_url=config_dict.get("api_base_url"),
        default_gpu_type=config_dict.get("default_gpu_type"),
        default_region=config_dict.get("default_region"),
        default_template_id=config_dict.get("default_template_id"),
        default_network_volume_id=config_dict.get("default_network_volume_id"),
        extra_config=config_dict.get("extra_config", {}),
    )
    # Local provider has no extra required config; workspace_dir is set at launch from get_workspace_dir()

    return provider_config


def get_provider_instance(record: TeamComputeProvider) -> ComputeProvider:
    """
    Get an instantiated ComputeProvider from a database record.

    Args:
        record: TeamComputeProvider database record

    Returns:
        Instantiated ComputeProvider object
    """
    config = db_record_to_provider_config(record)
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
        HTTPException: If validation fails
    """
    # Validate referential integrity before creating
    if validate:
        await validate_provider_data(session, team_id, created_by_user_id, validate_membership=True)

    provider = TeamComputeProvider(
        team_id=team_id, name=name, type=provider_type, config=config, created_by_user_id=created_by_user_id
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return provider


async def update_team_provider(
    session: AsyncSession, provider: TeamComputeProvider, name: Optional[str] = None, config: Optional[dict] = None
) -> TeamComputeProvider:
    """Update an existing team provider record."""
    if name is not None:
        provider.name = name
    if config is not None:
        provider.config = config
    await session.commit()
    await session.refresh(provider)
    return provider


async def delete_team_provider(session: AsyncSession, provider: TeamComputeProvider) -> None:
    """Delete a team provider record."""
    await session.delete(provider)
    await session.commit()
