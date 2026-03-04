from typing import List

from sqlalchemy import select

from transformerlab.db.session import async_session
from transformerlab.shared.models.models import Team


async def get_all_team_ids() -> List[str]:
    """Return the IDs of all teams in the database."""
    async with async_session() as session:
        result = await session.execute(select(Team.id))
        return [row[0] for row in result.all()]
