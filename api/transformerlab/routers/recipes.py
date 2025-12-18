from fastapi import APIRouter, BackgroundTasks
from lab import Dataset
from transformerlab.shared import galleries
import transformerlab.services.job_service as job_service
from transformerlab.services.tasks_service import tasks_service
from transformerlab.models import model_helper
import json
from transformerlab.routers.experiment import workflows
from transformerlab.services.job_service import job_update_status
import transformerlab.services.experiment_service as experiment_service

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("/list")
async def list_recipes():
    """List all recipes for a given experiment name."""
    recipes_gallery = await galleries.get_exp_recipe_gallery()
    return recipes_gallery


@router.get("/{id}")
async def get_recipe_by_id(id: str):
    """Fetch a recipe by its ID from the experiment recipe gallery."""
    recipes_gallery = await galleries.get_exp_recipe_gallery()
    for recipe in recipes_gallery:
        if recipe.get("id") == id:
            return recipe
    return {"error": f"Recipe with id {id} not found."}


@router.get("/{id}/check_dependencies")
async def check_recipe_dependencies(id: str):
    """Check if the dependencies for a recipe are installed for a given environment."""
    # Get the recipe
    recipes_gallery = await galleries.get_exp_recipe_gallery()
    recipe = next((r for r in recipes_gallery if r.get("id") == id), None)
    if not recipe:
        return {"error": f"Recipe with id {id} not found."}

    if len(recipe.get("dependencies", [])) == 0:
        return {"dependencies": []}

    # Get local models and datasets
    local_models = await model_helper.list_installed_models()
    local_model_names = set(model["model_id"] for model in local_models)
    local_datasets = Dataset.list_all()
    local_dataset_ids = set(ds["dataset_id"] for ds in local_datasets)

    # Get installed plugins using the same logic as /plugins/gallery
    from transformerlab.routers import plugins as plugins_router

    plugin_gallery = await plugins_router.plugin_gallery()
    installed_plugins = set(p["uniqueId"] for p in plugin_gallery if p.get("installed"))

    results = []
    for dep in recipe.get("dependencies", []):
        dep_type = dep.get("type")
        dep_name = dep.get("name")
        if dep_type == "workflow":
            # Skip workflow installation in this background job
            continue
        status = {"type": dep_type, "name": dep_name, "installed": False}
        if dep_type == "model":
            status["installed"] = dep_name in local_model_names
        elif dep_type == "dataset":
            # Check if dataset is installed
            status["installed"] = dep_name in local_dataset_ids
        elif dep_type == "plugin":
            status["installed"] = dep_name in installed_plugins
        results.append(status)
    return {"dependencies": results}


async def _install_recipe_dependencies_job(job_id, id):
    from transformerlab.routers import data as data_router
    from transformerlab.routers import plugins as plugins_router

    try:
        job = job_service.job_get(job_id)
        experiment_id = job["experiment_id"]
        await job_update_status(job_id, "RUNNING", experiment_id=experiment_id)
        recipes_gallery = await galleries.get_exp_recipe_gallery()
        recipe = next((r for r in recipes_gallery if r.get("id") == id), None)
        if not recipe:
            await job_update_status(
                job_id, "FAILED", experiment_id=experiment_id, error_msg=f"Recipe with id {id} not found."
            )
            return

        # Filter out model dependencies since they're handled separately
        non_model_deps = [dep for dep in recipe.get("dependencies", []) if dep.get("type") != "model"]

        if len(non_model_deps) == 0:
            await job_update_status(job_id, "COMPLETE", experiment_id=experiment_id)
            return

        local_datasets = Dataset.list_all()
        local_dataset_ids = set(ds["dataset_id"] for ds in local_datasets)
        total = len(non_model_deps)
        progress = 0
        results = []

        for dep in non_model_deps:
            dep_type = dep.get("type")
            dep_name = dep.get("name")
            if dep_type == "workflow":
                # Skip workflow installation in this background job
                continue
            result = {"type": dep_type, "name": dep_name, "action": None, "status": None}
            try:
                if dep_type == "dataset":
                    if dep_name not in local_dataset_ids:
                        download_result = await data_router.dataset_download(dataset_id=dep_name)
                        result["action"] = "download_dataset"
                        result["status"] = download_result.get("status", "unknown")
                    else:
                        result["action"] = "already_installed"
                        result["status"] = "success"
                elif dep_type == "plugin":
                    install_result = await plugins_router.install_plugin(plugin_id=dep_name)
                    result["action"] = "install_plugin"
                    result["status"] = install_result.get("status", "unknown")
            except Exception as e:
                result["action"] = "error"
                result["status"] = str(e)
            results.append(result)
            progress += 1
            job_service.job_update_progress(job_id, int(progress * 100 / total), experiment_id)
            job_service.job_update_job_data_insert_key_value(job_id, "results", results, experiment_id)
        await job_update_status(job_id, "COMPLETE", experiment_id=experiment_id)
    except Exception as e:
        await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=str(e))


