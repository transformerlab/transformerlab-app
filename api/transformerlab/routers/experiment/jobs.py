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

from sqlalchemy.ext.asyncio import AsyncSession

import transformerlab.services.job_service as job_service
from transformerlab.services.job_service import get_artifacts_from_directory, job_update_status
from transformerlab.services.provider_service import get_team_provider, get_provider_instance
from transformerlab.routers.auth import get_user_and_team
from transformerlab.shared.models.user_model import get_async_session
from transformerlab.compute_providers.models import JobState
from transformerlab.shared.tunnel_parser import get_tunnel_info
from lab import Job
from lab.dirs import get_workspace_dir, get_local_provider_job_dir
from transformerlab.shared import zip_utils

router = APIRouter(prefix="/jobs", tags=["train"])


@router.get("/list")
async def jobs_get_all(experimentId: str, type: str = "", status: str = "", subtype: str = ""):
    jobs = await job_service.jobs_get_all(type=type, status=status, experiment_id=experimentId)

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
    await job_service.job_delete(job_id, experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/create")
async def job_create(
    experimentId: str,
    type: str = "UNDEFINED",
    status: str = "CREATED",
    data: str = "{}",
):
    jobid = await job_service.job_create(type=type, status=status, job_data=data, experiment_id=experimentId)
    return jobid


async def job_create_task(script: str, job_data: str = "{}", experimentId: str = None):
    jobid = await job_service.job_create(
        type="UNDEFINED", status="CREATED", job_data=job_data, experiment_id=experimentId
    )
    return jobid


@router.get("/update/{job_id}")
async def job_update(job_id: str, status: str, experimentId: str):
    await job_update_status(job_id, status, experiment_id=experimentId)
    return {"message": "OK"}


async def start_next_job():
    # Count running jobs across all organizations
    num_running_jobs = await job_service.job_count_running_across_all_orgs()
    if num_running_jobs > 0:
        return {"message": "A job is already running"}

    # Get next queued job across all organizations
    nextjob, org_id = await job_service.jobs_get_next_queued_job_across_all_orgs()

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
    await job_service.job_stop(job_id, experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/delete_all")
async def job_delete_all(experimentId: str):
    await job_service.job_delete_all(experiment_id=experimentId)
    return {"message": "OK"}


@router.get("/{job_id}")
async def get_training_job(job_id: str):
    job = await job_service.job_get(job_id)
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
        job = await job_service.job_get(job_id)
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
            if output_file is not None and await storage.exists(output_file):
                output_file_name = output_file
            else:
                # Fall back to regular output file logic
                output_file_name = await shared.get_job_output_file_name(job_id)
        else:
            # Try to get output file name with fallback logic
            output_file_name = await shared.get_job_output_file_name(job_id)

        # Read and return the file content as JSON array of lines
        if await storage.exists(output_file_name):
            lines = []
            async with await storage.open(output_file_name, "r") as f:
                async for line in f:
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
                if await storage.exists(output_file_name):
                    lines = []
                    async with await storage.open(output_file_name, "r") as f:
                        async for line in f:
                            lines.append(line.rstrip("\n"))  # Remove trailing newline
                    return lines
                else:
                    return ["Output file not found after retry"]
            except Exception as retry_e:
                # If still no file after retry, create an empty one in the jobs directory
                print(f"Still no output file found for job {job_id} after retry, creating empty file: {retry_e}")
                # Use the Job class to get the proper directory and create the file
                job_obj = Job(job_id)
                output_file_name = await job_obj.get_log_path()
                # Get directory by removing filename from path using storage.join
                output_dir = storage.join(*output_file_name.split("/")[:-1]) if "/" in output_file_name else "."
                await storage.makedirs(output_dir, exist_ok=True)
                async with await storage.open(output_file_name, "w") as f:
                    await f.write("")
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

    job = await job_service.job_get(job_id)
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
        except NotImplementedError:
            # Provider doesn't support listing jobs (e.g., Runpod)
            # For Runpod, we can't determine a job_id, so we'll use the cluster_name as a fallback
            # or return a message that logs aren't available via job_id
            provider_job_id = cluster_name  # Use cluster_name as fallback identifier
            provider_job_candidates = []
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

    # For local provider, set workspace_dir (job dir) so LocalProvider can read logs.
    # Use the dedicated local-only directory so this works even when TFL_API_STORAGE_URI is set.
    if getattr(provider, "type", None) == "local" and hasattr(provider_instance, "extra_config"):
        job_dir = get_local_provider_job_dir(job_id, org_id=user_and_team["team_id"])
        provider_instance.extra_config["workspace_dir"] = job_dir

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


@router.get("/{job_id}/tunnel_info")
async def get_tunnel_info_for_job(
    experimentId: str,
    job_id: str,
    tail_lines: int = Query(400, ge=100, le=2000),
    user_and_team=Depends(get_user_and_team),
    session: AsyncSession = Depends(get_async_session),
):
    """
    Parse provider logs for a REMOTE job and extract tunnel information based on job type.

    This route automatically determines the tunnel type from job_data.interactive_type
    and uses the appropriate parser. Supports: 'vscode', 'jupyter', 'vllm', 'ssh'
    """

    job = await job_service.job_get(job_id)
    if not job or str(job.get("experiment_id")) != str(experimentId):
        raise HTTPException(status_code=404, detail="Job not found")

    job_data = job.get("job_data") or {}
    if not isinstance(job_data, dict):
        try:
            job_data = json.loads(job_data)
        except JSONDecodeError:
            job_data = {}

    # Get interactive_type from job_data, default to 'vscode' for backward compatibility
    interactive_type = job_data.get("interactive_type", "vscode")
    if not interactive_type:
        raise HTTPException(status_code=400, detail="Job does not contain interactive_type in job_data")

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

    # Determine provider-side job id in the same way as provider_logs
    provider_job_id: Optional[str | int] = job_data.get("provider_job_id")

    if provider_job_id is None:
        provider_job_ids = job_data.get("provider_job_ids")
        if isinstance(provider_job_ids, list) and provider_job_ids:
            provider_job_id = provider_job_ids[-1]

    if provider_job_id is None:
        try:
            provider_jobs = provider_instance.list_jobs(cluster_name)
        except NotImplementedError:
            # Provider doesn't support listing jobs (e.g., Runpod)
            # For Runpod, we can't determine a job_id, so we'll use the cluster_name as a fallback
            provider_job_id = cluster_name  # Use cluster_name as fallback identifier
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Failed to enumerate provider jobs: {exc}") from exc

        if provider_jobs:
            running_states = {JobState.RUNNING, JobState.PENDING}
            chosen_job = next((pj for pj in provider_jobs if pj.state in running_states), provider_jobs[-1])
            provider_job_id = chosen_job.job_id

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

    tunnel_info = get_tunnel_info(logs_text, interactive_type)

    return {
        **tunnel_info,
        "cluster_name": cluster_name,
        "provider_id": provider_id,
        "provider_job_id": str(provider_job_id),
        "interactive_type": interactive_type,
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
        job = await job_service.job_get(job_id)

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
            if output_file is not None and await storage.exists(output_file):
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
                output_file_name = await job_obj.get_log_path()
                # Get directory by removing filename from path using storage.join
                output_dir = storage.join(*output_file_name.split("/")[:-1]) if "/" in output_file_name else "."
                await storage.makedirs(output_dir, exist_ok=True)
                async with await storage.open(output_file_name, "w") as f:
                    await f.write("")
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
    if not await storage.exists(file_name):
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
    job = await job_service.job_get(job_id)
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

    if not await storage.exists(file_path):
        return Response("No additional details found for this evaluation", media_type="text/csv")

    # convert csv to JSON, but do not assume that \n marks the end of a row as cells can
    # contain fields that start and end with " and contain \n. Use a CSV parser instead.
    async with await storage.open(file_path, "r") as csvfile:
        contents_text = await csvfile.read()
        contents = csv.reader(contents_text.splitlines(), delimiter=",", quotechar='"')
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
    job = await job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]
    file_path = job_data.get("plot_data_path", None)

    if file_path is None or not await storage.exists(file_path):
        return Response("No plot data found for this evaluation", media_type="text/csv")

    async with await storage.open(file_path, "r") as f:
        content_str = await f.read()
        content = json.loads(content_str)
    return content


@router.get("/{job_id}/get_generated_dataset")
async def get_generated_dataset(job_id: str):
    job = await job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    # Get experiment name
    job_data = job["job_data"]

    # Check if the job has additional output path
    if "additional_output_path" in job_data.keys() and job_data["additional_output_path"]:
        json_file_path = job_data["additional_output_path"]
    else:
        return Response("No dataset found for this evaluation", media_type="text/csv")

    if not await storage.exists(json_file_path):
        return Response("No dataset found for this evaluation", media_type="text/csv")
    else:
        async with await storage.open(json_file_path, "r") as f:
            json_content_str = await f.read()
            json_content = json.loads(json_content_str)

        df = pd.DataFrame(json_content)

        content = {"header": df.columns.tolist(), "body": df.values.tolist()}

        return content


@router.get("/{job_id}/get_eval_results")
async def get_eval_results(job_id: str, task: str = "view", file_index: int = 0):
    """Get evaluation results for a job"""
    job = await job_service.job_get(job_id)
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

    if not await storage.exists(file_path):
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
        async def generate():
            async with await storage.open(file_path, "rb") as f:
                while True:
                    chunk = await f.read(8192)  # Read in 8KB chunks
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
        async with await storage.open(file_path, "r") as csvfile:
            content_str = await csvfile.read()
            contents = csv.reader(content_str.splitlines(), delimiter=",", quotechar='"')
            csv_content = {"header": [], "body": []}
            for i, row in enumerate(contents):
                if i == 0:
                    csv_content["header"] = row
                else:
                    csv_content["body"].append(row)
            return csv_content
    elif file_path.endswith(".json"):
        async with await storage.open(file_path, "r") as jsonfile:
            content_str = await jsonfile.read()
            content = json.loads(content_str)
            # If it's a list of records, convert to header/body format
            if isinstance(content, list) and len(content) > 0:
                if isinstance(content[0], dict):
                    header = list(content[0].keys())
                    body = [list(row.values()) for row in content]
                    return {"header": header, "body": body}
            return content
    else:
        # For other file types, just return as text
        async with await storage.open(file_path, "r") as f:
            return await f.read()


@router.get("/{job_id}/get_eval_images")
async def get_eval_images(job_id: str):
    """Get list of evaluation images for a job"""
    job = await job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]

    # Check if the job has eval_images_dir
    if "eval_images_dir" not in job_data or not job_data["eval_images_dir"]:
        return {"images": []}

    images_dir = job_data["eval_images_dir"]

    if not await storage.exists(images_dir):
        return {"images": []}

    # Supported image extensions
    image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg"}
    images = []
    try:
        # Use storage.ls to list directory contents
        items = await storage.ls(images_dir, detail=True)
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
                if await storage.isfile(file_path):
                    filename = file_path.split("/")[-1] if "/" in file_path else file_path
                    _, ext = os.path.splitext(filename.lower())
                    if ext in image_extensions:
                        # Try to get file info - for remote storage, stats might not be available
                        try:
                            items_detail = await storage.ls(file_path, detail=True)
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
    job = await job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)
    job_data = job["job_data"]

    # Check if the job has eval_images_dir
    if "eval_images_dir" not in job_data or not job_data["eval_images_dir"]:
        return Response("No images directory found for this job", status_code=404)

    images_dir = job_data["eval_images_dir"]

    if not await storage.exists(images_dir):
        return Response("Images directory not found", status_code=404)

    # Secure the filename to prevent directory traversal
    filename = secure_filename(filename)
    file_path = storage.join(images_dir, filename)

    # Ensure the file exists
    if not await storage.exists(file_path):
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
    job = await job_service.job_get(job_id)
    if job is None:
        return {"checkpoints": []}

    job_data = job["job_data"]
    # First try to use the new SDK method to get checkpoints
    try:
        from lab.job import Job

        # Get checkpoints using the SDK method
        sdk_job = Job(job_id)
        checkpoint_paths = await sdk_job.get_checkpoint_paths()

        if checkpoint_paths and len(checkpoint_paths) > 0:
            checkpoints = []
            for checkpoint_path in checkpoint_paths:
                try:
                    # Get filename from path
                    filename = checkpoint_path.split("/")[-1] if "/" in checkpoint_path else checkpoint_path
                    checkpoints.append({"filename": filename})
                except Exception as e:
                    print(f"Error processing checkpoint {checkpoint_path}: {e}")
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
    workspace_dir = await get_workspace_dir()
    default_adaptor_dir = storage.join(workspace_dir, "adaptors", secure_filename(model_name), adaptor_name)

    # Get job directory
    checkpoints_dir = job_data.get("checkpoints_dir")
    if not checkpoints_dir:
        from lab.dirs import get_job_checkpoints_dir

        checkpoints_dir = await get_job_checkpoints_dir(job_id)
    if not checkpoints_dir or not await storage.exists(checkpoints_dir):
        return {"checkpoints": []}
    elif await storage.isdir(checkpoints_dir):
        checkpoints = []
        try:
            items = await storage.ls(checkpoints_dir, detail=False)
            for item in items:
                file_path = item if isinstance(item, str) else str(item)
                filename = file_path.split("/")[-1] if "/" in file_path else file_path

                if fnmatch(filename, "*_adapters.safetensors"):
                    checkpoints.append({"filename": filename})
                # allow directories too
                elif await storage.isdir(file_path):
                    checkpoints.append({"filename": filename})
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
        items = await storage.ls(checkpoints_dir, detail=False)
        for item in items:
            file_path = item if isinstance(item, str) else str(item)
            filename = file_path.split("/")[-1] if "/" in file_path else file_path

            if fnmatch(filename, checkpoints_file_filter):
                checkpoints.append({"filename": filename})
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
    """Get list of artifacts for a job"""

    # Validate job_id
    if not job_id or job_id in ("", "-1"):
        return {"artifacts": []}

    """Get list of artifacts for a job"""

    # Use get_job_artifacts_dir to get the artifacts directory directly
    try:
        from lab.dirs import get_job_artifacts_dir

        artifacts_dir = await get_job_artifacts_dir(job_id)
        artifacts = await get_artifacts_from_directory(artifacts_dir, storage)
    except Exception as e:
        print(f"Error getting artifacts for job {job_id}: {e}")
        artifacts = []

    # Sort by filename in descending order for consistent ordering
    artifacts.sort(key=lambda x: x["filename"], reverse=True)

    return {"artifacts": artifacts}


