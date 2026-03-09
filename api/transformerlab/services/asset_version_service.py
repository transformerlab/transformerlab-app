"""
asset_version_service.py

Service layer for managing versioned groups of models and datasets.
Handles CRUD operations, tag management (latest, production, draft),
and resolving assets by tag or version number.
"""

from typing import Optional

from sqlalchemy import select, func, and_, update

from transformerlab.shared.models.models import AssetVersion
from transformerlab.db.session import async_session


VALID_TAGS = {"latest", "production", "draft"}
VALID_ASSET_TYPES = {"model", "dataset"}


def _validate_asset_type(asset_type: str) -> None:
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"asset_type must be one of {VALID_ASSET_TYPES}, got '{asset_type}'")


def _validate_tag(tag: str) -> None:
    if tag not in VALID_TAGS:
        raise ValueError(f"tag must be one of {VALID_TAGS}, got '{tag}'")


async def create_version(
    *,
    asset_type: str,
    group_name: str,
    asset_id: str,
    job_id: Optional[str] = None,
    description: Optional[str] = None,
    tag: Optional[str] = "latest",
) -> dict:
    """Create a new version in a group and auto-assign the next version number.

    By default the new version is tagged 'latest' and any previous 'latest' tag
    in the same group is cleared.

    Returns:
        A dict representation of the newly created AssetVersion row.
    """
    _validate_asset_type(asset_type)
    if tag is not None:
        _validate_tag(tag)

    async with async_session() as session:
        # Determine next version number
        result = await session.execute(
            select(func.coalesce(func.max(AssetVersion.version), 0)).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
            )
        )
        max_version = result.scalar_one()
        next_version = max_version + 1

        # Clear the tag from any other version in this group (only one version per tag)
        if tag is not None:
            await session.execute(
                update(AssetVersion)
                .where(
                    AssetVersion.asset_type == asset_type,
                    AssetVersion.group_name == group_name,
                    AssetVersion.tag == tag,
                )
                .values(tag=None)
            )

        new_version = AssetVersion(
            asset_type=asset_type,
            group_name=group_name,
            version=next_version,
            asset_id=asset_id,
            tag=tag,
            job_id=job_id,
            description=description,
        )
        session.add(new_version)
        await session.commit()
        await session.refresh(new_version)

        return _row_to_dict(new_version)


async def list_groups(asset_type: str) -> list[dict]:
    """List all groups for a given asset type with summary info.

    Returns a list of dicts, each with:
        group_name, version_count, latest_version, tags (list of currently assigned tags)
    """
    _validate_asset_type(asset_type)

    async with async_session() as session:
        # Get groups with counts
        result = await session.execute(
            select(
                AssetVersion.group_name,
                func.count(AssetVersion.id).label("version_count"),
                func.max(AssetVersion.version).label("latest_version"),
            )
            .where(AssetVersion.asset_type == asset_type)
            .group_by(AssetVersion.group_name)
            .order_by(AssetVersion.group_name)
        )
        groups = []
        for row in result.all():
            group_name = row[0]
            version_count = row[1]
            latest_version = row[2]

            # Get tags assigned in this group
            tag_result = await session.execute(
                select(AssetVersion.tag).where(
                    AssetVersion.asset_type == asset_type,
                    AssetVersion.group_name == group_name,
                    AssetVersion.tag.is_not(None),
                )
            )
            tags = [r[0] for r in tag_result.all()]

            groups.append(
                {
                    "group_name": group_name,
                    "asset_type": asset_type,
                    "version_count": version_count,
                    "latest_version": latest_version,
                    "tags": tags,
                }
            )
        return groups


async def list_versions(asset_type: str, group_name: str) -> list[dict]:
    """List all versions in a group, ordered by version number descending."""
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion)
            .where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
            )
            .order_by(AssetVersion.version.desc())
        )
        return [_row_to_dict(row) for row in result.scalars().all()]


async def get_version(asset_type: str, group_name: str, version: int) -> Optional[dict]:
    """Get a specific version by number."""
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.version == version,
            )
        )
        row = result.scalar_one_or_none()
        return _row_to_dict(row) if row else None


