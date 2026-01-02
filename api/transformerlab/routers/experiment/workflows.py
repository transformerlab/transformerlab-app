from fastapi import APIRouter, UploadFile, Body
from fastapi.responses import FileResponse
from transformerlab.services.tasks_service import tasks_service
import transformerlab.services.job_service as job_service
from transformerlab.db.workflows import (
    workflow_count_queued,
    workflow_count_running,
    workflow_delete_by_id,
    workflow_queue,
    workflow_update_name,
    workflow_run_get_by_id,
    workflow_run_get_queued,
    workflow_run_get_running,
    workflow_run_update_status,
    workflow_run_update_with_new_job,
    workflow_runs_get_from_experiment,
    workflow_update_config,
    workflows_get_by_id,
    workflows_get_from_experiment,
    workflow_create,
)
import transformerlab.routers.tasks as tsks
import json
import yaml
import uuid

from transformerlab.shared.shared import slugify

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("/list", summary="get all workflows in the experiment")
async def workflows_get_in_experiment(experimentId: str):
    workflows = await workflows_get_from_experiment(experimentId)
    return workflows


async def workflows_get_by_trigger_type(experimentId: str, trigger_type: str):
    """Internal endpoint to get workflows that should be triggered by a specific trigger type"""
    workflows = await workflows_get_from_experiment(experimentId)
    triggered_workflows = []

    for workflow in workflows:
        config = workflow.get("config")

        if config is not None:
            if not isinstance(config, dict):
                try:
                    config = json.loads(config)
                except (json.JSONDecodeError, TypeError):
                    continue

            # Check if workflow has triggers and if trigger_type is in the triggers
            triggers = config.get("triggers", [])

            if trigger_type in triggers:
                triggered_workflows.append(workflow["id"])

    return triggered_workflows


@router.get("/runs", summary="get all workflow runs in the experiment")
async def workflow_runs_get_in_experiment(experimentId: str):
    workflow_runs = await workflow_runs_get_from_experiment(experimentId)
    return workflow_runs


@router.get("/delete/{workflow_id}", summary="delete a workflow")
async def workflow_delete(workflow_id: str, experimentId: str):
    # Delete workflow with experiment enforcement at database level
    success = await workflow_delete_by_id(workflow_id, experimentId)
    if not success:
        return {"error": "Workflow not found or does not belong to this experiment"}
    return {"message": "OK"}


@router.get("/create", summary="Create a workflow from config")
async def workflow_create_func(name: str, config: str = '{"nodes":[]}', experimentId: str = "alpha"):
    config = json.loads(config)

    # Check if a START node already exists
    has_start_node = any(node.get("type") == "START" for node in config["nodes"])

    if len(config["nodes"]) > 0 and not has_start_node:
        config["nodes"] = [
            {"type": "START", "id": str(uuid.uuid4()), "name": "START", "out": [config["nodes"][0]["id"]]}
        ] + config["nodes"]
    elif len(config["nodes"]) == 0:
        config["nodes"] = [{"type": "START", "id": str(uuid.uuid4()), "name": "START", "out": []}]

    workflow_id = await workflow_create(name, json.dumps(config), experimentId)
    return workflow_id


@router.get("/create_empty", summary="Create an empty workflow")
async def workflow_create_empty(name: str, experimentId: str = "alpha"):
    name = slugify(name)
    # Check if workflow name already exists in this experiment
    existing_workflows = await workflows_get_from_experiment(experimentId)
    for workflow in existing_workflows:
        if workflow.get("name") == name:
            return {"error": f"Workflow with name '{name}' already exists in this experiment"}

    config = {"nodes": [{"type": "START", "id": str(uuid.uuid4()), "name": "START", "out": []}]}
    workflow_id = await workflow_create(name, json.dumps(config), experimentId)
    return workflow_id