@router.get("/{job_id}/artifacts/download_all")
async def download_all_artifacts(job_id: str):
    """
    Download a zip file containing all artifacts for a job.
    """
    # 1. Gather all artifact file paths using service
    all_file_paths = await job_service.get_all_artifact_paths(job_id, storage)

    if not all_file_paths:
        return Response("No artifacts found for this job", status_code=404)

    # 2. Create Zip File in memory
    try:
        zip_buffer = await zip_utils.create_zip_from_storage(all_file_paths, storage)

        filename = f"artifacts_{job_id}.zip"
        headers = {
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        }

        return StreamingResponse(iter([zip_buffer.getvalue()]), media_type="application/zip", headers=headers)

    except Exception as e:
        print(f"Error creating zip file: {e}")
        return Response("Failed to generate zip file", status_code=500)


@router.get("/{job_id}/artifact/{filename}")
async def get_artifact(job_id: str, filename: str, task: str = "view"):
    """
    Serve individual artifact files for viewing or downloading.

    Args:
        job_id: The job ID
        filename: The artifact filename
        task: Either "view" or "download" (default: "view")
    """
    job = await job_service.job_get(job_id)
    if job is None:
        return Response("Job not found", status_code=404)

    job_data = job["job_data"]

    # First try to use the new SDK method to get artifact paths
    artifact_file_path = None
    try:
        from lab.job import Job

        # Get artifacts using the SDK method
        sdk_job = Job(job_id)
        artifact_paths = await sdk_job.get_artifact_paths()

        if artifact_paths:
            # Look for the file in the artifact paths
            filename_secure = secure_filename(filename)
            for artifact_path in artifact_paths:
                # Check if this path matches the filename
                path_filename = artifact_path.split("/")[-1] if "/" in artifact_path else artifact_path
                if path_filename == filename_secure:
                    artifact_file_path = artifact_path
                    break
    except Exception as e:
        print(f"Error using SDK method to get artifact paths: {e}")

    # Fallback to checking the artifacts directory
    if artifact_file_path is None:
        if "artifacts_dir" not in job_data or not job_data["artifacts_dir"]:
            return Response("No artifacts directory found for this job", status_code=404)

        artifacts_dir = job_data["artifacts_dir"]

        if not await storage.exists(artifacts_dir):
            return Response("Artifacts directory not found", status_code=404)

        # Secure the filename to prevent directory traversal
        filename_secure = secure_filename(filename)
        artifact_file_path = storage.join(artifacts_dir, filename_secure)

    # Ensure the file exists
    if not await storage.exists(artifact_file_path):
        return Response("Artifact not found", status_code=404)

    # Determine media type based on file extension
    _, ext = os.path.splitext(filename.lower())
    media_type_map = {
        # Images
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        # Videos
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".ogg": "video/ogg",
        ".avi": "video/x-msvideo",
        ".mov": "video/quicktime",
        # Audio
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/mp4",
        ".flac": "audio/flac",
        # JSON
        ".json": "application/json",
        # Text
        ".txt": "text/plain",
        ".log": "text/plain",
        ".csv": "text/csv",
        # Other
        ".pdf": "application/pdf",
        ".zip": "application/zip",
    }

    media_type = media_type_map.get(ext, "application/octet-stream")

    # For JSON files in view mode, return the parsed content
    if task == "view" and ext == ".json":
        try:
            async with await storage.open(artifact_file_path, "r") as f:
                content_str = await f.read()
                content = json.loads(content_str)
                return content
        except Exception as e:
            print(f"Error reading JSON file: {e}")
            # Fall back to streaming response

    # For download or other file types, stream the file
    # Use StreamingResponse to support both local and remote files (e.g., s3://)
    async def generate():
        async with await storage.open(artifact_file_path, "rb") as f:
            while True:
                chunk = await f.read(8192)  # Read in 8KB chunks
                if not chunk:
                    break
                yield chunk

    headers = {}
    if task == "download":
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    else:
        headers["Content-Disposition"] = f'inline; filename="{filename}"'

    headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    headers["Pragma"] = "no-cache"
    headers["Expires"] = "0"

    return StreamingResponse(
        generate(),
        media_type=media_type,
        headers=headers,
    )


