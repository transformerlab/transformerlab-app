import asyncio
import os
import posixpath
import contextvars
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

# Single source: aws | gcp | localfs (default aws for backward compatibility)
STORAGE_PROVIDER = (os.getenv("TFL_STORAGE_PROVIDER") or "aws").strip().lower()
_AWS_PROFILE = os.getenv("AWS_PROFILE", "transformerlab-s3")
_GCP_PROJECT = os.getenv("GCP_PROJECT", "transformerlab-workspace")

# Common prefixes that represent remote storage locations handled by this module
_REMOTE_PATH_PREFIXES: tuple[str, ...] = ("s3://", "gs://", "gcs://", "abfs://")


def is_remote_path(path: str) -> bool:
    """
    Return True if the given path represents a remote storage location.

    This centralizes the logic for detecting remote paths (S3, GCS, Azure, etc.)
    so that callers don't need to duplicate prefix checks.
    """
    return isinstance(path, str) and path.startswith(_REMOTE_PATH_PREFIXES)


def _get_storage_options() -> dict:
    """Get storage options based on TFL_STORAGE_PROVIDER (aws | gcp)."""
    if STORAGE_PROVIDER == "aws":
        return {"profile": _AWS_PROFILE} if _AWS_PROFILE else {}
    elif STORAGE_PROVIDER == "gcp":
        return {"project": _GCP_PROJECT} if _GCP_PROJECT else {}
    else:
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
        # Local filesystem or unknown protocol - use fsspec's default handling
        fs = fsspec.filesystem("file", asynchronous=False)
        return fs, uri

    # Build storage options as kwargs (not as nested dict)
    # This ensures they're passed correctly to the filesystem, not to AioSession
    fs_kwargs = {"asynchronous": False}  # Explicitly force sync mode
    if protocol == "s3":
        # For S3, explicitly prevent async session creation by ensuring we use boto3 (sync)
        # instead of aiobotocore (async). This avoids RuntimeError when async sessions
        # are cleaned up in wrong event loop via weakref callbacks.
        if _AWS_PROFILE:
            fs_kwargs["profile"] = _AWS_PROFILE
        # Ensure we're using sync boto3, not async aiobotocore
        # The asynchronous=False should be enough, but we also ensure no async clients are created
        fs_kwargs["default_fill_cache"] = False
        fs_kwargs["use_listings_cache"] = False
    elif protocol in ("gcs", "gs") and _GCP_PROJECT:
        fs_kwargs["project"] = _GCP_PROJECT

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
    return _get_fs_for_uri(tfl_uri)


async def root_uri() -> str:
    _, root = _get_fs_and_root()
    return root


async def filesystem():
    fs, _ = _get_fs_and_root()
    return fs


async def debug_info() -> dict:
    """Debug information about the current storage configuration."""
    context_uri = _current_tfl_storage_uri.get()
    env_uri = os.getenv("TFL_STORAGE_URI")
    fs, root = _get_fs_and_root()
    return {
        "TFL_STORAGE_URI_context": context_uri,
        "TFL_STORAGE_URI_env": env_uri,
        "AWS_PROFILE": _AWS_PROFILE,
        "GCP_PROJECT": _GCP_PROJECT,
        "STORAGE_PROVIDER": STORAGE_PROVIDER,
        "root_uri": root,
        "filesystem_type": type(fs).__name__,
    }


def join(*parts: str) -> str:
    return posixpath.join(*parts)


async def root_join(*parts: str) -> str:
    root = await root_uri()
    return join(root, *parts)


async def exists(path: str) -> bool:
    fs = await filesystem()
    return await asyncio.to_thread(fs.exists, path)


async def isdir(path: str, fs=None) -> bool:
    try:
        filesys = fs if fs is not None else await filesystem()
        return await asyncio.to_thread(filesys.isdir, path)
    except Exception:
        return False


async def isfile(path: str) -> bool:
    try:
        fs = await filesystem()
        return await asyncio.to_thread(fs.isfile, path)
    except Exception:
        return False


async def makedirs(path: str, exist_ok: bool = True) -> None:
    fs = await filesystem()
    try:
        await asyncio.to_thread(fs.makedirs, path, exist_ok=exist_ok)
    except TypeError:
        # Some filesystems don't support exist_ok parameter
        if not exist_ok or not await exists(path):
            await asyncio.to_thread(fs.makedirs, path)


async def ls(path: str, detail: bool = False, fs=None):
    # Use provided filesystem or get default
    filesys = fs if fs is not None else await filesystem()
    paths = await asyncio.to_thread(filesys.ls, path, detail=detail)
    # Ensure paths are full URIs for remote filesystems
    if path.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        full_paths = []
        for p in paths:
            if not p.startswith(("s3://", "gs://", "abfs://", "gcs://")):
                # Convert relative path to full URI
                protocol = path.split("://")[0] + "://"
                full_path = protocol + p
                full_paths.append(full_path)
            else:
                full_paths.append(p)
        full_paths = [p for p in full_paths if p != path]
        return full_paths
    return paths


