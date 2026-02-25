# database.py
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy.dialects.sqlite import insert
from fastapi import Depends
from os import getenv
import uuid

from transformerlab.db.constants import DATABASE_URL
from transformerlab.shared.models.models import Team, User, OAuthAccount
from transformerlab.shared.remote_workspace import create_bucket_for_team


# 3. Setup the Async Engine and Session
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# 5. Database session dependency
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


# 6. Verification function to ensure user_id exists (no foreign key constraint)
async def verify_user_exists(session: AsyncSession, user_id: uuid.UUID) -> bool:
    """
    Verify that a user_id exists in the user table.
    Used to ensure data integrity without foreign key constraints.
    """
    stmt = select(User).where(User.id == str(user_id))
    result = await session.execute(stmt)
    return result.scalar_one_or_none() is not None


# 7. Custom User Database with OAuth support (REQUIRED!)
class SQLAlchemyUserDatabaseWithOAuth(SQLAlchemyUserDatabase):
    """
    Extended SQLAlchemyUserDatabase with OAuth support.
    This is REQUIRED because the base class raises NotImplementedError for get_by_oauth_account.
    """

    async def get_by_oauth_account(self, oauth: str, account_id: str) -> Optional[User]:
        """
        Get a user by OAuth account provider and account ID.
        Args:
            oauth: OAuth provider name (e.g., 'google')
            account_id: The account ID from the OAuth provider
        Returns:
            User if found, None otherwise
        """
        statement = (
            select(User)
            .join(OAuthAccount, User.id == OAuthAccount.user_id)
            .where(OAuthAccount.oauth_name == oauth, OAuthAccount.account_id == account_id)
        )
        result = await self.session.execute(statement)
        user = result.scalar_one_or_none()
        return user

    async def add_oauth_account(self, user, create_dict: dict):
        """
        Override add_oauth_account to perform upsert instead of insert to handle
        IntegrityError when re-authenticating after revoking OAuth access.
        Verifies user exists before adding OAuth account (no foreign key constraint).
        """
        # Verify user exists (no foreign key constraint, so we check manually)
        user_exists = await verify_user_exists(self.session, user.id)
        if not user_exists:
            raise ValueError(f"User with id {user.id} does not exist")

        # Perform an upsert: insert if not exists, update if conflict on unique constraint
        stmt = (
            insert(OAuthAccount)
            .values(user_id=user.id, **create_dict)
            .on_conflict_do_update(
                index_elements=["oauth_name", "account_id"],  # Unique index on these columns
                set_={k: v for k, v in create_dict.items() if k not in ["id"]},  # Update all fields except primary key
            )
        )
        await self.session.execute(stmt)
        return user


# 8. Get user database dependency (REQUIRED!)
async def get_user_db(session: AsyncSession = Depends(get_async_session)):
    """Provides database access for users and OAuth accounts"""
    yield SQLAlchemyUserDatabaseWithOAuth(session, User, OAuthAccount)


# 9. Create personal team for user
async def create_personal_team(session: AsyncSession, user) -> Team:
    """
    Create a personal team for the user named "Username's Team".
    Each user gets their own team.

    Args:
        session: Database session
        user: User object with first_name, last_name, or email

    Returns:
        Team: The created personal team
    """
    # Generate team name from user's name or email
    if user.first_name:
        team_name = f"{user.first_name}'s Team"
    else:
        # Fallback to email username if no first_name
        team_name = f"{user.email.split('@')[0]}'s Team"

    # Create new team for this user
    team = Team(name=team_name)
    session.add(team)
    await session.commit()
    await session.refresh(team)

    # Create storage (cloud bucket or local folder) for the new team
    if getenv("TFL_REMOTE_STORAGE_ENABLED") or (
        getenv("TFL_STORAGE_PROVIDER") == "localfs" and getenv("TFL_STORAGE_URI")
    ):
        try:
            create_bucket_for_team(team.id, profile_name="transformerlab-s3")
        except Exception as e:
            # Log error but don't fail team creation if storage creation fails
            print(f"Warning: Failed to create storage for team {team.id}: {e}")

    return team


# Keep for backwards compatibility
async def create_default_team(session: AsyncSession, user=None) -> Team:
    """
    Deprecated: Use create_personal_team instead.
    This now creates personal teams.
    """
    if user:
        return await create_personal_team(session, user)
    else:
        # Fallback for old code that doesn't pass user
        team = Team(name="Default Team")
        session.add(team)
        await session.commit()
        await session.refresh(team)
        return team
