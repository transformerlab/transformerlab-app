import logging

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import UserExperimentAccess
from transformerlab.utils.datetime_utils import utc_now_naive

logger = logging.getLogger(__name__)


async def touch_experiment(session: AsyncSession, user_id: str, team_id: str, experiment_id: str) -> None:
    """Upsert last_opened_at for a user-experiment pair."""
    now = utc_now_naive()
    result = await session.execute(
        update(UserExperimentAccess)
        .where(
            UserExperimentAccess.user_id == user_id,
            UserExperimentAccess.team_id == team_id,
            UserExperimentAccess.experiment_id == experiment_id,
        )
        .values(last_opened_at=now)
    )
    if result.rowcount == 0:
        try:
            session.add(
                UserExperimentAccess(
                    user_id=user_id,
                    team_id=team_id,
                    experiment_id=experiment_id,
                    last_opened_at=now,
                )
            )
            await session.commit()
        except IntegrityError:
            # Another concurrent request inserted first; treat as success.
            await session.rollback()
    else:
        await session.commit()


async def get_recent_experiment_ids(session: AsyncSession, user_id: str, team_id: str, limit: int = 3) -> list[str]:
    """Return experiment IDs ordered by last_opened_at DESC for a user."""
    result = await session.execute(
        select(UserExperimentAccess)
        .where(
            UserExperimentAccess.user_id == user_id,
            UserExperimentAccess.team_id == team_id,
        )
        .order_by(UserExperimentAccess.last_opened_at.desc())
        .limit(limit)
    )
    return [row.experiment_id for row in result.scalars().all()]
