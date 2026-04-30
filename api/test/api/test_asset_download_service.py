import pytest
from fastapi.responses import StreamingResponse

from transformerlab.services import asset_download_service


@pytest.fixture
def asset_dir(tmp_path):
    d = tmp_path / "asset"
    d.mkdir()
    (d / "config.json").write_bytes(b"{}")
    (d / "sub").mkdir()
    (d / "sub" / "weights.bin").write_bytes(b"x" * 1024)
    return str(d)


@pytest.mark.asyncio
async def test_list_files_returns_relpaths_and_sizes(asset_dir):
    files = await asset_download_service.list_files(asset_dir)
    files_by_rel = {f["relpath"]: f["size"] for f in files}
    assert files_by_rel["config.json"] == 2
    assert files_by_rel["sub/weights.bin"] == 1024


@pytest.mark.asyncio
async def test_list_files_missing_dir_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        await asset_download_service.list_files(str(tmp_path / "nope"))


@pytest.mark.asyncio
async def test_stream_file_full(asset_dir):
    resp = await asset_download_service.stream_file(asset_dir, "config.json", range_header=None)
    assert isinstance(resp, StreamingResponse)
    assert resp.status_code == 200
    assert resp.headers["content-length"] == "2"
    assert resp.headers["accept-ranges"] == "bytes"


@pytest.mark.asyncio
async def test_stream_file_range_returns_206(asset_dir):
    resp = await asset_download_service.stream_file(asset_dir, "sub/weights.bin", range_header="bytes=10-")
    assert resp.status_code == 206
    assert resp.headers["content-length"] == str(1024 - 10)
    assert resp.headers["content-range"] == "bytes 10-1023/1024"


@pytest.mark.asyncio
async def test_stream_file_invalid_range_returns_416(asset_dir):
    resp = await asset_download_service.stream_file(asset_dir, "sub/weights.bin", range_header="bytes=2000-")
    assert resp.status_code == 416


@pytest.mark.asyncio
@pytest.mark.parametrize("bad", ["../escape", "/abs", "sub/../../escape", ""])
async def test_stream_file_rejects_traversal(asset_dir, bad):
    with pytest.raises(asset_download_service.InvalidRelpathError):
        await asset_download_service.stream_file(asset_dir, bad, range_header=None)
