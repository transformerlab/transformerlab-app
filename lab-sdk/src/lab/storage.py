import os
import posixpath
import contextvars
from types import TracebackType
from typing import Optional, Type

import fsspec
import aiofiles


class AsyncFileWrapper:
    """
    Wrapper to make sync file objects work with async context managers.
    This allows sync filesystem file objects to be used with 'async with'.
    """

    def __init__(self, file_obj):
        # Store the file object (which may be a context manager)
        self._file_obj = file_obj
        self.file_obj = None
        self._is_context_manager = hasattr(file_obj, "__enter__") and hasattr(file_obj, "__exit__")

    async def __aenter__(self):
        # Enter the sync context manager if it is one
        if self._is_context_manager:
            self.file_obj = self._file_obj.__enter__()
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
            # Exit the sync context manager
            self._file_obj.__exit__(exc_type, exc_val, exc_tb)
        elif self.file_obj and hasattr(self.file_obj, "close"):
            # Just close if no context manager protocol
            self.file_obj.close()
        self.file_obj = None

    # Override common I/O methods to make them async-compatible
    async def read(self, size=-1):
        """Read from the file (async wrapper for sync read)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.read(size)

    async def write(self, data):
        """Write to the file (async wrapper for sync write)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.write(data)

    async def readline(self, size=-1):
        """Read a line from the file (async wrapper for sync readline)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.readline(size)

    async def readlines(self, hint=-1):
        """Read all lines from the file (async wrapper for sync readlines)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.readlines(hint)

    async def seek(self, offset, whence=0):
        """Seek to a position in the file (async wrapper for sync seek)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.seek(offset, whence)

    async def tell(self):
        """Get current file position (async wrapper for sync tell)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.tell()

    async def flush(self):
        """Flush the file buffer (async wrapper for sync flush)."""
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        return self.file_obj.flush()

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
        # For async iteration, we need to wrap the sync iterator
        return self

    async def __anext__(self):
        if self.file_obj is None:
            raise ValueError("File object not initialized. Use 'async with' to open the file.")
        try:
            return next(self.file_obj)
        except StopIteration:
            raise StopAsyncIteration


# Context variable for storage URI (set by host app/session)
_current_tfl_storage_uri: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_tfl_storage_uri", default=None
)

_AWS_PROFILE = os.getenv("AWS_PROFILE", "transformerlab-s3")


def _get_fs_and_root():
    """
    Initialize filesystem and root path from context variable or TFL_STORAGE_URI.
    Falls back to local ~/.transformerlab or TFL_HOME_DIR when not set.
    """
    # Check context variable first, then fall back to environment variable
    tfl_uri = _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")

    if not tfl_uri or tfl_uri.strip() == "":
        root = os.getenv(
            "TFL_HOME_DIR",
            os.path.join(os.path.expanduser("~"), ".transformerlab"),
        )
        fs = fsspec.filesystem("file")
        return fs, root

    # Let fsspec parse the URI
    fs, _token, paths = fsspec.get_fs_token_paths(
        tfl_uri, storage_options={"profile": _AWS_PROFILE} if _AWS_PROFILE else None
    )
    # For S3 and other remote filesystems, we need to maintain the full URI format
    if tfl_uri.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        root = tfl_uri.rstrip("/")
    else:
        root = paths[0] if paths else ""
    return fs, root


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
    return fs.exists(path)


async def isdir(path: str, fs=None) -> bool:
    try:
        filesys = fs if fs is not None else await filesystem()
        return filesys.isdir(path)
    except Exception:
        return False


async def isfile(path: str) -> bool:
    try:
        fs = await filesystem()
        return fs.isfile(path)
    except Exception:
        return False


async def makedirs(path: str, exist_ok: bool = True) -> None:
    fs = await filesystem()
    try:
        fs.makedirs(path, exist_ok=exist_ok)
    except TypeError:
        # Some filesystems don't support exist_ok parameter
        if not exist_ok or not await exists(path):
            fs.makedirs(path)


async def ls(path: str, detail: bool = False, fs=None):
    # Use provided filesystem or get default
    filesys = fs if fs is not None else await filesystem()
    # Let fsspec parse the URI
    paths = filesys.ls(path, detail=detail)
    # Dont include the current path in the list
    # Ensure paths are full URIs for remote filesystems
    if path.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        # For remote filesystems, ensure returned paths are full URIs
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
    return fs.find(path)


async def walk(path: str, maxdepth=None, topdown=True, on_error="omit"):
    """
    Walk directory tree, yielding (root, dirs, files) tuples.

    Args:
        path: Root directory to start the walk
        maxdepth: Maximum recursion depth (None for no limit)
        topdown: If True, traverse top-down; if False, bottom-up
        on_error: Error behavior ('omit', 'raise', or callable)

    Yields:
        (root, dirs, files) tuples similar to os.walk()
    """
    fs = await filesystem()
    return fs.walk(path, maxdepth=maxdepth, topdown=topdown, on_error=on_error)


async def rm(path: str) -> None:
    if await exists(path):
        fs = await filesystem()
        fs.rm(path)