@router.get("/{workflow_id}/{node_id}/edit_node_metadata", summary="Edit metadata of a node in a workflow")
async def workflow_edit_node_metadata(workflow_id: str, node_id: str, metadata: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}
    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]
    for node in config["nodes"]:
        if node["id"] == node_id:
            if not isinstance(metadata, dict):
                node["metadata"] = json.loads(metadata)
            else:
                node["metadata"] = metadata

    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.get("/{workflow_id}/update_name", summary="Update the name of a workflow")
async def workflow_update_name_func(workflow_id: str, new_name: str, experimentId: str):
    new_name = slugify(new_name)
    # Update workflow name with experiment enforcement at database level
    # Check if workflow name already exists in this experiment
    existing_workflows = await workflows_get_from_experiment(experimentId)
    for workflow in existing_workflows:
        if workflow.get("name") == new_name:
            return {"error": f"Workflow with name '{new_name}' already exists in this experiment"}

    success = await workflow_update_name(workflow_id, new_name, experimentId)
    if not success:
        return {"error": "Workflow not found or does not belong to this experiment"}
    return {"message": "OK"}


@router.put("/{workflow_id}/config", summary="Update the config of a workflow")
async def workflow_update_config_func(workflow_id: str, experimentId: str, config: dict = Body()):
    """
    Update the config of a workflow directly.
    Accepts the config as a JSON object in the request body.
    """
    # Verify workflow exists and belongs to experiment
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    # Update workflow config with experiment enforcement at database level
    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow config"}
    return {"message": "OK"}


@router.get("/{workflow_id}/add_node", summary="Add a node to a workflow")
async def workflow_add_node(workflow_id: str, node: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    if not isinstance(node, dict):
        node = json.loads(node)

    new_node_json = node
    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]

    new_node_json["id"] = str(uuid.uuid4())
    new_node_json["out"] = []
    new_node_json["metadata"] = {}

    for node in config["nodes"]:
        if node["out"] == []:
            node["out"].append(new_node_json["id"])

    config["nodes"].append(new_node_json)

    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.post("/{workflow_id}/{node_id}/update_node", summary="Update a specific node in a workflow")
async def workflow_update_node(workflow_id: str, node_id: str, experimentId: str, new_node: dict = Body()):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]
    newNodes = []

    for node in config["nodes"]:
        if node["id"] == node_id:
            newNodes.append(new_node)
        else:
            newNodes.append(node)

    config["nodes"] = newNodes
    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.post("/{workflow_id}/{start_node_id}/remove_edge", summary="Remove an edge between two nodes in a workflow")
async def workflow_remove_edge(workflow_id: str, start_node_id: str, end_node_id: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]
    newNodes = []

    for node in config["nodes"]:
        if node["id"] == start_node_id:
            if end_node_id in node["out"]:
                node["out"].remove(end_node_id)
            newNodes.append(node)
        else:
            newNodes.append(node)

    config["nodes"] = newNodes
    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.post("/{workflow_id}/{start_node_id}/add_edge", summary="Add an edge between two nodes in a workflow")
async def workflow_add_edge(workflow_id: str, start_node_id: str, end_node_id: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]
    newNodes = []

    for node in config["nodes"]:
        if node["id"] == start_node_id:
            node["out"].append(end_node_id)
            newNodes.append(node)
        else:
            newNodes.append(node)

    config["nodes"] = newNodes
    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.get("/{workflow_id}/{node_id}/delete_node", summary="Delete a node from a workflow")
async def workflow_delete_node(workflow_id: str, node_id: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    config = workflow["config"]
    newNodes = []
    removedNode = {}
    for node in config["nodes"]:
        if node["id"] != node_id:
            newNodes.append(node)
        else:
            removedNode = node

    if removedNode["type"] == "START":
        return {"message": "Cannot delete start node"}
    for node in newNodes:
        if node_id in node["out"]:
            node["out"].remove(node_id)
            node["out"] += removedNode["out"]

    config["nodes"] = newNodes
    success = await workflow_update_config(workflow_id, json.dumps(config), experimentId)
    if not success:
        return {"error": "Failed to update workflow"}
    return {"message": "OK"}


@router.get("/{workflow_id}/export_to_yaml", summary="Export a workflow definition to YAML")
async def workflow_export_to_yaml(workflow_id: str, experimentId: str):
    # Get workflow with experiment enforcement at database level
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    for field in (
        "current_job_id",
        "current_task",
        "experiment_id",
        "created_at",
        "updated_at",
        "status",
        "id",
    ):
        workflow.pop(field, None)

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])

    filename = f"{workflow['name']}.yaml"
    with open(filename, "w") as yaml_file:
        yaml.dump(workflow, yaml_file)
    return FileResponse(filename, filename=filename)


