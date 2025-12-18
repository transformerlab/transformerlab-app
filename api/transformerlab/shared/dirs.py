# Root dir is the parent of the parent of this current directory:

import asyncio
import os
from lab import HOME_DIR
from lab.dirs import get_workspace_dir
from lab import storage


"""
TFL_SOURCE_CODE_DIR is the directory where the source code is stored.
By default, it is set to TFL_HOME_DIR/src
This directory stores code but shouldn't store any data because it is erased and replaced
on updates.

You can set any of the above using environment parameters and it will override the defaults.

ROOT_DIR is a legacy variable that we should replace with the above, eventually.
"""

FASTCHAT_LOGS_DIR = storage.join(asyncio.run(get_workspace_dir()), "logs")
if not asyncio.run(storage.exists(FASTCHAT_LOGS_DIR)):
    asyncio.run(storage.makedirs(FASTCHAT_LOGS_DIR, exist_ok=True))


# TFL_STATIC_FILES_DIR is TFL_HOME_DIR/webapp
STATIC_FILES_DIR = storage.join(HOME_DIR, "webapp")
asyncio.run(storage.makedirs(STATIC_FILES_DIR, exist_ok=True))
# if there is no index.html file in the static directory, create blank one
if not asyncio.run(storage.exists(storage.join(STATIC_FILES_DIR, "index.html"))):
    async def _init_index_html():
        async with await storage.open(storage.join(STATIC_FILES_DIR, "index.html"), "w") as f:
            await f.write(
                "<html><body><p>Transformer Lab Cloud App Files Missing. Run <pre>curl https://raw.githubusercontent.com/transformerlab/transformerlab-app/main/api/install.sh | bash</pre> to install.</p></body></html>"
            )
    asyncio.run(_init_index_html())

# TFL_SOURCE_CODE_DIR
api_py_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if api_py_dir != storage.join(HOME_DIR, "src"):
    print(f"We are working from {api_py_dir} which is not {os.path.join(HOME_DIR, 'src')}")
    print(
        "That means you are probably developing in a different location so we will set source dir to the current directory"
    )
    TFL_SOURCE_CODE_DIR = api_py_dir
else:
    print(f"Source code directory is set to: {os.path.join(HOME_DIR, 'src')}")
    TFL_SOURCE_CODE_DIR = storage.join(HOME_DIR, "src")

# ROOT_DIR (deprecate later)
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


# PLUGIN_PRELOADED_GALLERY
PLUGIN_PRELOADED_GALLERY = storage.join(TFL_SOURCE_CODE_DIR, "transformerlab", "plugins")

PLUGIN_SDK_DIR = storage.join(TFL_SOURCE_CODE_DIR, "transformerlab", "plugin_sdk")
PLUGIN_HARNESS = storage.join(PLUGIN_SDK_DIR, "plugin_harness.py")


# Galleries cache directory
GALLERIES_LOCAL_FALLBACK_DIR = storage.join(TFL_SOURCE_CODE_DIR, "transformerlab/galleries/")


# TEMPORARY: We want to move jobs back into the root directory instead of under experiment
# But for now we need to leave this here.
