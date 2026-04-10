"""
asset_version_service.py

Service layer for managing versioned groups of models and datasets.
Groups are stored as JSON files under the ``asset_groups/`` directory, completely
separate from the existing ``models/`` and ``datasets/`` directories.

Directory layout
----------------
asset_groups/
  models/
    <uuid>/
      index.json        - group-level metadata (name, description, etc.)
      model_list.json   - ordered list of version entries
  datasets/
    <uuid>/
      index.json
      dataset_list.json

The actual model / dataset files stay in their original locations.  Version
entries only store *references* (``asset_id``) pointing to those assets.

Group directories are keyed by UUID so the display name is freely editable.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from lab import storage

from transformerlab.shared.dirs import get_asset_groups_dir

logger = logging.getLogger(__name__)


VALID_ASSET_TYPES = {"model", "dataset"}

# Mapping from asset_type to the filename that holds the version list.
_LIST_FILENAME = {
    "model": "model_list.json",
    "dataset": "dataset_list.json",
}


# --- Internal helpers ---------------------------------------------------------


def _validate_asset_type(asset_type: str) -> None:
    if asset_type not in VALID_ASSET_TYPES:
        raise ValueError(f"asset_type must be one of {VALID_ASSET_TYPES}, got '{asset_type}'")


def _validate_group_id(group_id: str) -> None:
    """Ensure group_id is a valid UUID to prevent path traversal."""
    try:
        uuid.UUID(group_id)
    except ValueError:
        raise ValueError(f"Invalid group_id: '{group_id}' is not a valid UUID")


async def _type_dir(asset_type: str) -> str:
    """Return the type-level directory, creating it if needed."""
    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")
    await storage.makedirs(type_dir, exist_ok=True)
    return type_dir


async def _group_dir(asset_type: str, group_id: str) -> str:
    """Return the directory path for a specific group, creating parents as needed."""
    _validate_group_id(group_id)
    type_dir = await _type_dir(asset_type)
    path = storage.join(type_dir, group_id)
    await storage.makedirs(path, exist_ok=True)
    return path


async def _read_json(path: str, default=None):
    """Read and parse a JSON file from storage.  Returns *default* if missing."""
    try:
        if not await storage.exists(path):
            return default
        async with await storage.open(path, "r", encoding="utf-8") as f:
            text = await f.read()
        return json.loads(text)
    except Exception:
        return default


async def _write_json(path: str, data) -> None:
    """Serialise *data* to JSON and write it to *path*."""
    text = json.dumps(data, indent=2, default=str)
    async with await storage.open(path, "w", encoding="utf-8") as f:
        await f.write(text)


async def _read_index(asset_type: str, group_id: str) -> dict:
    gdir = await _group_dir(asset_type, group_id)
    path = storage.join(gdir, "index.json")
    data = await _read_json(path, default=None)
    if data is None:
        data = {
            "group_id": group_id,
            "name": group_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "description": "",
            "cover_image": None,
        }
        await _write_json(path, data)
    return data


async def _write_index(asset_type: str, group_id: str, data: dict) -> None:
    gdir = await _group_dir(asset_type, group_id)
    path = storage.join(gdir, "index.json")
    await _write_json(path, data)


async def _read_versions(asset_type: str, group_id: str) -> list[dict]:
    """Return the list of version dicts for a group (in append order)."""
    gdir = await _group_dir(asset_type, group_id)
    filename = _LIST_FILENAME[asset_type]
    path = storage.join(gdir, filename)
    data = await _read_json(path, default=None)
    if data is None:
        return []
    return data.get("versions", [])


async def _write_versions(asset_type: str, group_id: str, versions: list[dict]) -> None:
    gdir = await _group_dir(asset_type, group_id)
    filename = _LIST_FILENAME[asset_type]
    path = storage.join(gdir, filename)
    await _write_json(path, {"versions": versions})


def _version_to_dict(v: dict, asset_type: str, group_id: str) -> dict:
    """Normalise a raw version dict into the shape expected by callers."""
    return {
        "id": v.get("id", ""),
        "asset_type": asset_type,
        "group_id": group_id,
        "version_label": v.get("version_label", ""),
        "asset_id": v.get("asset_id", ""),
        "tag": v.get("tag"),
        "job_id": v.get("job_id"),
        "description": v.get("description"),
        "title": v.get("title"),
        "long_description": v.get("long_description"),
        "cover_image": v.get("cover_image"),
        "evals": v.get("evals"),
        "metadata": v.get("metadata"),
        "created_at": v.get("created_at"),
    }


async def _list_group_ids(asset_type: str) -> list[str]:
    """Return all group directory names (UUIDs) for the given asset type."""
    type_dir = await _type_dir(asset_type)
    if not await storage.exists(type_dir):
        return []
    try:
        entries = await storage.ls(type_dir, detail=False)
    except Exception:
        return []
    ids = []
    for entry in entries:
        entry_name = entry.rsplit("/", 1)[-1] if "/" in str(entry) else str(entry)
        if entry_name and not entry_name.startswith("."):
            ids.append(entry_name)
    return ids


async def _find_group_by_name(asset_type: str, name: str) -> Optional[str]:
    """Look up a group_id by its display name.  Returns None if not found."""
    for gid in await _list_group_ids(asset_type):
        try:
            index = await _read_index(asset_type, gid)
        except (ValueError, OSError) as exc:
            logger.warning("Skipping group %r (asset_type=%r): %s", gid, asset_type, exc)
            continue
        if index.get("name") == name:
            return gid
    return None


# --- Public API ---------------------------------------------------------------


async def create_version(
    *,
    asset_type: str,
    group_name: str,
    group_id: Optional[str] = None,
    asset_id: str,
    version_label: str = "v1",
    job_id: Optional[str] = None,
    description: Optional[str] = None,
    title: Optional[str] = None,
    long_description: Optional[str] = None,
    cover_image: Optional[str] = None,
    evals: Optional[dict] = None,
    extra_metadata: Optional[dict] = None,
    tag: Optional[str] = "latest",
) -> dict:
    """Create a new version in a group.

    If ``group_id`` is provided, the version is added to that existing group.
    Otherwise a group is looked up by ``group_name``, or a new one is created
    with a fresh UUID.

    By default the new version is tagged ``'latest'`` and any previous holder
    of that tag in the same group has the tag cleared.

    Returns:
        A dict representation of the newly created version entry.
    """
    _validate_asset_type(asset_type)

    if group_id is None:
        # Try to find existing group by name, or create a new one
        group_id = await _find_group_by_name(asset_type, group_name)
        if group_id is None:
            group_id = str(uuid.uuid4())

    # Ensure group index exists, setting the display name
    index = await _read_index(asset_type, group_id)
    if index.get("name") == group_id:
        # Default name (just the UUID) — set to the provided group_name
        index["name"] = group_name
        await _write_index(asset_type, group_id, index)

    versions = await _read_versions(asset_type, group_id)

    # Clear the tag from any other version in this group (one holder per tag)
    if tag is not None:
        for v in versions:
            if v.get("tag") == tag:
                v["tag"] = None

    new_entry: dict = {
        "id": str(uuid.uuid4()),
        "version_label": version_label,
        "tag": tag,
        "asset_id": asset_id,
        "job_id": job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "title": title,
        "description": description,
        "long_description": long_description,
        "cover_image": cover_image,
        "evals": evals,
        "metadata": extra_metadata,
    }

    versions.append(new_entry)
    await _write_versions(asset_type, group_id, versions)

    return _version_to_dict(new_entry, asset_type, group_id)


async def list_groups(asset_type: str) -> list[dict]:
    """List all groups for a given asset type with summary info.

    Groups with invalid UUIDs or corrupt data are silently skipped so that
    one bad directory does not prevent the entire listing from loading.
    """
    _validate_asset_type(asset_type)

    groups: list[dict] = []
    for gid in await _list_group_ids(asset_type):
        try:
            index = await _read_index(asset_type, gid)
            versions = await _read_versions(asset_type, gid)
        except (ValueError, OSError) as exc:
            logger.warning("Skipping group %r (asset_type=%r): %s", gid, asset_type, exc)
            continue
        tags = [v["tag"] for v in versions if v.get("tag")]

        groups.append(
            {
                "group_id": gid,
                "group_name": index.get("name", gid),
                "asset_type": asset_type,
                "description": index.get("description", ""),
                "version_count": len(versions),
                "latest_version_label": versions[-1].get("version_label") if versions else None,
                "tags": tags,
            }
        )

    groups.sort(key=lambda g: g["group_name"])
    return groups


async def update_group(
    asset_type: str,
    group_id: str,
    *,
    name: Optional[str] = ...,
    description: Optional[str] = ...,
) -> dict:
    """Update group-level metadata (name, description) in the index."""
    _validate_asset_type(asset_type)

    type_dir = await _type_dir(asset_type)
    gdir = storage.join(type_dir, group_id)
    if not await storage.exists(storage.join(gdir, "index.json")):
        raise ValueError(f"Group '{group_id}' not found")

    index = await _read_index(asset_type, group_id)

    if name is not ...:
        existing_id = await _find_group_by_name(asset_type, name)
        if existing_id is not None and existing_id != group_id:
            raise ValueError(f"A group named '{name}' already exists")
        index["name"] = name
    if description is not ...:
        index["description"] = description

    await _write_index(asset_type, group_id, index)
    return index


async def list_versions(asset_type: str, group_id: str) -> list[dict]:
    """List all versions in a group, newest first."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_id)
    return [_version_to_dict(v, asset_type, group_id) for v in reversed(versions)]


