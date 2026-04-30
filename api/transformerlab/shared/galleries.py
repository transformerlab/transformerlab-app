# Transformer Lab updates some of its galleries remotely
# It then tries to download the latest version and store in a local cache
# with a backup stored in the server code.
# This is all managed in this file.

import os
import json
import posixpath
import urllib.request
import shutil
import time
import tomllib
from pathlib import Path
from packaging.version import Version, InvalidVersion

from transformerlab.shared import dirs

# API-managed gallery files
TASKS_GALLERY_FILE = "task-gallery.json"
# Interactive tasks gallery (for interactive task templates)
INTERACTIVE_GALLERY_FILE = "interactive-gallery.json"
# Team-specific tasks gallery stored in workspace dir (per team)
TEAM_TASKS_GALLERY_FILE = "team_specific_tasks.json"
# Announcements gallery
ANNOUNCEMENTS_GALLERY_FILE = "announcement-gallery.json"

GALLERY_FILES = [
    TASKS_GALLERY_FILE,
    INTERACTIVE_GALLERY_FILE,
    ANNOUNCEMENTS_GALLERY_FILE,
]

TLAB_CHANNEL_GALLERIES_BASE_URL = os.environ.get(
    "TLAB_CHANNEL_GALLERIES_BASE_URL",
    "https://raw.githubusercontent.com/transformerlab/transformerlab-app/main/api/transformerlab/galleries/channels",
).rstrip("/")
TLAB_GALLERY_CHANNEL = os.environ.get("TLAB_GALLERY_CHANNEL", "stable").strip() or "stable"

CHANNEL_MANAGED_GALLERY_FILES = {
    TASKS_GALLERY_FILE,
    INTERACTIVE_GALLERY_FILE,
    ANNOUNCEMENTS_GALLERY_FILE,
}

_APP_VERSION_CACHE = None


async def update_gallery_cache():
    """
    Called when Transformer Lab starts up.
    Initializes any cached gallery files and tries to update from remote.
    """

    for filename in GALLERY_FILES:
        await update_gallery_cache_file(filename)


async def get_tasks_gallery():
    # Refresh the tasks gallery from remote at most once every 5 minutes
    await maybe_update_gallery_cache_file(TASKS_GALLERY_FILE, max_age_seconds=300)
    return await get_gallery_file(TASKS_GALLERY_FILE)


async def get_interactive_gallery():
    """
    Get the interactive tasks gallery.
    This contains templates for interactive task types (vscode, jupyter, vllm, ssh).
    Task run/setup resolve from task.yaml; gallery metadata augments for tunnels; see resolve_interactive_command.
    """
    return await get_gallery_file(INTERACTIVE_GALLERY_FILE)


async def get_announcements_gallery():
    """
    Get the announcements gallery.
    This contains announcements to display to users.
    """
    await update_gallery_cache_file(ANNOUNCEMENTS_GALLERY_FILE)
    return await get_gallery_file(ANNOUNCEMENTS_GALLERY_FILE)


async def get_team_tasks_gallery():
    """
    Team-specific tasks gallery stored in the workspace directory.
    Falls back to an empty list when missing or unreadable.
    """
    from lab.dirs import get_workspace_dir
    from lab import storage

    workspace_dir = await get_workspace_dir()
    gallery_path = storage.join(workspace_dir, TEAM_TASKS_GALLERY_FILE)

    try:
        # Ensure the workspace directory exists before checking the file
        await storage.makedirs(workspace_dir, exist_ok=True)

        if not await storage.exists(gallery_path):
            # Initialize an empty gallery file
            async with await storage.open(gallery_path, "w") as f:
                await f.write(json.dumps([]))
            return []

        async with await storage.open(gallery_path, "r") as f:
            return json.loads(await f.read())
    except Exception as e:
        print(f"❌ Failed to read team tasks gallery: {e}")
        return []


async def add_team_task_to_gallery(entry: dict):
    """
    Append (or upsert) a task entry to the team-specific gallery.
    Replaces an existing entry with the same id/title to avoid duplicates.
    """
    from lab.dirs import get_workspace_dir
    from lab import storage

    workspace_dir = await get_workspace_dir()
    gallery_path = storage.join(workspace_dir, TEAM_TASKS_GALLERY_FILE)

    try:
        await storage.makedirs(workspace_dir, exist_ok=True)
        current = await get_team_tasks_gallery()

        # De-duplicate on id or title
        new_id = entry.get("id")
        new_title = entry.get("title")
        filtered = []
        for item in current:
            if new_id and item.get("id") == new_id:
                continue
            if new_title and item.get("title") == new_title:
                continue
            filtered.append(item)

        filtered.append(entry)

        async with await storage.open(gallery_path, "w") as f:
            await f.write(json.dumps(filtered, indent=2))
        return filtered
    except Exception as e:
        print(f"❌ Failed to write team tasks gallery: {e}")
        return await get_team_tasks_gallery()


