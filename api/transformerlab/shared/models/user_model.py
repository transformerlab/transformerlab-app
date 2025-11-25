# database.py
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, Mapped, mapped_column
from fastapi_users.db import SQLAlchemyBaseUserTableUUID, SQLAlchemyBaseOAuthAccountTableUUID
from sqlalchemy import String

# Replace with your actual database URL (e.g., PostgreSQL, SQLite)
from transformerlab.db.constants import DATABASE_URL
from .models import Base, Team


# 1. Define your User Model (inherits from a FastAPI Users base class)
class User(SQLAlchemyBaseUserTableUUID, Base):
    """
    User database model. Inherits from SQLAlchemyBaseUserTableUUID which provides:
    - id (UUID primary key)
    - email (unique, indexed)
    - hashed_password
    - is_active (boolean)
    - is_superuser (boolean)
    - is_verified (boolean)

    We add custom fields below:
    """
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)


# 2. Define OAuth Account Model
class OAuthAccount(SQLAlchemyBaseOAuthAccountTableUUID, Base):
    """
    OAuth account model for linking OAuth providers to users.
    Stores OAuth provider info (Google, etc.) linked to our users.
    """
    # Link to user by storing their ID as string
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)  # UUID as string


# 2. Setup the Async Engine and Session
engine = create_async_engine(DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


# 3. Utility to create tables (run this on app startup)
async def create_db_and_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# 4. Database session dependency
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


# 5. Create personal team for user
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
    return team


# Keep for backwards compatibility - but now creates personal teams
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
