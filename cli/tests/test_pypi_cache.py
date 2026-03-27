"""Tests for the PyPI version cache module."""

import json
import os
import time
from unittest.mock import MagicMock, patch

from transformerlab_cli.util.pypi import (
    _parse_version,
    _read_cache,
    _write_cache,
    fetch_latest_version,
    is_update_available,
)


def test_parse_version():
    assert _parse_version("0.0.3") == (0, 0, 3)
    assert _parse_version("1.2.3") == (1, 2, 3)
    assert _parse_version("0.0.3") < _parse_version("0.0.4")
    assert _parse_version("0.1.0") > _parse_version("0.0.9")


def test_read_cache_missing_file(tmp_path):
    """Returns None when the cache file does not exist."""
    with patch("transformerlab_cli.util.pypi.CACHE_FILE", str(tmp_path / "nonexistent.json")):
        assert _read_cache() is None


def test_read_cache_expired(tmp_path):
    """Returns None when the cache is older than the TTL."""
    cache_file = str(tmp_path / "cache.json")
    with open(cache_file, "w") as f:
        json.dump({"latest_version": "0.0.4", "timestamp": time.time() - 99999}, f)
    with patch("transformerlab_cli.util.pypi.CACHE_FILE", cache_file):
        assert _read_cache() is None


def test_read_cache_fresh(tmp_path):
    """Returns data when the cache is still fresh."""
    cache_file = str(tmp_path / "cache.json")
    with open(cache_file, "w") as f:
        json.dump({"latest_version": "0.0.4", "timestamp": time.time()}, f)
    with patch("transformerlab_cli.util.pypi.CACHE_FILE", cache_file):
        result = _read_cache()
        assert result is not None
        assert result["latest_version"] == "0.0.4"


def test_write_cache_creates_file(tmp_path):
    """write_cache creates the cache file."""
    cache_file = str(tmp_path / "subdir" / "cache.json")
    with (
        patch("transformerlab_cli.util.pypi.CACHE_FILE", cache_file),
        patch("transformerlab_cli.util.pypi.CONFIG_DIR", str(tmp_path / "subdir")),
    ):
        _write_cache("1.2.3")
    assert os.path.exists(cache_file)
    with open(cache_file) as f:
        data = json.load(f)
    assert data["latest_version"] == "1.2.3"


def test_fetch_latest_version_uses_cache(tmp_path):
    """When cache is fresh, no HTTP call is made."""
    cache_file = str(tmp_path / "cache.json")
    with open(cache_file, "w") as f:
        json.dump({"latest_version": "0.0.5", "timestamp": time.time()}, f)

    with (
        patch("transformerlab_cli.util.pypi.CACHE_FILE", cache_file),
        patch("transformerlab_cli.util.pypi.httpx") as mock_httpx,
    ):
        result = fetch_latest_version()
        mock_httpx.get.assert_not_called()

    assert result == "0.0.5"


def test_fetch_latest_version_queries_pypi():
    """When cache is missing, queries PyPI and writes cache."""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"info": {"version": "0.0.6"}}

    with (
        patch("transformerlab_cli.util.pypi._read_cache", return_value=None),
        patch("transformerlab_cli.util.pypi.httpx") as mock_httpx,
        patch("transformerlab_cli.util.pypi._write_cache") as mock_write,
    ):
        mock_httpx.get.return_value = mock_response
        result = fetch_latest_version()

    assert result == "0.0.6"
    mock_write.assert_called_once_with("0.0.6")


def test_fetch_latest_version_network_error():
    """Returns None on network errors without crashing."""
    with (
        patch("transformerlab_cli.util.pypi._read_cache", return_value=None),
        patch("transformerlab_cli.util.pypi.httpx") as mock_httpx,
    ):
        mock_httpx.get.side_effect = Exception("network error")
        result = fetch_latest_version()

    assert result is None


def test_is_update_available_up_to_date():
    """Returns (installed, None) when up to date."""
    with (
        patch("transformerlab_cli.util.pypi.get_installed_version", return_value="0.0.3"),
        patch("transformerlab_cli.util.pypi.fetch_latest_version", return_value="0.0.3"),
    ):
        installed, latest = is_update_available()
    assert installed == "0.0.3"
    assert latest is None


def test_is_update_available_newer():
    """Returns (installed, latest) when a newer version exists."""
    with (
        patch("transformerlab_cli.util.pypi.get_installed_version", return_value="0.0.3"),
        patch("transformerlab_cli.util.pypi.fetch_latest_version", return_value="0.0.4"),
    ):
        installed, latest = is_update_available()
    assert installed == "0.0.3"
    assert latest == "0.0.4"


def test_is_update_available_unknown_version():
    """Returns (unknown, None) when installed version is unknown."""
    with patch("transformerlab_cli.util.pypi.get_installed_version", return_value="unknown"):
        installed, latest = is_update_available()
    assert installed == "unknown"
    assert latest is None