@router.get("/{id}/install_model_dependencies")
async def install_recipe_model_dependencies(id: str):
    """Install model dependencies for a recipe as separate jobs and return job IDs."""
    from transformerlab.routers import model as model_router
    import asyncio

    # Get the recipe
    recipes_gallery = await galleries.get_exp_recipe_gallery()
    recipe = next((r for r in recipes_gallery if r.get("id") == id), None)
    if not recipe:
        return {"error": f"Recipe with id {id} not found."}

    # Get local models to check what's already installed
    local_models = await model_helper.list_installed_models()
    local_model_names = set(model["model_id"] for model in local_models)

    model_jobs = []
    for dep in recipe.get("dependencies", []):
        if dep.get("type") == "model":
            dep_name = dep.get("name")
            if dep_name not in local_model_names:
                # Create a DOWNLOAD_MODEL job for this model
                job_id = job_service.job_create(
                    type="DOWNLOAD_MODEL",
                    status="QUEUED",
                    job_data=json.dumps({"model_id": dep_name}),
                    experiment_id="",
                )
                # Start the download as a background task without waiting
                asyncio.create_task(model_router.download_model_by_huggingface_id(model=dep_name, job_id=job_id))
                model_jobs.append(
                    {
                        "model_name": dep_name,
                        "job_id": job_id,
                        "status": "started",
                        "action": "download_model",
                    }
                )
            else:
                model_jobs.append(
                    {
                        "model_name": dep_name,
                        "job_id": None,
                        "status": "already_installed",
                        "action": "already_installed",
                    }
                )

    return {"model_jobs": model_jobs}


@router.get("/{id}/install_dependencies")
async def install_recipe_dependencies(id: str, background_tasks: BackgroundTasks):
    """Install all dependencies for a recipe - models as separate jobs and others as a background job."""

    # Install model dependencies as separate jobs
    model_result = await install_recipe_model_dependencies(id)
    if "error" in model_result:
        return model_result

    # Install other dependencies as a background job
    job_id = job_service.job_create(
        type="INSTALL_RECIPE_DEPS",
        status="QUEUED",
        job_data=json.dumps({"recipe_id": id, "results": [], "progress": 0}),
        experiment_id=None,
    )
    # Start background task
    background_tasks.add_task(_install_recipe_dependencies_job, job_id, id)

    # Format response with unified jobs structure
    jobs = []

    # Add model jobs
    for model_job in model_result["model_jobs"]:
        if model_job["job_id"] is not None:
            jobs.append(
                {
                    "job_id": model_job["job_id"],
                    "type": "DOWNLOAD_MODEL",
                    "name": model_job["model_name"],
                }
            )

    # Add other dependencies job
    jobs.append(
        {
            "job_id": job_id,
            "type": "INSTALL_RECIPE_DEPS",
            "name": f"Recipe dependencies for {id}",
        }
    )

    return {"jobs": jobs, "status": "started"}


@router.get("/jobs/{job_id}/status")
async def get_install_job_status(job_id: int):
    """Get the status and progress of a dependency installation job."""
    job = job_service.job_get(job_id)
    if not job:
        return {"error": f"Job {job_id} not found."}
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "results": job["job_data"].get("results", []),
        "error_msg": job["job_data"].get("error_msg"),
    }


