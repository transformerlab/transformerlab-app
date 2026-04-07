"""Tests for transformerlab.services.storage_service (cloud-agnostic storage proxy helpers).

All ``lab.storage`` calls are mocked so the tests are fast and deterministic.
"""

import pytest
from unittest.mock import AsyncMock, patch

from transformerlab.services import storage_service


# ---------------------------------------------------------------------------
# get_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_object_happy_path():
    """get_object returns a StreamingResponse whose body matches mocked storage data."""
    file_data = b"hello-world"

    mock_file = AsyncMock()
    mock_file.read = AsyncMock(side_effect=[file_data, b""])
    mock_file.__aenter__ = AsyncMock(return_value=mock_file)
    mock_file.__aexit__ = AsyncMock(return_value=False)

    with (
        patch("lab.storage.exists", new_callable=AsyncMock, return_value=True),
        patch("lab.storage.open", new_callable=AsyncMock, return_value=mock_file),
    ):
        response = await storage_service.get_object("s3://my-bucket/some/key.txt")

        assert response.media_type == "application/octet-stream"

        # Collect streamed chunks — must happen inside the mock context because
        # the _stream() generator calls storage.open lazily.
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            chunks.append(chunk)
        assert b"".join(chunks) == file_data


@pytest.mark.asyncio
async def test_get_object_not_found():
    """get_object raises FileNotFoundError when the path does not exist."""
    with patch("lab.storage.exists", new_callable=AsyncMock, return_value=False):
        with pytest.raises(FileNotFoundError, match="not found"):
            await storage_service.get_object("s3://my-bucket/missing/key")


# ---------------------------------------------------------------------------
# put_object
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_put_object_happy_path():
    """put_object writes data via lab.storage.open in write mode."""
    mock_file = AsyncMock()
    mock_file.write = AsyncMock()
    mock_file.__aenter__ = AsyncMock(return_value=mock_file)
    mock_file.__aexit__ = AsyncMock(return_value=False)

    with patch("lab.storage.open", new_callable=AsyncMock, return_value=mock_file):
        await storage_service.put_object("s3://my-bucket/dst/key.bin", b"data-bytes")

    mock_file.write.assert_called_once_with(b"data-bytes")


@pytest.mark.asyncio
async def test_put_object_storage_error():
    """put_object raises RuntimeError when the underlying storage call fails."""
    mock_file = AsyncMock()
    mock_file.write = AsyncMock(side_effect=OSError("disk full"))
    mock_file.__aenter__ = AsyncMock(return_value=mock_file)
    mock_file.__aexit__ = AsyncMock(return_value=False)

    with patch("lab.storage.open", new_callable=AsyncMock, return_value=mock_file):
        with pytest.raises(RuntimeError, match="Storage put failed"):
            await storage_service.put_object("s3://b/k", b"x")


# ---------------------------------------------------------------------------
# list_objects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_objects_happy_path():
    """list_objects returns child paths from lab.storage.ls."""
    expected = ["s3://my-bucket/a/1.txt", "s3://my-bucket/a/2.txt"]

    with patch("lab.storage.ls", new_callable=AsyncMock, return_value=expected):
        paths = await storage_service.list_objects("s3://my-bucket/a/")

    assert paths == expected


@pytest.mark.asyncio
async def test_list_objects_not_found_returns_empty():
    """list_objects returns an empty list when the path does not exist."""
    with patch("lab.storage.ls", new_callable=AsyncMock, side_effect=FileNotFoundError):
        paths = await storage_service.list_objects("s3://my-bucket/empty/")

    assert paths == []


@pytest.mark.asyncio
async def test_list_objects_storage_error():
    """list_objects raises RuntimeError on unexpected storage errors."""
    with patch("lab.storage.ls", new_callable=AsyncMock, side_effect=OSError("access denied")):
        with pytest.raises(RuntimeError, match="Storage ls failed"):
            await storage_service.list_objects("s3://locked-bucket")


# ---------------------------------------------------------------------------
# Filesystem metadata helpers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fs_exists():
    """fs_exists delegates to lab.storage.exists."""
    with patch("lab.storage.exists", new_callable=AsyncMock, return_value=True):
        assert await storage_service.fs_exists("s3://b/k") is True


@pytest.mark.asyncio
async def test_fs_isdir():
    """fs_isdir delegates to lab.storage.isdir."""
    with patch("lab.storage.isdir", new_callable=AsyncMock, return_value=True):
        assert await storage_service.fs_isdir("s3://b/dir/") is True


@pytest.mark.asyncio
async def test_fs_isfile():
    """fs_isfile delegates to lab.storage.isfile."""
    with patch("lab.storage.isfile", new_callable=AsyncMock, return_value=False):
        assert await storage_service.fs_isfile("s3://b/missing") is False


@pytest.mark.asyncio
async def test_fs_makedirs():
    """fs_makedirs delegates to lab.storage.makedirs."""
    with patch("lab.storage.makedirs", new_callable=AsyncMock) as mock_mk:
        await storage_service.fs_makedirs("s3://b/new/dir")
    mock_mk.assert_called_once_with("s3://b/new/dir", exist_ok=True)


@pytest.mark.asyncio
async def test_fs_rm_file():
    """fs_rm (non-recursive) delegates to lab.storage.rm."""
    with patch("lab.storage.rm", new_callable=AsyncMock) as mock_rm:
        await storage_service.fs_rm("s3://b/file.txt", recursive=False)
    mock_rm.assert_called_once_with("s3://b/file.txt")


@pytest.mark.asyncio
async def test_fs_rm_tree():
    """fs_rm (recursive) delegates to lab.storage.rm_tree."""
    with patch("lab.storage.rm_tree", new_callable=AsyncMock) as mock_rm:
        await storage_service.fs_rm("s3://b/dir/", recursive=True)
    mock_rm.assert_called_once_with("s3://b/dir/")


@pytest.mark.asyncio
async def test_fs_find():
    """fs_find delegates to lab.storage.find."""
    expected = ["s3://b/a/1.txt", "s3://b/a/2.txt"]
    with patch("lab.storage.find", new_callable=AsyncMock, return_value=expected):
        result = await storage_service.fs_find("s3://b/a")
    assert result == expected


@pytest.mark.asyncio
async def test_fs_find_storage_error():
    """fs_find raises RuntimeError on unexpected storage errors."""
    with patch("lab.storage.find", new_callable=AsyncMock, side_effect=OSError("gone")):
        with pytest.raises(RuntimeError, match="Storage find failed"):
            await storage_service.fs_find("s3://b/a")
