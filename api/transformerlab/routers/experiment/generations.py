import asyncio
import json
import os
import subprocess
import sys
import urllib
from typing import Any

from fastapi import APIRouter, Body
from fastapi.responses import FileResponse
from lab import storage
from transformerlab.services.job_service import job_get
from transformerlab.shared import shared, dirs
from lab import dirs as lab_dirs
from transformerlab.services.experiment_service import experiment_get, experiment_update_config

from werkzeug.utils import secure_filename
import aiofiles

router = APIRouter(prefix="/generations", tags=["generations"])


@router.post("/add")
async def experiment_add_generation(experimentId: str, plugin: Any = Body()):
    """Add an generationn to an experiment. This will create a new directory in the experiment
    and add global plugin to the specific experiment. By copying the plugin to the experiment
    directory, we can modify the plugin code for the specific experiment without affecting
    other experiments that use the same plugin."""

    experiment = await experiment_get(experimentId)

    if experiment is None:
        return {"message": f"Experiment {experimentId} does not exist"}

    experiment_config = experiment["config"]  # now returns a dict directly

    if "generations" not in experiment_config or not isinstance(experiment_config.get("generations"), list):
        experiment_config["generations"] = []

    generations = experiment_config["generations"]

    name = plugin["name"]
    plugin_name = plugin["plugin"]
    script_parameters = plugin["script_parameters"]

    slug = shared.slugify(name)

    # If name is greater than 100 characters, truncate it
    if len(slug) > 100:
        slug = slug[:100]
        print("Generation name is too long, truncating to 100 characters")

    generation = {"name": slug, "plugin": plugin_name, "script_parameters": script_parameters}

    generations.append(generation)

    await experiment_update_config(experimentId, "generations", generations)

    return {"message": f"Experiment {experimentId} updated with plugin {plugin_name}"}


@router.get("/delete")
async def experiment_delete_generation(experimentId: str, generation_name: str):
    """Delete an generation from an experiment. This will delete the directory in the experiment
    and remove the global plugin from the specific experiment."""
    try:
        print("Deleting generation", experimentId, generation_name)
        experiment = await experiment_get(experimentId)

        if experiment is None:
            return {"message": f"Experiment {experimentId} does not exist"}

        experiment_config = experiment["config"]  # now returns a dict directly

        if "generations" not in experiment_config or not isinstance(experiment_config.get("generations"), list):
            return {"message": f"Experiment {experimentId} has no generations"}

        generations = experiment_config["generations"]

        # remove the generation from the list:
        generations = [e for e in generations if e["name"] != generation_name]

        await experiment_update_config(experimentId, "generations", generations)

        return {"message": f"Generation {generations} deleted from experiment {experimentId}"}
    except Exception as e:
        print("Error in delete_generation_task", e)
        raise e


# @TODO delete the following function and use the plugin file function


@router.post("/edit")
async def edit_evaluation_generation(experimentId: str, plugin: Any = Body()):
    """Get the contents of the generation"""
    try:
        experiment = await experiment_get(experimentId)

        # if the experiment does not exist, return an error:
        if experiment is None:
            return {"message": f"Experiment {experimentId} does not exist"}

        generation_name = plugin["evalName"]
        updated_json = plugin["script_parameters"]

        plugin_name = updated_json["plugin_name"]
        template_name = updated_json["template_name"]

        experiment_config = experiment["config"]  # now returns a dict directly

        # updated_json = json.loads(updated_json)

        if "generations" not in experiment_config or not isinstance(experiment_config.get("generations"), list):
            return {"message": f"Experiment {experimentId} has no generations"}

        generations = experiment_config["generations"]

        # Remove fields model_name, model_architecture and plugin_name from the updated_json
        # as they are not needed in the generations list
        updated_json.pop("model_name", None)
        updated_json.pop("model_architecture", None)
        updated_json.pop("plugin_name", None)
        updated_json.pop("template_name", None)

        for generation in generations:
            if generation["name"] == generation_name and generation["plugin"] == plugin_name:
                generation["script_parameters"] = updated_json
                generation["name"] = template_name

        await experiment_update_config(experimentId, "generations", generations)

        return {"message": "OK"}
    except Exception as e:
        print("Error in edit_generation_task", e)
        raise e


@router.get("/get_generation_plugin_file_contents")
async def get_generation_plugin_file_contents(experimentId: str, plugin_name: str):
    # first get the experiment name:
    data = await experiment_get(experimentId)

    # if the experiment does not exist, return an error:
    if data is None:
        return {"message": f"Experiment {experimentId} does not exist"}

    # experiment_name = data["name"]

    # print(f"{EXPERIMENTS_DIR}/{experiment_name}/generation/{generation_name}/main.py")

    file_name = "main.py"
    plugin_path = lab_dirs.plugin_dir_by_name(plugin_name)

    # now get the file contents
    try:
        with open(os.path.join(plugin_path, file_name), "r") as f:
            file_contents = f.read()
    except FileNotFoundError:
        return "error file not found"

    return file_contents


