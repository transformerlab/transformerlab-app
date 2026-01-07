from sqlalchemy import select

# from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession


# Make sure SQLAlchemy is installed using pip install sqlalchemy[asyncio] as
# described here https://docs.sqlalchemy.org/en/20/orm/extensions/asyncio.html

from typing import AsyncGenerator

from transformerlab.shared.models.models import Config

from transformerlab.db.session import async_session


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


###############
# Config MODEL
###############


async def config_get(key: str, user_id: str | None = None, team_id: str | None = None):
    """
    Get config value with priority: user-specific -> team-specific -> global.

    Priority order:
    1. User-specific (user_id set, team_id matches current team)
    2. Team-specific (user_id IS NULL, team_id set)
    """
    async with async_session() as session:
        # First try user-specific config (if user_id provided)
        if user_id and team_id:
            result = await session.execute(
                select(Config.value)
                .where(Config.key == key, Config.user_id == user_id, Config.team_id == team_id)
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                return row

        # Then try team-specific config (user_id IS NULL, team_id set)
        if team_id:
            result = await session.execute(
                select(Config.value)
                .where(Config.key == key, Config.user_id.is_(None), Config.team_id == team_id)
                .limit(1)
            )
            row = result.scalar_one_or_none()
            if row is not None:
                return row

        # Finally fallback to global config (user_id IS NULL, team_id IS NULL)
        result = await session.execute(
            select(Config.value).where(Config.key == key, Config.user_id.is_(None), Config.team_id.is_(None)).limit(1)
        )
        row = result.scalar_one_or_none()
        return row


async def config_set(key: str, value: str, user_id: str | None = None, team_id: str | None = None):
    """
    Set config value.

    Args:
        key: Config key
        value: Config value
        user_id: User ID for user-specific config. If None, sets team-wide config.
        team_id: Team ID for team-specific config. If None, sets global config.

    Config types:
    - User-specific: user_id is set, team_id is set
    - Team-wide: user_id is None, team_id is set
    """
    async with async_session() as session:
        # Check if config already exists
        if user_id is None and team_id is None:
            # Global config: both user_id and team_id are NULL
            result = await session.execute(
                select(Config).where(Config.key == key, Config.user_id.is_(None), Config.team_id.is_(None))
            )
        elif user_id is None:
            # Team-wide config: user_id is NULL, team_id is set
            result = await session.execute(
                select(Config).where(Config.key == key, Config.user_id.is_(None), Config.team_id == team_id)
            )
        else:
            # User-specific config: both user_id and team_id are set
            result = await session.execute(
                select(Config).where(
                    Config.key == key,
                    Config.user_id == user_id,
                    Config.team_id == team_id,
                )
            )

        existing = result.scalar_one_or_none()

        if existing:
            # Update existing config
            existing.value = value
        else:
            # Insert new config
            new_config = Config(key=key, value=value, user_id=user_id, team_id=team_id)
            session.add(new_config)

        await session.commit()
    return
