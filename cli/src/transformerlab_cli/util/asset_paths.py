"""Path helpers for asset upload commands (model, dataset, task).

Walks user-supplied paths into (local_path, server_relpath) tuples and validates
relpaths against path-traversal attacks before sending them to the server.
"""

import os
from typing import Iterable, Iterator


class InvalidRelpathError(ValueError):
    """Raised when a relpath would escape its asset directory or is malformed."""


def sanitize_relpath(relpath: str) -> str:
    """Normalise and validate a relpath. Returns the canonical posix-style relpath.

    Rejects: empty strings, absolute paths, NUL bytes, paths whose normalised form
    contains '..' segments, and paths ending in a separator.
    """
    if not relpath:
        raise InvalidRelpathError("relpath must be non-empty")
    if "\x00" in relpath:
        raise InvalidRelpathError("relpath must not contain NUL")
    # Treat backslashes as separators for cross-platform safety.
    candidate = relpath.replace("\\", "/")
    if candidate.startswith("/"):
        raise InvalidRelpathError(f"relpath must be relative: {relpath!r}")
    if candidate.endswith("/"):
        raise InvalidRelpathError(f"relpath must not end with '/': {relpath!r}")
    parts = candidate.split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise InvalidRelpathError(f"relpath has invalid segment: {relpath!r}")
    return "/".join(parts)


def walk_inputs(paths: Iterable[str]) -> Iterator[tuple[str, str]]:
    """Yield (local_path, relpath) for every regular file under each input path.

    - A file argument yields exactly one tuple with the file's basename as relpath.
    - A directory argument is walked recursively; relpaths are relative to that dir.
    - Hidden entries (anything whose basename starts with '.') are skipped.
    - Symlinks are skipped (we don't want to silently follow links to host files).
    - Missing paths raise FileNotFoundError immediately.
    """
    for raw in paths:
        if not os.path.exists(raw) and not os.path.islink(raw):
            raise FileNotFoundError(raw)
        if os.path.islink(raw):
            # Skip symlinks at the top level too.
            continue
        if os.path.isfile(raw):
            base = os.path.basename(raw)
            if base.startswith("."):
                continue
            yield raw, sanitize_relpath(base)
            continue
        # Directory walk
        for root, dirs, files in os.walk(raw, followlinks=False):
            # Skip hidden directories in-place so os.walk doesn't descend.
            dirs[:] = [d for d in dirs if not d.startswith(".")]
            for name in files:
                if name.startswith("."):
                    continue
                full = os.path.join(root, name)
                if os.path.islink(full):
                    continue
                rel = os.path.relpath(full, raw)
                yield full, sanitize_relpath(rel)
