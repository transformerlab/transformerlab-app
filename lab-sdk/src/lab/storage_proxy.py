from __future__ import annotations

import io
import os
from typing import List, Optional

import requests as _requests

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def is_proxy_mode() -> bool:
    """Return True if the storage proxy should be used (remote node)."""
    return bool(os.environ.get("_TFL_API_URL"))


def _api_url() -> str:
    url = os.environ.get("_TFL_API_URL", "")
    if not url:
        raise RuntimeError(
            "Storage proxy not configured: _TFL_API_URL environment variable is not set. "
            "This usually means the job was not launched through the Transformer Lab provider system."
        )
    return url.rstrip("/")


def _auth_headers() -> dict[str, str]:
    """Build HTTP headers with the auth token and team id."""
    token = os.environ.get("_TFL_API_KEY", "")
    team_id = os.environ.get("_TFL_TEAM_ID", "")
    headers: dict[str, str] = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if team_id:
        headers["X-Team-Id"] = team_id
    return headers


def _post_json(endpoint: str, json_body: dict, timeout: int = 120) -> dict:
    """POST JSON to a proxy endpoint and return the parsed response body."""
    url = f"{_api_url()}/storage/proxy/{endpoint}"
    resp = _requests.post(url, json=json_body, headers=_auth_headers(), timeout=timeout)
    if resp.status_code != 200:
        raise RuntimeError(f"Storage proxy {endpoint} failed (HTTP {resp.status_code}): {resp.text}")
    return resp.json()


# ---------------------------------------------------------------------------
# Filesystem metadata operations (mirror lab.storage API)
# ---------------------------------------------------------------------------


def exists(path: str) -> bool:
    """Check whether *path* exists (via proxy)."""
    data = _post_json("exists", {"path": path})
    return bool(data.get("result", False))


def isdir(path: str) -> bool:
    """Check whether *path* is a directory (via proxy)."""
    data = _post_json("isdir", {"path": path})
    return bool(data.get("result", False))


def isfile(path: str) -> bool:
    """Check whether *path* is a file (via proxy)."""
    data = _post_json("isfile", {"path": path})
    return bool(data.get("result", False))


def makedirs(path: str, exist_ok: bool = True) -> None:
    """Create directory tree at *path* (via proxy)."""
    _post_json("makedirs", {"path": path, "exist_ok": exist_ok})


def rm(path: str) -> None:
    """Remove a single file (via proxy)."""
    _post_json("rm", {"path": path, "recursive": False})


def rm_tree(path: str) -> None:
    """Recursively remove a directory tree (via proxy)."""
    _post_json("rm", {"path": path, "recursive": True})


def ls(path: str, detail: bool = False) -> list:
    """List children of *path* (via proxy). *detail* is ignored in proxy mode."""
    data = _post_json("ls", {"path": path})
    return data.get("paths", [])


def find(path: str) -> list[str]:
    """Recursively list all files under *path* (via proxy)."""
    data = _post_json("find", {"path": path})
    return data.get("paths", [])


# ---------------------------------------------------------------------------
# File read / write
# ---------------------------------------------------------------------------


def read_bytes(path: str) -> bytes:
    """Read the entire contents of *path* as bytes (via proxy)."""
    url = f"{_api_url()}/storage/proxy/get"
    resp = _requests.post(url, json={"path": path}, headers=_auth_headers(), stream=True, timeout=300)
    if resp.status_code == 404:
        raise FileNotFoundError(f"{path} not found")
    if resp.status_code != 200:
        raise RuntimeError(f"Storage proxy read failed (HTTP {resp.status_code}): {resp.text}")
    chunks: list[bytes] = []
    for chunk in resp.iter_content(chunk_size=1024 * 1024):
        chunks.append(chunk)
    return b"".join(chunks)


def read_text(path: str, encoding: str = "utf-8") -> str:
    """Read the entire contents of *path* as text (via proxy)."""
    return read_bytes(path).decode(encoding)


