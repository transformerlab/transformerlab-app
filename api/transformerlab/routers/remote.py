import os
import json
import httpx
from fastapi import APIRouter, Form, Request, File, UploadFile, Depends
from typing import Optional, List
from transformerlab.services import job_service
from transformerlab.services.job_service import job_update_status
from transformerlab.routers.auth.api_key_auth import get_user_or_api_key
from transformerlab.services.auth import AuthenticatedIdentity, auth_service
from lab import storage
from lab.dirs import get_workspace_dir, get_job_checkpoints_dir


router = APIRouter(prefix="/remote", tags=["remote"])


def validate_gpu_orchestrator_env_vars():
    """
    Validate that required GPU orchestrator environment variables are set.
    Returns a tuple of (url, port) if valid, or (None, error_response) if invalid.
    """
    gpu_orchestrator_url = os.getenv("GPU_ORCHESTRATION_SERVER")
    gpu_orchestrator_port = os.getenv("GPU_ORCHESTRATION_SERVER_PORT")

    if not gpu_orchestrator_url:
        return None, {"status": "error", "message": "GPU_ORCHESTRATION_SERVER environment variable not set"}

    if not gpu_orchestrator_port:
        return None, {"status": "error", "message": "GPU_ORCHESTRATION_SERVER_PORT environment variable not set"}

    return gpu_orchestrator_url, gpu_orchestrator_port


@router.post("/create-job")
async def create_remote_job(
    request: Request,
    experimentId: str,
    identity: AuthenticatedIdentity = Depends(get_user_or_api_key),
    cluster_name: str = Form(...),
    command: str = Form("echo 'Hello World'"),
    task_name: Optional[str] = Form(None),
    subtype: Optional[str] = Form(None),
    cpus: Optional[str] = Form(None),
    memory: Optional[str] = Form(None),
    disk_space: Optional[str] = Form(None),
    accelerators: Optional[str] = Form(None),
    num_nodes: Optional[int] = Form(None),
    setup: Optional[str] = Form(None),
    uploaded_dir_path: Optional[str] = Form(None),
):
    """
    Create a remote job without launching it. Returns job info for frontend to show placeholder.
    """
    # Get user information from the authentication identity
    user_info_payload = auth_service.get_user_info(identity)

    # Extract user info for storage (name/email for display)
    user_info = {}
    if user_info_payload.get("first_name") or user_info_payload.get("last_name"):
        user_info["name"] = " ".join(
            [user_info_payload.get("first_name", ""), user_info_payload.get("last_name", "")]
        ).strip()
    if user_info_payload.get("email"):
        user_info["email"] = user_info_payload["email"]

    # First, create a REMOTE job
    job_data = {"task_name": task_name, "command": command, "cluster_name": cluster_name}
    if subtype:
        job_data["subtype"] = subtype

    # Add user_info to job_data if we have any user information
    if user_info:
        job_data["user_info"] = user_info

    # Add optional parameters if provided
    if cpus:
        job_data["cpus"] = cpus
    if memory:
        job_data["memory"] = memory
    if disk_space:
        job_data["disk_space"] = disk_space
    if accelerators:
        job_data["accelerators"] = accelerators
    if num_nodes:
        job_data["num_nodes"] = num_nodes
    if setup:
        job_data["setup"] = setup
    if uploaded_dir_path:
        job_data["uploaded_dir_path"] = uploaded_dir_path

    try:
        job_id = job_service.job_create(
            type="REMOTE",
            status="LAUNCHING",
            experiment_id=experimentId,
        )
        # Update the job data to add fields from job_data (this ensures default fields stay in the job)
        for key, value in job_data.items():
            job_service.job_update_job_data_insert_key_value(job_id, key, value, experimentId)

        # Format cluster_name as <user_value>-job-<job_id> and persist it
        formatted_cluster_name = f"{cluster_name}-job-{job_id}"
        job_service.job_update_job_data_insert_key_value(job_id, "cluster_name", formatted_cluster_name, experimentId)

        return {
            "status": "success",
            "job_id": job_id,
            "cluster_name": formatted_cluster_name,
            "message": "Remote job created successfully",
        }
    except Exception as e:
        print(f"Failed to create job: {str(e)}")
        return {"status": "error", "message": "Failed to create job"}