async def resolve_by_tag(asset_type: str, group_name: str, tag: str = "latest") -> Optional[dict]:
    """Resolve a version by its tag.

    This is the primary way the rest of the app looks up which asset to use.
    Defaults to 'latest' if no tag is specified.

    Returns:
        The matching AssetVersion dict, or None if not found.
    """
    _validate_asset_type(asset_type)
    _validate_tag(tag)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.tag == tag,
            )
        )
        row = result.scalar_one_or_none()
        return _row_to_dict(row) if row else None


async def resolve(
    asset_type: str, group_name: str, tag: Optional[str] = None, version: Optional[int] = None
) -> Optional[dict]:
    """Resolve a specific version of a group.

    Resolution priority:
    1. If version is provided, return that exact version.
    2. If tag is provided, return the version with that tag.
    3. Otherwise, return the version tagged 'latest'.
    4. If no 'latest' tag exists, return the highest version number.
    """
    _validate_asset_type(asset_type)

    if version is not None:
        return await get_version(asset_type, group_name, version)

    if tag is not None:
        return await resolve_by_tag(asset_type, group_name, tag)

    # Default: try 'latest' tag first
    result = await resolve_by_tag(asset_type, group_name, "latest")
    if result:
        return result

    # Fallback: highest version number
    async with async_session() as session:
        result_query = await session.execute(
            select(AssetVersion)
            .where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
            )
            .order_by(AssetVersion.version.desc())
            .limit(1)
        )
        row = result_query.scalar_one_or_none()
        return _row_to_dict(row) if row else None


async def set_tag(asset_type: str, group_name: str, version: int, tag: str) -> Optional[dict]:
    """Set a tag on a specific version.

    Clears the tag from any other version in the same group first (only one version per tag).
    """
    _validate_asset_type(asset_type)
    _validate_tag(tag)

    async with async_session() as session:
        # First clear this tag from any other version in the group
        await session.execute(
            update(AssetVersion)
            .where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.tag == tag,
            )
            .values(tag=None)
        )

        # Now assign the tag to the target version
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.version == version,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return None

        row.tag = tag
        await session.commit()
        await session.refresh(row)
        return _row_to_dict(row)


async def clear_tag(asset_type: str, group_name: str, version: int) -> Optional[dict]:
    """Remove the tag from a specific version."""
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.version == version,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return None

        row.tag = None
        await session.commit()
        await session.refresh(row)
        return _row_to_dict(row)


async def delete_version(asset_type: str, group_name: str, version: int) -> bool:
    """Delete a specific version from the registry.

    Returns True if the version existed and was deleted.
    Does NOT delete the underlying filesystem asset.
    """
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
                AssetVersion.version == version,
            )
        )
        row = result.scalar_one_or_none()
        if not row:
            return False

        await session.delete(row)
        await session.commit()
        return True


async def delete_group(asset_type: str, group_name: str) -> int:
    """Delete all versions in a group.

    Returns the number of versions deleted.
    Does NOT delete the underlying filesystem assets.
    """
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.group_name == group_name,
            )
        )
        rows = result.scalars().all()
        count = len(rows)
        for row in rows:
            await session.delete(row)
        await session.commit()
        return count


async def get_groups_for_asset(asset_type: str, asset_id: str) -> list[dict]:
    """Find all groups that contain a specific asset_id.

    Useful for showing version badges on the model/dataset list views.
    """
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(
            select(AssetVersion).where(
                AssetVersion.asset_type == asset_type,
                AssetVersion.asset_id == asset_id,
            )
        )
        return [_row_to_dict(row) for row in result.scalars().all()]


async def get_all_asset_group_map(asset_type: str) -> dict[str, list[dict]]:
    """Build a map of asset_id -> list of group memberships.

    This is used by the frontend to efficiently annotate list views
    with version/group information without N+1 queries.
    """
    _validate_asset_type(asset_type)

    async with async_session() as session:
        result = await session.execute(select(AssetVersion).where(AssetVersion.asset_type == asset_type))
        mapping: dict[str, list[dict]] = {}
        for row in result.scalars().all():
            entry = _row_to_dict(row)
            mapping.setdefault(entry["asset_id"], []).append(entry)
        return mapping


def _row_to_dict(row: AssetVersion) -> dict:
    """Convert an AssetVersion ORM row to a plain dict."""
    return {
        "id": row.id,
        "asset_type": row.asset_type,
        "group_name": row.group_name,
        "version": row.version,
        "asset_id": row.asset_id,
        "tag": row.tag,
        "job_id": row.job_id,
        "description": row.description,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
