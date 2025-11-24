# database.py
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Team


# # 2. Setup the Async Engine and Session
# engine = create_async_engine(DATABASE_URL)
# AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


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
