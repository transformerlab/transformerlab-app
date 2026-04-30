from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from transformerlab_cli.util.chunked_upload import upload_one_file


def _resp(status, data):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = data
    return m


@patch("transformerlab_cli.util.chunked_upload.api.put")
@patch("transformerlab_cli.util.chunked_upload.api.get")
@patch("transformerlab_cli.util.chunked_upload.api.post_json")
def test_upload_one_file_sends_init_chunks_complete(post_json, get, put, tmp_path: Path):
    f = tmp_path / "blob.bin"
    f.write_bytes(b"x" * (3 * 1024 * 1024))  # 3 MB
    post_json.side_effect = [
        _resp(200, {"upload_id": "abc123", "chunk_size": 1024 * 1024}),
        _resp(200, {"temp_path": "/tmp/abc123/assembled"}),
    ]
    get.return_value = _resp(200, {"received": []})
    put.return_value = _resp(200, {"received": [0]})

    upload_id = upload_one_file(str(f))

    assert upload_id == "abc123"
    init_call = post_json.call_args_list[0]
    assert init_call.args[0] == "/upload/init"
    assert init_call.kwargs["json_data"]["filename"] == "blob.bin"
    assert init_call.kwargs["json_data"]["total_size"] == 3 * 1024 * 1024
    assert put.call_count == 3
    complete_call = post_json.call_args_list[1]
    assert complete_call.args[0] == "/upload/abc123/complete"
    assert complete_call.kwargs["json_data"] == {"total_chunks": 3}


@patch("transformerlab_cli.util.chunked_upload.api.put")
@patch("transformerlab_cli.util.chunked_upload.api.get")
@patch("transformerlab_cli.util.chunked_upload.api.post_json")
def test_upload_one_file_skips_already_received_chunks(post_json, get, put, tmp_path: Path):
    f = tmp_path / "blob.bin"
    f.write_bytes(b"x" * (3 * 1024 * 1024))
    post_json.side_effect = [
        _resp(200, {"upload_id": "abc", "chunk_size": 1024 * 1024}),
        _resp(200, {"temp_path": "/tmp/abc/assembled"}),
    ]
    get.return_value = _resp(200, {"received": [0, 1]})
    put.return_value = _resp(200, {"received": [0, 1, 2]})

    upload_one_file(str(f))

    # Only chunk 2 needs uploading.
    assert put.call_count == 1
    args, kwargs = put.call_args
    assert "chunk_index=2" in args[0]


@patch("transformerlab_cli.util.chunked_upload.api.put")
@patch("transformerlab_cli.util.chunked_upload.api.get")
@patch("transformerlab_cli.util.chunked_upload.api.post_json")
def test_upload_one_file_chunk_failure_raises(post_json, get, put, tmp_path: Path):
    f = tmp_path / "blob.bin"
    f.write_bytes(b"x" * 1024)
    post_json.return_value = _resp(200, {"upload_id": "abc", "chunk_size": 1024 * 1024})
    get.return_value = _resp(200, {"received": []})
    put.return_value = _resp(500, {"error": "boom"})

    with pytest.raises(RuntimeError, match="chunk 0 failed"):
        upload_one_file(str(f))


@patch("transformerlab_cli.util.chunked_upload.api.put")
@patch("transformerlab_cli.util.chunked_upload.api.get")
@patch("transformerlab_cli.util.chunked_upload.api.post_json")
def test_upload_one_file_zero_bytes_sends_no_chunks(post_json, get, put, tmp_path: Path):
    f = tmp_path / "empty.bin"
    f.write_bytes(b"")
    post_json.side_effect = [
        _resp(200, {"upload_id": "abc", "chunk_size": 1024 * 1024}),
        _resp(200, {"temp_path": "/tmp/abc/assembled"}),
    ]
    get.return_value = _resp(200, {"received": []})

    upload_id = upload_one_file(str(f))

    assert upload_id == "abc"
    assert put.call_count == 0
    complete_call = post_json.call_args_list[1]
    assert complete_call.kwargs["json_data"] == {"total_chunks": 0}