@router.post("/import_from_yaml", summary="Import a workflow definition from YAML")
async def workflow_import_from_yaml(file: UploadFile, experimentId: str = "alpha"):
    with open(file.filename, "r") as fileStream:
        workflow = yaml.load(fileStream, Loader=yaml.BaseLoader)
    await workflow_create(workflow["name"], json.dumps(workflow["config"]), experimentId)
    return {"message": "OK"}


@router.get("/{workflow_id}/start", summary="Queue a workflow to start execution")
async def start_workflow(workflow_id: str, experimentId: str):
    # Verify workflow exists and belongs to experiment
    workflow = await workflows_get_by_id(workflow_id, experimentId)
    if not workflow:
        return {"error": "Workflow not found or does not belong to this experiment"}

    await workflow_queue(workflow_id)
    return {"message": "OK"}


async def start_next_step_in_workflow():
    # 1. Find the active workflow run (Running or next Queued)
    active_run = await get_active_workflow_run()
    if not active_run:
        return {"message": "No workflow is running or queued."}

    # 2. Load context for the active run
    workflow_run_id, workflow_id, workflow_config, current_tasks, current_job_ids = await load_workflow_context(
        active_run
    )

    # 3. Check status of jobs from the *previous* step (if any)
    job_status_message = await check_current_jobs_status(workflow_run_id, current_job_ids)
    if job_status_message:
        return {"message": job_status_message}

    # --- Jobs from previous step are complete, determine next step ---

    # 4. Determine the next task(s) based on completed ones
    next_task_ids = await determine_next_tasks(current_tasks, workflow_config, workflow_run_id)

    if next_task_ids is None:
        return {"message": "Failed to determine next task due to an error."}

    if not next_task_ids:
        # Workflow is complete
        await workflow_run_update_status(workflow_run_id, "COMPLETE")
        await workflow_run_update_with_new_job(workflow_run_id, "[]", "[]")  # Clear current tasks/jobs
        return {"message": "Workflow Complete!"}

    # 5. Handle START node and get the actual next nodes
    actual_next_task_ids, next_nodes = await handle_start_node_skip(next_task_ids, workflow_config, workflow_run_id)

    if actual_next_task_ids is None:  # Indicates an error occurred in _handle_start_node_skip
        return {"message": "Failed processing potential START node."}

    if not actual_next_task_ids:  # Can happen if START node had no output
        await workflow_run_update_status(workflow_run_id, "COMPLETE")
        await workflow_run_update_with_new_job(workflow_run_id, "[]", "[]")
        return {"message": "Workflow Complete (ended after START node)!"}

    # 6. Queue jobs for the next node(s)
    next_job_ids = []
    for node in next_nodes:
        # Pass necessary context to the queuing function
        new_job_info = await queue_job_for_node(node, active_run, workflow_config)
        if new_job_info and "id" in new_job_info:
            next_job_ids.append(new_job_info["id"])
        else:
            return {"message": f"Failed to queue job for task '{node.get('task', 'UNKNOWN')}'."}

    # 7. Update workflow run state with new current tasks and job IDs
    await workflow_run_update_with_new_job(workflow_run_id, json.dumps(actual_next_task_ids), json.dumps(next_job_ids))

    return {"message": f"Started next step with job(s): {next_job_ids}"}