@router.get("/{job_id}")
async def get_training_job_by_path(job_id: str):
    return await job_service.job_get(job_id)


@router.get("/{job_id}/output")
async def get_training_job_output_jobpath(job_id: str, sweeps: bool = False):
    try:
        job = await job_service.job_get(job_id)
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
            if output_file is not None and await storage.exists(output_file):
                async with await storage.open(output_file, "r") as f:
                    output = await f.read()
                return output
            else:
                # Fall back to regular output file logic
                experiment_id = job["experiment_id"]
                output_file_name = await shared.get_job_output_file_name(job_id, experiment_name=experiment_id)
        else:
            # Get experiment information for new job directory structure
            experiment_id = job["experiment_id"]
            output_file_name = await shared.get_job_output_file_name(job_id, experiment_name=experiment_id)

        if await storage.exists(output_file_name):
            async with await storage.open(output_file_name, "r") as f:
                output = await f.read()
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
        job = await job_service.job_get(job_id)
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
        if output_file and await storage.exists(output_file):
            try:
                async with await storage.open(output_file, "r") as f:
                    content_str = await f.read()
                    output = json.loads(content_str)
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


@router.get("/{job_id}/datasets")
async def get_job_datasets(job_id: str, request: Request):
    """Get list of datasets in the job's datasets directory"""

    if not job_id or job_id in ("", "-1"):
        return {"datasets": []}

    try:
        from lab.dirs import get_job_datasets_dir

        datasets_dir = await get_job_datasets_dir(job_id)
        datasets = await job_service.get_datasets_from_directory(datasets_dir, storage)
    except Exception as e:
        print(f"Error getting datasets for job {job_id}: {e}")
        datasets = []

    # Sort by name for consistent ordering
    datasets.sort(key=lambda x: x["name"])

    return {"datasets": datasets}