@router.post("/launch")
async def launch_remote(
    request: Request,
    experimentId: str,
    identity: AuthenticatedIdentity = Depends(get_user_or_api_key),
    job_id: Optional[str] = Form(None),
    cluster_name: Optional[str] = Form(None),
    command: str = Form("echo 'Hello World'"),
    task_name: Optional[str] = Form(None),
    subtype: Optional[str] = Form(None),
    cpus: Optional[str] = Form(None),
    memory: Optional[str] = Form(None),
    disk_space: Optional[str] = Form(None),
    accelerators: Optional[str] = Form(None),
    num_nodes: Optional[int] = Form(None),
    setup: Optional[str] = Form(None),
    uploaded_dir_path: Optional[str] = Form(None),
    checkpoint: Optional[str] = Form(None),
    parent_job_id: Optional[str] = Form(None),
    use_existing_cluster: Optional[bool] = Form(False),
):
    """
    Launch a remote instance via Lattice orchestrator or submit job to existing cluster.
    If use_existing_cluster is True, submits job to existing cluster via /jobs/{cluster_name}/submit.
    If job_id is provided, use existing job, otherwise create new one.
    checkpoint: Optional[str] = Form(None),
    parent_job_id: Optional[str] = Form(None),
    """
    formatted_cluster_name = cluster_name
    # Handle resume from checkpoint logic
    if checkpoint and parent_job_id:
        # Get the parent job
        parent_job = job_service.job_get(parent_job_id)
        if not parent_job:
            return {"status": "error", "message": f"Parent job {parent_job_id} not found"}

        # Get the parent job data
        parent_job_data = parent_job.get("job_data", {})

        # Validate checkpoint existence
        checkpoints_dir = get_job_checkpoints_dir(parent_job_id)
        checkpoint_path = os.path.normpath(os.path.join(checkpoints_dir, checkpoint))

        # Validate that the checkpoint path is within the checkpoints directory
        if not checkpoint_path.startswith(os.path.abspath(checkpoints_dir) + os.sep):
            return {"status": "error", "message": "Invalid checkpoint name (potential directory traversal detected)"}

        if not os.path.exists(checkpoint_path):
            return {"status": "error", "message": f"Checkpoint {checkpoint} not found at {checkpoint_path}"}

        # Get the original command
        command = parent_job_data.get("command", "")
        if not command:
            return {"status": "error", "message": "Original command not found in parent job data"}

        # Create a simple, meaningful task name for the resumed training
        task_name = f"resume_training_{parent_job_id}"

        # Use ALL parameters from parent job for resume (user just presses button)
        cluster_name = parent_job_data.get("cluster_name")
        cpus = parent_job_data.get("cpus")
        memory = parent_job_data.get("memory")
        disk_space = parent_job_data.get("disk_space")
        accelerators = parent_job_data.get("accelerators")
        num_nodes = parent_job_data.get("num_nodes")
        setup = parent_job_data.get("setup")
        uploaded_dir_path = parent_job_data.get("uploaded_dir_path")

        # Force creation of new job for resume (don't use existing job_id)
        job_id = None

    # Validate required fields
    if not cluster_name:
        return {"status": "error", "message": "cluster_name is required"}

    # Build a unified data structure with all parameters
    data = {
        "command": command,
        "task_name": task_name,
    }

    if subtype:
        data["subtype"] = subtype

    if not use_existing_cluster:
        data["cluster_name"] = formatted_cluster_name

    # Add resume metadata if resuming from checkpoint
    if checkpoint and parent_job_id:
        data["resumed_from_checkpoint"] = checkpoint
        data["checkpoint_path"] = checkpoint_path
        data["parent_job_id"] = parent_job_id

    # Add optional parameters if provided
    if cpus:
        data["cpus"] = cpus
    if memory:
        data["memory"] = memory
    if disk_space:
        data["disk_space"] = disk_space
    if accelerators:
        data["accelerators"] = accelerators
    if num_nodes:
        data["num_nodes"] = num_nodes
    if setup:
        data["setup"] = setup
    if uploaded_dir_path:
        data["uploaded_dir_path"] = uploaded_dir_path

    # If job_id is provided, use existing job, otherwise create a new one
    if not job_id:
        # Get user information from the authentication identity
        user_info_payload = auth_service.get_user_info(identity)

        # Extract user info for storage (name/email for display)
        user_info = {}
        if user_info_payload.get("first_name") or user_info_payload.get("last_name"):
            user_info["name"] = " ".join(
                [user_info_payload.get("first_name", ""), user_info_payload.get("last_name", "")]
            ).strip()
        if user_info_payload.get("email"):
            user_info["email"] = user_info_payload["email"]

        # Add user_info to job_data if we have any user information
        if user_info:
            data["user_info"] = user_info
        try:
            job_id = job_service.job_create(
                type="REMOTE",
                status="LAUNCHING",
                experiment_id=experimentId,
            )
            # Store all data in the job (this ensures default fields stay in the job)
            for key, value in data.items():
                job_service.job_update_job_data_insert_key_value(job_id, key, value, experimentId)

            if not use_existing_cluster:
                # Format cluster_name as <user_value>-job-<job_id> and persist it
                formatted_cluster_name = f"{cluster_name}-job-{job_id}"

            job_service.job_update_job_data_insert_key_value(
                job_id, "cluster_name", formatted_cluster_name, experimentId
            )
        except Exception as e:
            print(f"Failed to create job: {str(e)}")
            return {"status": "error", "message": "Failed to create job"}

    # Use task_name as job_name if provided, otherwise fall back to cluster_name
    job_name = task_name if task_name else formatted_cluster_name
    data["job_name"] = job_name
    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response

    # Prepare the request data for Lattice orchestrator
    request_data = data.copy()
    request_data["tlab_job_id"] = job_id

    # Use task_name as job_name if provided, otherwise fall back to cluster_name
    request_data["job_name"] = task_name if task_name else cluster_name

    # Determine which endpoint to use based on use_existing_cluster flag
    if use_existing_cluster:
        # Submit job to existing cluster
        gpu_orchestrator_url = (
            f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/jobs/{formatted_cluster_name}/submit"
        )

    else:
        # Launch new instance
        request_data["cluster_name"] = formatted_cluster_name
        gpu_orchestrator_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/instances/launch"

    try:
        # Make the request to the Lattice orchestrator
        async with httpx.AsyncClient() as client:
            # Build headers: prefer configured API key, otherwise forward incoming Authorization header
            outbound_headers = {"Content-Type": "application/x-www-form-urlencoded"}
            incoming_auth = request.headers.get("AUTHORIZATION")
            if incoming_auth:
                outbound_headers["AUTHORIZATION"] = incoming_auth

            response = await client.post(
                f"{gpu_orchestrator_url}",
                headers=outbound_headers,
                data=request_data,
                cookies=request.cookies,
                timeout=30.0,
            )

            if response.status_code == 200:
                response_data = response.json()
                # Store the request_id in job data for later use
                if "request_id" in response_data:
                    job_service.job_update_job_data_insert_key_value(
                        job_id, "orchestrator_request_id", response_data["request_id"], experimentId
                    )
                # Store the cluster_name in job data for later use
                if "cluster_name" in response_data:
                    job_service.job_update_job_data_insert_key_value(
                        job_id, "cluster_name", response_data["cluster_name"], experimentId
                    )

                success_message = (
                    "Job submitted to existing cluster successfully"
                    if use_existing_cluster
                    else "Remote instance launched successfully"
                )

                return {
                    "status": "success",
                    "data": response_data,
                    "job_id": job_id,
                    "message": f"Training resumed from checkpoint {checkpoint}" if checkpoint else success_message,
                }
            else:
                return {
                    "status": "error",
                    "message": f"Lattice orchestrator returned status {response.status_code}: {response.text}",
                }

    except httpx.TimeoutException:
        return {"status": "error", "message": "Request to Lattice orchestrator timed out"}
    except httpx.RequestError:
        return {"status": "error", "message": "Request error occurred"}
    except Exception:
        return {"status": "error", "message": "Unexpected error occurred"}


