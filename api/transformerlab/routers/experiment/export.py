import json
import os
import time
import asyncio
import subprocess
import sys

from fastapi import APIRouter

from transformerlab.services.experiment_service import experiment_get
from transformerlab.services.job_service import job_create, job_get
from lab import dirs as lab_dirs
from lab import storage
from transformerlab.shared import dirs, shared

from transformerlab.services.job_service import job_update_status

from werkzeug.utils import secure_filename

router = APIRouter(prefix="/export", tags=["export"])


@router.get("/run_exporter_script")
async def run_exporter_script(
    id: str,
    plugin_name: str,
    plugin_architecture: str,
    plugin_params: str = "{}",
    job_id: str = None,
    org_id: str = None,
):
    """
    plugin_name: the id of the exporter plugin to run
    plugin_architecture: A string containing the standard name of plugin architecture
    plugin_params: a string of JSON containing parameters for this plugin (found in plugins info.json)
    job_id: optional job_id to use instead of creating a new job (for use by job system)
    """

    # Load experiment details into config
    experiment_details = experiment_get(id=id)
    if experiment_details is None:
        return {"message": f"Experiment {id} does not exist"}

    experiment_name = experiment_details["name"]

    # Get input model parameters
    config = (
        experiment_details["config"]
        if isinstance(experiment_details["config"], dict)
        else json.loads(experiment_details["config"] or "{}")
    )
    input_model_id = config["foundation"]
    input_model_id_without_author = input_model_id.split("/")[-1]
    input_model_architecture = config["foundation_model_architecture"]

    # The exporter plugin needs to know where to find the model
    input_model_path = config.get("foundation_filename", "")
    if not input_model_path:
        input_model_path = input_model_id

    # TODO: Verify that the model uses a supported format

    # Convert JSON parameters
    # And set default parameters for anything that didn't get passed in
    params = json.loads(plugin_params)
    q_type = ""
    if "outtype" in params:
        q_type = params["outtype"]
    elif "q_bits" in params:
        q_type = str(params["q_bits"]) + "bit"

    # Generate output model details
    conversion_time = int(time.time())
    output_model_architecture = plugin_architecture
    output_model_id = f"{output_model_architecture}-{input_model_id_without_author}-{conversion_time}"
    if len(q_type) > 0:
        output_model_id = f"{output_model_id}-{q_type}"
    output_model_name = f"{input_model_id_without_author} - {output_model_architecture}"
    if len(q_type) > 0:
        output_model_name = f"{output_model_name} - {q_type}"
    output_filename = ""

    # GGUF is special: it generates a different format with only one file
    # For everything to work we need the model ID and output filename to match
    if output_model_architecture == "GGUF":
        output_model_id = f"{input_model_id_without_author}-{conversion_time}.gguf"
        if len(q_type) > 0:
            output_model_id = f"{input_model_id_without_author}-{conversion_time}-{q_type}.gguf"

        output_filename = output_model_id
    else:
        # For directory-based models (non-GGUF), set model_filename to "." to indicate the directory itself
        output_filename = "."

    # Figure out plugin and model output directories
    script_directory = lab_dirs.plugin_dir_by_name(plugin_name)

    output_model_id = secure_filename(output_model_id)

    from lab.dirs import get_models_dir

    output_path = storage.join(get_models_dir(), output_model_id)

    # Create a job in the DB with the details of this export (only if job_id not provided)
    if job_id is None:
        job_data = dict(
            plugin=plugin_name,
            input_model_id=input_model_id,
            input_model_path=input_model_path,
            input_model_architecture=input_model_architecture,
            output_model_id=output_model_id,
            output_model_architecture=output_model_architecture,
            output_model_name=output_model_name,
            output_model_path=output_path,
            params=params,
        )
        job_data_json = json.dumps(job_data)
        job_id = job_create(type="EXPORT", status="Started", experiment_id=experiment_name, job_data=job_data_json)
        return job_id

    # Setup arguments to pass to plugin
    args = [
        "--plugin_dir",
        script_directory,
        "--job_id",
        str(job_id),
        "--model_name",
        input_model_id,
        "--model_path",
        input_model_path,
        "--model_architecture",
        input_model_architecture,
        "--output_dir",
        output_path,
        "--output_model_id",
        output_model_id,
    ]

    # Add additional parameters that are unique to the plugin (defined in info.json and passed in via plugin_params)
    for key in params:
        new_param = [f"--{key}", params[key]]
        args.extend(new_param)

    # Run the export plugin
    subprocess_command = [sys.executable, dirs.PLUGIN_HARNESS] + args

    # Prepare environment variables for subprocess
    # Pass organization_id via environment variable if provided
    process_env = None
    if org_id:
        process_env = os.environ.copy()
        process_env["_TFL_ORG_ID"] = org_id

    try:
        # Get the output file path
        job_output_file = await shared.get_job_output_file_name(job_id, experiment_name=experiment_name)

        # Create the output file and run the process with output redirection
        with storage.open(job_output_file, "w") as f:
            process = await asyncio.create_subprocess_exec(
                *subprocess_command, stdout=f, stderr=subprocess.PIPE, cwd=script_directory, env=process_env
            )
            _, stderr = await process.communicate()

            try:
                stderr_str = stderr.decode("utf-8", errors="replace")
            except Exception as e:
                stderr_str = f"[stderr decode error]: {e}"

            if stderr_str.strip():
                print(f"Error: {stderr_str}")
                f.write(f"\nError:\n{stderr_str}")

            if process.returncode != 0:
                job = job_get(job_id)
                experiment_id = job["experiment_id"]
                await job_update_status(job_id=job_id, status="FAILED", experiment_id=experiment_id)
                return {
                    "status": "error",
                    "message": "Export failed due to an internal error. Please check the output file for more details.",
                }

    except Exception as e:
        print(f"Failed to export model. Exception: {e}")
        job = job_get(job_id)
        experiment_id = job["experiment_id"]
        await job_update_status(job_id=job_id, status="FAILED", experiment_id=experiment_id)
        return {"message": "Failed to export model due to an internal error."}

    # Model create was successful!
    # Create an index.json file so this can be read by the system (SDK format)
    output_model_full_id = f"TransformerLab/{output_model_id}"
    model_description = {
        "model_id": output_model_full_id,
        "model_filename": output_filename,
        "name": output_model_name,
        "local_model": True,
        "json_data": {
            "uniqueID": output_model_full_id,
            "name": output_model_name,
            "model_filename": output_filename,
            "description": f"{output_model_architecture} model generated by Transformer Lab based on {input_model_id}",
            "source": "transformerlab",
            "architecture": output_model_architecture,
            "huggingface_repo": "",
            "params": plugin_params,
        },
    }
    model_description_file_path = storage.join(output_path, "index.json")
    with storage.open(model_description_file_path, "w") as model_description_file:
        json.dump(model_description, model_description_file)

    return {"status": "success", "job_id": job_id}
