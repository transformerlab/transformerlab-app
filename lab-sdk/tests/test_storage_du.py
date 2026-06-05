import os
import pytest
from unittest.mock import patch
from lab import storage


@pytest.mark.asyncio
async def test_du_sums_local_directory(tmp_path):
    (tmp_path / "a.txt").write_bytes(b"x" * 100)
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "b.txt").write_bytes(b"y" * 250)

    total = await storage.du(str(tmp_path))
    assert total == 350


@pytest.mark.asyncio
async def test_du_missing_path_returns_zero(tmp_path):
    missing = os.path.join(str(tmp_path), "does-not-exist")
    assert await storage.du(missing) == 0


@pytest.mark.asyncio
async def test_du_fallback_when_du_not_implemented(tmp_path):
    """When fs.du raises NotImplementedError, du() falls back to walk/info summing."""
    (tmp_path / "a.txt").write_bytes(b"x" * 100)
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "b.txt").write_bytes(b"y" * 250)

    fs, _ = storage._get_fs_for_path(str(tmp_path))
    with patch.object(fs, "du", side_effect=NotImplementedError("du not supported")):
        total = await storage.du(str(tmp_path))

    assert total == 350
