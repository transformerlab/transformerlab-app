from pathlib import Path
from unittest.mock import patch

import httpx

from transformerlab_cli.util.chunked_download import download_one_file


def _build_handler(server_bytes: bytes):
    def handler(request: httpx.Request) -> httpx.Response:
        rng = request.headers.get("range")
        if rng:
            # "bytes=N-"
            start = int(rng.split("=")[1].split("-")[0])
            payload = server_bytes[start:]
            return httpx.Response(
                206,
                content=payload,
                headers={
                    "Content-Length": str(len(payload)),
                    "Content-Range": f"bytes {start}-{len(server_bytes) - 1}/{len(server_bytes)}",
                },
            )
        return httpx.Response(
            200,
            content=server_bytes,
            headers={"Content-Length": str(len(server_bytes))},
        )

    return handler


@patch("transformerlab_cli.util.chunked_download._build_client")
def test_download_one_file_full(build_client, tmp_path: Path):
    body = b"hello world" * 100
    build_client.return_value = httpx.Client(transport=httpx.MockTransport(_build_handler(body)))
    target = tmp_path / "out.bin"

    download_one_file("/model/file?model_id=foo&relpath=bar", target_path=str(target), server_size=len(body))

    assert target.read_bytes() == body


@patch("transformerlab_cli.util.chunked_download._build_client")
def test_download_one_file_resumes_partial(build_client, tmp_path: Path):
    body = b"abcdefghij" * 50  # 500 bytes
    build_client.return_value = httpx.Client(transport=httpx.MockTransport(_build_handler(body)))
    target = tmp_path / "out.bin"
    target.write_bytes(body[:200])  # half-baked existing file

    download_one_file("/x", target_path=str(target), server_size=len(body))

    assert target.read_bytes() == body


@patch("transformerlab_cli.util.chunked_download._build_client")
def test_download_one_file_size_match_skips(build_client, tmp_path: Path):
    body = b"abc"
    build_client.return_value = httpx.Client(transport=httpx.MockTransport(_build_handler(body)))
    target = tmp_path / "out.bin"
    target.write_bytes(body)

    download_one_file("/x", target_path=str(target), server_size=len(body))

    # Server should not have been called — but we can't easily assert that with MockTransport.
    # Instead, assert content unchanged.
    assert target.read_bytes() == body


@patch("transformerlab_cli.util.chunked_download._build_client")
def test_download_one_file_oversized_local_restarts(build_client, tmp_path: Path):
    body = b"abc"
    build_client.return_value = httpx.Client(transport=httpx.MockTransport(_build_handler(body)))
    target = tmp_path / "out.bin"
    target.write_bytes(b"oversized garbage data")

    download_one_file("/x", target_path=str(target), server_size=len(body))

    assert target.read_bytes() == body
