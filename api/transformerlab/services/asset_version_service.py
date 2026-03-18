"""
asset_version_service.py

Service layer for managing versioned groups of models and datasets.
Groups are stored as JSON files under the ``asset_groups/`` directory, completely
separate from the existing ``models/`` and ``datasets/`` directories.

Directory layout
----------------
asset_groups/
  models/
    <group_name>/
      index.json        - group-level metadata
      model_list.json   - ordered list of version entries
  datasets/
    <group_name>/
      index.json
      dataset_list.json

The actual model / dataset files stay in their original locations.  Version
entries only store *references* (``asset_id``) pointing to those assets.
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from lab import storage

from transformerlab.shared.dirs import get_asset_groups_dir


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


async def _group_dir(asset_type: str, group_name: str) -> str:
    """Return the directory path for a specific group, creating parents as needed."""
    root = await get_asset_groups_dir()
    # asset_type plural form for directory name
    type_dir = storage.join(root, f"{asset_type}s")
    await storage.makedirs(type_dir, exist_ok=True)
    path = storage.join(type_dir, group_name)
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


async def _read_index(asset_type: str, group_name: str) -> dict:
    gdir = await _group_dir(asset_type, group_name)
    path = storage.join(gdir, "index.json")
    data = await _read_json(path, default=None)
    if data is None:
        data = {
            "name": group_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "description": "",
            "cover_image": None,
        }
        await _write_json(path, data)
    return data


async def _write_index(asset_type: str, group_name: str, data: dict) -> None:
    gdir = await _group_dir(asset_type, group_name)
    path = storage.join(gdir, "index.json")
    await _write_json(path, data)


async def _read_versions(asset_type: str, group_name: str) -> list[dict]:
    """Return the list of version dicts for a group (in append order)."""
    gdir = await _group_dir(asset_type, group_name)
    filename = _LIST_FILENAME[asset_type]
    path = storage.join(gdir, filename)
    data = await _read_json(path, default=None)
    if data is None:
        return []
    return data.get("versions", [])


async def _write_versions(asset_type: str, group_name: str, versions: list[dict]) -> None:
    gdir = await _group_dir(asset_type, group_name)
    filename = _LIST_FILENAME[asset_type]
    path = storage.join(gdir, filename)
    await _write_json(path, {"versions": versions})


def _version_to_dict(v: dict, asset_type: str, group_name: str) -> dict:
    """Normalise a raw version dict into the shape expected by callers."""
    return {
        "id": v.get("id", ""),
        "asset_type": asset_type,
        "group_name": group_name,
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


# --- Public API ---------------------------------------------------------------


async def create_version(
    *,
    asset_type: str,
    group_name: str,
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

    By default the new version is tagged ``'latest'`` and any previous holder
    of that tag in the same group has the tag cleared.

    Returns:
        A dict representation of the newly created version entry.
    """
    _validate_asset_type(asset_type)

    # Ensure group index exists
    await _read_index(asset_type, group_name)

    versions = await _read_versions(asset_type, group_name)

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
    await _write_versions(asset_type, group_name, versions)

    return _version_to_dict(new_entry, asset_type, group_name)


async def list_groups(asset_type: str) -> list[dict]:
    """List all groups for a given asset type with summary info."""
    _validate_asset_type(asset_type)

    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")

    # If the type directory doesn't exist yet, return empty list
    if not await storage.exists(type_dir):
        return []

    groups: list[dict] = []
    try:
        entries = await storage.ls(type_dir, detail=False)
    except Exception:
        return []

    for entry in entries:
        # entry may be a full path - take the basename
        entry_name = entry.rsplit("/", 1)[-1] if "/" in str(entry) else str(entry)
        if not entry_name or entry_name.startswith("."):
            continue

        group_name = entry_name
        versions = await _read_versions(asset_type, group_name)
        tags = [v["tag"] for v in versions if v.get("tag")]

        groups.append(
            {
                "group_name": group_name,
                "asset_type": asset_type,
                "version_count": len(versions),
                "latest_version_label": versions[-1].get("version_label") if versions else None,
                "tags": tags,
            }
        )

    groups.sort(key=lambda g: g["group_name"])
    return groups


async def list_versions(asset_type: str, group_name: str) -> list[dict]:
    """List all versions in a group, newest first."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_name)
    # Return newest first (reverse of append order)
    return [_version_to_dict(v, asset_type, group_name) for v in reversed(versions)]


async def get_version(asset_type: str, group_name: str, version_label: str) -> Optional[dict]:
    """Get a specific version by its label."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_name)
    for v in versions:
        if v.get("version_label") == version_label:
            return _version_to_dict(v, asset_type, group_name)
    return None