async def get_version(asset_type: str, group_id: str, version_label: str) -> Optional[dict]:
    """Get a specific version by its label."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_id)
    for v in versions:
        if v.get("version_label") == version_label:
            return _version_to_dict(v, asset_type, group_id)
    return None


async def get_version_by_id(asset_type: str, group_id: str, version_id: str) -> Optional[dict]:
    """Get a specific version by its UUID."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_id)
    for v in versions:
        if v.get("id") == version_id:
            return _version_to_dict(v, asset_type, group_id)
    return None


async def update_version(
    asset_type: str,
    group_id: str,
    version_label: str,
    *,
    description: Optional[str] = ...,
    title: Optional[str] = ...,
    long_description: Optional[str] = ...,
    cover_image: Optional[str] = ...,
    evals: Optional[dict] = ...,
    extra_metadata: Optional[dict] = ...,
    tag: Optional[str] = ...,
) -> Optional[dict]:
    """Update mutable fields on a specific version.

    Uses sentinel default (``...``) so callers can distinguish between
    "not provided" and "explicitly set to None".
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)
    target = None
    for v in versions:
        if v.get("version_label") == version_label:
            target = v
            break

    if target is None:
        return None

    updatable = {
        "description": description,
        "title": title,
        "long_description": long_description,
        "cover_image": cover_image,
        "evals": evals,
        "metadata": extra_metadata,
        "tag": tag,
    }

    for field, value in updatable.items():
        if value is ...:
            continue  # not provided by caller

        if field == "tag" and value is not None:
            # Clear this tag from any other version in the group
            for v in versions:
                if v is not target and v.get("tag") == value:
                    v["tag"] = None

        target[field] = value

    await _write_versions(asset_type, group_id, versions)
    return _version_to_dict(target, asset_type, group_id)


async def resolve_by_tag(asset_type: str, group_id: str, tag: str = "latest") -> Optional[dict]:
    """Resolve a version by its tag."""
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)
    for v in versions:
        if v.get("tag") == tag:
            return _version_to_dict(v, asset_type, group_id)
    return None


async def resolve(
    asset_type: str,
    group_id: str,
    tag: Optional[str] = None,
    version_label: Optional[str] = None,
) -> Optional[dict]:
    """Resolve a specific version of a group.

    Resolution priority:
    1. If version_label is provided, return that exact version.
    2. If tag is provided, return the version with that tag.
    3. Otherwise, return the version tagged 'latest'.
    4. If no 'latest' tag exists, return the most recently added version.
    """
    _validate_asset_type(asset_type)

    if version_label is not None:
        return await get_version(asset_type, group_id, version_label)

    if tag is not None:
        return await resolve_by_tag(asset_type, group_id, tag)

    # Default: try 'latest' tag first
    result = await resolve_by_tag(asset_type, group_id, "latest")
    if result:
        return result

    # Fallback: most recently added version (last in list)
    versions = await _read_versions(asset_type, group_id)
    if versions:
        return _version_to_dict(versions[-1], asset_type, group_id)
    return None


async def set_tag(asset_type: str, group_id: str, version_label: str, tag: str) -> Optional[dict]:
    """Set a tag on a specific version.

    Clears the tag from any other version in the same group first.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)

    # Clear tag from all versions
    for v in versions:
        if v.get("tag") == tag:
            v["tag"] = None

    # Assign to target
    target = None
    for v in versions:
        if v.get("version_label") == version_label:
            v["tag"] = tag
            target = v
            break

    if target is None:
        return None

    await _write_versions(asset_type, group_id, versions)
    return _version_to_dict(target, asset_type, group_id)


