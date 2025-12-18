import json
import os
from pathlib import Path

from typing import Annotated

from fastapi import APIRouter, Body
import httpx

from transformerlab.services.experiment_service import experiment_get

from transformerlab.shared import shared, dirs
from lab import dirs as lab_dirs

from werkzeug.utils import secure_filename

from transformerlab.routers.plugins import plugin_gallery


router = APIRouter(prefix="/plugins", tags=["plugins"])


@router.get("/list")
async def experiment_list_scripts(id: str, type: str = None, filter: str = None):
    """List all the scripts in the experiment"""
    # first get the experiment name:
    data = await experiment_get(id)

    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # Get all plugins in the gallery, so we can compare their version number
    # to plugins that are installed in the experiment
    gallery_plugins = await plugin_gallery()

    # parse the filter variable which is formatted as key:value
    # for example, model_architecture:LLamaArchitecture
    filter_key = None
    filter_value = None
    if filter is not None:
        [filter_key, filter_value] = filter.split(":")

    # print(f"Filtering by {filter_key} with value {filter_value}")

    from lab.dirs import get_plugin_dir

    scripts_dir = await get_plugin_dir()

    # now get a list of all the directories in the scripts directory:
    scripts_full_json = []

    # If the scripts dir doesn't exist, return empty:
    if not os.path.exists(scripts_dir):
        return scripts_full_json

    for filename in os.listdir(scripts_dir):
        if os.path.isdir(os.path.join(scripts_dir, filename)):
            # check the type of each index.json in each script dir
            try:
                plugin_info = json.load(open(f"{scripts_dir}/{filename}/index.json", "r"))
            except FileNotFoundError:
                continue
            except json.decoder.JSONDecodeError:
                print(f"Error decoding {scripts_dir}/{filename}/index.json")
                continue

            plugin_type = None
            if "type" in plugin_info:
                plugin_type = plugin_info["type"]

            plugin_info["installed"] = True

            # Look up this plugin in the gallery to get the version number
            gallery_version = None
            for gallery_plugin in gallery_plugins:
                if gallery_plugin.get("uniqueId") == filename:
                    gallery_version = gallery_plugin.get("version")
                    break

            plugin_info["gallery_version"] = gallery_version

            # print(
            #     f"Plugin {filename} has version {plugin_info.get('version')} but in Gallery it is {plugin_version}")

            # if the type of plugin matches with the type filter, or no filter is provided then continue:
            if type is None or type == plugin_type:
                # check if the plugin has the additional filter key as a property
                if filter_key is None:
                    scripts_full_json.append(plugin_info)
                else:
                    # check if the filter key is in the plugin_info:
                    if filter_key in plugin_info:
                        # check if, in the info, the value is an array
                        # If it is an array, then check for the value by iterating through
                        if isinstance(plugin_info[filter_key], list):
                            if filter_value is None or filter_value in plugin_info[filter_key]:
                                scripts_full_json.append(plugin_info)
                        # otherwise, check if the value matches
                        else:
                            if filter_value is None or filter_value == plugin_info[filter_key]:
                                scripts_full_json.append(plugin_info)
                    else:
                        print("item does not have key " + filter_key)

    return scripts_full_json


@router.get("/download", summary="Download a dataset to the LLMLab server.")
async def plugin_download(id: int, plugin_slug: str):
    """Download a plugin and install to a local list of available plugins"""
    # Get plugin from plugin gallery:
    # plugin = await db.get_plugin(plugin_slug)
    # Right now this plugin object doesn't contain the URL to the plugin, so we need to get that from the plugin gallery:
    # Fix this later by storing the information locally in the database
    gallery_file = os.path.join(dirs.TFL_SOURCE_CODE_DIR, "transformerlab", "galleries", "plugin-gallery.json")
    plugin_gallery_json = open(gallery_file, "r")
    plugin_gallery = json.load(plugin_gallery_json)

    # We hardcode this to the first object -- fix later
    url = plugin_gallery[0]["url"]

    client = httpx.AsyncClient()

    # Download index.json from the URL above:
    # Hack: this won't work because we can't download a file from our own server
    print("Getting the plugin index.json file at " + url + "index.json")
    # index_json = urlopen(url + "index.json").read()
    response = await client.get(url + "index.json")
    index_json = response.text
    print("Downloaded...")

    # Convert index.json to a dict:
    index = json.loads(index_json)

    # Add index.json to the list of files to download:
    index["files"].append("index.json")

    for file in index["files"]:
        # Download each file
        print("Downloading " + file + "...")
        response = await client.get(url + file)
        file_contents = response.text
        # Save each file to workspace/plugins/<plugin_slug>/<file>
        p = await lab_dirs.plugin_dir_by_name(plugin_slug)
        os.makedirs(p, mode=0o755, exist_ok=True)
        with open(f"{p}/{file}", "w") as f:
            f.write(file_contents)

    await client.aclose()

    return {"message": "OK"}


#
# *****************************************************************************
# Everything below is used to manage plugins in the experiment/{id}/plugins/ directory
# *****************************************************************************


allowed_extensions: list[str] = [".py", ".pyj2", ".ipynb", ".md", ".txt", ".sh", ".json"]


