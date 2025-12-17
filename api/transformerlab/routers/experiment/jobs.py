import asyncio
from fnmatch import fnmatch
import json
import os
import csv
from typing import List, Optional
import pandas as pd
from fastapi import APIRouter, Response, Request, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from lab import storage

from transformerlab.shared import shared
from json import JSONDecodeError

from werkzeug.utils import secure_filename

from transformerlab.routers.serverinfo import watch_file

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

import transformerlab.services.job_service as job_service
from transformerlab.services.job_service import job_update_status
from transformerlab.services.provider_service import (
    get_team_provider,
    get_provider_instance,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.compute_providers.models import JobState
from lab import Job
from lab.dirs import get_workspace_dir

router = APIRouter(prefix="/jobs", tags=["train"])


@router.get("/list")
async def jobs_get_all(experimentId: str, type: str = "", status: str = "", subtype: str = ""):
    jobs = job_service.jobs_get_all(type=type, status=status, experiment_id=experimentId)

    # Optional filter by job_data.subtype
    if subtype:
        filtered = []
        for job in jobs:
            job_data = job.get("job_data", {})
            if not isinstance(job_data, dict):
                try:
                    job_data = json.loads(job_data)
                except Exception:
                    job_data = {}
            if job_data.get("subtype") == subtype:
                filtered.append(job)
        return filtered

    return jobs


@router.get("/delete/{job_id}")
async def job_delete(job_id: str, experimentId: str):
    job_service.job_delete(job_id, experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/create")
async def job_create(
    experimentId: str,
    type: str = "UNDEFINED",
    status: str = "CREATED",
    data: str = "{}",
):
    jobid = job_service.job_create(type=type, status=status, job_data=data, experiment_id=experimentId)
    return jobid


async def job_create_task(script: str, job_data: str = "{}", experimentId: str = None):
    jobid = job_service.job_create(type="UNDEFINED", status="CREATED", job_data=job_data, experiment_id=experimentId)
    return jobid


@router.get("/update/{job_id}")
async def job_update(job_id: str, status: str, experimentId: str):
    await job_update_status(job_id, status, experiment_id=experimentId)
    return {"message": "OK"}


async def start_next_job():
    # Count running jobs across all organizations
    num_running_jobs = job_service.job_count_running_across_all_orgs()
    if num_running_jobs > 0:
        return {"message": "A job is already running"}

    # Get next queued job across all organizations
    nextjob, org_id = job_service.jobs_get_next_queued_job_across_all_orgs()

    if nextjob:
        print(f"Starting Next Job in Queue: {nextjob}")
        print(f"Job belongs to organization: {org_id}")
        print("Starting job: " + str(nextjob["id"]))

        # Set organization context before running the job
        # Note: This is safe because:
        # 1. This function runs in a background task with its own async context (isolated from request handlers)
        # 2. Request handlers have their own middleware that sets/clears org context per request
        # 3. The try/finally block ensures cleanup even if run_job() raises an exception
        if org_id:
            from lab.dirs import set_organization_id

            set_organization_id(org_id)
            print(f"Set organization context to: {org_id}")

        try:
            nextjob_data = nextjob["job_data"]
            if not isinstance(nextjob_data, dict):
                job_config = json.loads(nextjob["job_data"])
            else:
                job_config = nextjob_data
            experiment_name = nextjob["experiment_id"]  # Note: experiment_id and experiment_name are the same
            await shared.run_job(
                job_id=nextjob["id"], job_config=job_config, experiment_name=experiment_name, job_details=nextjob
            )
            return nextjob
        finally:
            # Clear organization context after running job
            if org_id:
                from lab.dirs import set_organization_id

                set_organization_id(None)
    else:
        return {"message": "No jobs in queue"}


@router.get("/{job_id}/stop")
async def stop_job(job_id: str, experimentId: str):
    # The way a job is stopped is simply by adding "stop: true" to the job_data
    # This will be checked by the plugin as it runs
    job_service.job_stop(job_id, experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/delete_all")
async def job_delete_all(experimentId: str):
    job_service.job_delete_all(experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/{job_id}")
async def get_training_job(job_id: str):
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    return job


@router.get("/{job_id}/tasks_output")
async def get_tasks_job_output(job_id: str, sweeps: bool = False):
    """
    Get Tasks job output with robust error handling.
    Uses the same logic as stream_job_output but returns content directly.
    """
    try:
        job = job_service.job_get(job_id)
        if job is None:
            return "Job not found"

        job_data = job.get("job_data", {})

        # Handle both dict and JSON string formats
        if not isinstance(job_data, dict):
            try:
                job_data = json.loads(job_data)
            except JSONDecodeError:
                print(f"Error decoding job_data for job {job_id}. Using empty job_data.")
                job_data = {}

        # Handle sweeps case first
        if sweeps:
            output_file = job_data.get("sweep_output_file", None)
            if output_file is not None and storage.exists(output_file):
                output_file_name = output_file
            else:
                # Fall back to regular output file logic
                output_file_name = await shared.get_job_output_file_name(job_id)
        else:
            # Try to get output file name with fallback logic
            output_file_name = await shared.get_job_output_file_name(job_id)

        # Read and return the file content as JSON array of lines
        if storage.exists(output_file_name):
            lines = []
            with storage.open(output_file_name, "r") as f:
                for line in f:
                    lines.append(line.rstrip("\n"))  # Remove trailing newline
            return lines
        else:
            return ["Output file not found"]

    except ValueError as e:
        # If the value error starts with "No output file found for job" then wait 4 seconds and try again
        # because the file might not have been created yet
        if str(e).startswith("No output file found for job"):
            print(f"Output file not found for job {job_id}, retrying in 4 seconds...")
            await asyncio.sleep(4)
            try:
                output_file_name = await shared.get_job_output_file_name(job_id)
                if storage.exists(output_file_name):
                    lines = []
                    with storage.open(output_file_name, "r") as f:
                        for line in f:
                            lines.append(line.rstrip("\n"))  # Remove trailing newline
                    return lines
                else:
                    return ["Output file not found after retry"]
            except Exception as retry_e:
                # If still no file after retry, create an empty one in the jobs directory
                print(f"Still no output file found for job {job_id} after retry, creating empty file: {retry_e}")
                # Use the Job class to get the proper directory and create the file
                job_obj = Job(job_id)
                output_file_name = job_obj.get_log_path()
                # Get directory by removing filename from path using storage.join
                output_dir = storage.join(*output_file_name.split("/")[:-1]) if "/" in output_file_name else "."
                storage.makedirs(output_dir, exist_ok=True)
                with storage.open(output_file_name, "w") as f:
                    f.write("")
                return []
        else:
            print(f"ValueError in get_tasks_job_output: {e}")
            return ["An internal error has occurred!"]
    except Exception as e:
        # Handle general error
        print(f"Error in get_tasks_job_output: {e}")
        return ["An internal error has occurred!"]


@router.get("/{job_id}/provider_logs")
async def get_provider_job_logs(
    experimentId: str,
    job_id: str,
    tail_lines: int = Query(400, ge=100, le=2000),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Fetch the raw job logs directly from the underlying compute provider for a REMOTE job.
    """

    job = job_service.job_get(job_id)
    if not job or str(job.get("experiment_id")) != str(experimentId):
        raise HTTPException(status_code=404, detail="Job not found")

    job_data = job.get("job_data") or {}
    if not isinstance(job_data, dict):
        try:
            job_data = json.loads(job_data)
        except JSONDecodeError:
            job_data = {}

    provider_id = job_data.get("provider_id")
    cluster_name = job_data.get("cluster_name")
    if not provider_id or not cluster_name:
        raise HTTPException(
            status_code=400, detail="Job does not contain provider metadata (provider_id/cluster_name missing)"
        )

    provider = await get_team_provider(session, user_and_team["team_id"], provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = get_provider_instance(provider)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to initialize provider: {exc}") from exc

    # Figure out which provider-side job_id to query logs for
    provider_job_id: Optional[str | int] = job_data.get("provider_job_id")

    provider_job_candidates: List[dict] = []
    if provider_job_id is None:
        provider_job_ids = job_data.get("provider_job_ids")
        if isinstance(provider_job_ids, list) and provider_job_ids:
            provider_job_id = provider_job_ids[-1]

    if provider_job_id is None:
        provider_launch_result = job_data.get("provider_launch_result")
        if isinstance(provider_launch_result, dict):
            provider_job_id = provider_launch_result.get("job_id")

    if provider_job_id is None:
        try:
            provider_jobs = provider_instance.list_jobs(cluster_name)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to enumerate provider jobs: {exc}") from exc

        if provider_jobs:
            running_states = {JobState.RUNNING, JobState.PENDING}
            chosen_job = next((job for job in provider_jobs if job.state in running_states), provider_jobs[-1])
            provider_job_id = chosen_job.job_id
            provider_job_candidates = [
                {
                    "job_id": str(job.job_id),
                    "state": job.state.value if isinstance(job.state, JobState) else str(job.state),
                    "submitted_at": job.submitted_at,
                    "started_at": job.started_at,
                    "finished_at": job.finished_at,
                }
                for job in provider_jobs
            ]

    if provider_job_id is None:
        raise HTTPException(status_code=404, detail="Unable to determine provider job id for this job")

    try:
        raw_logs = provider_instance.get_job_logs(
            cluster_name,
            provider_job_id,
            tail_lines=tail_lines or None,
            follow=False,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Failed to fetch provider logs: {exc}") from exc

    if isinstance(raw_logs, (bytes, bytearray)):
        logs_text = raw_logs.decode("utf-8", errors="replace")
    elif isinstance(raw_logs, str):
        logs_text = raw_logs
    else:
        try:
            logs_text = json.dumps(raw_logs, indent=2)
        except TypeError:
            logs_text = str(raw_logs)

    return {
        "cluster_name": cluster_name,
        "provider_id": provider_id,
        "provider_job_id": str(provider_job_id),
        "provider_name": job_data.get("provider_name"),
        "tail_lines": tail_lines,
        "logs": logs_text,
        "job_candidates": provider_job_candidates,
    }


# Templates


# @router.get("/template/{template_id}")
# async def get_train_template(template_id: str):
#     return await get_training_template(template_id)


# @router.put("/template/update")
# async def update_training_template(
#     template_id: str,
#     name: str,
#     description: str,
#     type: str,
#     config: Annotated[str, Body(embed=True)],
# ):
#     try:
#         configObject = json.loads(config)
#         datasets = configObject["dataset_name"]
#         job_service.update_training_template(template_id, name, description, type, datasets, config)
#     except JSONDecodeError as e:
#         print(f"JSON decode error: {e}")
#         return {"status": "error", "message": "An error occurred while processing the request."}
#     except Exception as e:
#         print(f"Unexpected error: {e}")
#         return {"status": "error", "message": "An internal error has occurred."}
#     return {"status": "success"}


@router.get("/{job_id}/stream_output")
async def stream_job_output(job_id: str, sweeps: bool = False):
    """
    Stream job output with robust error handling and retry logic.
    Enhanced version combining the best of both train and jobs routers.
    """
    try:
        job = job_service.job_get(job_id)

        job_data = job.get("job_data", {})

        # Handle both dict and JSON string formats
        if not isinstance(job_data, dict):
            try:
                job_data = json.loads(job_data)
            except JSONDecodeError:
                print(f"Error decoding job_data for job {job_id}. Using empty job_data.")
                job_data = {}

        # Handle sweeps case first
        if sweeps:
            output_file = job_data.get("sweep_output_file", None)
            if output_file is not None and storage.exists(output_file):
                output_file_name = output_file
            else:
                # Fall back to regular output file logic
                output_file_name = await shared.get_job_output_file_name(job_id)
        else:
            # Try to get output file name with fallback logic
            output_file_name = await shared.get_job_output_file_name(job_id)

    except ValueError as e:
        # If the value error starts with "No output file found for job" then wait 4 seconds and try again
        # because the file might not have been created yet
        if str(e).startswith("No output file found for job"):
            print(f"Output file not found for job {job_id}, retrying in 4 seconds...")
            await asyncio.sleep(4)
            try:
                output_file_name = await shared.get_job_output_file_name(job_id)
            except Exception as retry_e:
                # If still no file after retry, create an empty one in the jobs directory
                print(f"Still no output file found for job {job_id} after retry, creating empty file: {retry_e}")
                # Use the Job class to get the proper directory and create the file
                job_obj = Job(job_id)
                output_file_name = job_obj.get_log_path()
                # Get directory by removing filename from path using storage.join
                output_dir = storage.join(*output_file_name.split("/")[:-1]) if "/" in output_file_name else "."
                storage.makedirs(output_dir, exist_ok=True)
                with storage.open(output_file_name, "w") as f:
                    f.write("")
        else:
            print(f"ValueError in stream_job_output: {e}")
            return StreamingResponse(
                iter(["data: Error: An internal error has occurred!\n\n"]),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
            )
    except Exception as e:
        # Handle general error
        print(f"Error in stream_job_output: {e}")
        return StreamingResponse(
            iter(["data: Error: An internal error has occurred!\n\n"]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
        )

    return StreamingResponse(
        # we force polling because i can't get this to work otherwise -- changes aren't detected
        watch_file(output_file_name, start_from_beginning=True, force_polling=True),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/{job_id}/stream_detailed_json_report")
async def stream_detailed_json_report(job_id: str, file_name: str):
    if not storage.exists(file_name):
        print(f"File not found: {file_name}")
        return "File not found", 404

    return StreamingResponse(
        # we force polling because i can't get this to work otherwise -- changes aren't detected
        watch_file(file_name, start_from_beginning=True, force_polling=False),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
    )


@router.get("/{job_id}/get_additional_details")
async def stream_job_additional_details(job_id: str, task: str = "view"):
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]
    if "additional_output_path" not in job_data:
        return Response("No additional details found for this job", media_type="text/csv")
    file_path = job_data["additional_output_path"]
    if file_path.endswith(".csv"):
        file_format = "text/csv"
        filename = f"report_{job_id}.csv"
    elif file_path.endswith(".json"):
        file_format = "application/json"
        filename = f"report_{job_id}.json"
    if task == "download":
        return FileResponse(file_path, filename=filename, media_type=file_format)

    if not storage.exists(file_path):
        return Response("No additional details found for this evaluation", media_type="text/csv")

    # convert csv to JSON, but do not assume that \n marks the end of a row as cells can
    # contain fields that start and end with " and contain \n. Use a CSV parser instead.
    with storage.open(file_path, "r") as csvfile:
        contents = csv.reader(csvfile, delimiter=",", quotechar='"')
        # convert the csv to a JSON object
        csv_content = {"header": [], "body": []}
        for i, row in enumerate(contents):
            if i == 0:
                csv_content["header"] = row
            else:
                csv_content["body"].append(row)
    return csv_content


@router.get("/{job_id}/get_figure_json")
async def get_figure_path(job_id: str):
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]
    file_path = job_data.get("plot_data_path", None)

    if file_path is None or not storage.exists(file_path):
        return Response("No plot data found for this evaluation", media_type="text/csv")

    with storage.open(file_path, "r") as f:
        content = json.loads(f.read())
    return content


@router.get("/{job_id}/get_generated_dataset")
async def get_generated_dataset(job_id: str):
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    # Get experiment name
    job_data = job["job_data"]

    # Check if the job has additional output path
    if "additional_output_path" in job_data.keys() and job_data["additional_output_path"]:
        json_file_path = job_data["additional_output_path"]
    else:
        return Response("No dataset found for this evaluation", media_type="text/csv")

    if not storage.exists(json_file_path):
        return Response("No dataset found for this evaluation", media_type="text/csv")
    else:
        with storage.open(json_file_path, "r") as f:
            json_content = json.loads(f.read())

        df = pd.DataFrame(json_content)

        content = {"header": df.columns.tolist(), "body": df.values.tolist()}

        return content


@router.get("/{job_id}/get_eval_results")
async def get_eval_results(job_id: str, task: str = "view", file_index: int = 0):
    """Get evaluation results for a job"""
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]

    # Check if the job has eval_results
    if "eval_results" not in job_data or not job_data["eval_results"]:
        return Response("No evaluation results found for this job", media_type="text/csv")

    eval_results_list = job_data["eval_results"]
    if not isinstance(eval_results_list, list) or len(eval_results_list) == 0:
        return Response("No evaluation results found for this job", media_type="text/csv")

    # Get the file path (use file_index to select which file if multiple)
    if file_index >= len(eval_results_list):
        file_index = 0
    file_path = eval_results_list[file_index]

    if not storage.exists(file_path):
        return Response("Evaluation results file not found", media_type="text/csv")

    # Determine file format
    if file_path.endswith(".csv"):
        file_format = "text/csv"
        filename = f"eval_results_{job_id}.csv"
    elif file_path.endswith(".json"):
        file_format = "application/json"
        filename = f"eval_results_{job_id}.json"
    else:
        file_format = "text/plain"
        filename = f"eval_results_{job_id}.txt"

    if task == "download":
        # Use StreamingResponse to support both local and remote files
        def generate():
            with storage.open(file_path, "rb") as f:
                while True:
                    chunk = f.read(8192)  # Read in 8KB chunks
                    if not chunk:
                        break
                    yield chunk

        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
        }
        return StreamingResponse(
            generate(),
            media_type=file_format,
            headers=headers,
        )

    # For view, convert CSV to JSON format
    if file_path.endswith(".csv"):
        with storage.open(file_path, "r") as csvfile:
            contents = csv.reader(csvfile, delimiter=",", quotechar='"')
            csv_content = {"header": [], "body": []}
            for i, row in enumerate(contents):
                if i == 0:
                    csv_content["header"] = row
                else:
                    csv_content["body"].append(row)
            return csv_content
    elif file_path.endswith(".json"):
        with storage.open(file_path, "r") as jsonfile:
            content = json.load(jsonfile)
            # If it's a list of records, convert to header/body format
            if isinstance(content, list) and len(content) > 0:
                if isinstance(content[0], dict):
                    header = list(content[0].keys())
                    body = [list(row.values()) for row in content]
                    return {"header": header, "body": body}
            return content
    else:
        # For other file types, just return as text
        with storage.open(file_path, "r") as f:
            return f.read()


@router.get("/{job_id}/get_eval_images")
async def get_eval_images(job_id: str):
    """Get list of evaluation images for a job"""
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]

    # Check if the job has eval_images_dir
    if "eval_images_dir" not in job_data or not job_data["eval_images_dir"]:
        return {"images": []}

    images_dir = job_data["eval_images_dir"]

    if not storage.exists(images_dir):
        return {"images": []}

    # Supported image extensions
    image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}
    images = []
    try:
        # Use storage.ls to list directory contents
        items = storage.ls(images_dir, detail=True)
        for item in items:
            # Handle both dict (detail=True) and string (detail=False) formats
            if isinstance(item, dict):
                file_path = item.get("name", "")
                filename = file_path.split("/")[-1] if "/" in file_path else file_path
                file_type = item.get("type", "file")
                if file_type == "file":
                    _, ext = os.path.splitext(filename.lower())
                    if ext in image_extensions:
                        images.append(
                            {
                                "filename": filename,
                                "path": f"/jobs/{job_id}/image/{filename}",  # API endpoint path
                                "size": item.get("size", 0),
                                "modified": item.get("mtime", 0) if "mtime" in item else None,
                            }
                        )
            else:
                # Fallback for string format - check if it's a file
                file_path = item if isinstance(item, str) else str(item)
                if storage.isfile(file_path):
                    filename = file_path.split("/")[-1] if "/" in file_path else file_path
                    _, ext = os.path.splitext(filename.lower())
                    if ext in image_extensions:
                        # Try to get file info - for remote storage, stats might not be available
                        try:
                            items_detail = storage.ls(file_path, detail=True)
                            if items_detail and isinstance(items_detail[0], dict):
                                file_info = items_detail[0]
                                images.append(
                                    {
                                        "filename": filename,
                                        "path": f"/jobs/{job_id}/image/{filename}",
                                        "size": file_info.get("size", 0),
                                        "modified": file_info.get("mtime", 0) if "mtime" in file_info else None,
                                    }
                                )
                            else:
                                images.append(
                                    {
                                        "filename": filename,
                                        "path": f"/jobs/{job_id}/image/{filename}",
                                        "size": None,
                                        "modified": None,
                                    }
                                )
                        except Exception:
                            images.append(
                                {
                                    "filename": filename,
                                    "path": f"/jobs/{job_id}/image/{filename}",
                                    "size": None,
                                    "modified": None,
                                }
                            )
    except Exception as e:
        print(f"Error reading images directory {images_dir}: {e}")
        return {"images": []}

    # Sort by filename for consistent ordering
    images.sort(key=lambda x: x["filename"])
    return {"images": images}


@router.get("/{job_id}/image/{filename}")
async def get_eval_image(job_id: str, filename: str):
    """Serve individual evaluation image files"""
    job = job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]

    # Check if the job has eval_images_dir
    if "eval_images_dir" not in job_data or not job_data["eval_images_dir"]:
        return Response("No images directory found for this job", status_code=404)

    images_dir = job_data["eval_images_dir"]

    if not storage.exists(images_dir):
        return Response("Images directory not found", status_code=404)

    # Secure the filename to prevent directory traversal
    filename = secure_filename(filename)
    file_path = storage.join(images_dir, filename)

    # Ensure the file exists
    if not storage.exists(file_path):
        return Response("Image not found", status_code=404)

    # For security, verify the file path is within the images directory
    # Normalize paths for comparison
    images_dir_normalized = images_dir.rstrip("/")
    file_path_normalized = file_path.rstrip("/")
    if (
        not file_path_normalized.startswith(images_dir_normalized + "/")
        and file_path_normalized != images_dir_normalized
    ):
        return Response("Image not found", status_code=404)

    # Determine media type based on file extension
    _, ext = os.path.splitext(filename.lower())
    media_type_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }

    media_type = media_type_map.get(ext, "application/octet-stream")

    return FileResponse(
        file_path,
        media_type=media_type,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"},
    )


@router.get("/{job_id}/checkpoints")
async def get_checkpoints(job_id: str, request: Request):
    if job_id is None or job_id == "" or job_id == "-1":
        return {"checkpoints": []}

    """Get list of checkpoints for a job"""
    job = job_service.job_get(job_id)
    if job is None:
        return {"checkpoints": []}

    job_data = job["job_data"]
    # First try to use the new SDK method to get checkpoints
    try:
        from lab.job import Job

        # Get checkpoints using the SDK method
        sdk_job = Job(job_id)
        checkpoint_paths = sdk_job.get_checkpoint_paths()

        if checkpoint_paths and len(checkpoint_paths) > 0:
            checkpoints = []
            for checkpoint_path in checkpoint_paths:
                try:
                    if storage.isdir(checkpoint_path):
                        # Don't set formatted_time and filesize for directories
                        formatted_time = None
                        filesize = None
                    else:
                        # Try to get file info from storage
                        try:
                            # Use storage.ls to get file details if available
                            file_info_list = storage.ls(checkpoint_path, detail=True)
                            if file_info_list and isinstance(file_info_list, dict):
                                file_info = file_info_list.get(checkpoint_path, {})
                                filesize = file_info.get("size", 0)
                                mtime = file_info.get("mtime", None)
                                if mtime:
                                    formatted_time = datetime.fromtimestamp(mtime).isoformat()
                                else:
                                    formatted_time = None
                            elif file_info_list and isinstance(file_info_list, list) and len(file_info_list) > 0:
                                file_info = file_info_list[0] if isinstance(file_info_list[0], dict) else {}
                                filesize = file_info.get("size", 0)
                                mtime = file_info.get("mtime", None)
                                if mtime:
                                    formatted_time = datetime.fromtimestamp(mtime).isoformat()
                                else:
                                    formatted_time = None
                            else:
                                # Fallback: try os.stat for local files (won't work for remote)
                                try:
                                    stat = os.stat(checkpoint_path)
                                    modified_time = stat.st_mtime
                                    filesize = stat.st_size
                                    formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                                except (OSError, AttributeError):
                                    # Remote storage or stat not available
                                    formatted_time = None
                                    filesize = None
                        except Exception:
                            # If storage.ls fails, try os.stat as fallback
                            try:
                                stat = os.stat(checkpoint_path)
                                modified_time = stat.st_mtime
                                filesize = stat.st_size
                                formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                            except (OSError, AttributeError):
                                formatted_time = None
                                filesize = None

                    # Get filename from path
                    filename = checkpoint_path.split("/")[-1] if "/" in checkpoint_path else checkpoint_path
                    checkpoints.append({"filename": filename, "date": formatted_time, "size": filesize})
                except Exception as e:
                    print(f"Error getting stat for checkpoint {checkpoint_path}: {e}")
                    continue

            # Sort checkpoints by filename in reverse (descending) order for consistent ordering
            checkpoints.sort(key=lambda x: x["filename"], reverse=True)
            return {"checkpoints": checkpoints}
    except Exception as e:
        print(f"SDK checkpoint method failed for job {job_id}, falling back to legacy method: {e}")

    # Fallback to the original logic if SDK method doesn't work or returns nothing
    # Check if the job has a supports_checkpoints flag
    # if "supports_checkpoints" not in job_data or not job_data["supports_checkpoints"]:
    #     return {"checkpoints": []}

    # By default we assume the training type is an adaptor training
    # and the checkpoints are stored alongside the adaptors
    # this maps to how mlx lora works, which will be the first use case
    # but we will have to abstract this further in the future
    config = job_data.get("config", {})
    if not isinstance(config, dict):
        try:
            config = json.loads(config)
        except Exception:
            config = {}
    model_name = config.get("model_name", "")
    adaptor_name = config.get("adaptor_name", "adaptor")
    workspace_dir = get_workspace_dir()
    default_adaptor_dir = storage.join(workspace_dir, "adaptors", secure_filename(model_name), adaptor_name)

    # Get job directory
    checkpoints_dir = job_data.get("checkpoints_dir")
    if not checkpoints_dir:
        from lab.dirs import get_job_checkpoints_dir

        checkpoints_dir = get_job_checkpoints_dir(job_id)
    if not checkpoints_dir or not storage.exists(checkpoints_dir):
        return {"checkpoints": []}
    elif storage.isdir(checkpoints_dir):
        checkpoints = []
        try:
            items = storage.ls(checkpoints_dir, detail=False)
            for item in items:
                file_path = item if isinstance(item, str) else str(item)
                filename = file_path.split("/")[-1] if "/" in file_path else file_path

                if fnmatch(filename, "*_adapters.safetensors"):
                    # Try to get file info
                    try:
                        file_info_list = storage.ls(file_path, detail=True)
                        if file_info_list and isinstance(file_info_list, dict):
                            file_info = file_info_list.get(file_path, {})
                            filesize = file_info.get("size", 0)
                            mtime = file_info.get("mtime", None)
                            modified_time = mtime if mtime else None
                        elif file_info_list and isinstance(file_info_list, list) and len(file_info_list) > 0:
                            file_info = file_info_list[0] if isinstance(file_info_list[0], dict) else {}
                            filesize = file_info.get("size", 0)
                            mtime = file_info.get("mtime", None)
                            modified_time = mtime if mtime else None
                        else:
                            # Fallback to os.stat for local files
                            try:
                                stat = os.stat(file_path)
                                modified_time = stat.st_mtime
                                filesize = stat.st_size
                            except (OSError, AttributeError):
                                modified_time = None
                                filesize = None
                        checkpoints.append({"filename": filename, "date": modified_time, "size": filesize})
                    except Exception as e:
                        print(f"Error getting file info for {file_path}: {e}")
                        checkpoints.append({"filename": filename, "date": None, "size": None})
                # allow directories too
                elif storage.isdir(file_path):
                    checkpoints.append({"filename": filename, "date": None, "size": None})
            if checkpoints:
                return {"checkpoints": checkpoints}
        except Exception as e:
            print(f"Error listing checkpoints directory {checkpoints_dir}: {e}")

    # Fallback to using default adaptor directory as checkpoints directory
    checkpoints_dir = default_adaptor_dir
    checkpoints_file_filter = job_data.get("checkpoints_file_filter", "*_adapters.safetensors")
    if not checkpoints_file_filter:
        checkpoints_file_filter = "*_adapters.safetensors"

    checkpoints = []
    try:
        items = storage.ls(checkpoints_dir, detail=False)
        for item in items:
            file_path = item if isinstance(item, str) else str(item)
            filename = file_path.split("/")[-1] if "/" in file_path else file_path

            if fnmatch(filename, checkpoints_file_filter):
                try:
                    # Try to get file info from storage
                    file_info_list = storage.ls(file_path, detail=True)
                    if file_info_list and isinstance(file_info_list, dict):
                        file_info = file_info_list.get(file_path, {})
                        filesize = file_info.get("size", 0)
                        mtime = file_info.get("mtime", None)
                        if mtime:
                            formatted_time = datetime.fromtimestamp(mtime).isoformat()
                        else:
                            formatted_time = None
                    elif file_info_list and isinstance(file_info_list, list) and len(file_info_list) > 0:
                        file_info = file_info_list[0] if isinstance(file_info_list[0], dict) else {}
                        filesize = file_info.get("size", 0)
                        mtime = file_info.get("mtime", None)
                        if mtime:
                            formatted_time = datetime.fromtimestamp(mtime).isoformat()
                        else:
                            formatted_time = None
                    else:
                        # Fallback to os.stat for local files
                        try:
                            stat = os.stat(file_path)
                            modified_time = stat.st_mtime
                            filesize = stat.st_size
                            formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                        except (OSError, AttributeError):
                            formatted_time = None
                            filesize = None
                except Exception as e:
                    print(f"Error getting stat for file {file_path}: {e}")
                    formatted_time = None
                    filesize = None
                checkpoints.append({"filename": filename, "date": formatted_time, "size": filesize})
    except Exception as e:
        print(f"Error reading checkpoints directory {checkpoints_dir}: {e}")

    # Sort checkpoints by filename in reverse (descending) order for consistent ordering
    checkpoints.sort(key=lambda x: x["filename"], reverse=True)

    return {
        "checkpoints": checkpoints,
        "model_name": model_name,
        "adaptor_name": adaptor_name,
    }


@router.get("/{job_id}/artifacts")
async def get_artifacts(job_id: str, request: Request):
    if job_id is None or job_id == "" or job_id == "-1":
        return {"artifacts": []}

    """Get list of artifacts for a job"""
    job = job_service.job_get(job_id)
    if job is None:
        return {"artifacts": []}

    job_data = job["job_data"]

    # First try to use the new SDK method to get artifacts
    try:
        from lab.job import Job

        # Get artifacts using the SDK method
        sdk_job = Job(job_id)
        artifact_paths = sdk_job.get_artifact_paths()

        if artifact_paths:
            artifacts = []
            for artifact_path in artifact_paths:
                try:
                    # Try to get file info from storage
                    try:
                        file_info_list = storage.ls(artifact_path, detail=True)
                        if file_info_list and isinstance(file_info_list, dict):
                            file_info = file_info_list.get(artifact_path, {})
                            filesize = file_info.get("size", 0)
                            mtime = file_info.get("mtime", None)
                            if mtime:
                                formatted_time = datetime.fromtimestamp(mtime).isoformat()
                            else:
                                formatted_time = None
                        elif file_info_list and isinstance(file_info_list, list) and len(file_info_list) > 0:
                            file_info = file_info_list[0] if isinstance(file_info_list[0], dict) else {}
                            filesize = file_info.get("size", 0)
                            mtime = file_info.get("mtime", None)
                            if mtime:
                                formatted_time = datetime.fromtimestamp(mtime).isoformat()
                            else:
                                formatted_time = None
                        else:
                            # Fallback to os.stat for local files
                            try:
                                stat = os.stat(artifact_path)
                                modified_time = stat.st_mtime
                                filesize = stat.st_size
                                formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                            except (OSError, AttributeError):
                                formatted_time = None
                                filesize = None
                    except Exception:
                        # If storage.ls fails, try os.stat as fallback
                        try:
                            stat = os.stat(artifact_path)
                            modified_time = stat.st_mtime
                            filesize = stat.st_size
                            formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                        except (OSError, AttributeError):
                            formatted_time = None
                            filesize = None

                    filename = artifact_path.split("/")[-1] if "/" in artifact_path else artifact_path
                    artifact_dict = {"filename": filename}
                    if formatted_time is not None:
                        artifact_dict["date"] = formatted_time
                    if filesize is not None:
                        artifact_dict["size"] = filesize
                    artifacts.append(artifact_dict)
                except Exception as e:
                    print(f"Error getting stat for artifact {artifact_path}: {e}")
                    continue

            # Sort artifacts by filename in reverse (descending) order for consistent ordering
            artifacts.sort(key=lambda x: x["filename"], reverse=True)
            return {"artifacts": artifacts}
    except Exception as e:
        print(f"SDK artifact method failed for job {job_id}, falling back to legacy method: {e}")

    # Fallback to the original logic if SDK method doesn't work or returns nothing
    # Get artifacts directory from job_data or use default location
    artifacts_dir = job_data.get("artifacts_dir")
    if not artifacts_dir:
        # Use the SDK's artifacts directory structure
        from lab.dirs import get_job_artifacts_dir

        artifacts_dir = get_job_artifacts_dir(job_id)

    if not artifacts_dir or not storage.exists(artifacts_dir):
        return {"artifacts": []}

    artifacts = []
    try:
        items = storage.ls(artifacts_dir, detail=False)
        for item in items:
            file_path = item if isinstance(item, str) else str(item)
            if storage.isfile(file_path):
                filename = file_path.split("/")[-1] if "/" in file_path else file_path
                try:
                    # Try to get file info from storage
                    file_info_list = storage.ls(file_path, detail=True)
                    if file_info_list and isinstance(file_info_list, dict):
                        file_info = file_info_list.get(file_path, {})
                        filesize = file_info.get("size", 0)
                        mtime = file_info.get("mtime", None)
                        if mtime:
                            formatted_time = datetime.fromtimestamp(mtime).isoformat()
                        else:
                            formatted_time = None
                    elif file_info_list and isinstance(file_info_list, list) and len(file_info_list) > 0:
                        file_info = file_info_list[0] if isinstance(file_info_list[0], dict) else {}
                        filesize = file_info.get("size", 0)
                        mtime = file_info.get("mtime", None)
                        if mtime:
                            formatted_time = datetime.fromtimestamp(mtime).isoformat()
                        else:
                            formatted_time = None
                    else:
                        # Fallback to os.stat for local files
                        try:
                            stat = os.stat(file_path)
                            modified_time = stat.st_mtime
                            filesize = stat.st_size
                            formatted_time = datetime.fromtimestamp(modified_time).isoformat()
                        except (OSError, AttributeError):
                            formatted_time = None
                            filesize = None
                except Exception as e:
                    print(f"Error getting stat for file {file_path}: {e}")
                    formatted_time = None
                    filesize = None
                artifact_dict = {"filename": filename}
                if formatted_time is not None:
                    artifact_dict["date"] = formatted_time
                if filesize is not None:
                    artifact_dict["size"] = filesize
                artifacts.append(artifact_dict)
    except Exception as e:
        print(f"Error reading artifacts directory {artifacts_dir}: {e}")

    # Sort artifacts by filename in reverse (descending) order for consistent ordering
    artifacts.sort(key=lambda x: x["filename"], reverse=True)

    return {"artifacts": artifacts}


@router.get("/{job_id}")
async def get_training_job_by_path(job_id: str):
    return job_service.job_get(job_id)


@router.get("/{job_id}/output")
async def get_training_job_output_jobpath(job_id: str, sweeps: bool = False):
    try:
        job = job_service.job_get(job_id)
        if job is None:
            return "Job not found"

        job_data = job.get("job_data", {})

        # Handle both dict and JSON string formats
        if not isinstance(job_data, dict):
            try:
                job_data = json.loads(job_data)
            except JSONDecodeError:
                print(f"Error decoding job_data for job {job_id}. Using empty job_data.")
                job_data = {}

        if sweeps:
            output_file = job_data.get("sweep_output_file", None)
            if output_file is not None and storage.exists(output_file):
                with storage.open(output_file, "r") as f:
                    output = f.read()
                return output
            else:
                # Fall back to regular output file logic
                experiment_id = job["experiment_id"]
                output_file_name = await shared.get_job_output_file_name(job_id, experiment_name=experiment_id)
        else:
            # Get experiment information for new job directory structure
            experiment_id = job["experiment_id"]
            output_file_name = await shared.get_job_output_file_name(job_id, experiment_name=experiment_id)

        if storage.exists(output_file_name):
            with storage.open(output_file_name, "r") as f:
                output = f.read()
            return output
        else:
            return "Output file not found"
    except ValueError as e:
        # Handle specific error
        print(f"ValueError: {e}")
        return "An internal error has occurred!"
    except Exception as e:
        # Handle general error
        print(f"Error: {e}")
        return "An internal error has occurred!"


@router.get("/{job_id}/sweep_results")
async def sweep_results(job_id: str):
    try:
        job = job_service.job_get(job_id)
        if job is None:
            return {"status": "error", "message": "Job not found."}

        job_data = job.get("job_data", {})

        # Handle both dict and JSON string formats
        if not isinstance(job_data, dict):
            try:
                job_data = json.loads(job_data)
            except JSONDecodeError:
                print(f"Error decoding job_data for job {job_id}. Using empty job_data.")
                job_data = {}

        output_file = job_data.get("sweep_results_file", None)
        if output_file and storage.exists(output_file):
            try:
                with storage.open(output_file, "r") as f:
                    output = json.load(f)
                return {"status": "success", "data": output}
            except json.JSONDecodeError as e:
                print(f"JSON decode error for job {job_id}: {e}")
                return {"status": "error", "message": "Invalid JSON format in sweep results file."}
        else:
            print(f"Sweep results file not found for job {job_id}: {output_file}")
            return {"status": "error", "message": "Sweep results file not found."}

    except Exception as e:
        print(f"Error loading sweep results for job {job_id}: {e}")
        return {"status": "error", "message": "An internal error has occurred!"}