async def delete_team_task_from_gallery(task_id: str):
    """
    Delete a task entry from the team-specific gallery by id or title.
    Returns True if deleted, False if not found.
    """
    from lab.dirs import get_workspace_dir
    from lab import storage

    workspace_dir = await get_workspace_dir()
    gallery_path = storage.join(workspace_dir, TEAM_TASKS_GALLERY_FILE)

    try:
        await storage.makedirs(workspace_dir, exist_ok=True)
        current = await get_team_tasks_gallery()

        # Filter out the task with matching id or title
        filtered = []
        found = False
        for item in current:
            if item.get("id") == task_id or item.get("title") == task_id:
                found = True
                continue
            filtered.append(item)

        if found:
            async with await storage.open(gallery_path, "w") as f:
                await f.write(json.dumps(filtered, indent=2))
            return True
        return False
    except Exception as e:
        print(f"❌ Failed to delete from team tasks gallery: {e}")
        return False


######################
# INTERNAL SUBROUTINES
######################


async def gallery_cache_file_path(filename: str):
    from lab.dirs import get_galleries_cache_dir

    return os.path.join(get_galleries_cache_dir(), filename)


async def maybe_update_gallery_cache_file(filename: str, max_age_seconds: int = 300):
    """
    Conditionally refresh a gallery cache file from remote if it is older than max_age_seconds.
    Ensures the file exists (initializing from the local fallback if needed) before checking age.
    """

    cached_gallery_file = await gallery_cache_file_path(filename)

    # If the file does not exist yet, initialize it (this will also try remote once)
    if not os.path.isfile(cached_gallery_file):
        await update_gallery_cache_file(filename)
        return

    try:
        mtime = os.path.getmtime(cached_gallery_file)
    except OSError as e:
        print(f"❌ Failed to read mtime for {filename}: {e}")
        # If we can't read mtime for some reason, fall back to a full update
        await update_gallery_cache_file(filename)
        return

    # Only hit the remote source if the cache is older than max_age_seconds
    now = time.time()
    if now - mtime > max_age_seconds:
        await update_cache_from_remote(filename)


async def update_gallery_cache_file(filename: str):
    """
    Initialize the gallery cache file if it doesn't exist from code,
    then try to update from remote.
    """

    # First, if nothing is cached yet, then initialize with a local copy when available.
    cached_gallery_file = await gallery_cache_file_path(filename)
    if not os.path.isfile(cached_gallery_file):
        print(f"✅ Initializing {filename} from local source.")

        sourcefile = get_local_gallery_path(filename)
        if os.path.isfile(sourcefile):
            local_galleries_flag = os.environ.get("TLAB_USE_LOCAL_GALLERIES", "").strip()
            if local_galleries_flag in ("1", "true", "yes"):
                if filename in CHANNEL_MANAGED_GALLERY_FILES:
                    channel = os.environ.get("TLAB_GALLERY_CHANNEL", TLAB_GALLERY_CHANNEL).strip() or "stable"
                    print(f"📦 Startup local channel gallery ({channel}): {sourcefile}")
                else:
                    print(f"📦 Startup local gallery fallback: {sourcefile}")
            # Use fsspec-aware copy
            parent_dir = posixpath.dirname(cached_gallery_file)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            shutil.copy(sourcefile, cached_gallery_file)
        else:
            print("❌ Unable to find local gallery file", sourcefile)

    # Then, try to update from remote.
    await update_cache_from_remote(filename)


async def update_cache_from_remote(gallery_filename: str):
    """
    Fetches a gallery file from channel source and updates the cache.
    Set TLAB_USE_LOCAL_GALLERIES=1 to skip remote fetching and use the local bundle only.
    """
    if os.environ.get("TLAB_USE_LOCAL_GALLERIES", "").strip() in ("1", "true", "yes"):
        return
    if not should_use_channel_bundle(gallery_filename):
        # Non-channel galleries are no longer remotely refreshed by this module.
        return
    try:
        data, remote_gallery = try_fetch_channel_gallery(gallery_filename)
        if data is None:
            return

        local_cache_filename = await gallery_cache_file_path(gallery_filename)
        parent_dir = posixpath.dirname(local_cache_filename)
        if parent_dir:
            os.makedirs(parent_dir, exist_ok=True)
        with open(local_cache_filename, "wb") as f:
            f.write(data)
        print(f"☁️  Updated gallery from remote: {remote_gallery}")
    except Exception as e:
        print(f"❌ Failed to update gallery from remote: {remote_gallery} {e}")