async def find(path: str) -> list[str]:
    fs = await filesystem()
    return await asyncio.to_thread(fs.find, path)


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
    # Materialise the generator in a thread so the blocking filesystem
    # traversal never stalls the event loop.
    return await asyncio.to_thread(lambda: list(fs.walk(path, maxdepth=maxdepth, topdown=topdown, on_error=on_error)))


async def rm(path: str) -> None:
    if await exists(path):
        fs = await filesystem()
        await asyncio.to_thread(fs.rm, path)


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


async def _get_uncached_filesystem(path: str, fs=None):
    """
    Get a filesystem instance without caching for reading files.
    This prevents Etag caching issues when files are being modified concurrently.

    Args:
        path: Path to the file
        fs: Optional existing filesystem instance to extract protocol/storage options from
    """
    # If fs is provided, try to extract protocol and storage options from it
    if fs is not None:
        try:
            # Get the protocol from the filesystem type or class name
            fs_type = type(fs).__name__.lower()
            protocol = None
            if "s3" in fs_type or "s3filesystem" in fs_type:
                protocol = "s3"
            elif "gcs" in fs_type or "google" in fs_type or "gcsfilesystem" in fs_type:
                protocol = "gcs"
            elif "abfs" in fs_type or "azure" in fs_type or "abfsfilesystem" in fs_type:
                protocol = "abfs"

            # Extract storage options from filesystem if possible
            storage_options = {}
            if protocol == "s3":
                # For S3, try to get profile from filesystem config
                if hasattr(fs, "config_kwargs") and fs.config_kwargs:
                    config = fs.config_kwargs
                    if "profile" in config:
                        storage_options["profile"] = config["profile"]
                    elif "aws_access_key_id" in config:
                        # If explicit credentials, don't use profile
                        pass
                    elif _AWS_PROFILE:
                        storage_options["profile"] = _AWS_PROFILE
                elif hasattr(fs, "anon") and not fs.anon:
                    # Non-anonymous S3, use default profile if available
                    if _AWS_PROFILE:
                        storage_options["profile"] = _AWS_PROFILE
                elif _AWS_PROFILE:
                    storage_options["profile"] = _AWS_PROFILE
            elif protocol:
                storage_options = _get_storage_options()

            if protocol:
                # Create a new uncached filesystem with the same protocol and options
                fs_kwargs = {
                    "asynchronous": False,  # Explicitly force sync mode
                    "skip_instance_cache": True,
                    "default_fill_cache": False,
                    "use_listings_cache": False,
                }
                fs_kwargs.update(storage_options)
                fs_uncached = fsspec.filesystem(protocol, **fs_kwargs)
                return fs_uncached
        except Exception:
            # If extraction fails, fall through to path-based inference
            pass

    # Check if this is a remote path (full URI)
    if path.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        # Extract protocol from the path
        protocol = path.split("://")[0]

        # Build storage options
        storage_options = _get_storage_options()

        # Create a new filesystem instance with caching disabled
        fs_kwargs = {
            "asynchronous": False,  # Explicitly force sync mode
            "skip_instance_cache": True,
            "default_fill_cache": False,
            "use_listings_cache": False,
        }
        fs_kwargs.update(storage_options)
        fs_uncached = fsspec.filesystem(protocol, **fs_kwargs)
        return fs_uncached
    else:
        # For local filesystems, check if we're using a remote workspace
        tfl_uri = _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")
        if tfl_uri and tfl_uri.startswith(("s3://", "gs://", "abfs://", "gcs://")):
            # Path is relative but we're using remote storage
            protocol = tfl_uri.split("://")[0]
            storage_options = _get_storage_options()
            fs_kwargs = {
                "asynchronous": False,  # Explicitly force sync mode
                "skip_instance_cache": True,
                "default_fill_cache": False,
                "use_listings_cache": False,
            }
            fs_kwargs.update(storage_options)
            fs_uncached = fsspec.filesystem(protocol, **fs_kwargs)
            return fs_uncached
        else:
            # For local filesystems, just use the default
            return await filesystem()


def _get_fs_for_path(path: str):
    """
    Get filesystem for a given path, handling S3 storage_options correctly.
    Returns (filesystem, parsed_path) tuple.

    Reuses _get_fs_for_uri() to avoid code duplication.
    """
    fs, _ = _get_fs_for_uri(path)
    return fs, path


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

    await asyncio.to_thread(_do_copy)


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