@router.post("/{pluginId}/save_file_contents")
async def plugin_save_file_contents(id: str, pluginId: str, filename: str, file_contents: Annotated[str, Body()]):
    global allowed_extensions

    filename = secure_filename(filename)

    data = await experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    if file_ext not in allowed_extensions:
        return {"message": f"File extension {file_ext} for {filename} not supported"}

    # clean the file name:
    filename = shared.slugify(filename)
    pluginId = shared.slugify(pluginId)

    script_path = await lab_dirs.plugin_dir_by_name(pluginId)

    # make directory if it does not exist:
    if not os.path.exists(f"{script_path}"):
        os.makedirs(f"{script_path}")

    # now save the file contents, overwriting if it already exists:
    with open(f"{script_path}/{filename}{file_ext}", "w") as f:
        print(f"Writing {script_path}/{filename}{file_ext}")
        f.write(file_contents)

    return {"message": f"{script_path}/{filename}{file_ext} file contents saved"}


@router.get("/{pluginId}/file_contents")
async def plugin_get_file_contents(id: str, pluginId: str, filename: str):
    global allowed_extensions

    filename = secure_filename(filename)

    data = await experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    if file_ext not in allowed_extensions:
        return {"message": f"File extension {file_ext} for {filename} not supported"}

    # The following prevents path traversal attacks:
    plugin_dir = await lab_dirs.plugin_dir_by_name((pluginId))
    final_path = Path(plugin_dir).joinpath(filename + file_ext).resolve().relative_to(plugin_dir)

    final_path = plugin_dir + "/" + str(final_path)

    # now get the file contents
    try:
        with open(final_path, "r") as f:
            file_contents = f.read()
    except FileNotFoundError:
        return "FILE NOT FOUND"

    return file_contents


@router.get("/{pluginId}/list_files")
async def plugin_list_files(id: str, pluginId: str):
    global allowed_extensions

    data = await experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]
    scripts_dir = await lab_dirs.plugin_dir_by_name(pluginId)

    # check if directory exists:
    if not os.path.exists(scripts_dir):
        return []

    # now get the list of files:
    files = []
    for file in os.listdir(scripts_dir):
        [filename, file_ext] = os.path.splitext(file)
        if file_ext in allowed_extensions:
            files.append(filename + file_ext)

    return files


@router.get("/{pluginId}/create_new_file")
async def plugin_create_new_file(id: str, pluginId: str, filename: str):
    global allowed_extensions

    filename = secure_filename(filename)

    data = experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    if file_ext not in allowed_extensions:
        return {
            "error": "true",
            "message": f"File extension {file_ext} for {filename} not supported. Please use one of the following extensions: {allowed_extensions}",
        }

    # clean the file name:
    filename = shared.slugify(filename)
    pluginId = shared.slugify(pluginId)

    script_path = lab_dirs.plugin_dir_by_name(pluginId)

    # make directory if it does not exist:
    if not os.path.exists(f"{script_path}"):
        os.makedirs(f"{script_path}")

    # now save the file contents, overwriting if it already exists:
    with open(f"{script_path}/{filename}{file_ext}", "w+") as _:
        # f.write("")
        pass

    return {"message": f"{script_path}/{filename}{file_ext} file created"}


@router.get(path="/{pluginId}/delete_file")
async def plugin_delete_file(id: str, pluginId: str, filename: str):
    global allowed_extensions

    filename = secure_filename(filename)

    data = experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    if file_ext not in allowed_extensions:
        return {
            "error": "true",
            "message": f"File extension {file_ext} for {filename} not supported. Please use one of the following extensions: {allowed_extensions}",
        }

    # clean the file name:
    filename = shared.slugify(filename)
    pluginId = shared.slugify(pluginId)

    script_path = lab_dirs.plugin_dir_by_name(pluginId)

    # make directory if it does not exist:
    if not os.path.exists(f"{script_path}"):
        return {"error": "true", "message": f"{script_path} does not exist"}

    # now delete the file contents
    os.remove(f"{script_path}/{filename}{file_ext}")

    return {"message": f"{script_path}/{filename}{file_ext} file deleted"}


@router.get(path="/new_plugin")
async def plugin_new_plugin_directory(id: str, pluginId: str):
    global allowed_extensions

    data = experiment_get(id)
    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {id} does not exist"}

    # experiment_name = data["name"]

    # clean the file name:
    pluginId = shared.slugify(value=pluginId)

    script_path = lab_dirs.plugin_dir_by_name(pluginId)

    # make directory if it does not exist:
    if not os.path.exists(f"{script_path}"):
        os.makedirs(f"{script_path}")

    index_json = {
        "uniqueId": pluginId,
        "name": pluginId,
        "description": "",
        "plugin-format": "python",
        "type": "trainer",
        "files": [],
        "parameters": [],
    }

    # add an index.json file:
    with open(f"{script_path}/index.json", "w+") as f:
        print(f"Writing {script_path}/index.json")
        json_content = json.dumps(index_json, indent=4)
        print(json_content)
        f.write(json.dumps(index_json, indent=4))

    return {"message": f"{script_path} directory created"}
