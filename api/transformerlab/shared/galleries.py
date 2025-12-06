# Transformer Lab updates some of its galleries remotely
# It then tries to download the latest version and store in a local cache
# with a backup stored in the server code.
# This is all managed in this file.

import json
import posixpath
import time
import urllib.request

from lab import storage

from transformerlab.shared import dirs

# This is the list of galleries that are updated remotely
MODEL_GALLERY_FILE = "model-gallery.json"
DATA_GALLERY_FILE = "dataset-gallery.json"
MODEL_GROUP_GALLERY_FILE = "model-group-gallery.json"
EXP_RECIPES_GALLERY_FILE = "exp-recipe-gallery.json"
# Tasks gallery main file
TASKS_GALLERY_FILE = "task-gallery.json"
GALLERY_FILES = [
    MODEL_GALLERY_FILE,
    DATA_GALLERY_FILE,
    MODEL_GROUP_GALLERY_FILE,
    EXP_RECIPES_GALLERY_FILE,
    TASKS_GALLERY_FILE,
]

TLAB_REMOTE_GALLERIES_URL = "https://raw.githubusercontent.com/transformerlab/galleries/main/"


def update_gallery_cache():
    """
    Called when Transformer Lab starts up.
    Initializes any cached gallery files and tries to update from remote.
    """

    for filename in GALLERY_FILES:
        update_gallery_cache_file(filename)


def get_models_gallery():
    return get_gallery_file(MODEL_GALLERY_FILE)


def get_model_groups_gallery():
    return get_gallery_file(MODEL_GROUP_GALLERY_FILE)


def get_data_gallery():
    return get_gallery_file(DATA_GALLERY_FILE)


def get_exp_recipe_gallery():
    return get_gallery_file(EXP_RECIPES_GALLERY_FILE)


def get_tasks_gallery():
    return get_gallery_file(TASKS_GALLERY_FILE)


######################
# INTERNAL SUBROUTINES
######################


def gallery_cache_file_path(filename: str):
    from lab.dirs import get_galleries_cache_dir

    return storage.join(get_galleries_cache_dir(), filename)


def update_gallery_cache_file(filename: str):
    """
    Initialize the gallery cache file if it doesn't exist from code,
    then try to update from remote.
    """

    # First, if nothing is cached yet, then initialize with the local copy.
    cached_gallery_file = gallery_cache_file_path(filename)
    if not storage.isfile(cached_gallery_file):
        print(f"✅ Initializing {filename} from local source.")

        sourcefile = storage.join(dirs.GALLERIES_LOCAL_FALLBACK_DIR, filename)
        if storage.isfile(sourcefile):
            # Use fsspec-aware copy
            parent_dir = posixpath.dirname(cached_gallery_file)
            if parent_dir:
                storage.makedirs(parent_dir, exist_ok=True)
            storage.copy_file(sourcefile, cached_gallery_file)
        else:
            print("❌ Unable to find local gallery file", sourcefile)

    # Then, try to update from remote.
    update_cache_from_remote(filename)


def update_cache_from_remote(gallery_filename: str):
    """
    Fetches a gallery file from source and updates the cache
    """
    try:
        remote_gallery = TLAB_REMOTE_GALLERIES_URL + gallery_filename
        local_cache_filename = gallery_cache_file_path(gallery_filename)
        # Stream download and write via fsspec
        with urllib.request.urlopen(remote_gallery) as resp:
            data = resp.read()
        parent_dir = posixpath.dirname(local_cache_filename)
        if parent_dir:
            storage.makedirs(parent_dir, exist_ok=True)
        with storage.open(local_cache_filename, "wb") as f:
            f.write(data)
        print(f"☁️  Updated gallery from remote: {remote_gallery}")
    except Exception as e:
        print(f"❌ Failed to update gallery from remote: {remote_gallery} {e}")


def update_cache_from_remote_if_stale(gallery_filename: str, max_age_seconds: int = 3600):
    """
    Updates the gallery cache from remote only if the cache is older than max_age_seconds.
    Default max_age_seconds is 3600 (1 hour).

    Handles fused filesystems where getmtime() might be unreliable.
    """
    local_cache_filename = gallery_cache_file_path(gallery_filename)

    # If file doesn't exist, update it
    if not storage.isfile(local_cache_filename):
        update_cache_from_remote(gallery_filename)
        return

    # Check if cache is stale
    # Handle fused filesystems where getmtime() might be unreliable or unavailable
    try:
        # Get file info using storage module
        file_info = storage.filesystem().info(local_cache_filename)

        # Extract modification time - handle different filesystem formats
        mtime = None
        if "mtime" in file_info:
            mtime = file_info["mtime"]
        elif "LastModified" in file_info:
            # S3 and some other filesystems use LastModified (datetime object)
            from datetime import datetime

            last_modified = file_info["LastModified"]
            if isinstance(last_modified, datetime):
                mtime = last_modified.timestamp()
            else:
                mtime = float(last_modified)
        elif "modified" in file_info:
            mtime = file_info["modified"]

        if mtime is None:
            # Could not determine modification time, update to be safe
            update_cache_from_remote(gallery_filename)
            return

        current_time = time.time()
        file_age = current_time - mtime

        # Sanity check: if mtime is in the future or file_age is negative, treat as unreliable
        if file_age < 0 or mtime > current_time:
            # Fused filesystem returned unreliable timestamp, update to be safe
            update_cache_from_remote(gallery_filename)
            return

        if file_age > max_age_seconds:
            update_cache_from_remote(gallery_filename)
    except (OSError, ValueError, KeyError, AttributeError) as e:
        # getmtime() failed (e.g., on some fused filesystems), update to be safe
        print(f"⚠️  Could not determine cache age for {gallery_filename}, updating: {e}")
        update_cache_from_remote(gallery_filename)


def get_gallery_file(filename: str):
    # default empty gallery returned in case of failed gallery file open
    gallery = []
    gallery_path = gallery_cache_file_path(filename)

    # Check for the cached file. If it's not there then initialize.
    if not storage.isfile(gallery_path):
        print(f"Updating gallery cache file {filename}")
        update_gallery_cache_file(filename)

    with storage.open(gallery_path) as f:
        gallery = json.load(f)

    return gallery
