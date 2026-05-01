import asyncio
import os
import posixpath
import contextvars
import threading
from types import TracebackType
from typing import Optional, Type

import fsspec
import aiofiles

import logging

# Suppress the specific task exception log if it's polluting your logs
logging.getLogger("aiobotocore").setLevel(logging.CRITICAL)
logging.getLogger("s3fs").setLevel(logging.CRITICAL)


class AsyncFileWrapper:
    """
    Wrapper to make sync file objects work with async context managers.

    All I/O methods dispatch to a thread pool via asyncio.to_thread so that
    blocking S3/GCS network calls never stall the event loop.
    """

    def __init__(self, file_obj):
        # Store the file object (which may be a context manager)
        self._file_obj = file_obj
        self.file_obj = None
        self._is_context_manager = hasattr(file_obj, "__enter__") and hasattr(file_obj, "__exit__")

    async def __aenter__(self):
        # Enter the sync context manager in a thread — for S3 this is where
        # the actual HTTP connection / GetObject request is initiated.
        if self._is_context_manager:
            self.file_obj = await asyncio.to_thread(self._file_obj.__enter__)
        else:
            self.file_obj = self._file_obj
        return self

    async def __aexit__(
        self,
        exc_type: Optional[Type[BaseException]],
        exc_val: Optional[BaseException],
        exc_tb: Optional[TracebackType],
    ) -> None:
        if self._is_context_manager:
            await asyncio.to_thread(self._file_obj.__exit__, exc_type, exc_val, exc_tb)
        elif self.file_obj and hasattr(self.file_obj, "close"):
            await asyncio.to_thread(self.file_obj.close)
        self.file_obj = None

    async def read(self, size=-1):
        """Read bytes from the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.read, size)

    async def write(self, data):
        """Write data to the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.write, data)

    async def readline(self, size=-1):
        """Read a single line from the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.readline, size)

    async def readlines(self, hint=-1):
        """Read all lines from the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.readlines, hint)

    async def seek(self, offset, whence=0):
        """Seek to the given position in the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.seek, offset, whence)

    async def tell(self):
        """Return the current file position."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.tell)

    async def flush(self):
        """Flush any buffered writes to the file."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return await asyncio.to_thread(self.file_obj.flush)

    def __getattr__(self, name):
        # Delegate all other attributes to the underlying file object
        if self.file_obj is None:
            raise AttributeError(f"'{type(self).__name__}' object has no attribute '{name}'")
        return getattr(self.file_obj, name)

    def __iter__(self):
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return iter(self.file_obj)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        try:
            return await asyncio.to_thread(next, self.file_obj)
        except StopIteration:
            raise StopAsyncIteration


# Context variable for storage URI (set by host app/session)
_current_tfl_storage_uri: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_tfl_storage_uri", default=None
)

# Single source: aws | gcp | azure | localfs (default aws for backward compatibility)
STORAGE_PROVIDER = (os.getenv("TFL_STORAGE_PROVIDER") or "aws").strip().lower()
_AWS_PROFILE = os.getenv("AWS_PROFILE", "transformerlab-s3")
_GCP_PROJECT = os.getenv("GCP_PROJECT", "transformerlab-workspace")
_AZURE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
_AZURE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT")
_AZURE_ACCOUNT_KEY = os.getenv("AZURE_STORAGE_KEY")
_AZURE_SAS_TOKEN = os.getenv("AZURE_STORAGE_SAS_TOKEN")

# Common prefixes that represent remote storage locations handled by this module
_REMOTE_PATH_PREFIXES: tuple[str, ...] = ("s3://", "gs://", "gcs://", "abfs://")

# Module-level cache for "uncached" filesystem instances.
# Keyed by (protocol, normalized credential/storage options), so we avoid
# mixing auth contexts while still reusing long-lived connection pools.
_uncached_fs_cache: dict[tuple[str, tuple[tuple[str, str], ...]], "fsspec.AbstractFileSystem"] = {}
_uncached_fs_lock = threading.Lock()


def _is_localfs_org_scoped_uri(uri: str | None) -> bool:
    """Return True when uri is a localfs path containing /orgs/<org_id>/... ."""
    if not uri:
        return False

    # Only apply this check to plain local filesystem paths.
    if is_remote_path(uri):
        return False

    parts = [p for p in os.path.normpath(uri).split(os.sep) if p]
    for i, part in enumerate(parts[:-1]):
        if part == "orgs" and parts[i + 1] not in {"", "."}:
            return True
    return False


def _remote_workspace_bucket_or_container(uri: str) -> str:
    """First bucket (S3/GCS) or container segment (abfs) after the scheme."""
    if uri.startswith("s3://"):
        tail = uri[5:].lstrip("/")
        return tail.split("/")[0] if tail else ""
    if uri.startswith("gs://"):
        tail = uri[5:].lstrip("/")
        return tail.split("/")[0] if tail else ""
    if uri.startswith("gcs://"):
        tail = uri[6:].lstrip("/")
        return tail.split("/")[0] if tail else ""
    if uri.startswith("abfs://"):
        tail = uri[7:]
        authority = tail.split("/")[0] if tail else ""
        if "@" in authority:
            return authority.split("@", 1)[0]
        return authority
    return ""


def _is_remote_team_workspace_uri(uri: str | None) -> bool:
    """
    True when TFL_STORAGE_URI is already a per-team workspace root from remote_workspace
    (e.g. s3://workspace-<team_id>). Subprocesses get this from the launcher without org contextvars.
    """
    if not uri or not is_remote_path(uri):
        return False
    name = _remote_workspace_bucket_or_container(uri)
    return name.startswith("workspace-") and len(name) > len("workspace-")


def is_remote_path(path: str) -> bool:
    """
    Return True if the given path represents a remote storage location.

    This centralizes the logic for detecting remote paths (S3, GCS, Azure, etc.)
    so that callers don't need to duplicate prefix checks.
    """
    return isinstance(path, str) and path.startswith(_REMOTE_PATH_PREFIXES)


def _get_storage_options() -> dict:
    """Get storage options based on TFL_STORAGE_PROVIDER (aws | gcp | azure)."""
    if STORAGE_PROVIDER == "aws":
        return {"profile": _AWS_PROFILE} if _AWS_PROFILE else {}
    if STORAGE_PROVIDER == "gcp":
        return {"project": _GCP_PROJECT} if _GCP_PROJECT else {}
    if STORAGE_PROVIDER == "azure":
        # Prefer a single connection string if provided; otherwise fall back to
        # account-based configuration. These map directly onto adlfs/fsspec
        # keyword arguments.
        options: dict[str, str] = {}
        if _AZURE_CONNECTION_STRING:
            options["connection_string"] = _AZURE_CONNECTION_STRING
            return options
        if _AZURE_ACCOUNT_NAME:
            options["account_name"] = _AZURE_ACCOUNT_NAME
        if _AZURE_ACCOUNT_KEY:
            options["account_key"] = _AZURE_ACCOUNT_KEY
        if _AZURE_SAS_TOKEN:
            options["sas_token"] = _AZURE_SAS_TOKEN
        return options
    return {}


def _get_fs_for_uri(uri: str):
    """
    Create a sync filesystem for a given URI.
    Returns (filesystem, root_path) tuple.

    This explicitly creates a sync filesystem to avoid issues with async s3fs
    passing storage_options to AioSession incorrectly when an event loop is running.
    """
    if not uri or uri.strip() == "":
        root = os.getenv(
            "TFL_HOME_DIR",
            os.path.join(os.path.expanduser("~"), ".transformerlab"),
        )
        fs = fsspec.filesystem("file", asynchronous=False)
        return fs, root

    # Extract protocol
    if uri.startswith("s3://"):
        protocol = "s3"
    elif uri.startswith("gs://") or uri.startswith("gcs://"):
        protocol = "gcs"
    elif uri.startswith("abfs://"):
        protocol = "abfs"
    else:
        # Local filesystem or unknown protocol - use fsspec's default handling.
        # Expand ~ so users can set TFL_STORAGE_URI="~/data/transformerlab" in .env
        # without the literal "~" leaking into every file path.
        fs = fsspec.filesystem("file", asynchronous=False)
        return fs, os.path.expanduser(uri)

    # Build storage options as kwargs (not as nested dict)
    # This ensures they're passed correctly to the filesystem, not to AioSession
    fs_kwargs: dict = {"asynchronous": False}  # GCS/Azure: force sync fsspec entrypoint
    if protocol == "s3":
        # Do NOT pass `asynchronous` to s3fs: older s3fs forwards it to botocore.session.Session,
        # which raises TypeError. Sync S3FileSystem is the default without this kwarg.
        fs_kwargs = {}
        if _AWS_PROFILE:
            fs_kwargs["profile"] = _AWS_PROFILE
        fs_kwargs["default_fill_cache"] = False
        fs_kwargs["use_listings_cache"] = False
    elif protocol in ("gcs", "gs") and _GCP_PROJECT:
        fs_kwargs["project"] = _GCP_PROJECT
    elif protocol == "abfs":
        # Azure storage via adlfs; options depend on how credentials are
        # supplied. We only attach options when Azure is the selected
        # storage provider so we don't accidentally mix providers.
        if STORAGE_PROVIDER == "azure":
            fs_kwargs.update(_get_storage_options())

    # Explicitly create sync filesystem to avoid async s3fs issues
    # Use filesystem() directly with asynchronous=False to force sync version
    # This prevents fsspec from auto-detecting async mode and creating async filesystem
    fs = fsspec.filesystem(protocol, **fs_kwargs)

    # For remote filesystems, maintain the full URI format as root
    if uri.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        root = uri.rstrip("/")
    else:
        root = uri
    return fs, root


def _get_fs_and_root():
    """
    Initialize filesystem and root path from context variable or TFL_STORAGE_URI.
    Falls back to local ~/.transformerlab or TFL_HOME_DIR when not set.
    """
    # Check context variable first, then fall back to environment variable
    tfl_uri = _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")

    # When org-scoped storage is enabled, the context var MUST be set so that
    # the resolved root is scoped to the correct organization.  If it isn't,
    # we'd silently fall back to the unscoped TFL_STORAGE_URI, causing
    # "not found" errors for org-specific resources (jobs, models, etc.).
    tfl_remote_storage_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    uses_localfs_multi_org = STORAGE_PROVIDER == "localfs" and os.getenv("TFL_STORAGE_URI")
    env_scoped_localfs = uses_localfs_multi_org and _is_localfs_org_scoped_uri(tfl_uri)
    env_scoped_remote = tfl_remote_storage_enabled and _is_remote_team_workspace_uri(tfl_uri)
    if (tfl_remote_storage_enabled or uses_localfs_multi_org) and _current_tfl_storage_uri.get() is None:
        # Subprocesses may get an explicit org-scoped URI without contextvars: localfs
        # .../orgs/<id>/workspace, or remote s3|gs|abfs://workspace-<team_id>/...
        if not env_scoped_localfs and not env_scoped_remote:
            raise RuntimeError(
                "Organization context is required but not set. "
                "Ensure set_organization_id() is called before accessing storage "
                "(e.g. in request middleware or at the start of a background task)."
            )

    return _get_fs_for_uri(tfl_uri)


async def root_uri() -> str:
    fs, root = _get_fs_and_root()
    try:
        return root
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def filesystem():
    fs, _ = _get_fs_and_root()
    return fs


async def debug_info() -> dict:
    """Debug information about the current storage configuration."""
    context_uri = _current_tfl_storage_uri.get()
    env_uri = os.getenv("TFL_STORAGE_URI")
    fs, root = _get_fs_and_root()
    try:
        return {
            "TFL_STORAGE_URI_context": context_uri,
            "TFL_STORAGE_URI_env": env_uri,
            "AWS_PROFILE": _AWS_PROFILE,
            "GCP_PROJECT": _GCP_PROJECT,
            "STORAGE_PROVIDER": STORAGE_PROVIDER,
            "root_uri": root,
            "filesystem_type": type(fs).__name__,
        }
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


def join(*parts: str) -> str:
    return posixpath.join(*parts)


async def root_join(*parts: str) -> str:
    root = await root_uri()
    return join(root, *parts)


async def exists(path: str) -> bool:
    fs = await filesystem()
    try:
        return await asyncio.to_thread(fs.exists, path)
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def isdir(path: str, fs=None) -> bool:
    filesys = fs
    try:
        filesys = fs if fs is not None else await filesystem()
        return await asyncio.to_thread(filesys.isdir, path)
    except Exception:
        return False
    finally:
        if fs is None:
            # Close filesystem even if exception raised.
            await _close_filesystem(filesys)


async def isfile(path: str) -> bool:
    fs = None
    try:
        fs = await filesystem()
        return await asyncio.to_thread(fs.isfile, path)
    except Exception:
        return False
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def makedirs(path: str, exist_ok: bool = True) -> None:
    fs = await filesystem()
    try:
        await asyncio.to_thread(fs.makedirs, path, exist_ok=exist_ok)
    except TypeError:
        # Some filesystems don't support exist_ok parameter
        if not exist_ok or not await exists(path):
            await asyncio.to_thread(fs.makedirs, path)
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def ls(path: str, detail: bool = False, fs=None):
    # Use provided filesystem or get default
    filesys = fs if fs is not None else await filesystem()
    try:
        paths = await asyncio.to_thread(filesys.ls, path, detail=detail)
        is_remote = path.startswith(_REMOTE_PATH_PREFIXES)
        protocol = (path.split("://", 1)[0] + "://") if is_remote else ""

        if detail:
            # fsspec's detail=True returns dicts whose 'name'/'Key' field is
            # scheme-less for remote backends (e.g. "bucket/key" for S3).
            # Callers like asset_download_service.list_files compare these
            # against the scheme-prefixed `path`, so normalize here.
            if not is_remote:
                return paths
            normalized: list = []
            for entry in paths:
                if not isinstance(entry, dict):
                    normalized.append(entry)
                    continue
                # fsspec uses 'name'; some backends also surface 'Key'.
                for key in ("name", "Key"):
                    val = entry.get(key)
                    if isinstance(val, str) and not val.startswith(_REMOTE_PATH_PREFIXES):
                        entry[key] = protocol + val.lstrip("/")
                normalized.append(entry)
            return normalized

        # Ensure paths are full URIs for remote filesystems
        if is_remote:
            full_paths = []
            for p in paths:
                if not p.startswith(_REMOTE_PATH_PREFIXES):
                    # Convert relative path to full URI
                    full_paths.append(protocol + p)
                else:
                    full_paths.append(p)
            full_paths = [p for p in full_paths if p != path]
            return full_paths
        return paths
    finally:
        if fs is None:
            # Close filesystem even if exception raised.
            await _close_filesystem(filesys)


async def find(path: str) -> list[str]:
    fs = await filesystem()
    try:
        return await asyncio.to_thread(fs.find, path)
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def walk(path: str, maxdepth=None, topdown=True, on_error="omit"):
    """
    Walk directory tree, returning a list of (root, dirs, files) tuples.

    Args:
        path: Root directory to start the walk
        maxdepth: Maximum recursion depth (None for no limit)
        topdown: If True, traverse top-down; if False, bottom-up
        on_error: Error behavior ('omit', 'raise', or callable)

    Returns:
        List of (root, dirs, files) tuples similar to os.walk()
    """
    fs = await filesystem()
    try:
        # Materialise the generator in a thread so the blocking filesystem
        # traversal never stalls the event loop.
        return await asyncio.to_thread(
            lambda: list(fs.walk(path, maxdepth=maxdepth, topdown=topdown, on_error=on_error))
        )
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(fs)


async def rm(path: str) -> None:
    if await exists(path):
        fs = await filesystem()
        try:
            await asyncio.to_thread(fs.rm, path)
        finally:
            # Close filesystem even if exception raised.
            await _close_filesystem(fs)


async def rm_tree(path: str) -> None:
    if await exists(path):
        fs = await filesystem()
        try:
            await asyncio.to_thread(fs.rm, path, recursive=True)
        except TypeError:
            # Some filesystems don't support recursive parameter
            # Use find() to get all files and remove them individually
            files = await find(path)
            for file_path in reversed(files):  # Remove files before directories
                await asyncio.to_thread(fs.rm, file_path)
        finally:
            # Close filesystem even if exception raised.
            await _close_filesystem(fs)


async def open(path: str, mode: str = "r", fs=None, uncached: bool = False, **kwargs):
    """
    Open a file for reading or writing.

    For local files, uses aiofiles for truly async file I/O.
    For remote files (S3, GCS, etc.), dispatches the blocking open() call to a
    thread pool and wraps the result in AsyncFileWrapper whose I/O methods are
    also thread-dispatched, so no S3 network call ever blocks the event loop.

    Args:
        path: Path to the file
        mode: File mode ('r', 'w', etc.)
        fs: Optional filesystem instance to use
        uncached: If True, use a filesystem instance without caching (useful for avoiding Etag issues)
        **kwargs: Additional arguments passed to filesystem.open()

    Returns:
        Async context manager wrapping the file object.
    """
    if uncached:
        # Create an uncached filesystem instance
        # If fs is provided, use it to infer protocol/storage options, otherwise infer from path
        filesys = await _get_uncached_filesystem(path, fs=fs)
    else:
        filesys = fs if fs is not None else await filesystem()

    # Check if this is a local filesystem
    is_local = isinstance(filesys, fsspec.implementations.local.LocalFileSystem)

    if is_local:
        # Use aiofiles for local files — already truly async, no change needed
        return aiofiles.open(path, mode=mode, **kwargs)
    else:
        # Open the remote file in a thread (the open() call itself initiates the
        # S3/GCS connection), then wrap it so subsequent reads/writes are also
        # dispatched to threads via AsyncFileWrapper.
        sync_file = await asyncio.to_thread(filesys.open, path, mode, **kwargs)
        return AsyncFileWrapper(sync_file)


def _resolve_protocol(path: str, fs=None) -> Optional[str]:
    """Determine the remote storage protocol from a filesystem or path.

    Returns the protocol string (``"s3"``, ``"gcs"``, ``"abfs"``) or ``None``
    if the path/filesystem is local.
    """
    if fs is not None:
        fs_type = type(fs).__name__.lower()
        if "s3" in fs_type:
            return "s3"
        if "gcs" in fs_type or "google" in fs_type:
            return "gcs"
        if "abfs" in fs_type or "azure" in fs_type:
            return "abfs"

    if path.startswith(("s3://",)):
        return "s3"
    if path.startswith(("gs://", "gcs://")):
        return "gcs"
    if path.startswith(("abfs://",)):
        return "abfs"

    # Path looks local but the workspace may be remote.
    tfl_uri = _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")
    if tfl_uri and tfl_uri.startswith(_REMOTE_PATH_PREFIXES):
        raw = tfl_uri.split("://", 1)[0]
        # Normalize "gs" → "gcs" so we don't create duplicate cache entries
        return "gcs" if raw == "gs" else raw

    return None


def _extract_storage_options(protocol: str, fs=None) -> dict:
    """Extract storage options from an existing filesystem or fall back to module-level env vars.

    When *fs* is provided, attempts to read credentials (e.g. AWS profile)
    from the filesystem's own config so that the uncached instance
    authenticates identically.  Falls back to module-level defaults
    (_AWS_PROFILE, _GCP_PROJECT, etc.) when *fs* is None or when its
    config cannot be inspected.
    """
    storage_options: dict = {}
    if protocol == "s3":
        if fs is not None:
            # Try to reuse explicit settings from filesystem config first.
            if hasattr(fs, "config_kwargs") and fs.config_kwargs:
                config = fs.config_kwargs
                if "profile" in config:
                    storage_options["profile"] = config["profile"]
                # Preserve explicit credential/session settings when present.
                for key in (
                    "aws_access_key_id",
                    "aws_secret_access_key",
                    "aws_session_token",
                    "token",
                    "endpoint_url",
                    "region_name",
                    "client_kwargs",
                    "config_kwargs",
                    "requester_pays",
                ):
                    if key in config:
                        storage_options[key] = config[key]
                if "profile" not in storage_options and "aws_access_key_id" not in storage_options and _AWS_PROFILE:
                    storage_options["profile"] = _AWS_PROFILE
            elif hasattr(fs, "anon") and not fs.anon:
                if _AWS_PROFILE:
                    storage_options["profile"] = _AWS_PROFILE
            elif _AWS_PROFILE:
                storage_options["profile"] = _AWS_PROFILE
        elif _AWS_PROFILE:
            storage_options["profile"] = _AWS_PROFILE
    elif protocol in ("gcs", "gs"):
        if _GCP_PROJECT:
            storage_options["project"] = _GCP_PROJECT
    elif protocol == "abfs" and STORAGE_PROVIDER == "azure":
        storage_options.update(_get_storage_options())
    return storage_options


def _normalize_options_for_cache_key(storage_options: dict) -> tuple[tuple[str, str], ...]:
    """Build a hashable, deterministic representation of storage options."""
    normalized: list[tuple[str, str]] = []
    for key in sorted(storage_options.keys()):
        value = storage_options[key]
        normalized.append((str(key), repr(value)))
    return tuple(normalized)


def _build_uncached_fs(protocol: str, storage_options: dict) -> "fsspec.AbstractFileSystem":
    """Create a single uncached filesystem for *protocol*.

    File-level and listing caches are disabled so every read hits the remote
    store, but the instance itself (and its connection pool) is meant to be
    long-lived and reused via ``_uncached_fs_cache``.
    """
    fs_kwargs: dict = {
        "asynchronous": False,
        "skip_instance_cache": True,
        "default_fill_cache": False,
        "use_listings_cache": False,
    }
    fs_kwargs.update(storage_options)

    return fsspec.filesystem(protocol, **fs_kwargs)


async def _get_uncached_filesystem(path: str, fs=None):
    """Return a filesystem with file/listing caches disabled.

    Instead of creating a **new** ``S3FileSystem`` on every call (which
    accumulates orphaned boto3 sessions / connection pools), we maintain a
    single instance per protocol in ``_uncached_fs_cache``.  The instance
    has ``default_fill_cache=False`` and ``use_listings_cache=False`` so
    every read goes to the remote store, but the underlying HTTP pool is
    reused.

    For local filesystems the regular cached instance is returned.
    """
    protocol = _resolve_protocol(path, fs=fs)
    if protocol is None:
        # Local filesystem — just return the regular cached instance.
        return await filesystem()

    storage_options = _extract_storage_options(protocol, fs=fs)
    cache_key = (protocol, _normalize_options_for_cache_key(storage_options))

    # Fast path: already cached (no lock needed for reads of a built-in dict).
    cached = _uncached_fs_cache.get(cache_key)
    if cached is not None:
        return cached

    with _uncached_fs_lock:
        # Double-check after acquiring the lock.
        cached = _uncached_fs_cache.get(cache_key)
        if cached is not None:
            return cached
        uncached = _build_uncached_fs(protocol, storage_options=storage_options)
        _uncached_fs_cache[cache_key] = uncached
        return uncached


def _get_fs_for_path(path: str):
    """
    Get filesystem for a given path, handling S3 storage_options correctly.
    Returns (filesystem, parsed_path) tuple.

    Reuses _get_fs_for_uri() to avoid code duplication.
    """
    fs, _ = _get_fs_for_uri(path)
    return fs, path


async def _close_filesystem(fs) -> None:
    """No-op — intentionally does NOT close the filesystem.

    ``_get_fs_for_uri`` uses fsspec's instance cache (``skip_instance_cache``
    is not set), so every caller receives a **shared** instance.  Closing it
    here would corrupt connection pools for concurrent callers.

    More critically, ``s3fs.S3FileSystem`` (even with ``asynchronous=False``)
    uses ``aiobotocore`` internally, which creates ``aiohttp`` connectors
    bound to the event loop that was running at creation time.  Calling
    ``fs.close()`` via ``asyncio.to_thread`` runs the teardown in a worker
    thread whose loop differs from the original, producing:

        RuntimeError: Future attached to a different loop

    fsspec manages the lifecycle of cached filesystem instances; we should
    not interfere.
    """
    pass


async def copy_file(src: str, dest: str) -> None:
    """Copy a single file from src to dest across arbitrary filesystems."""
    # Run the entire streaming copy in a thread — src_fs.open() and dest_fs.open()
    # both make blocking network calls for remote filesystems.
    src_fs, _ = _get_fs_for_path(src)
    dest_fs, _ = _get_fs_for_path(dest)

    def _do_copy():
        with src_fs.open(src, "rb") as r:
            with dest_fs.open(dest, "wb") as w:
                for chunk in iter_chunks(r):
                    w.write(chunk)

    try:
        await asyncio.to_thread(_do_copy)
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(src_fs)
        if dest_fs is not src_fs:
            # Close filesystem even if exception raised.
            await _close_filesystem(dest_fs)


def iter_chunks(file_obj, chunk_size: int = 8 * 1024 * 1024):
    """Helper to read file in chunks (synchronous)."""
    while True:
        data = file_obj.read(chunk_size)
        if not data:
            break
        yield data


async def copy_dir(src_dir: str, dest_dir: str) -> None:
    """Recursively copy a directory tree across arbitrary filesystems."""
    await makedirs(dest_dir, exist_ok=True)
    # Determine the source filesystem independently of destination
    src_fs, _ = _get_fs_for_path(src_dir)
    # Remember protocol for remote paths so that we can reconstruct full URIs
    # from keys returned by fsspec (which may omit the protocol).
    src_protocol: Optional[str] = None
    if is_remote_path(src_dir):
        src_protocol = src_dir.split("://", 1)[0]

    try:
        try:
            src_files = await asyncio.to_thread(src_fs.find, src_dir)
        except Exception:
            # If find is not available, fall back to listing via walk
            src_files = []
            walk_result = await asyncio.to_thread(lambda: list(src_fs.walk(src_dir)))
            for _, _, files in walk_result:
                for f in files:
                    src_files.append(f)

        for raw_src_file in src_files:
            # For remote filesystems, ensure we have a full URI (e.g., s3://bucket/...)
            src_file = raw_src_file
            if src_protocol is not None and not is_remote_path(raw_src_file):
                src_file = f"{src_protocol}://{raw_src_file.lstrip('/')}"

            # Compute relative path with respect to the source dir using the
            # normalized src_file URI/path.
            rel_path = src_file[len(src_dir) :].lstrip("/")
            dest_file = join(dest_dir, rel_path)
            # Ensure destination directory exists
            dest_parent = posixpath.dirname(dest_file)
            if dest_parent:
                await makedirs(dest_parent, exist_ok=True)
            # Copy the file using streaming (robust across FSes)
            await copy_file(src_file, dest_file)
    finally:
        # Close filesystem even if exception raised.
        await _close_filesystem(src_fs)