@router.get("/run_generation_script")
async def run_generation_script(
    experimentId: str, plugin_name: str, generation_name: str, job_id: str, org_id: str = None
):
    job_config = (await job_get(job_id))["job_data"]
    generation_config = job_config.get("config", {})
    print(generation_config)
    plugin_name = secure_filename(plugin_name)
    generation_name = secure_filename(generation_name)

    experiment_details = await experiment_get(id=experimentId)

    if experiment_details is None:
        return {"message": f"Experiment {experimentId} does not exist"}
    config = (
        experiment_details["config"]
        if isinstance(experiment_details["config"], dict)
        else json.loads(experiment_details["config"] or "{}")
    )

    model_name = config.get("foundation", "")
    if "model_name" in generation_config.keys():
        model_name = generation_config["model_name"]

    model_file_path = config.get("foundation_filename", "")
    if model_file_path is None or model_file_path.strip() == "":
        model_file_path = ""
    model_type = config.get("foundation_model_architecture", "")
    if "model_architecture" in generation_config.keys():
        model_type = generation_config["model_architecture"]
    model_adapter = config.get("model_adapter", "")
    if "model_adapter" in generation_config.keys():
        model_adapter = generation_config["model_adapter"]

    # @TODO: This whole thing can be re-written to use the shared function to run a plugin

    # Create the input file for the script:
    from lab.dirs import get_temp_dir

    temp_dir = await get_temp_dir()
    input_file = storage.join(temp_dir, "plugin_input_" + str(plugin_name) + ".json")

    # The following two ifs convert nested JSON strings to JSON objects -- this is a hack
    # and should be done in the API itself
    if "config" in experiment_details:
        experiment_details["config"] = (
            experiment_details["config"]
            if isinstance(experiment_details["config"], dict)
            else json.loads(experiment_details["config"] or "{}")
        )
        if "inferenceParams" in experiment_details["config"]:
            if isinstance(experiment_details["config"]["inferenceParams"], str):
                experiment_details["config"]["inferenceParams"] = json.loads(
                    experiment_details["config"]["inferenceParams"]
                )
        if "generations" in experiment_details["config"]:
            if isinstance(experiment_details["config"]["generations"], str):
                experiment_details["config"]["generations"] = json.loads(experiment_details["config"]["generations"])

    template_config = generation_config["script_parameters"]
    job_output_file = await shared.get_job_output_file_name(job_id, plugin_name, experimentId)

    input_contents = {"experiment": experiment_details, "config": template_config}
    async with aiofiles.open(input_file, "w") as outfile:
        await outfile.write(json.dumps(input_contents, indent=4))

    # For now, even though we have the file above, we are also going to pass all params
    # as command line arguments to the script.

    # Create a list of all the parameters:
    script_directory = await lab_dirs.plugin_dir_by_name(plugin_name)
    extra_args = ["--plugin_dir", script_directory]
    for key in template_config:
        extra_args.append("--" + key)
        extra_args.append(str(template_config[key]))

    extra_args.extend(
        [
            "--experiment_name",
            experimentId,
            "--generation_name",
            generation_name,
            "--input_file",
            input_file,
            "--model_name",
            model_name,
            "--model_path",
            model_file_path,
            "--model_architecture",
            model_type,
            "--model_adapter",
            model_adapter,
            "--job_id",
            str(job_id),
        ]
    )

    # Check if plugin has a venv directory
    venv_path = os.path.join(script_directory, "venv")
    if os.path.exists(venv_path) and os.path.isdir(venv_path):
        print(f">Plugin has virtual environment, activating venv from {venv_path}")
        # Use bash to activate venv and then run the command
        venv_python = os.path.join(venv_path, "bin", "python")
        # Construct command that first activates venv then runs script
        subprocess_command = [venv_python, dirs.PLUGIN_HARNESS] + extra_args
    else:
        print(">Using system Python interpreter")
        subprocess_command = [sys.executable, dirs.PLUGIN_HARNESS] + extra_args

    print(f">Running {subprocess_command}")

    output_file = await lab_dirs.generation_output_file(experimentId, generation_name)

    print(f">GENERATION Output file: {job_output_file}")

    # Prepare environment variables for subprocess
    # Pass organization_id via environment variable if provided
    process_env = None
    if org_id:
        process_env = os.environ.copy()
        process_env["_TFL_ORG_ID"] = org_id

    async with aiofiles.open(job_output_file, "w") as f:
        process = await asyncio.create_subprocess_exec(
            *subprocess_command, stdout=f, stderr=subprocess.PIPE, env=process_env
        )
        await process.communicate()

    async with aiofiles.open(output_file, "w") as f:
        # Copy all contents from job_output_file to output_file
        async with aiofiles.open(job_output_file, "r") as job_output:
            async for line in job_output:
                await f.write(line)


@router.get("/get_output")
async def get_output(experimentId: str, generation_name: str):
    """Get the output of an generation"""

    # sanitize the input:
    generation_name = urllib.parse.unquote(generation_name)

    generation_output_file = await lab_dirs.generation_output_file(experimentId, generation_name)
    if not await storage.exists(generation_output_file):
        return {"message": "Output file does not exist"}

    print(f"Returning output file: {generation_output_file}.")

    # return the whole file as a file response:
    return FileResponse(generation_output_file)
