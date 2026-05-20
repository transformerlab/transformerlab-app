import secrets
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from transformerlab.shared.models.models import PublicShareLink
from transformerlab.utils.datetime_utils import utc_now_naive

ALLOWED_RESOURCE_TYPES = {"experiment_notes", "experiment_chart"}


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


async def get_active_link(
    session: AsyncSession,
    resource_type: str,
    resource_id: str,
) -> Optional[PublicShareLink]:
    stmt = (
        select(PublicShareLink)
        .where(
            PublicShareLink.resource_type == resource_type,
            PublicShareLink.resource_id == str(resource_id),
            PublicShareLink.revoked_at.is_(None),
        )
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def revoke_active_link(
    session: AsyncSession,
    resource_type: str,
    resource_id: str,
) -> None:
    stmt = (
        update(PublicShareLink)
        .where(
            PublicShareLink.resource_type == resource_type,
            PublicShareLink.resource_id == str(resource_id),
            PublicShareLink.revoked_at.is_(None),
        )
        .values(revoked_at=utc_now_naive())
    )
    await session.execute(stmt)
    await session.commit()


async def mint_link(
    session: AsyncSession,
    resource_type: str,
    resource_id: str,
    team_id: str,
    user_id: str,
) -> PublicShareLink:
    if resource_type not in ALLOWED_RESOURCE_TYPES:
        raise ValueError(f"Unsupported resource_type: {resource_type}")

    await revoke_active_link(session, resource_type, resource_id)

    link = PublicShareLink(
        token=_generate_token(),
        resource_type=resource_type,
        resource_id=str(resource_id),
        team_id=str(team_id),
        created_by=str(user_id),
    )
    session.add(link)
    await session.commit()
    await session.refresh(link)
    return link


async def resolve_token(
    session: AsyncSession,
    token: str,
) -> Optional[PublicShareLink]:
    stmt = (
        select(PublicShareLink)
        .where(
            PublicShareLink.token == token,
            PublicShareLink.revoked_at.is_(None),
        )
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()