async def rm_tree(path: str) -> None:
    if await exists(path):
        fs = await filesystem()
        try:
            fs.rm(path, recursive=True)
        except TypeError:
            # Some filesystems don't support recursive parameter
            # Use find() to get all files and remove them individually
            files = await find(path)
            for file_path in reversed(files):  # Remove files before directories
                fs.rm(file_path)


def _normalize_local_path(path: str) -> str:
    """
    Normalize a path intended for use on the local filesystem and
    reject obvious path traversal in relative paths.

    This keeps existing behaviour for absolute paths (which are assumed
    to be chosen by trusted code), while preventing relative paths like
    "../../etc/passwd" from escaping the intended working directory.
    """
    normalized = os.path.normpath(path)

    # If the normalized path is relative, ensure it does not traverse upwards.
    if not os.path.isabs(normalized):
        parts = [p for p in normalized.split(os.sep) if p not in ("", ".")]
        if ".." in parts:
            raise ValueError(f"Disallowed path traversal in relative path: {path!r}")

    return normalized


async def open(path: str, mode: str = "r", fs=None, uncached: bool = False, **kwargs):
    """
    Open a file for reading or writing.

    For local files, uses aiofiles for truly async file I/O.
    For remote files (S3, GCS, etc.), uses fsspec sync file objects.

    Args:
        path: Path to the file
        mode: File mode ('r', 'w', etc.)
        fs: Optional filesystem instance to use
        uncached: If True, use a filesystem instance without caching (useful for avoiding Etag issues)
        **kwargs: Additional arguments passed to filesystem.open()

    Returns:
        File-like object (context manager for remote, async context manager for local)
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
        safe_path = _normalize_local_path(path)
        # Use aiofiles for local files to get truly async file I/O
        return aiofiles.open(safe_path, mode=mode, **kwargs)
    else:
        # Use sync filesystem open method, but wrap it in async context manager
        # so it can be used with 'async with'
        sync_file = filesys.open(path, mode=mode, **kwargs)
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
            if protocol == "s3" and _AWS_PROFILE:
                storage_options["profile"] = _AWS_PROFILE

            if protocol:
                # Create a new uncached filesystem with the same protocol and options
                fs_kwargs = {
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
        storage_options = {}
        if protocol == "s3" and _AWS_PROFILE:
            storage_options["profile"] = _AWS_PROFILE

        # Create a new filesystem instance with caching disabled
        fs_uncached = fsspec.filesystem(
            protocol,
            skip_instance_cache=True,
            default_fill_cache=False,
            use_listings_cache=False,
            **storage_options,
        )
        return fs_uncached
    else:
        # For local filesystems, check if we're using a remote workspace
        tfl_uri = _current_tfl_storage_uri.get() or os.getenv("TFL_STORAGE_URI")
        if tfl_uri and tfl_uri.startswith(("s3://", "gs://", "abfs://", "gcs://")):
            # Path is relative but we're using remote storage
            protocol = tfl_uri.split("://")[0]
            storage_options = {}
            if protocol == "s3" and _AWS_PROFILE:
                storage_options["profile"] = _AWS_PROFILE
            fs_uncached = fsspec.filesystem(
                protocol,
                skip_instance_cache=True,
                default_fill_cache=False,
                use_listings_cache=False,
                **storage_options,
            )
            return fs_uncached
        else:
            # For local filesystems, just use the default
            return await filesystem()


def _get_fs_for_path(path: str):
    """
    Get filesystem for a given path, handling S3 storage_options correctly.
    Returns (filesystem, parsed_path) tuple.
    """
    storage_options = {}
    if path.startswith("s3://") and _AWS_PROFILE:
        storage_options["profile"] = _AWS_PROFILE
    return fsspec.core.url_to_fs(path, storage_options=storage_options if storage_options else None)


async def copy_file(src: str, dest: str) -> None:
    """Copy a single file from src to dest across arbitrary filesystems."""
    # Use streaming copy to be robust across different filesystems
    # Get sync filesystems with proper storage_options handling
    src_fs, _ = _get_fs_for_path(src)
    dest_fs, _ = _get_fs_for_path(dest)

    # Use sync filesystem methods (wrapped in async function for API compatibility)
    with src_fs.open(src, "rb") as r:
        with dest_fs.open(dest, "wb") as w:
            for chunk in iter_chunks(r):
                w.write(chunk)


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
    try:
        src_files = src_fs.find(src_dir)
    except Exception:
        # If find is not available, fall back to listing via walk
        src_files = []
        for _, _, files in src_fs.walk(src_dir):
            for f in files:
                src_files.append(f)

    for src_file in src_files:
        # Compute relative path with respect to the source dir
        rel_path = src_file[len(src_dir) :].lstrip("/")
        dest_file = join(dest_dir, rel_path)
        # Ensure destination directory exists
        dest_parent = posixpath.dirname(dest_file)
        if dest_parent:
            await makedirs(dest_parent, exist_ok=True)
        # Copy the file using streaming (robust across FSes)
        await copy_file(src_file, dest_file)
