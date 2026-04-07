"""Tests for lab.storage_proxy (SDK-side storage proxy client).

HTTP calls are mocked via ``unittest.mock.patch`` on ``requests``.
"""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _set_proxy_env(monkeypatch):
    """Inject the env vars that the storage_proxy module needs."""
    monkeypatch.setenv("_TFL_API_URL", "http://localhost:8338")
    monkeypatch.setenv("_TFL_API_KEY", "tl-test-key-123")
    monkeypatch.setenv("_TFL_TEAM_ID", "team-abc")

    # Clear cached module so env changes are picked up
    import sys

    for mod_name in list(sys.modules):
        if "storage_proxy" in mod_name:
            del sys.modules[mod_name]

    yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _ok_response(json_body: dict | None = None, content: bytes = b"", status: int = 200) -> MagicMock:
    """Build a mock ``requests.Response``."""
    resp = MagicMock()
    resp.status_code = status
    resp.text = ""
    if json_body is not None:
        resp.json.return_value = json_body
    resp.content = content
    resp.iter_content = MagicMock(return_value=[content] if content else [])
    return resp


def _err_response(status: int = 502, text: str = "Server error") -> MagicMock:
    resp = MagicMock()
    resp.status_code = status
    resp.text = text
    return resp


# ---------------------------------------------------------------------------
# is_proxy_mode
# ---------------------------------------------------------------------------


def test_is_proxy_mode_true():
    from lab import storage_proxy

    assert storage_proxy.is_proxy_mode() is True


def test_is_proxy_mode_false(monkeypatch):
    monkeypatch.delenv("_TFL_API_URL", raising=False)
    import sys

    for mod_name in list(sys.modules):
        if "storage_proxy" in mod_name:
            del sys.modules[mod_name]
    from lab import storage_proxy

    assert storage_proxy.is_proxy_mode() is False


# ---------------------------------------------------------------------------
# _auth_headers
# ---------------------------------------------------------------------------


def test_auth_headers():
    from lab import storage_proxy

    headers = storage_proxy._auth_headers()
    assert headers["Authorization"] == "Bearer tl-test-key-123"
    assert headers["X-Team-Id"] == "team-abc"


# ---------------------------------------------------------------------------
# exists / isdir / isfile
# ---------------------------------------------------------------------------


def test_exists_true():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"result": True})):
        assert storage_proxy.exists("s3://b/k") is True


def test_exists_false():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"result": False})):
        assert storage_proxy.exists("s3://b/missing") is False


def test_isdir():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"result": True})):
        assert storage_proxy.isdir("s3://b/dir/") is True


def test_isfile():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"result": False})):
        assert storage_proxy.isfile("s3://b/missing") is False


# ---------------------------------------------------------------------------
# makedirs
# ---------------------------------------------------------------------------


def test_makedirs_calls_proxy():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.makedirs("s3://b/new/dir")

    call_kwargs = mock_post.call_args
    assert "makedirs" in call_kwargs[1].get("url", call_kwargs[0][0] if call_kwargs[0] else "")


# ---------------------------------------------------------------------------
# rm / rm_tree
# ---------------------------------------------------------------------------


def test_rm_calls_proxy():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.rm("s3://b/file.txt")

    json_sent = mock_post.call_args[1].get("json", {})
    assert json_sent.get("recursive") is False


def test_rm_tree_calls_proxy():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.rm_tree("s3://b/dir/")

    json_sent = mock_post.call_args[1].get("json", {})
    assert json_sent.get("recursive") is True


# ---------------------------------------------------------------------------
# ls / find
# ---------------------------------------------------------------------------


def test_ls():
    from lab import storage_proxy

    paths = ["s3://b/a/1.txt", "s3://b/a/2.txt"]
    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"paths": paths})):
        result = storage_proxy.ls("s3://b/a")

    assert result == paths


def test_find():
    from lab import storage_proxy

    paths = ["s3://b/a/1.txt", "s3://b/a/sub/2.txt"]
    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"paths": paths})):
        result = storage_proxy.find("s3://b/a")

    assert result == paths


# ---------------------------------------------------------------------------
# read_bytes / read_text
# ---------------------------------------------------------------------------


def test_read_bytes():
    from lab import storage_proxy

    resp = _ok_response(content=b"raw-data")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        data = storage_proxy.read_bytes("s3://b/file.bin")

    assert data == b"raw-data"


def test_read_text():
    from lab import storage_proxy

    resp = _ok_response(content=b"hello text")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        text = storage_proxy.read_text("s3://b/file.txt")

    assert text == "hello text"


