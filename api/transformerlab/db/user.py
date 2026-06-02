# api/transformerlab/db/user.py
"""User and OAuth database access."""

import uuid
from typing import Optional, Sequence

from fastapi import Depends
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as _pg_insert
from sqlalchemy.dialects.sqlite import insert as _sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.db.constants import DATABASE_TYPE
from transformerlab.db.session import get_async_session
from transformerlab.shared.models.models import OAuthAccount, User

# Dialect-specific INSERT, chosen once at import time. Both dialects expose
# on_conflict_do_update() with the same surface, so callers use it uniformly.
_dialect_insert = _pg_insert if DATABASE_TYPE == "postgresql" else _sqlite_insert


async def verify_user_exists(session: AsyncSession, user_id: uuid.UUID) -> bool:
    """Verify a user_id exists (we have no FK constraint to rely on)."""
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


async def get_user_by_id(session: AsyncSession, user_id) -> Optional[User]:
    """Return the user with this id, or None. Accepts str or UUID."""
    if isinstance(user_id, str):
        user_id = uuid.UUID(user_id)
    stmt = select(User).where(User.id == user_id)
    result = await session.execute(stmt)
    return result.unique().scalar_one_or_none()


async def get_user_by_email(session: AsyncSession, email: str) -> Optional[User]:
    """Return the user with this email, or None."""
    stmt = select(User).where(User.email == email)
    result = await session.execute(stmt)
    return result.unique().scalar_one_or_none()


async def get_users_by_ids(session: AsyncSession, ids: Sequence[str]) -> list[User]:
    """Return all users whose id is in `ids`."""
    if not ids:
        return []
    stmt = select(User).where(User.id.in_(list(ids)))
    result = await session.execute(stmt)
    return list(result.unique().scalars().all())


class SQLAlchemyUserDatabaseWithOAuth(SQLAlchemyUserDatabase):
    """SQLAlchemyUserDatabase with OAuth support.

    Required because the base class raises NotImplementedError for
    get_by_oauth_account.
    """

    async def get_by_oauth_account(self, oauth: str, account_id: str) -> Optional[User]:
        statement = (
            select(User)
            .join(OAuthAccount, User.id == OAuthAccount.user_id)
            .where(OAuthAccount.oauth_name == oauth, OAuthAccount.account_id == account_id)
        )
        result = await self.session.execute(statement)
        return result.scalar_one_or_none()

    async def add_oauth_account(self, user, create_dict: dict):
        """Upsert (not insert) the OAuth account so re-auth after revoke works.
        Verifies the user exists first (no FK constraint)."""
        user_exists = await verify_user_exists(self.session, user.id)
        if not user_exists:
            raise ValueError(f"User with id {user.id} does not exist")

        stmt = (
            _dialect_insert(OAuthAccount)
            .values(user_id=user.id, **create_dict)
            .on_conflict_do_update(
                index_elements=["oauth_name", "account_id"],
                set_={k: v for k, v in create_dict.items() if k not in ["id"]},
            )
        )
        await self.session.execute(stmt)
        return user


async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    """FastAPI dependency: user + OAuth database access."""
    yield SQLAlchemyUserDatabaseWithOAuth(session, User, OAuthAccount)
