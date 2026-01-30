# Root dir is the parent of the parent of this current directory:

import os
from lab import HOME_DIR
from lab import storage


"""
TFL_SOURCE_CODE_DIR is the directory where the source code is stored.
By default, it is set to TFL_HOME_DIR/src
This directory stores code but shouldn't store any data because it is erased and replaced
on updates.

You can set any of the above using environment parameters and it will override the defaults.

ROOT_DIR is a legacy variable that we should replace with the above, eventually.
"""

# Note: These path constants are computed synchronously at module load.
# Directory creation is deferred to async init function called at app startup.
# We use None as sentinel to indicate these need to be computed lazily
_fastchat_logs_dir = None
_static_files_dir = None


def get_fastchat_logs_dir_sync():
    """Get FASTCHAT_LOGS_DIR synchronously - for module-level code only."""
    global _fastchat_logs_dir
    if _fastchat_logs_dir is None:
        # This is a hack for module initialization - we'll set it properly in async init
        # For now, just compute the path without async storage operations
        _fastchat_logs_dir = os.path.join(HOME_DIR, "logs")
    return _fastchat_logs_dir


def get_static_files_dir_sync():
    """Get STATIC_FILES_DIR synchronously - for module-level code only."""
    global _static_files_dir
    if _static_files_dir is None:
        _static_files_dir = os.path.join(HOME_DIR, "webapp")
    return _static_files_dir


# Export as module-level constants for backward compatibility
FASTCHAT_LOGS_DIR = get_fastchat_logs_dir_sync()
STATIC_FILES_DIR = get_static_files_dir_sync()


async def initialize_dirs():
    """Initialize directories asynchronously. Should be called at app startup."""
    global FASTCHAT_LOGS_DIR, STATIC_FILES_DIR
    from lab.dirs import get_workspace_dir

    # Compute FASTCHAT_LOGS_DIR using async storage
    workspace_dir = await get_workspace_dir()
    FASTCHAT_LOGS_DIR = storage.join(workspace_dir, "logs")
    if not await storage.exists(FASTCHAT_LOGS_DIR):
        await storage.makedirs(FASTCHAT_LOGS_DIR, exist_ok=True)

    # Ensure STATIC_FILES_DIR exists
    STATIC_FILES_DIR = storage.join(HOME_DIR, "webapp")
    await storage.makedirs(STATIC_FILES_DIR, exist_ok=True)

    # Create default index.html if missing
    index_html_path = storage.join(STATIC_FILES_DIR, "index.html")
    if not await storage.exists(index_html_path):
        async with await storage.open(index_html_path, "w") as f:
            await f.write(
                "<html><body><p>Transformer Lab Cloud App Files Missing. Run <pre>curl https://raw.githubusercontent.com/transformerlab/transformerlab-app/main/api/install.sh | bash</pre> to install.</p></body></html>"
            )


# TFL_SOURCE_CODE_DIR
api_py_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if api_py_dir != os.path.join(HOME_DIR, "src"):
    print(f"We are working from {api_py_dir} which is not {os.path.join(HOME_DIR, 'src')}")
    print(
        "That means you are probably developing in a different location so we will set source dir to the current directory"
    )
    TFL_SOURCE_CODE_DIR = api_py_dir
else:
    print(f"Source code directory is set to: {os.path.join(HOME_DIR, 'src')}")
    TFL_SOURCE_CODE_DIR = os.path.join(HOME_DIR, "src")

# ROOT_DIR (deprecate later)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# PLUGIN_PRELOADED_GALLERY - use os.path.join for module-level paths
PLUGIN_PRELOADED_GALLERY = os.path.join(TFL_SOURCE_CODE_DIR, "transformerlab", "plugins")

PLUGIN_SDK_DIR = os.path.join(TFL_SOURCE_CODE_DIR, "transformerlab", "plugin_sdk")
PLUGIN_HARNESS = os.path.join(PLUGIN_SDK_DIR, "plugin_harness.py")


# Galleries cache directory
GALLERIES_LOCAL_FALLBACK_DIR = os.path.join(TFL_SOURCE_CODE_DIR, "transformerlab/galleries/")


# TEMPORARY: We want to move jobs back into the root directory instead of under experiment
# But for now we need to leave this here.
