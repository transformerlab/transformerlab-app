"""Check the latest CLI version on PyPI with local file-based caching."""

import json
import os
import time
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as pkg_version

import httpx

from transformerlab_cli.util.shared import CONFIG_DIR

PYPI_URL = "https://pypi.org/pypi/transformerlab-cli/json"
CACHE_FILE = os.path.join(CONFIG_DIR, ".version_cache.json")
CACHE_TTL_SECONDS = 4 * 60 * 60  # 4 hours


def get_installed_version() -> str:
    """Return the installed CLI version from package metadata, or 'unknown'."""
    try:
        return pkg_version("transformerlab-cli")
    except PackageNotFoundError:
        return "unknown"


def _parse_version(v: str) -> tuple[int, ...]:
    """Parse 'X.Y.Z' into a tuple of ints for comparison."""
    return tuple(int(x) for x in v.split("."))


def _read_cache() -> dict | None:
    """Read the cache file. Returns parsed dict or None if missing/expired/corrupt."""
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        if time.time() - data.get("timestamp", 0) > CACHE_TTL_SECONDS:
            return None
        if "latest_version" not in data:
            return None
        return data
    except Exception:
        return None


def _write_cache(latest_version: str) -> None:
    """Write version data + current timestamp to cache file."""
    try:
        os.makedirs(CONFIG_DIR, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump({"latest_version": latest_version, "timestamp": time.time()}, f)
    except Exception:
        pass


def fetch_latest_version() -> str | None:
    """Check cache first; if stale/missing, query PyPI. Returns latest version string or None."""
    try:
        cached = _read_cache()
        if cached is not None:
            return cached["latest_version"]

        response = httpx.get(PYPI_URL, timeout=3.0)
        if response.status_code != 200:
            return None

        latest = response.json()["info"]["version"]
        _write_cache(latest)
        return latest
    except Exception:
        return None


def is_update_available() -> tuple[str, str | None]:
    """Return (installed_version, latest_or_None).

    ``latest`` is the newer version string when an update is available,
    or ``None`` when the CLI is up-to-date or the check failed.
    """
    try:
        installed = get_installed_version()
        if installed == "unknown":
            return installed, None

        latest = fetch_latest_version()
        if latest is None:
            return installed, None

        if _parse_version(latest) > _parse_version(installed):
            return installed, latest

        return installed, None
    except Exception:
        return get_installed_version(), None