@router.post("/stop")
async def stop_remote(
    request: Request,
    job_id: str = Form(...),
    cluster_name: str = Form(...),
):
    """
    Stop a remote instance via Lattice orchestrator by calling instances/down endpoint
    """
    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response

    # First, cancel the job on the cluster
    down_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/instances/down"

    try:
        # Make the request to the Lattice orchestrator
        async with httpx.AsyncClient() as client:
            # Build headers: prefer configured API key, otherwise forward incoming Authorization header
            outbound_headers = {"Content-Type": "application/json"}
            incoming_auth = request.headers.get("AUTHORIZATION")
            if incoming_auth:
                outbound_headers["AUTHORIZATION"] = incoming_auth

            # Bring down the cluster
            print(f"Bringing down cluster {cluster_name}")
            # Prepare JSON payload for the orchestrator
            payload = {
                "cluster_name": cluster_name,
                "tlab_job_id": job_id,  # Pass the job_id to the orchestrator
            }

            response = await client.post(
                down_url, headers=outbound_headers, json=payload, cookies=request.cookies, timeout=30.0
            )

            if response.status_code == 200:
                # Get the job to check its status and update job_data
                job = job_service.job_get(job_id)
                if job:
                    experiment_id = job.get("experiment_id")
                    if experiment_id:
                        # Set cluster_stopped: true in job_data
                        job_service.job_update_job_data_insert_key_value(
                            job_id, "cluster_stopped", True, experiment_id
                        )
                        # Only update job status to STOPPED if it's not already COMPLETE
                        if job.get("status") != "COMPLETE":
                            await job_update_status(job_id, "STOPPED", experiment_id=experiment_id)
                    else:
                        # Fallback: update status without experiment_id (backward compatibility)
                        if job.get("status") != "COMPLETE":
                            await job_update_status(job_id, "STOPPED")

                return {
                    "status": "success",
                    "data": response.json(),
                    "message": "Remote instance stopped successfully",
                }
            else:
                return {
                    "status": "error",
                    "message": f"Lattice orchestrator returned status {response.status_code}: {response.text}",
                }

    except httpx.TimeoutException:
        return {"status": "error", "message": "Request to Lattice orchestrator timed out"}
    except httpx.RequestError:
        return {"status": "error", "message": "Request error occurred"}
    except Exception:
        return {"status": "error", "message": "Unexpected error occurred"}