def write_bytes(path: str, data: bytes) -> None:
    """Write *data* to *path* (via proxy)."""
    url = f"{_api_url()}/storage/proxy/put"
    resp = _requests.post(
        url,
        data=data,
        headers={**_auth_headers(), "Content-Type": "application/octet-stream"},
        params={"path": path},
        timeout=300,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Storage proxy write failed (HTTP {resp.status_code}): {resp.text}")


def write_text(path: str, text: str, encoding: str = "utf-8") -> None:
    """Write *text* to *path* (via proxy)."""
    write_bytes(path, text.encode(encoding))


class ProxyFile:
    """In-memory file-like object that reads from / writes to the proxy.

    Used by ``lab.storage.open()`` when proxy mode is active.  Supports the
    async context-manager protocol expected by ``AsyncFileWrapper`` /
    ``aiofiles``-style callers via thin wrappers.

    Only the subset of the file API actually used by the SDK is implemented:
    ``read``, ``write``, ``close``.
    """

    def __init__(self, path: str, mode: str = "r", encoding: Optional[str] = None):
        self._path = path
        self._mode = mode
        self._encoding = encoding
        self._buffer = io.BytesIO()
        self._closed = False

        # For read modes, eagerly fetch the content
        if "r" in mode and "w" not in mode and "a" not in mode:
            try:
                raw = read_bytes(path)
            except FileNotFoundError:
                raw = b""
            self._buffer = io.BytesIO(raw)

    def read(self, size: int = -1) -> str | bytes:
        raw = self._buffer.read(size)
        if self._encoding or ("b" not in self._mode):
            return raw.decode(self._encoding or "utf-8")
        return raw

    def write(self, data: str | bytes) -> int:
        if isinstance(data, str):
            encoded = data.encode(self._encoding or "utf-8")
        else:
            encoded = data
        return self._buffer.write(encoded)

    def readline(self, size: int = -1) -> str | bytes:
        raw = self._buffer.readline(size)
        if self._encoding or ("b" not in self._mode):
            return raw.decode(self._encoding or "utf-8")
        return raw

    def readlines(self, hint: int = -1) -> list:
        lines = self._buffer.readlines(hint)
        if self._encoding or ("b" not in self._mode):
            return [line.decode(self._encoding or "utf-8") for line in lines]
        return lines

    def seek(self, offset: int, whence: int = 0) -> int:
        return self._buffer.seek(offset, whence)

    def tell(self) -> int:
        return self._buffer.tell()

    def flush(self) -> None:
        pass  # no-op; actual flush happens on close

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        # On write/append modes, flush the buffer to the proxy
        if any(c in self._mode for c in ("w", "a")):
            write_bytes(self._path, self._buffer.getvalue())

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()


def open_file(path: str, mode: str = "r", encoding: Optional[str] = None) -> ProxyFile:
    """Open a remote file via the proxy. Returns a ``ProxyFile`` instance."""
    return ProxyFile(path, mode=mode, encoding=encoding)


# ---------------------------------------------------------------------------
# Convenience wrappers (original public API kept for backward compat)
# ---------------------------------------------------------------------------


def get(bucket: str, key: str, local_path: str) -> None:
    """Download ``s3://<bucket>/<key>`` to *local_path* via the storage proxy."""
    full_path = f"s3://{bucket}/{key}"
    data = read_bytes(full_path)
    with open(local_path, "wb") as f:
        f.write(data)


def put(bucket: str, key: str, local_path: str) -> None:
    """Upload *local_path* to ``s3://<bucket>/<key>`` via the storage proxy."""
    full_path = f"s3://{bucket}/{key}"
    with open(local_path, "rb") as f:
        data = f.read()
    write_bytes(full_path, data)


def list_keys(bucket: str, prefix: str = "") -> List[str]:
    """List object keys in *bucket* (optionally filtered by *prefix*) via the proxy."""
    full_path = f"s3://{bucket}"
    if prefix:
        full_path = f"{full_path}/{prefix.rstrip('/')}"
    return ls(full_path)