@router.post("/{id}/create_experiment")
async def create_experiment_for_recipe(id: str, experiment_name: str):
    """Create a new experiment with the given name and blank config, and install workflow dependencies."""
    from transformerlab.routers.experiment import experiment as experiment_router

    # Check if experiment already exists
    existing = experiment_service.experiment_get(experiment_name)
    if existing:
        return {"status": "error", "message": f"Experiment '{experiment_name}' already exists.", "data": {}}
    # Create experiment with blank config
    experiment_id = experiment_service.experiment_create(name=experiment_name, config={})

    # Get the recipe
    recipes_gallery = await galleries.get_exp_recipe_gallery()
    recipe = next((r for r in recipes_gallery if r.get("id") == id), None)
    if not recipe:
        return {"status": "error", "message": f"Recipe with id {id} not found.", "data": {}}

    # Populate Notes file if recipe contains notes
    notes_result = None
    if recipe.get("notes"):
        try:
            # Use the experiment router's save_file_contents function to create the Notes file
            notes_result = experiment_router.experiment_save_file_contents(
                id=experiment_id, filename="readme.md", file_contents=recipe.get("notes")
            )
        except Exception:
            notes_result = {"error": "Failed to create Notes file."}

    # Set foundation model if present in dependencies
    model_set_result = None
    local_models = await model_helper.list_installed_models()
    local_model_dict = {m["model_id"]: m for m in local_models}
    for dep in recipe.get("dependencies", []):
        if dep.get("type") == "model":
            model_id = dep.get("name")
            model = local_model_dict.get(model_id)
            # Check if the model is installed
            if not model:
                model_set_result = {"error": f"Model '{model_id}' not found in local models."}
                break
            model_name = model.get("model_id", "")
            model_filename = ""
            if model.get("stored_in_filesystem"):
                model_filename = model.get("local_path", "")
            elif model.get("json_data", {}).get("model_filename"):
                model_filename = model["json_data"]["model_filename"]
            architecture = model.get("json_data", {}).get("architecture", "")

            # Update experiment config fields using the experiment update_config route
            experiment_service.experiment_update_config(experiment_id, "foundation", model_name)
            experiment_service.experiment_update_config(experiment_id, "foundation_model_architecture", architecture)
            experiment_service.experiment_update_config(experiment_id, "foundation_filename", model_filename)
            model_set_result = {
                "foundation": model_name,
                "foundation_model_architecture": architecture,
                "foundation_filename": model_filename,
            }
            break  # Only set the first model dependency

    # Process documents - download ZIP files
    document_results = []
    for doc in recipe.get("documents", []):
        url = doc.get("url")

        result = {"url": url, "action": "download_documents"}
        try:
            from transformerlab.routers.experiment import documents as documents_router

            # Download and extract the ZIP file
            download_result = await documents_router.document_download_zip(
                experimentId=experiment_id, data={"url": url}
            )

            result["status"] = download_result.get("status", "unknown")
            result["extracted_files"] = download_result.get("extracted_files", [])
            result["total_files"] = download_result.get("total_files", 0)
            result["extraction_path"] = download_result.get("extraction_path", "")

        except Exception:
            result["status"] = "error: failed to download documents"

        document_results.append(result)

    # Process tasks and create tasks in database
    task_results = []
    tasks = recipe.get("tasks", [])

    # Extract dataset from dependencies (assuming only one dataset)
    dataset_name = ""
    dataset_deps = [dep for dep in recipe.get("dependencies", []) if dep.get("type") == "dataset"]
    if dataset_deps:
        dataset_name = dataset_deps[0].get("name", "")

    for i, task in enumerate(tasks):
        task_type = task.get("task_type")
        if task_type in ["TRAIN", "EVAL", "GENERATE", "EXPORT"]:
            try:
                # Parse the config_json to extract template metadata
                config_json = task.get("config_json", "{}")
                parsed_config = json.loads(config_json)

                # Convert any lists or dicts in the config to JSON strings
                for key, value in parsed_config.items():
                    if key != "script_parameters" and isinstance(value, (list, dict)):
                        parsed_config[key] = json.dumps(value)

                # Convert list/dict values inside script_parameters to strings
                if "script_parameters" in parsed_config and isinstance(parsed_config["script_parameters"], dict):
                    for param_key, param_value in parsed_config["script_parameters"].items():
                        if isinstance(param_value, (list, dict)):
                            parsed_config["script_parameters"][param_key] = json.dumps(param_value)

                # For EXPORT tasks, ensure params is a JSON
                if task_type == "EXPORT" and "params" in parsed_config:
                    if isinstance(parsed_config["params"], str):
                        try:
                            parsed_config["params"] = json.loads(parsed_config["params"])
                        except json.JSONDecodeError:
                            print(f"Invalid JSON for params in EXPORT task: {parsed_config['params']}")

                # Extract task name from recipe
                task_name = task.get("name")

                # Check if the task has exported inputs_json (from export_experiment)
                if "inputs_json" in task:
                    # Use the exported inputs directly
                    inputs_json = task.get("inputs_json", "{}")
                    if isinstance(inputs_json, str):
                        inputs = json.loads(inputs_json)
                    else:
                        inputs = inputs_json
                else:
                    # Create inputs JSON from config (for manually created recipes)
                    inputs = {
                        "model_name": parsed_config.get("model_name", ""),
                        "model_architecture": parsed_config.get("model_architecture", ""),
                        "dataset_name": dataset_name,  # From dependencies
                    }

                    # For EVAL tasks, add evaluation specific inputs
                    if task_type == "EVAL":
                        inputs.update(
                            {
                                "tasks": parsed_config.get("tasks", ""),
                                "limit": parsed_config.get("limit", ""),
                                "run_name": parsed_config.get("run_name", ""),
                            }
                        )
                    # For GENERATE tasks, add generation specific inputs
                    elif task_type == "GENERATE":
                        inputs.update(
                            {
                                "num_goldens": parsed_config.get("num_goldens", ""),
                                "scenario": parsed_config.get("scenario", ""),
                                "task": parsed_config.get("task", ""),
                                "run_name": parsed_config.get("run_name", ""),
                            }
                        )
                    # For EXPORT tasks, add export specific inputs
                    elif task_type == "EXPORT":
                        inputs.update(
                            {
                                "input_model_id": parsed_config.get("input_model_id", ""),
                                "input_model_path": parsed_config.get("input_model_path", ""),
                                "input_model_architecture": parsed_config.get("input_model_architecture", ""),
                                "output_model_id": parsed_config.get("output_model_id", ""),
                                "output_model_architecture": parsed_config.get("output_model_architecture", ""),
                                "output_model_name": parsed_config.get("output_model_name", ""),
                                "output_model_path": parsed_config.get("output_model_path", ""),
                                "output_filename": parsed_config.get("output_filename", ""),
                                "script_directory": parsed_config.get("script_directory", ""),
                                "params": json.loads(parsed_config.get("params", {})),
                            }
                        )

                # Create outputs JSON (what the task produces)
                outputs = {}

                # TODO: Check if this is relevant and needed and if not, remove it.
                if task_type == "EVAL":
                    outputs["eval_results"] = "{}"
                elif task_type == "GENERATE":
                    outputs["generated_outputs"] = "[]"
                elif task_type == "EXPORT":
                    outputs["exported_model_path"] = parsed_config.get("output_model_path", "")
                    outputs["exported_model_id"] = parsed_config.get("output_model_id", "")

                # Get plugin name
                plugin_name = parsed_config.get("plugin_name", "")

                # Create task in filesystem
                tasks_service.add_task(
                    name=task_name,
                    task_type=task_type,
                    inputs=inputs,
                    config=parsed_config,
                    plugin=plugin_name,
                    outputs=outputs,
                    experiment_id=experiment_id,
                )

                task_results.append(
                    {
                        "task_index": i + 1,
                        "task_name": task_name,
                        "action": "create_task",
                        "status": "success",
                        "task_type": task_type,
                        "dataset_used": dataset_name,
                        "plugin": plugin_name,
                    }
                )

            except Exception:
                task_results.append(
                    {
                        "task_index": i + 1,
                        "action": "create_task",
                        "status": f"error: Failed to create {task_type.lower()} task.",
                    }
                )

    # Process workflows and create workflows in database
    workflow_creation_results = []
    recipe_workflows = recipe.get("workflows", [])

    for workflow_def in recipe_workflows:
        try:
            workflow_name = workflow_def.get("name", "")
            workflow_config = workflow_def.get("config", {"nodes": []})

            # Create workflow in database using the workflow_create function
            workflow_id = await workflows.workflow_create_func(
                name=workflow_name, config=json.dumps(workflow_config), experimentId=experiment_id
            )

            # Log the workflow creation results
            workflow_creation_results.append(
                {
                    "workflow_name": workflow_name,
                    "action": "create_workflow",
                    "status": "success",
                    "workflow_id": workflow_id,
                }
            )

        except Exception:
            workflow_creation_results.append(
                {
                    "workflow_name": workflow_def.get("name", "Unknown"),
                    "action": "create_workflow",
                    "status": "error: Failed to create workflow.",
                }
            )

    return {
        "status": "success",
        "message": "",
        "data": {
            "experiment_id": experiment_id,
            "name": experiment_name,
            "model_set_result": model_set_result,
            "document_results": document_results,
            "task_results": task_results,
            "workflow_creation_results": workflow_creation_results,
            "notes_result": notes_result,
        },
    }