@router.post("/upload")
async def upload_directory(
    request: Request,
    dir_files: List[UploadFile] = File(...),
    dir_name: Optional[str] = Form(None),
):
    """
    Upload a directory to the remote Lattice orchestrator for later use in cluster launches.
    Files are stored locally first, then sent to orchestrator.
    """

    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response
    gpu_orchestrator_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/instances/upload"

    # Store files locally first
    local_storage_dir = None
    try:
        # Create local storage directory
        workspace_dir = get_workspace_dir()
        local_uploads_dir = storage.join(workspace_dir, "uploads")
        storage.makedirs(local_uploads_dir, exist_ok=True)

        # Create unique directory for this upload
        import uuid

        upload_id = str(uuid.uuid4())
        base_upload_dir = f"upload_{upload_id}"
        local_storage_dir = storage.join(local_uploads_dir, base_upload_dir)
        storage.makedirs(local_storage_dir, exist_ok=True)

        # Store files locally
        for file in dir_files:
            # Reset file pointer to beginning
            await file.seek(0)
            content = await file.read()

            # Create directory structure if filename contains path separators
            file_path = storage.join(local_storage_dir, file.filename)
            # Get parent directory and create it if needed
            file_dir = storage.join(*file_path.split("/")[:-1]) if "/" in file_path else local_storage_dir
            storage.makedirs(file_dir, exist_ok=True)

            # For file uploads, we need to write to local filesystem for HTTP upload
            # If storage is remote, we might need to handle this differently
            # For now, write directly using storage.open which handles both local and remote
            with storage.open(file_path, "wb") as f:
                f.write(content)

        # Prepare the request data for Lattice orchestrator
        files_data = []
        form_data = {}

        # Add dir_name if provided
        if dir_name:
            form_data["dir_name"] = dir_name

        # Prepare files for upload (reset file pointers)
        for file in dir_files:
            await file.seek(0)
            files_data.append(("dir_files", (file.filename, await file.read(), file.content_type)))

        # Make the request to the Lattice orchestrator
        async with httpx.AsyncClient() as client:
            # Build headers: prefer configured API key, otherwise forward incoming Authorization header
            outbound_headers = {}
            incoming_auth = request.headers.get("AUTHORIZATION")
            if incoming_auth:
                outbound_headers["AUTHORIZATION"] = incoming_auth

            response = await client.post(
                f"{gpu_orchestrator_url}",
                headers=outbound_headers,
                files=files_data,
                data=form_data,
                cookies=request.cookies,
                timeout=60.0,  # Longer timeout for file uploads
            )

            if response.status_code == 200:
                response_data = response.json()
                # Add local storage path to response (just the folder name)
                response_data["local_storage_path"] = base_upload_dir
                return {
                    "status": "success",
                    "data": response_data,
                    "message": "Directory uploaded successfully",
                    "local_storage_path": base_upload_dir,
                }
            else:
                return {
                    "status": "error",
                    "message": f"Lattice orchestrator returned status {response.status_code}: {response.text}",
                }

    except httpx.TimeoutException:
        return {"status": "error", "message": "Request to Lattice orchestrator timed out"}
    except httpx.RequestError:
        return {"status": "error", "message": "Request error occurred"}
    except Exception as e:
        print(f"Upload error: {e}")
        return {"status": "error", "message": "Unexpected error occurred"}