def test_read_bytes_not_found():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_err_response(404, "Not found")):
        with pytest.raises(FileNotFoundError):
            storage_proxy.read_bytes("s3://b/missing")


# ---------------------------------------------------------------------------
# write_bytes / write_text
# ---------------------------------------------------------------------------


def test_write_bytes():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.write_bytes("s3://b/dst.bin", b"payload")

    assert mock_post.call_args[1]["data"] == b"payload"


def test_write_text():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.write_text("s3://b/dst.txt", "hello")

    assert mock_post.call_args[1]["data"] == b"hello"


def test_write_bytes_error():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_err_response(502, "fail")):
        with pytest.raises(RuntimeError, match="Storage proxy write failed"):
            storage_proxy.write_bytes("s3://b/k", b"x")


# ---------------------------------------------------------------------------
# ProxyFile
# ---------------------------------------------------------------------------


def test_proxy_file_read():
    from lab import storage_proxy

    resp = _ok_response(content=b"file content")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        pf = storage_proxy.ProxyFile("s3://b/f.txt", mode="r")
        assert pf.read() == "file content"


def test_proxy_file_read_binary():
    from lab import storage_proxy

    resp = _ok_response(content=b"\x00\x01\x02")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        pf = storage_proxy.ProxyFile("s3://b/f.bin", mode="rb")
        assert pf.read() == b"\x00\x01\x02"


def test_proxy_file_write_flushes_on_close():
    """ProxyFile writes data to the proxy only when close() is called."""
    from lab import storage_proxy

    # Create a write-mode file — no network call yet
    pf = storage_proxy.ProxyFile("s3://b/out.txt", mode="w")
    pf.write("hello ")
    pf.write("world")

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        pf.close()

    # write_bytes should have been called with the full content
    assert mock_post.call_args[1]["data"] == b"hello world"


def test_proxy_file_context_manager():
    from lab import storage_proxy

    resp = _ok_response(content=b"ctx")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        with storage_proxy.ProxyFile("s3://b/f.txt", mode="r") as f:
            assert f.read() == "ctx"


# ---------------------------------------------------------------------------
# open_file
# ---------------------------------------------------------------------------


def test_open_file_returns_proxy_file():
    from lab import storage_proxy

    resp = _ok_response(content=b"opened")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        pf = storage_proxy.open_file("s3://b/f.txt", mode="r")

    assert isinstance(pf, storage_proxy.ProxyFile)
    assert pf.read() == "opened"


# ---------------------------------------------------------------------------
# Backward-compat wrappers (get / put / list_keys)
# ---------------------------------------------------------------------------


def test_get_downloads_to_file(tmp_path):
    from lab import storage_proxy

    dest = tmp_path / "downloaded.txt"
    resp = _ok_response(content=b"file-data")
    with patch.object(storage_proxy._requests, "post", return_value=resp):
        storage_proxy.get("my-bucket", "models/checkpoint.bin", str(dest))

    assert dest.read_bytes() == b"file-data"


def test_put_uploads_from_file(tmp_path):
    from lab import storage_proxy

    src = tmp_path / "upload.txt"
    src.write_bytes(b"upload-data")

    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"status": "ok"})) as mock_post:
        storage_proxy.put("my-bucket", "uploads/file.txt", str(src))

    assert mock_post.call_args[1]["data"] == b"upload-data"


def test_list_keys():
    from lab import storage_proxy

    paths = ["s3://my-bucket/a/1.txt", "s3://my-bucket/a/2.txt"]
    with patch.object(storage_proxy._requests, "post", return_value=_ok_response({"paths": paths})):
        result = storage_proxy.list_keys("my-bucket", prefix="a/")

    assert result == paths


# ---------------------------------------------------------------------------
# Error: missing env var
# ---------------------------------------------------------------------------


def test_raises_without_api_url(monkeypatch):
    """Functions raise RuntimeError when _TFL_API_URL is not set."""
    monkeypatch.delenv("_TFL_API_URL", raising=False)

    import sys

    for mod_name in list(sys.modules):
        if "storage_proxy" in mod_name:
            del sys.modules[mod_name]

    from lab import storage_proxy

    with pytest.raises(RuntimeError, match="_TFL_API_URL"):
        storage_proxy.exists("s3://b/k")


# ---------------------------------------------------------------------------
# Error: non-200 from _post_json
# ---------------------------------------------------------------------------


def test_post_json_error():
    from lab import storage_proxy

    with patch.object(storage_proxy._requests, "post", return_value=_err_response(502, "backend down")):
        with pytest.raises(RuntimeError, match="Storage proxy .* failed"):
            storage_proxy.exists("s3://b/k")