@router.get("/runs/{workflow_run_id}", summary="get a specific workflow run by id")
async def workflow_runs_get_by_id(workflow_run_id: str, experimentId: str):
    workflow_run = await workflow_run_get_by_id(workflow_run_id)
    if not workflow_run:
        return {"error": "Workflow run not found"}

    # Verify workflow belongs to experiment
    workflow = await workflows_get_by_id(workflow_run.get("workflow_id"), experimentId)
    if not workflow:
        return {"error": "Associated workflow not found or does not belong to this experiment"}

    returnInfo = {"run": workflow_run, "workflow": workflow, "jobs": []}

    try:
        if isinstance(workflow_run.get("job_ids", "[]"), str):
            job_ids = json.loads(workflow_run.get("job_ids", "[]"))
        else:
            job_ids = workflow_run.get("job_ids", [])

        for job_id in job_ids:
            job = await job_service.job_get(job_id)
            if not job:
                continue

            job_info = {"jobID": job_id, "status": job.get("status", "UNKNOWN")}

            # Safely get job data
            job_data = job.get("job_data", {})
            if not isinstance(job_data, dict):
                job_data = {}

            # Safely extract fields
            if job_data.get("template_name"):
                job_info["taskName"] = job_data["template_name"]
            if job_data.get("start_time"):
                job_info["jobStartTime"] = job_data["start_time"]
            if job_data.get("end_time"):
                job_info["jobEndTime"] = job_data["end_time"]

            returnInfo["jobs"].append(job_info)

    except json.JSONDecodeError:
        # If job_ids JSON is invalid, return empty jobs list
        pass

    return returnInfo


@router.get("/{workflow_run_id}/cancel", summary="Cancel a running workflow")
async def cancel_workflow_run(workflow_run_id: str, experimentId: str):
    """
    Cancel a running workflow by stopping all its current jobs.
    The workflow execution engine will automatically detect the stopped jobs
    and transition the workflow to CANCELLED status.
    """
    # Get the workflow run
    workflow_run = await workflow_run_get_by_id(workflow_run_id)
    if not workflow_run:
        return {"error": "Workflow run not found"}

    # Verify workflow belongs to experiment
    workflow = await workflows_get_by_id(workflow_run.get("workflow_id"), experimentId)
    if not workflow:
        return {"error": "Associated workflow not found or does not belong to this experiment"}

    # Check if workflow can be cancelled
    current_status = workflow_run.get("status")
    if current_status not in ["RUNNING", "QUEUED"]:
        return {"error": f"Cannot cancel workflow in {current_status} status"}

    # Cancel all current jobs - this will trigger automatic workflow cancellation
    if isinstance(workflow_run.get("current_job_ids", "[]"), str):
        current_job_ids = json.loads(workflow_run.get("current_job_ids", "[]"))
    else:
        current_job_ids = workflow_run.get("current_job_ids", [])
    cancelled_jobs = []

    for job_id in current_job_ids:
        await job_service.job_stop(job_id, experimentId)  # This sets stop=True in job_data
        cancelled_jobs.append(job_id)

    # The workflow execution engine will automatically detect the stopped jobs
    # and update the workflow status to CANCELLED within the next execution cycle

    return {
        "message": f"Workflow run {workflow_run_id} cancellation initiated",
        "cancelled_jobs": cancelled_jobs,
        "note": "Workflow status will be updated to CANCELLED automatically",
    }


# Helper functions moved from old workflows.py
async def get_active_workflow_run():
    num_running_workflows = await workflow_count_running()
    num_queued_workflows = await workflow_count_queued()

    if num_running_workflows + num_queued_workflows == 0:
        return None  # No workflows to process

    active_run = await workflow_run_get_running()
    # if we have no currenlty active workflow run, then run a queued one
    if active_run is None:
        active_run = await workflow_run_get_queued()
        if active_run:
            await workflow_run_update_status(active_run["id"], "RUNNING")

    return active_run