async def check_remote_job_status(request: Request, cluster_name: str):
    """
    Check the status of jobs running on a remote cluster via the orchestrator.
    Returns the status of all jobs on the cluster.
    """
    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response

    # Build the jobs endpoint URL
    jobs_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/jobs/{cluster_name}"

    try:
        async with httpx.AsyncClient() as client:
            # Build headers: prefer configured API key, otherwise forward incoming Authorization header
            outbound_headers = {"Content-Type": "application/json"}
            incoming_auth = request.headers.get("AUTHORIZATION")
            if incoming_auth:
                outbound_headers["AUTHORIZATION"] = incoming_auth

            response = await client.get(jobs_url, headers=outbound_headers, cookies=request.cookies, timeout=30.0)

            if response.status_code == 200:
                return {
                    "status": "success",
                    "data": response.json(),
                    "message": "Remote job status retrieved successfully",
                }
            else:
                return {
                    "status": "error",
                    "message": f"Orchestrator returned status {response.status_code}: {response.text}",
                }

    except httpx.TimeoutException:
        return {"status": "error", "message": "Request to orchestrator timed out"}
    except httpx.RequestError:
        return {"status": "error", "message": "Request error occurred"}
    except Exception:
        return {"status": "error", "message": "Unexpected error occurred"}