@router.get("/{job_id}/models")
async def get_job_models(job_id: str, request: Request):
    """Get list of models in the job's models directory"""

    if not job_id or job_id in ("", "-1"):
        return {"models": []}

    try:
        from lab.dirs import get_job_models_dir

        models_dir = await get_job_models_dir(job_id)
        models = await job_service.get_models_from_directory(models_dir, storage)
    except Exception as e:
        print(f"Error getting models for job {job_id}: {e}")
        models = []

    # Sort by name for consistent ordering
    models.sort(key=lambda x: x["name"])

    return {"models": models}


@router.post("/{job_id}/datasets/{dataset_name}/save_to_registry")
async def save_dataset_to_registry(job_id: str, dataset_name: str):
    """Copy a dataset from job's datasets directory to the global datasets registry"""

    try:
        from lab.dirs import get_job_datasets_dir, get_datasets_dir

        # Secure the dataset name
        dataset_name_secure = secure_filename(dataset_name)

        # Get source path (job's datasets directory)
        job_datasets_dir = await get_job_datasets_dir(job_id)
        source_path = storage.join(job_datasets_dir, dataset_name_secure)

        if not await storage.exists(source_path):
            return Response("Dataset not found in job directory", status_code=404)

        # Get destination path (global datasets registry)
        datasets_registry_dir = await get_datasets_dir()
        dest_path = storage.join(datasets_registry_dir, dataset_name_secure)

        # Check if dataset already exists in registry
        if await storage.exists(dest_path):
            return Response("Dataset already exists in registry", status_code=409)

        # Copy the dataset directory to the registry
        await storage.copy(source_path, dest_path, recursive=True)

        return {"status": "success", "message": f"Dataset {dataset_name_secure} saved to registry"}

    except Exception as e:
        print(f"Error saving dataset to registry for job {job_id}: {e}")
        return Response("Failed to save dataset", status_code=500)


@router.post("/{job_id}/models/{model_name}/save_to_registry")
async def save_model_to_registry(job_id: str, model_name: str):
    """Copy a model from job's models directory to the global models registry"""

    try:
        from lab.dirs import get_job_models_dir, get_models_dir

        # Secure the model name
        model_name_secure = secure_filename(model_name)

        # Get source path (job's models directory)
        job_models_dir = await get_job_models_dir(job_id)
        source_path = storage.join(job_models_dir, model_name_secure)

        if not await storage.exists(source_path):
            return Response("Model not found in job directory", status_code=404)

        # Get destination path (global models registry)
        models_registry_dir = await get_models_dir()
        dest_path = storage.join(models_registry_dir, model_name_secure)

        # Check if model already exists in registry
        if await storage.exists(dest_path):
            return Response("Model already exists in registry", status_code=409)

        # Copy the model directory to the registry
        await storage.copy(source_path, dest_path, recursive=True)

        return {"status": "success", "message": f"Model {model_name_secure} saved to registry"}

    except Exception as e:
        print(f"Error saving model to registry for job {job_id}: {e}")
        return Response("Failed to save model", status_code=500)