async def clear_tag(asset_type: str, group_id: str, version_label: str) -> Optional[dict]:
    """Remove the tag from a specific version."""
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)
    target = None
    for v in versions:
        if v.get("version_label") == version_label:
            v["tag"] = None
            target = v
            break

    if target is None:
        return None

    await _write_versions(asset_type, group_id, versions)
    return _version_to_dict(target, asset_type, group_id)


async def delete_version(asset_type: str, group_id: str, version_label: str) -> bool:
    """Delete a specific version from the registry.

    Returns True if the version existed and was deleted.
    Does NOT delete the underlying filesystem asset.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)
    new_versions = [v for v in versions if v.get("version_label") != version_label]

    if len(new_versions) == len(versions):
        return False  # not found

    await _write_versions(asset_type, group_id, new_versions)

    # If group is now empty, clean up its directory
    if not new_versions:
        await _remove_group_dir(asset_type, group_id)

    return True


async def delete_group(asset_type: str, group_id: str) -> int:
    """Delete all versions in a group.

    Returns the number of versions deleted.
    Does NOT delete the underlying filesystem assets.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_id)
    count = len(versions)

    if count > 0:
        await _remove_group_dir(asset_type, group_id)

    return count


async def _remove_group_dir(asset_type: str, group_id: str) -> None:
    """Remove the group directory and all its JSON files."""
    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")
    gdir = storage.join(type_dir, group_id)
    try:
        if await storage.exists(gdir):
            await storage.rm(gdir, recursive=True)
    except Exception:
        pass


