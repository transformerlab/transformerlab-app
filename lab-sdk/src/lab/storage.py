import os
import posixpath
import contextvars

import fsspec


# Context variable for storage URI (set by host app/session)
_current_tfl_storage_uri: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "current_tfl_storage_uri", default=None
)

REMOTE_WORKSPACE_HOST = os.getenv("REMOTE_WORKSPACE_HOST", "aws")
_AWS_PROFILE = os.getenv("AWS_PROFILE", "transformerlab-s3")
_GCP_PROJECT = os.getenv("GCP_PROJECT", "transformerlab-workspace")


def _get_storage_options() -> dict:
    """Get storage options based on REMOTE_WORKSPACE_HOST."""
    if REMOTE_WORKSPACE_HOST == "aws":
        return {"profile": _AWS_PROFILE} if _AWS_PROFILE else {}
    elif REMOTE_WORKSPACE_HOST == "gcp":
        return {"project": _GCP_PROJECT} if _GCP_PROJECT else {}
    else:
        return {}


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

    # Get storage options based on cloud provider
    storage_options = _get_storage_options()

    # Let fsspec parse the URI
    fs, _token, paths = fsspec.get_fs_token_paths(tfl_uri, storage_options=storage_options)
    # For S3 and other remote filesystems, we need to maintain the full URI format
    if tfl_uri.startswith(("s3://", "gs://", "abfs://", "gcs://")):
        root = tfl_uri.rstrip("/")
    else:
        root = paths[0] if paths else ""
    return fs, root


def root_uri() -> str:
    _, root = _get_fs_and_root()
    return root


def filesystem():
    fs, _ = _get_fs_and_root()
    return fs


def debug_info() -> dict:
    """Debug information about the current storage configuration."""
    context_uri = _current_tfl_storage_uri.get()
    env_uri = os.getenv("TFL_STORAGE_URI")
    fs, root = _get_fs_and_root()
    return {
        "TFL_STORAGE_URI_context": context_uri,
        "TFL_STORAGE_URI_env": env_uri,
        "AWS_PROFILE": _AWS_PROFILE,
        "GCP_PROJECT": _GCP_PROJECT,
        "REMOTE_WORKSPACE_HOST": REMOTE_WORKSPACE_HOST,
        "root_uri": root,
        "filesystem_type": type(fs).__name__,
    }


def join(*parts: str) -> str:
    return posixpath.join(*parts)


def root_join(*parts: str) -> str:
    return join(root_uri(), *parts)


def exists(path: str) -> bool:
    return filesystem().exists(path)


def isdir(path: str, fs=None) -> bool:
    try:
        filesys = fs if fs is not None else filesystem()
        return filesys.isdir(path)
    except Exception:
        return False


def isfile(path: str) -> bool:
    try:
        return filesystem().isfile(path)
    except Exception:
        return False


def makedirs(path: str, exist_ok: bool = True) -> None:
    try:
        filesystem().makedirs(path, exist_ok=exist_ok)
    except TypeError:
        # Some filesystems don't support exist_ok parameter
        if not exist_ok or not exists(path):
            filesystem().makedirs(path)


def ls(path: str, detail: bool = False, fs=None):
    # Use provided filesystem or get default
    filesys = fs if fs is not None else filesystem()
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


def find(path: str) -> list[str]:
    return filesystem().find(path)


def walk(path: str, maxdepth=None, topdown=True, on_error="omit"):
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
    return filesystem().walk(path, maxdepth=maxdepth, topdown=topdown, on_error=on_error)


def rm(path: str) -> None:
    if exists(path):
        filesystem().rm(path)


def rm_tree(path: str) -> None:
    if exists(path):
        try:
            filesystem().rm(path, recursive=True)
        except TypeError:
            # Some filesystems don't support recursive parameter
            # Use find() to get all files and remove them individually
            files = find(path)
            for file_path in reversed(files):  # Remove files before directories
                filesystem().rm(file_path)


def open(path: str, mode: str = "r", fs=None, uncached: bool = False, **kwargs):
    """
    Open a file for reading or writing.

    Args:
        path: Path to the file
        mode: File mode ('r', 'w', etc.)
        fs: Optional filesystem instance to use
        uncached: If True, use a filesystem instance without caching (useful for avoiding Etag issues)
        **kwargs: Additional arguments passed to filesystem.open()

    Returns:
        File-like object
    """
    if uncached:
        # Create an uncached filesystem instance
        # If fs is provided, use it to infer protocol/storage options, otherwise infer from path
        filesys = _get_uncached_filesystem(path, fs=fs)
    else:
        filesys = fs if fs is not None else filesystem()
    return filesys.open(path, mode=mode, **kwargs)


def _get_uncached_filesystem(path: str, fs=None):
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
                fs_uncached = fsspec.filesystem(
                    protocol,
                    skip_instance_cache=True,
                    default_fill_cache=False,
                    use_listings_cache=False,
                    **storage_options,
                )
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
            storage_options = _get_storage_options()
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
            return filesystem()


def copy_file(src: str, dest: str) -> None:
    """Copy a single file from src to dest across arbitrary filesystems."""
    # Use streaming copy to be robust across different filesystems
    with fsspec.open(src, "rb") as r, fsspec.open(dest, "wb") as w:
        for chunk in iter_chunks(r):
            w.write(chunk)


def iter_chunks(file_obj, chunk_size: int = 8 * 1024 * 1024):
    """Helper to read file in chunks."""
    while True:
        data = file_obj.read(chunk_size)
        if not data:
            break
        yield data


def copy_dir(src_dir: str, dest_dir: str) -> None:
    """Recursively copy a directory tree across arbitrary filesystems."""
    makedirs(dest_dir, exist_ok=True)
    # Determine the source filesystem independently of destination
    src_fs, _ = fsspec.core.url_to_fs(src_dir)
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
            makedirs(dest_parent, exist_ok=True)
        # Copy the file using streaming (robust across FSes)
        copy_file(src_file, dest_file)