async def get_gallery_file(filename: str):
    # default empty gallery returned in case of failed gallery file open
    gallery = []

    # When developing locally, prefer the in-repo gallery file over the cached copy.
    local_galleries_flag = os.environ.get("TLAB_USE_LOCAL_GALLERIES", "").strip()
    if local_galleries_flag in ("1", "true", "yes"):
        local_path = get_local_gallery_path(filename)
        if os.path.isfile(local_path):
            if filename in CHANNEL_MANAGED_GALLERY_FILES:
                channel = os.environ.get("TLAB_GALLERY_CHANNEL", TLAB_GALLERY_CHANNEL).strip() or "stable"
                print(f"📦 Using local channel gallery ({channel}): {local_path}")
            else:
                print(f"📦 Using local gallery fallback: {local_path}")
            with open(local_path, "r") as f:
                gallery = json.load(f)
            return gallery
        print(f"⚠️  Local gallery file not found: {local_path}. Falling back to cache.")

    gallery_path = await gallery_cache_file_path(filename)

    # Check for the cached file. If it's not there then initialize.
    if not os.path.isfile(gallery_path):
        print(f"Updating gallery cache file {filename}")
        await update_gallery_cache_file(filename)

    with open(gallery_path, "r") as f:
        gallery = json.load(f)

    return gallery


def should_use_channel_bundle(filename: str) -> bool:
    return filename in CHANNEL_MANAGED_GALLERY_FILES and bool(TLAB_CHANNEL_GALLERIES_BASE_URL)


def get_local_gallery_path(filename: str) -> str:
    """
    Resolve the preferred in-repo local path for a gallery file.
    If a channel-managed gallery is requested, prefer channels/<channel>/latest/<file>.
    """
    if filename in CHANNEL_MANAGED_GALLERY_FILES:
        channel = os.environ.get("TLAB_GALLERY_CHANNEL", TLAB_GALLERY_CHANNEL).strip() or "stable"
        candidate = os.path.join(dirs.GALLERIES_LOCAL_FALLBACK_DIR, "channels", channel, "latest", filename)
        if os.path.isfile(candidate):
            return candidate
    return os.path.join(dirs.GALLERIES_LOCAL_FALLBACK_DIR, filename)


def current_app_version() -> str:
    global _APP_VERSION_CACHE
    if _APP_VERSION_CACHE:
        return _APP_VERSION_CACHE

    env_version = os.environ.get("TLAB_APP_VERSION", "").strip()
    if env_version:
        _APP_VERSION_CACHE = env_version
        return _APP_VERSION_CACHE

    pyproject_path = Path(__file__).resolve().parents[2] / "pyproject.toml"
    try:
        with pyproject_path.open("rb") as f:
            pyproject_data = tomllib.load(f)
        _APP_VERSION_CACHE = str(pyproject_data.get("project", {}).get("version", "0.0.0"))
    except Exception:
        _APP_VERSION_CACHE = "0.0.0"
    return _APP_VERSION_CACHE


def is_manifest_version_compatible(manifest: dict, app_version: str | None = None) -> bool:
    app_version = app_version or current_app_version()
    try:
        app_ver = Version(str(app_version))
    except InvalidVersion:
        return False

    min_version = manifest.get("min_supported_app_version")
    if min_version:
        try:
            if app_ver < Version(str(min_version)):
                return False
        except InvalidVersion:
            return False

    max_version = manifest.get("max_supported_app_version")
    if max_version:
        try:
            if app_ver > Version(str(max_version)):
                return False
        except InvalidVersion:
            return False

    return True


def try_fetch_channel_gallery(gallery_filename: str):
    channel = os.environ.get("TLAB_GALLERY_CHANNEL", TLAB_GALLERY_CHANNEL).strip() or "stable"
    manifest_url = f"{TLAB_CHANNEL_GALLERIES_BASE_URL}/{channel}/latest/manifest.json"
    try:
        with urllib.request.urlopen(manifest_url) as resp:
            manifest = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"⚠️  Channel manifest unavailable: {manifest_url} ({e})")
        return None, manifest_url

    if not is_manifest_version_compatible(manifest):
        print(
            "⚠️  Channel manifest incompatible with app version "
            f"{current_app_version()}; keeping current cache/local bundle."
        )
        return None, manifest_url

    files = manifest.get("files", {})
    if files and gallery_filename not in files:
        print(f"⚠️  {gallery_filename} missing in channel manifest; keeping current cache/local bundle.")
        return None, manifest_url

    gallery_url = f"{TLAB_CHANNEL_GALLERIES_BASE_URL}/{channel}/latest/{gallery_filename}"
    with urllib.request.urlopen(gallery_url) as resp:
        return resp.read(), gallery_url