@router.get("/logs/{request_id}")
async def get_orchestrator_logs(request: Request, request_id: str):
    """
    Stream logs from the orchestrator for a specific request_id in real-time.
    This endpoint forwards authentication and streams the response.
    """
    from fastapi.responses import StreamingResponse

    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response

    # Build the logs endpoint URL
    logs_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/instances/requests/{request_id}/logs"

    async def stream_logs():
        """Generator that streams logs from orchestrator to client"""
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                # Build headers: prefer configured API key, otherwise forward incoming Authorization header
                outbound_headers = {"Content-Type": "application/json"}
                incoming_auth = request.headers.get("AUTHORIZATION")
                if incoming_auth:
                    outbound_headers["AUTHORIZATION"] = incoming_auth

                # Stream the response from orchestrator
                async with client.stream(
                    "GET", logs_url, headers=outbound_headers, cookies=request.cookies
                ) as response:
                    if response.status_code == 200:
                        # Stream each chunk from orchestrator to client in real-time
                        async for chunk in response.aiter_bytes():
                            if chunk:
                                yield chunk
                    else:
                        # Send error as SSE format
                        error_msg = f"data: {json.dumps({'error': f'Orchestrator returned status {response.status_code}', 'status': 'failed'})}\n\n"
                        yield error_msg.encode()

        except httpx.TimeoutException:
            print("Error streaming orchestrator logs: Request to orchestrator timed out")
            error_msg = f"data: {json.dumps({'error': 'Request to orchestrator timed out', 'status': 'failed'})}\n\n"
            yield error_msg.encode()
        except httpx.RequestError as e:
            print(f"Error streaming orchestrator logs: {str(e)}")
            error_msg = f"data: {json.dumps({'error': 'Request error occurred', 'status': 'failed'})}\n\n"
            yield error_msg.encode()
        except Exception as e:
            print(f"Error streaming orchestrator logs: {str(e)}")
            error_msg = f"data: {json.dumps({'error': 'Unexpected error occurred', 'status': 'failed'})}\n\n"
            yield error_msg.encode()

    return StreamingResponse(
        stream_logs(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Content-Type": "text/event-stream",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/check-status")
async def check_remote_jobs_status(request: Request):
    """
    Simple endpoint to check and update status of REMOTE jobs in LAUNCHING state.
    This endpoint can be called by the frontend and forwards authentication.
    """
    try:
        # Get all REMOTE jobs in LAUNCHING state across all experiments
        import transformerlab.services.experiment_service as experiment_service

        launching_remote_jobs = []

        # Get all experiments and check for REMOTE jobs in LAUNCHING state
        experiments = experiment_service.experiment_get_all()
        for exp in experiments:
            # Avoid errors of broken migrations in experiments
            if "id" not in exp:
                continue
            exp_jobs = job_service.jobs_get_all(exp["id"], type="REMOTE", status="LAUNCHING")
            launching_remote_jobs.extend(exp_jobs)

        if not launching_remote_jobs:
            return {"message": "No REMOTE jobs in LAUNCHING state", "updated_jobs": [], "status": "success"}

        updated_jobs = []
        print(f"Checking {len(launching_remote_jobs)} REMOTE jobs in LAUNCHING state")

        for job in launching_remote_jobs:
            job_id = job["id"]
            job_data = job.get("job_data", {})
            cluster_name = job_data.get("cluster_name")

            if not cluster_name:
                print(f"Warning: Job {job_id} has no cluster_name in job_data")
                continue

            # Check the status of jobs on this cluster using the actual request
            status_response = await check_remote_job_status(request, cluster_name)

            if status_response["status"] == "success":
                orchestrator_data = status_response["data"]
                jobs_on_cluster = orchestrator_data.get("jobs", [])

                # Check if all jobs on the cluster are in a terminal state (SUCCEEDED or FAILED)
                all_jobs_finished = True
                for cluster_job in jobs_on_cluster:
                    job_status = cluster_job.get("status", "")
                    # Check for both the enum format and plain string format
                    if job_status not in ["JobStatus.SUCCEEDED", "JobStatus.FAILED", "SUCCEEDED", "FAILED"]:
                        all_jobs_finished = False
                        break

                if all_jobs_finished and jobs_on_cluster:
                    # All jobs on the cluster are finished, mark our LAUNCHING job as COMPLETE
                    await job_update_status(job_id, "COMPLETE", experiment_id=job["experiment_id"])
                    updated_jobs.append(
                        {
                            "job_id": job_id,
                            "cluster_name": cluster_name,
                            "status": "COMPLETE",
                            "message": "All jobs on cluster completed",
                        }
                    )
                else:
                    # Jobs are still running on the cluster
                    updated_jobs.append(
                        {
                            "job_id": job_id,
                            "cluster_name": cluster_name,
                            "status": "LAUNCHING",
                            "message": "Jobs still running on cluster",
                        }
                    )
            else:
                print(
                    f"Error checking status for job {job_id} on cluster {cluster_name}: {status_response.get('message', 'Unknown error')}"
                )

        return {
            "status": "success",
            "updated_jobs": updated_jobs,
            "message": f"Checked {len(launching_remote_jobs)} REMOTE jobs in LAUNCHING state",
        }

    except Exception as e:
        print(f"Error checking remote job status: {str(e)}")
        return {"status": "error", "message": "Error checking remote job status"}


@router.get("/instances-status")
async def get_instances_status(request: Request):
    """
    Get the status of all instances from the GPU orchestrator.
    Forwards authentication and cookies to the orchestrator.
    """
    # Validate environment variables
    result = validate_gpu_orchestrator_env_vars()
    gpu_orchestrator_url, gpu_orchestrator_port = result
    if isinstance(gpu_orchestrator_url, dict):
        return gpu_orchestrator_url  # Error response
    elif isinstance(gpu_orchestrator_port, dict):
        return gpu_orchestrator_port  # Error response

    # Build the instances status endpoint URL
    instances_url = f"{gpu_orchestrator_url}:{gpu_orchestrator_port}/api/v1/instances/status"

    try:
        async with httpx.AsyncClient() as client:
            # Build headers: forward incoming Authorization header
            outbound_headers = {"Content-Type": "application/json"}
            incoming_auth = request.headers.get("AUTHORIZATION")
            if incoming_auth:
                outbound_headers["AUTHORIZATION"] = incoming_auth

            response = await client.get(instances_url, headers=outbound_headers, cookies=request.cookies, timeout=30.0)

            if response.status_code == 200:
                data = response.json()
                # Strip "ClusterStatus." prefix from status field
                if "clusters" in data:
                    for cluster in data["clusters"]:
                        if "status" in cluster and isinstance(cluster["status"], str):
                            cluster["status"] = cluster["status"].replace("ClusterStatus.", "")

                return {
                    "status": "success",
                    "data": data,
                    "message": "Instance status retrieved successfully",
                }
            else:
                return {
                    "status": "error",
                    "message": f"Orchestrator returned status {response.status_code}: {response.text}",
                }

    except httpx.TimeoutException:
        return {"status": "error", "message": "Request to orchestrator timed out"}
    except httpx.RequestError:
        return {"status": "error", "message": "Request error occurred"}
    except Exception as e:
        print(f"Error getting instances status: {str(e)}")
        return {"status": "error", "message": "Unexpected error occurred"}
