# Transformer Lab updates some of its galleries remotely
# It then tries to download the latest version and store in a local cache
# with a backup stored in the server code.
# This is all managed in this file.

import os
import json
import posixpath
import urllib.request
import shutil

from transformerlab.shared import dirs

# This is the list of galleries that are updated remotely
MODEL_GALLERY_FILE = "model-gallery.json"
DATA_GALLERY_FILE = "dataset-gallery.json"
MODEL_GROUP_GALLERY_FILE = "model-group-gallery.json"
EXP_RECIPES_GALLERY_FILE = "exp-recipe-gallery.json"
# Tasks gallery main file
TASKS_GALLERY_FILE = "tasks-gallery.json"
# Team-specific tasks gallery stored in workspace dir (per team)
TEAM_TASKS_GALLERY_FILE = "team_specific_tasks.json"
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


def get_team_tasks_gallery():
    """
    Team-specific tasks gallery stored in the workspace directory.
    Falls back to an empty list when missing or unreadable.
    """
    from lab.dirs import get_workspace_dir
    from lab import storage

    workspace_dir = get_workspace_dir()
    gallery_path = storage.join(workspace_dir, TEAM_TASKS_GALLERY_FILE)

    try:
        # Ensure the workspace directory exists before checking the file
        storage.makedirs(workspace_dir, exist_ok=True)

        if not storage.exists(gallery_path):
            # Initialize an empty gallery file
            with storage.open(gallery_path, "w") as f:
                json.dump([], f)
            return []

        with storage.open(gallery_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Failed to read team tasks gallery: {e}")
        return []


def add_team_task_to_gallery(entry: dict):
    """
    Append (or upsert) a task entry to the team-specific gallery.
    Replaces an existing entry with the same id/title to avoid duplicates.
    """
    from lab.dirs import get_workspace_dir
    from lab import storage

    workspace_dir = get_workspace_dir()
    gallery_path = storage.join(workspace_dir, TEAM_TASKS_GALLERY_FILE)

    try:
        storage.makedirs(workspace_dir, exist_ok=True)
        current = get_team_tasks_gallery()

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

        with storage.open(gallery_path, "w") as f:
            json.dump(filtered, f, indent=2)
        return filtered
    except Exception as e:
        print(f"❌ Failed to write team tasks gallery: {e}")
        return get_team_tasks_gallery()


######################
# INTERNAL SUBROUTINES
######################


def gallery_cache_file_path(filename: str):
    from lab.dirs import get_galleries_cache_dir

    return os.path.join(get_galleries_cache_dir(), filename)


def update_gallery_cache_file(filename: str):
    """
    Initialize the gallery cache file if it doesn't exist from code,
    then try to update from remote.
    """

    # First, if nothing is cached yet, then initialize with the local copy.
    cached_gallery_file = gallery_cache_file_path(filename)
    if not os.path.isfile(cached_gallery_file):
        print(f"✅ Initializing {filename} from local source.")

        sourcefile = os.path.join(dirs.GALLERIES_LOCAL_FALLBACK_DIR, filename)
        if os.path.isfile(sourcefile):
            # Use fsspec-aware copy
            parent_dir = posixpath.dirname(cached_gallery_file)
            if parent_dir:
                os.makedirs(parent_dir, exist_ok=True)
            shutil.copy(sourcefile, cached_gallery_file)
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
            os.makedirs(parent_dir, exist_ok=True)
        with open(local_cache_filename, "wb") as f:
            f.write(data)
        print(f"☁️  Updated gallery from remote: {remote_gallery}")
    except Exception as e:
        print(f"❌ Failed to update gallery from remote: {remote_gallery} {e}")


def get_gallery_file(filename: str):
    # default empty gallery returned in case of failed gallery file open
    gallery = []
    gallery_path = gallery_cache_file_path(filename)

    # Check for the cached file. If it's not there then initialize.
    if not os.path.isfile(gallery_path):
        print(f"Updating gallery cache file {filename}")
        update_gallery_cache_file(filename)

    with open(gallery_path, "r") as f:
        gallery = json.load(f)

    return gallery