async def load_workflow_context(active_run):
    workflow_run_id = active_run["id"]
    workflow_id = active_run["workflow_id"]
    experiment_id = active_run["experiment_id"]  # Get experiment_id from active_run
    workflow = await workflows_get_by_id(workflow_id, experiment_id)
    if not workflow:
        raise ValueError("Workflow not found or does not belong to this experiment")

    if workflow.get("config") is not None and not isinstance(workflow["config"], dict):
        workflow["config"] = json.loads(workflow["config"])
    workflow_config = workflow["config"]

    # List of task IDs (node IDs)
    if isinstance(active_run.get("current_tasks", "[]"), str):
        current_tasks = json.loads(active_run.get("current_tasks", "[]"))
    else:
        current_tasks = active_run.get("current_tasks", [])

    # List of job IDs
    if isinstance(active_run.get("current_job_ids", "[]"), str):
        current_job_ids = json.loads(active_run.get("current_job_ids", "[]"))
    else:
        current_job_ids = active_run.get("current_job_ids", [])

    return workflow_run_id, workflow_id, workflow_config, current_tasks, current_job_ids


async def check_current_jobs_status(workflow_run_id, current_job_ids):
    """
    Checks the status of currently running jobs for the workflow step.
    Updates workflow status if a job failed or was cancelled.
    Returns None if all jobs are complete, or a message string if waiting, failed, or cancelled.
    """
    if not current_job_ids:
        return None

    for job_id in current_job_ids:
        current_job = await job_service.job_get(job_id)
        if not current_job:
            await workflow_run_update_status(workflow_run_id, "FAILED")
            return f"Could not find job with ID {job_id}"

        status = current_job.get("status")

        if status == "FAILED":
            await workflow_run_update_status(workflow_run_id, "FAILED")
            return "The current job failed"

        if status in ["CANCELLED", "DELETED", "STOPPED"]:
            await workflow_run_update_with_new_job(workflow_run_id, "[]", "[]")
            await workflow_run_update_status(workflow_run_id, "CANCELLED")
            return "The current job was cancelled/stopped/deleted"

        if status != "COMPLETE":
            return "The current job is running"

    return None


def find_nodes_by_ids(node_ids, all_nodes):
    """Finds node configuration dictionaries based on a list of node IDs."""
    return [node for node in all_nodes if node.get("id") in node_ids]


async def determine_next_tasks(current_tasks, workflow_config, workflow_run_id):
    """
    Determines the IDs of the next tasks based on the current tasks and workflow config.
    Returns a list of next task IDs, an empty list if workflow is complete, or None on error.
    """
    all_nodes = workflow_config.get("nodes", [])
    next_task_ids = []

    if current_tasks:
        current_nodes = find_nodes_by_ids(current_tasks, all_nodes)
        if not current_nodes:
            await workflow_run_update_status(workflow_run_id, "FAILED")
            return None

        for node in current_nodes:
            next_task_ids += node["out"]

    else:
        if all_nodes:
            next_task_ids = [all_nodes[0]["id"]]

    return next_task_ids


async def handle_start_node_skip(next_task_ids, workflow_config, workflow_run_id):
    """
    Checks if the next task is a START node. If so, finds the subsequent tasks.
    Returns the actual next task IDs and their corresponding node dicts.
    Returns (None, None) on error.
    """
    all_nodes = workflow_config.get("nodes", [])
    next_nodes = find_nodes_by_ids(next_task_ids, all_nodes)

    if not next_nodes and next_task_ids:
        await workflow_run_update_status(workflow_run_id, "FAILED")
        return None, None

    # Handle potential multiple start nodes or parallel paths from start
    final_next_task_ids = []
    processed_start_nodes = False

    temp_next_nodes = []
    for node in next_nodes:
        if node.get("type") == "START":
            processed_start_nodes = True
            final_next_task_ids.extend(node.get("out", []))
        else:
            temp_next_nodes.append(node)
            final_next_task_ids.append(node["id"])

    if processed_start_nodes:
        if not final_next_task_ids:
            return [], []

        next_nodes = find_nodes_by_ids(final_next_task_ids, all_nodes)
        if not next_nodes:
            await workflow_run_update_status(workflow_run_id, "FAILED")
            return None, None
        return final_next_task_ids, next_nodes
    else:
        return next_task_ids, next_nodes