async def get_version_by_id(asset_type: str, group_name: str, version_id: str) -> Optional[dict]:
    """Get a specific version by its UUID."""
    _validate_asset_type(asset_type)
    versions = await _read_versions(asset_type, group_name)
    for v in versions:
        if v.get("id") == version_id:
            return _version_to_dict(v, asset_type, group_name)
    return None


async def update_version(
    asset_type: str,
    group_name: str,
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

    versions = await _read_versions(asset_type, group_name)
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

    await _write_versions(asset_type, group_name, versions)
    return _version_to_dict(target, asset_type, group_name)


async def resolve_by_tag(asset_type: str, group_name: str, tag: str = "latest") -> Optional[dict]:
    """Resolve a version by its tag."""
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_name)
    for v in versions:
        if v.get("tag") == tag:
            return _version_to_dict(v, asset_type, group_name)
    return None


async def resolve(
    asset_type: str,
    group_name: str,
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
        return await get_version(asset_type, group_name, version_label)

    if tag is not None:
        return await resolve_by_tag(asset_type, group_name, tag)

    # Default: try 'latest' tag first
    result = await resolve_by_tag(asset_type, group_name, "latest")
    if result:
        return result

    # Fallback: most recently added version (last in list)
    versions = await _read_versions(asset_type, group_name)
    if versions:
        return _version_to_dict(versions[-1], asset_type, group_name)
    return None


async def set_tag(asset_type: str, group_name: str, version_label: str, tag: str) -> Optional[dict]:
    """Set a tag on a specific version.

    Clears the tag from any other version in the same group first.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_name)

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

    await _write_versions(asset_type, group_name, versions)
    return _version_to_dict(target, asset_type, group_name)


async def clear_tag(asset_type: str, group_name: str, version_label: str) -> Optional[dict]:
    """Remove the tag from a specific version."""
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_name)
    target = None
    for v in versions:
        if v.get("version_label") == version_label:
            v["tag"] = None
            target = v
            break

    if target is None:
        return None

    await _write_versions(asset_type, group_name, versions)
    return _version_to_dict(target, asset_type, group_name)


async def delete_version(asset_type: str, group_name: str, version_label: str) -> bool:
    """Delete a specific version from the registry.

    Returns True if the version existed and was deleted.
    Does NOT delete the underlying filesystem asset.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_name)
    new_versions = [v for v in versions if v.get("version_label") != version_label]

    if len(new_versions) == len(versions):
        return False  # not found

    await _write_versions(asset_type, group_name, new_versions)

    # If group is now empty, clean up its directory
    if not new_versions:
        await _remove_group_dir(asset_type, group_name)

    return True


async def delete_group(asset_type: str, group_name: str) -> int:
    """Delete all versions in a group.

    Returns the number of versions deleted.
    Does NOT delete the underlying filesystem assets.
    """
    _validate_asset_type(asset_type)

    versions = await _read_versions(asset_type, group_name)
    count = len(versions)

    if count > 0:
        await _remove_group_dir(asset_type, group_name)

    return count


async def _remove_group_dir(asset_type: str, group_name: str) -> None:
    """Remove the group directory and all its JSON files."""
    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")
    gdir = storage.join(type_dir, group_name)
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

    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")

    if not await storage.exists(type_dir):
        return []

    results: list[dict] = []
    try:
        entries = await storage.ls(type_dir, detail=False)
    except Exception:
        return []

    for entry in entries:
        group_name = entry.rsplit("/", 1)[-1] if "/" in str(entry) else str(entry)
        if not group_name or group_name.startswith("."):
            continue
        versions = await _read_versions(asset_type, group_name)
        for v in versions:
            if v.get("asset_id") == asset_id:
                results.append(_version_to_dict(v, asset_type, group_name))

    return results


async def get_all_asset_group_map(asset_type: str) -> dict[str, list[dict]]:
    """Build a map of asset_id -> list of group memberships.

    This is used by the frontend to efficiently annotate list views
    with version/group information without N+1 queries.
    """
    _validate_asset_type(asset_type)

    root = await get_asset_groups_dir()
    type_dir = storage.join(root, f"{asset_type}s")

    if not await storage.exists(type_dir):
        return {}

    mapping: dict[str, list[dict]] = {}
    try:
        entries = await storage.ls(type_dir, detail=False)
    except Exception:
        return {}

    for entry in entries:
        group_name = entry.rsplit("/", 1)[-1] if "/" in str(entry) else str(entry)
        if not group_name or group_name.startswith("."):
            continue
        versions = await _read_versions(asset_type, group_name)
        for v in versions:
            d = _version_to_dict(v, asset_type, group_name)
            mapping.setdefault(d["asset_id"], []).append(d)

    return mapping
