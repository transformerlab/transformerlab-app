"""Shared upload-acceptance logic for model and dataset routers.

Validates a server-supplied relpath, ensures the destination dir exists, and
copies the assembled file from the upload-staging area into place.
"""

from lab import storage


class InvalidRelpathError(ValueError):
    """Raised when the client-supplied relpath would escape the asset directory."""


class RelpathConflictError(FileExistsError):
    """Raised when the relpath already exists and force=False."""


def _sanitize_relpath(relpath: str) -> str:
    if not relpath:
        raise InvalidRelpathError("relpath must be non-empty")
    if "\x00" in relpath:
        raise InvalidRelpathError("relpath must not contain NUL")
    candidate = relpath.replace("\\", "/")
    if candidate.startswith("/"):
        raise InvalidRelpathError("relpath must be relative")
    if candidate.endswith("/"):
        raise InvalidRelpathError("relpath must not end with '/'")
    parts = candidate.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise InvalidRelpathError("relpath has invalid segment")
    return "/".join(parts)


async def accept_uploaded_file(
    *,
    asset_dir: str,
    assembled_path: str,
    relpath: str,
    force: bool,
) -> str:
    """Copy the assembled file at `assembled_path` into `asset_dir/<relpath>`.

    Returns the final destination path. Lazy-creates `asset_dir` and any
    intermediate dirs implied by `relpath`. Raises RelpathConflictError if the
    target already exists and `force` is False; raises InvalidRelpathError on
    bad relpath.
    """
    safe = _sanitize_relpath(relpath)
    target = storage.join(asset_dir, *safe.split("/"))
    parent = storage.join(asset_dir, *safe.split("/")[:-1]) if "/" in safe else asset_dir

    await storage.makedirs(parent, exist_ok=True)
    if not force and await storage.exists(target):
        raise RelpathConflictError(relpath)
    await storage.copy_file(assembled_path, target)
    return target
