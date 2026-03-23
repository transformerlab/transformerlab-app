"""
Service for checking the latest available version of Transformer Lab from GitHub.

Caches the result in memory to avoid hitting GitHub's rate limits.
"""

import logging
import time
import asyncio
from pathlib import Path

import httpx
from packaging.version import Version, InvalidVersion

from lab import HOME_DIR
from tlab_package_init import __version__ as PACKAGE_VERSION

logger = logging.getLogger(__name__)

GITHUB_RELEASES_LATEST_URL = "https://github.com/transformerlab/transformerlab-app/releases/latest"
CACHE_TTL_SECONDS = 3600  # 1 hour

_cached_latest_version: str | None = None
_cache_timestamp: float = 0.0


async def get_current_version() -> str:
    """Read the installed Transformer Lab version from ~/.transformerlab/src/LATEST_VERSION."""
    latest_version_file = Path(HOME_DIR) / "src" / "LATEST_VERSION"
    try:
        version = (await asyncio.to_thread(latest_version_file.read_text, encoding="utf-8")).strip()
        if version:
            return version.lstrip("v")
    except Exception as e:
        logger.warning("Failed to read current version from %s: %s", latest_version_file, e)

    # Fallback for dev/test environments where the install file may not exist.
    return PACKAGE_VERSION


async def fetch_latest_version_from_github() -> str | None:
    """Fetch the latest release version tag from GitHub via redirect on /releases/latest."""
    global _cached_latest_version, _cache_timestamp

    now = time.time()
    if _cached_latest_version is not None and (now - _cache_timestamp) < CACHE_TTL_SECONDS:
        return _cached_latest_version

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.head(GITHUB_RELEASES_LATEST_URL, follow_redirects=False)

        location = response.headers.get("location", "")
        if not location:
            logger.warning("GitHub releases/latest did not return a Location header")
            return _cached_latest_version

        # Location looks like: https://github.com/.../releases/tag/v0.31.1
        tag = location.rsplit("/", 1)[-1]
        version_str = tag.lstrip("v")

        # Validate it parses as a version
        Version(version_str)

        _cached_latest_version = version_str
        _cache_timestamp = now
        return _cached_latest_version

    except Exception as e:
        logger.warning("Failed to fetch latest version from GitHub: %s", e)
        return _cached_latest_version


def _is_update_available(current: str, latest: str | None) -> bool:
    """Return True if latest is a newer version than current."""
    if not latest:
        return False
    try:
        return Version(latest) > Version(current)
    except InvalidVersion:
        return False


async def get_version_info() -> dict:
    """Return current version, latest version, and whether an update is available."""
    current = await get_current_version()
    latest = await fetch_latest_version_from_github()
    return {
        "current_version": current,
        "latest_version": latest,
        "update_available": _is_update_available(current, latest),
    }