async def find_task_definition(task_name: str, workflow_run_id: int, experiment_id: int, task_type: str):
    """Finds the task definition from the database by name within the specified experiment and task type."""
    tasks = tasks_service.tasks_get_by_type_in_experiment(task_type, experiment_id)
    for task in tasks:
        if task.get("name") == task_name:
            return task

    # if the task isnt found
    await workflow_run_update_status(workflow_run_id, "FAILED")
    return None


async def find_previous_node_and_job(current_node, workflow_run, workflow_config):
    """Finds the job corresponding to the node that preceded the current_node."""

    all_nodes = workflow_config.get("nodes", [])
    previous_job = None

    # Find nodes that have current_node["id"] in their "out" list
    potential_previous_nodes = [node for node in all_nodes if current_node.get("id") in node.get("out", [])]

    if not potential_previous_nodes:
        return None

    if potential_previous_nodes:
        # Taking the first predecessor found. Needs improvement for multiple inputs.
        previous_node = potential_previous_nodes[0]
        if previous_node.get("type") != "START":
            ran_nodes_str = workflow_run.get("node_ids", "[]")
            ran_jobs_str = workflow_run.get("job_ids", "[]")
            if not isinstance(ran_nodes_str, str):
                ran_nodes_str = json.dumps(ran_nodes_str)
            if not isinstance(ran_jobs_str, str):
                ran_jobs_str = json.dumps(ran_jobs_str)
            ran_nodes = json.loads(ran_nodes_str)
            ran_jobs = json.loads(ran_jobs_str)
            if previous_node["id"] in ran_nodes:
                previous_job_ID = ran_jobs[ran_nodes.index(previous_node["id"])]
                previous_job = await job_service.job_get(previous_job_ID)

    return previous_job


def extract_previous_job_outputs(previous_job):
    """Extracts relevant output information from a completed job."""
    outputs = {}
    if previous_job is None or "job_data" not in previous_job or not previous_job["job_data"]:
        return outputs

    job_data = previous_job["job_data"]  # Assuming job_data is already a dict
    job_type = previous_job.get("type")
    job_config = job_data.get("config", {})  # Handle missing config safely

    try:
        from lab.dirs import get_models_dir

        fuse_pretext = get_models_dir() + "/"
    except Exception:
        fuse_pretext = ""

    if job_type == "GENERATE":
        # Prefer dataset_id from top-level job_data if present
        dataset_id = job_data.get("dataset_id") or job_config.get("dataset_id")
        if dataset_id:
            outputs["dataset_name"] = str(dataset_id).lower().replace(" ", "-")

    elif job_type == "TRAIN":
        model_name = job_config.get("model_name")
        adaptor_name = job_config.get("adaptor_name")
        model_architecture = job_config.get("model_architecture")

        if job_config.get("fuse_model") and model_name and adaptor_name:
            model_base_name = model_name.split("/")[-1]
            outputs["model_name"] = f"{fuse_pretext}{model_base_name}_{adaptor_name}"
        elif model_name:
            outputs["model_name"] = model_name

        if model_architecture:
            outputs["model_architecture"] = model_architecture
        if adaptor_name and not job_config.get("fuse_model"):
            outputs["adaptor_name"] = adaptor_name

    elif job_type == "EXPORT":
        # Extract export outputs from job config
        output_model_id = job_config.get("output_model_id")
        output_model_path = job_config.get("output_model_path")
        output_model_architecture = job_config.get("output_model_architecture")
        output_model_name = job_config.get("output_model_name")

        if output_model_id:
            outputs["exported_model_id"] = output_model_id
        if output_model_path:
            outputs["exported_model_path"] = output_model_path
        if output_model_architecture:
            outputs["exported_model_architecture"] = output_model_architecture
        if output_model_name:
            outputs["exported_model_name"] = output_model_name

    return outputs


