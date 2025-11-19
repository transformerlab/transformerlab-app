# database.py
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, Mapped, mapped_column
from fastapi_users.db import SQLAlchemyBaseUserTableUUID
from sqlalchemy import select, String

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


# 5. Create default team if not exists
async def create_default_team(session: AsyncSession) -> Team:
    stmt = select(Team).where(Team.name == "Default Team")
    result = await session.execute(stmt)
    team = result.scalar_one_or_none()
    if not team:
        team = Team(name="Default Team")
        session.add(team)
        await session.commit()
        await session.refresh(team)
    return team