async def get_groups_for_asset(asset_type: str, asset_id: str) -> list[dict]:
    """Find all groups that contain a specific asset_id.

    Useful for showing version badges on the model/dataset list views.
    """
    _validate_asset_type(asset_type)

    results: list[dict] = []
    for gid in await _list_group_ids(asset_type):
        try:
            versions = await _read_versions(asset_type, gid)
        except (ValueError, OSError) as exc:
            logger.warning("Skipping group %r (asset_type=%r): %s", gid, asset_type, exc)
            continue
        for v in versions:
            if v.get("asset_id") == asset_id:
                results.append(_version_to_dict(v, asset_type, gid))

    return results


async def get_all_asset_group_map(asset_type: str) -> dict[str, list[dict]]:
    """Build a map of asset_id -> list of group memberships.

    This is used by the frontend to efficiently annotate list views
    with version/group information without N+1 queries.
    """
    _validate_asset_type(asset_type)

    mapping: dict[str, list[dict]] = {}
    for gid in await _list_group_ids(asset_type):
        try:
            versions = await _read_versions(asset_type, gid)
        except (ValueError, OSError) as exc:
            logger.warning("Skipping group %r (asset_type=%r): %s", gid, asset_type, exc)
            continue
        for v in versions:
            d = _version_to_dict(v, asset_type, gid)
            mapping.setdefault(d["asset_id"], []).append(d)

    return mapping