def prepare_next_task_io(task_def: dict, previous_outputs: dict):
    """Prepares the JSON input and output strings for the next task."""
    if not isinstance(task_def.get("inputs", "{}"), dict):
        inputs = json.loads(task_def.get("inputs", "{}"))
    else:
        inputs = task_def.get("inputs", {})

    if not isinstance(task_def.get("outputs", "{}"), dict):
        outputs = json.loads(task_def.get("outputs", "{}"))
    else:
        outputs = task_def.get("outputs", {})

    task_type = task_def.get("type")

    # Map previous outputs to next inputs
    if task_type == "EVAL":
        # Map relevant outputs to specific input fields
        for key in ["model_name", "model_architecture", "adaptor_name", "dataset_name"]:
            if key in previous_outputs:
                inputs[key] = previous_outputs[key]

    elif task_type == "TRAIN":
        # Map relevant outputs to specific input fields
        for key in ["model_name", "model_architecture", "dataset_name"]:
            if key in previous_outputs:
                inputs[key] = previous_outputs[key]
        # Generate dynamic output fields
        outputs["adaptor_name"] = str(uuid.uuid4()).replace("-", "")

    elif task_type == "GENERATE":
        # Generate dynamic output fields
        outputs["dataset_id"] = str(uuid.uuid4()).replace("-", "")

    elif task_type == "EXPORT":
        # Map relevant outputs to specific input fields for export tasks
        for key in ["model_name", "model_architecture", "exported_model_id", "exported_model_path"]:
            if key in previous_outputs:
                # Map exported outputs back to input model fields for chaining
                if key == "exported_model_id":
                    inputs["input_model_id"] = previous_outputs[key]
                    inputs["model_name"] = previous_outputs[key]
                elif key == "exported_model_path":
                    inputs["input_model_path"] = previous_outputs[key]
                    inputs["model_path"] = previous_outputs[key]
                elif key == "exported_model_architecture":
                    inputs["input_model_architecture"] = previous_outputs[key]
                    inputs["model_architecture"] = previous_outputs[key]
                else:
                    inputs[key] = previous_outputs[key]

        # Generate dynamic output fields for export tasks
        import time

        timestamp = int(time.time())
        outputs["exported_model_id"] = f"exported_model_{timestamp}"
        outputs["exported_model_path"] = f"/models/exported_model_{timestamp}"

    return json.dumps(inputs), json.dumps(outputs)


async def queue_job_for_node(node: dict, workflow_run: dict, workflow_config: dict):
    """Finds task def, prepares IO, and queues a job for a given workflow node."""
    task_name = node.get("task")
    if not task_name:
        return None

    experiment_id = workflow_run.get("experiment_id")
    if experiment_id is None:
        return None

    # Extract task type from the node for efficient lookup
    task_type = node.get("type")
    task_def = await find_task_definition(task_name, workflow_run["id"], experiment_id, task_type)
    if not task_def:
        return None

    # Find the job that ran *before* this node to get its outputs
    previous_job = await find_previous_node_and_job(node, workflow_run, workflow_config)

    # Extract outputs from the previous job
    previous_outputs = extract_previous_job_outputs(previous_job)

    # Prepare inputs and outputs for the new job
    inputs_json, outputs_json = prepare_next_task_io(task_def, previous_outputs)

    # Queue the task
    try:
        task_id_to_queue = task_def.get("id")
        if task_id_to_queue is None:
            await workflow_run_update_status(workflow_run["id"], "FAILED")
            return None

        queued_job_info = await tsks.queue_task(task_id_to_queue, inputs_json, outputs_json)
        if not queued_job_info or "id" not in queued_job_info:
            return None
        return queued_job_info
    except Exception as e:
        print(f"Error queueing task {task_name}: {e}")
        await workflow_run_update_status(workflow_run["id"], "FAILED")
        return None
