"""
The Entrypoint File for Transformer Lab's API Server.
"""

import os
import argparse
import asyncio

import json
import signal
import subprocess
from contextlib import asynccontextmanager
import sys
from werkzeug.utils import secure_filename

import fastapi
import httpx

# Using torch to test for CUDA and MPS support.
import uvicorn
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from dotenv import load_dotenv

load_dotenv()


from fastchat.constants import (  # noqa: E402
    ErrorCode,
)
from fastchat.protocol.openai_api_protocol import (  # noqa: E402
    ErrorResponse,
)

from transformerlab.services.experiment_service import experiment_get  # noqa: E402
from transformerlab.services.job_service import job_create, job_get, job_update_status  # noqa: E402
from transformerlab.services.experiment_init import (  # noqa: E402
    seed_default_experiments,
    cancel_in_progress_jobs,
    seed_default_admin_user,
)
import transformerlab.db.session as db  # noqa: E402

from transformerlab.shared.ssl_utils import ensure_persistent_self_signed_cert  # noqa: E402
from transformerlab.routers import (  # noqa: E402
    data,
    model,
    serverinfo,
    train,
    plugins,
    evals,
    config,
    tasks,
    prompts,
    tools,
    batched_prompts,
    recipes,
    teams,
    compute_provider,
    auth,
    api_keys,
    quota,
)
from transformerlab.routers.auth import get_user_and_team  # noqa: E402
import torch  # noqa: E402

try:
    from pynvml import nvmlShutdown  # noqa: E402

    HAS_AMD = False
except Exception:
    from pyrsmi import rocml  # noqa: E402

    HAS_AMD = True
from transformerlab import fastchat_openai_api  # noqa: E402
from transformerlab.routers.experiment import experiment  # noqa: E402
from transformerlab.routers.experiment import workflows  # noqa: E402
from transformerlab.routers.experiment import jobs  # noqa: E402
from transformerlab.shared import shared  # noqa: E402
from transformerlab.shared import galleries  # noqa: E402
from lab.dirs import get_workspace_dir  # noqa: E402
from lab import dirs as lab_dirs  # noqa: E402
from transformerlab.shared import dirs  # noqa: E402
from transformerlab.db.filesystem_migrations import (  # noqa: E402
    migrate_datasets_table_to_filesystem,  # noqa: E402
    migrate_models_table_to_filesystem,  # noqa: E402
    migrate_tasks_table_to_filesystem,  # noqa: E402
    migrate_job_and_experiment_to_filesystem,  # noqa: E402
)
from transformerlab.shared.request_context import set_current_org_id  # noqa: E402
from lab.dirs import set_organization_id as lab_set_org_id  # noqa: E402
from lab import storage  # noqa: E402
from transformerlab.shared.remote_workspace import validate_cloud_credentials  # noqa: E402


# The following environment variable can be used by other scripts
# who need to connect to the root DB, for example
os.environ["LLM_LAB_ROOT_PATH"] = dirs.ROOT_DIR
# environment variables that start with _ are
# used internally to set constants that are shared between separate processes. They are not meant to be
# to be overriden by the user.
os.environ["_TFL_SOURCE_CODE_DIR"] = dirs.TFL_SOURCE_CODE_DIR


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Docs on lifespan events: https://fastapi.tiangolo.com/advanced/events/"""
    # Do the following at API Startup:
    print_launch_message()
    # Initialize directories early
    from transformerlab.shared import dirs as shared_dirs

    await shared_dirs.initialize_dirs()

    # Set the temporary image directory for transformerlab (computed async)
    temp_image_dir = storage.join(await get_workspace_dir(), "temp", "images")
    os.environ["TLAB_TEMP_IMAGE_DIR"] = str(temp_image_dir)
    # Validate cloud credentials early - fail fast if missing
    validate_cloud_credentials()
    await galleries.update_gallery_cache()
    spawn_fastchat_controller_subprocess()
    await db.init()  # This now runs Alembic migrations internally
    print("✅ SEED DATA")
    # Initialize experiments
    await seed_default_experiments()
    # Seed default admin user
    await seed_default_admin_user()
    # Cancel any running jobs
    await cancel_in_progress_jobs()

    # Create buckets for all existing teams if TFL_API_STORAGE_URI is enabled
    if os.getenv("TFL_API_STORAGE_URI"):
        print("✅ CHECKING BUCKETS FOR EXISTING TEAMS")
        try:
            from transformerlab.db.session import async_session
            from transformerlab.shared.remote_workspace import create_buckets_for_all_teams

            async with async_session() as session:
                success_count, failure_count, error_messages = await create_buckets_for_all_teams(
                    session, profile_name="transformerlab-s3"
                )
                if success_count > 0:
                    print(f"✅ Created/verified buckets for {success_count} team(s)")
                if failure_count > 0:
                    print(f"⚠️  Failed to create buckets for {failure_count} team(s)")
                    for error in error_messages:
                        print(f"   - {error}")
        except Exception as e:
            print(f"⚠️  Error creating buckets for existing teams: {e}")

    if "--reload" in sys.argv:
        await install_all_plugins()
    # run the migrations
    asyncio.create_task(migrate_models_table_to_filesystem())
    asyncio.create_task(migrate_datasets_table_to_filesystem())
    asyncio.create_task(migrate_job_and_experiment_to_filesystem())
    asyncio.create_task(migrate_tasks_table_to_filesystem())

    if not os.getenv("TFL_API_STORAGE_URI"):
        asyncio.create_task(run_over_and_over())
    print("FastAPI LIFESPAN: 🏁 🏁 🏁 Begin API Server 🏁 🏁 🏁", flush=True)
    yield
    # Do the following at API Shutdown:
    await db.close()
    # Run the clean up function
    cleanup_at_exit()
    print("FastAPI LIFESPAN: Complete")


async def run_over_and_over():
    """Every three seconds, check for new jobs to run."""
    while True:
        await asyncio.sleep(3)
        await jobs.start_next_job()
        await workflows.start_next_step_in_workflow()


description = "Transformerlab API helps you do awesome stuff. 🚀"
tags_metadata = [
    {
        "name": "datasets",
        "description": "Actions used to manage the datasets used by Transformer Lab.",
    },
    {"name": "train", "description": "Actions for training models."},
    {"name": "experiment", "descriptions": "Actions for managinging experiments."},
    {
        "name": "model",
        "description": "Actions for interacting with huggingface models",  # TODO: is this true?
    },
    {
        "name": "serverinfo",
        "description": "Actions for interacting with the Transformer Lab server.",
    },
]

if os.getenv("SENTRY_DSN"):
    # Import only if SENTRY_DSN is set.
    # This way we can avoid making sentry_sdk a mandatory dependency.
    import sentry_sdk

    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        # integrations=[FastApiIntegration()],
        # Enable sending logs to Sentry
        enable_logs=True,
        # Set traces_sample_rate to 1.0 to capture 100%
        # of transactions for tracing.
        traces_sample_rate=1.0,
        # Set profile_session_sample_rate to 1.0 to profile 100%
        # of profile sessions.
        profile_session_sample_rate=1.0,
        # Set profile_lifecycle to "trace" to automatically
        # run the profiler on when there is an active transaction
        profile_lifecycle="trace",
    )

app = fastapi.FastAPI(
    title="Transformerlab API",
    description=description,
    summary="An API for working with LLMs.",
    version="0.0.1",
    terms_of_service="http://example.com/terms/",
    license_info={
        "name": "Apache 2.0",
        "url": "https://www.apache.org/licenses/LICENSE-2.0.html",
    },
    lifespan=lifespan,
    openapi_tags=tags_metadata,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Middleware to set context var for organization id per request (multitenant)
# Determines team_id from X-Team-Id header or API key, and sets context early.
@app.middleware("http")
async def set_org_context(request: Request, call_next):
    try:
        org_id = None

        # First check X-Team-Id header (fastest path)
        org_id = request.headers.get("X-Team-Id")

        # If no X-Team-Id, try to determine from API key
        if not org_id:
            from transformerlab.shared.api_key_auth import determine_team_id_from_request
            from transformerlab.db.session import async_session

            # Create a session for the middleware check
            async with async_session() as session:
                try:
                    org_id = await determine_team_id_from_request(request, session)
                except Exception:
                    # If determination fails, leave as None (will be handled by dependency)
                    pass

        set_current_org_id(org_id)
        if lab_set_org_id is not None:
            lab_set_org_id(org_id)
        response = await call_next(request)
        return response
    finally:
        # Clear at end of request
        set_current_org_id(None)
        if lab_set_org_id is not None:
            lab_set_org_id(None)


def create_error_response(code: int, message: str) -> JSONResponse:
    return JSONResponse(ErrorResponse(message=message, code=code).model_dump(), status_code=400)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return create_error_response(ErrorCode.VALIDATION_TYPE_ERROR, str(exc))


app.include_router(model.router, dependencies=[Depends(get_user_and_team)])
app.include_router(serverinfo.router, dependencies=[Depends(get_user_and_team)])
app.include_router(train.router, dependencies=[Depends(get_user_and_team)])
app.include_router(data.router, dependencies=[Depends(get_user_and_team)])
app.include_router(experiment.router, dependencies=[Depends(get_user_and_team)])
app.include_router(plugins.router, dependencies=[Depends(get_user_and_team)])
app.include_router(evals.router, dependencies=[Depends(get_user_and_team)])
app.include_router(jobs.router, dependencies=[Depends(get_user_and_team)])
app.include_router(tasks.router, dependencies=[Depends(get_user_and_team)])
app.include_router(config.router, dependencies=[Depends(get_user_and_team)])
app.include_router(prompts.router, dependencies=[Depends(get_user_and_team)])
app.include_router(tools.router, dependencies=[Depends(get_user_and_team)])
app.include_router(recipes.router, dependencies=[Depends(get_user_and_team)])
app.include_router(batched_prompts.router, dependencies=[Depends(get_user_and_team)])
app.include_router(fastchat_openai_api.router, dependencies=[Depends(get_user_and_team)])
app.include_router(teams.router, dependencies=[Depends(get_user_and_team)])
app.include_router(compute_provider.router)
app.include_router(auth.router)
app.include_router(api_keys.router)
app.include_router(quota.router)

controller_process = None
worker_process = None


def spawn_fastchat_controller_subprocess():
    global controller_process
    controller_log_path = storage.join(dirs.FASTCHAT_LOGS_DIR, "controller.log")
    # Note: subprocess requires a local file handle, so we use open() directly
    # but construct the path using storage.join for workspace consistency
    logfile = open(controller_log_path, "w")
    port = "21001"

    controller_process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "fastchat.serve.controller",
            "--port",
            port,
            "--log-file",
            controller_log_path,
        ],
        stdout=logfile,
        stderr=logfile,
    )
    print(f"Started fastchat controller on port {port}")


async def install_all_plugins():
    all_plugins = await plugins.list_plugins()
    print("Re-copying all plugin files from source to workspace")
    for plugin in all_plugins:
        plugin_id = plugin["uniqueId"]
        print(f"Refreshing workspace plugin: {plugin_id}")
        await plugins.copy_plugin_files_to_workspace(plugin_id)


# @app.get("/")
# async def home():
#     return {"msg": "Welcome to Transformer Lab!"}


@app.get("/server/controller_start", tags=["serverinfo"])
async def server_controler_start():
    spawn_fastchat_controller_subprocess()
    return {"message": "OK"}


@app.get("/server/controller_stop", tags=["serverinfo"])
async def server_controller_stop():
    controller_process.terminate()
    return {"message": "OK"}


def set_worker_process_id(process):
    global worker_process
    worker_process = process


@app.get("/server/worker_start", tags=["serverinfo"])
async def server_worker_start(
    model_name: str,
    adaptor: str = "",
    model_filename: str | None = None,
    model_architecture: str = "",
    eight_bit: bool = False,
    cpu_offload: bool = False,
    inference_engine: str = "default",
    experiment_id: str = None,
    inference_params: str = "",
    request: Request = None,
):
    # the first priority for inference params should be the inference params passed in, then the inference parameters in the experiment
    # first we check to see if any inference params were passed in
    if inference_params != "":
        try:
            inference_params = json.loads(inference_params)
        except json.JSONDecodeError:
            return {"status": "error", "message": "malformed inference params passed"}
    # then we check to see if we are an experiment
    elif experiment_id is not None:
        try:
            experiment = await experiment_get(experiment_id)
            experiment_config = (
                experiment["config"]
                if isinstance(experiment["config"], dict)
                else json.loads(experiment["config"] or "{}")
            )
            try:
                inference_params = experiment_config["inferenceParams"]
            except KeyError:
                print("No inference params found in experiment config, using empty dict")
                inference_params = {}
            if not isinstance(inference_params, dict):
                # if inference_params is a string, we need to parse it as JSON
                inference_params = json.loads(inference_params)
        except json.JSONDecodeError:
            return {"status": "error", "message": "malformed inference params passed"}
    # if neither are true, then we have an issue
    else:
        return {"status": "error", "message": "malformed inference params passed"}

    engine = inference_engine
    if "inferenceEngine" in inference_params and engine == "default":
        engine = inference_params.get("inferenceEngine")

    if engine == "default":
        return {"status": "error", "message": "no inference engine specified"}

    inference_engine = engine

    model_architecture = model_architecture

    plugin_name = inference_engine
    plugin_location = await lab_dirs.plugin_dir_by_name(plugin_name)

    model = model_name
    if model_filename is not None and model_filename != "":
        model = model_filename

    if adaptor != "":
        # Resolve per-request workspace if multitenant
        workspace_dir = await get_workspace_dir()
        adaptor = f"{workspace_dir}/adaptors/{secure_filename(model)}/{adaptor}"

    params = [
        dirs.PLUGIN_HARNESS,
        "--plugin_dir",
        plugin_location,
        "--model-path",
        model,
        "--model-architecture",
        model_architecture,
        "--adaptor-path",
        adaptor,
        "--parameters",
        json.dumps(inference_params),
    ]

    job_id = await job_create(type="LOAD_MODEL", status="STARTED", job_data="{}", experiment_id=experiment_id)

    print("Loading plugin loader instead of default worker")

    from lab.dirs import get_global_log_path

    async with await storage.open(await get_global_log_path(), "a") as global_log:
        await global_log.write(f"🏃 Loading Inference Server for {model_name} with {inference_params}\n")

    # Pass organization_id as environment variable to subprocess
    from transformerlab.shared.request_context import get_current_org_id

    org_id = get_current_org_id()
    subprocess_env = {}
    if org_id:
        subprocess_env["_TFL_ORG_ID"] = org_id

    process = await shared.async_run_python_daemon_and_update_status(
        python_script=params,
        job_id=job_id,
        begin_string="Application startup complete.",
        set_process_id_function=set_worker_process_id,
        env=subprocess_env,
    )
    exitcode = process.returncode
    if exitcode == 99:
        from lab.dirs import get_global_log_path

        async with await storage.open(await get_global_log_path(), "a") as global_log:
            await global_log.write(
                "GPU (CUDA) Out of Memory: Please try a smaller model or a different inference engine. Restarting the server may free up resources.\n"
            )
        return {
            "status": "error",
            "message": "GPU (CUDA) Out of Memory: Please try a smaller model or a different inference engine. Restarting the server may free up resources.",
        }
    if exitcode is not None and exitcode != 0:
        from lab.dirs import get_global_log_path

        async with await storage.open(await get_global_log_path(), "a") as global_log:
            await global_log.write(f"Error loading model: {model_name} with exit code {exitcode}\n")
        job = await job_get(job_id)
        error_msg = None
        if job and job.get("job_data"):
            error_msg = job["job_data"].get("error_msg")
        if not error_msg:
            error_msg = f"Exit code {exitcode}"
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}
    from lab.dirs import get_global_log_path

    async with await storage.open(await get_global_log_path(), "a") as global_log:
        await global_log.write(f"Model loaded successfully: {model_name}\n")
    return {"status": "success", "job_id": job_id}


@app.get("/server/worker_stop", tags=["serverinfo"])
async def server_worker_stop():
    global worker_process
    print(f"Stopping worker process: {worker_process}")
    if worker_process is not None:
        try:
            os.kill(worker_process.pid, signal.SIGTERM)
            worker_process = None

        except Exception as e:
            print(f"Error stopping worker process: {e}")
    # check if there is a file called worker.pid, if so kill the related process:
    if os.path.isfile("worker.pid"):
        with open("worker.pid", "r") as f:
            pids = [line.strip() for line in f if line.strip()]
            for pid in pids:
                print(f"Killing worker process with PID: {pid}")
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except ProcessLookupError:
                    print(f"Process {pid} no longer exists, skipping")
                except Exception as e:
                    print(f"Error killing process {pid}: {e}")
        # delete the worker.pid file:
        os.remove("worker.pid")

    # Wait a bit for the worker to fully terminate
    await asyncio.sleep(1)

    # Refresh the controller to remove the stopped worker immediately
    try:
        async with httpx.AsyncClient() as client:
            await client.post(fastchat_openai_api.app_settings.controller_address + "/refresh_all_workers")
    except Exception as e:
        print(f"Error refreshing controller after stopping worker: {e}")

    return {"message": "OK"}


@app.get("/server/worker_healthz", tags=["serverinfo"])
async def server_worker_health(request: Request):
    models = []
    result = []
    try:
        models = await fastchat_openai_api.show_available_models()
    except httpx.HTTPError as exc:
        print(f"HTTP Exception for {exc.request.url} - {exc}")
        raise HTTPException(status_code=503, detail="No worker")

    # We create a new object with JUST the id of the models
    # we do this so that we get a clean object that can be used
    # by react to see if the object changed. If we returned the whole
    # model object, you would see some changes in the object that are
    # not relevant to the user -- triggering renders in React
    for model_data in models.data:
        result.append({"id": model_data.id})

    return result


@app.get("/healthz")
async def healthz():
    """
    Health check endpoint to verify server status and mode.
    """
    tfl_api_storage_uri = os.getenv("TFL_API_STORAGE_URI", "")

    # Determine mode: s3 or local
    if tfl_api_storage_uri:
        mode = "s3"
    else:
        mode = "local"

    return {
        "message": "OK",
        "mode": mode,
    }


# Add an endpoint that serves the static files in the ~/.transformerlab/webapp directory:
app.mount("/", StaticFiles(directory=dirs.STATIC_FILES_DIR, html=True), name="application")


def cleanup_at_exit():
    if controller_process is not None:
        print("🔴 Quitting spawned controller.")
        controller_process.kill()
    if worker_process is not None:
        print("🔴 Quitting spawned workers.")
        try:
            worker_process.kill()
        except ProcessLookupError:
            print(f"Process {worker_process.pid} doesn't exist so nothing to kill")
    if os.path.isfile("worker.pid"):
        with open("worker.pid", "r") as f:
            pids = [line.strip() for line in f if line.strip()]
            for pid in pids:
                try:
                    os.kill(int(pid), signal.SIGTERM)
                except ProcessLookupError:
                    print(f"Process {pid} doesn't exist so nothing to kill")
                except Exception as e:
                    print(f"Error killing process {pid}: {e}")
            os.remove("worker.pid")
    # Perform NVML Shutdown if CUDA is available
    if torch.cuda.is_available():
        try:
            print("🔴 Releasing allocated GPU Resources")
            if not HAS_AMD:
                nvmlShutdown()
            else:
                rocml.smi_shutdown()
        except Exception as e:
            print(f"Error shutting down NVML: {e}")
    print("🔴 Quitting Transformer Lab API server.")


def parse_args():
    parser = argparse.ArgumentParser(description="FastChat ChatGPT-Compatible RESTful API server.")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="host name")
    parser.add_argument("--port", type=int, default=8338, help="port number")
    parser.add_argument("--allow-credentials", action="store_true", help="allow credentials")
    parser.add_argument("--allowed-origins", type=json.loads, default=["*"], help="allowed origins")
    parser.add_argument("--allowed-methods", type=json.loads, default=["*"], help="allowed methods")
    parser.add_argument("--allowed-headers", type=json.loads, default=["*"], help="allowed headers")
    parser.add_argument("--auto_reinstall_plugins", type=bool, default=False, help="auto reinstall plugins")
    parser.add_argument("--https", action="store_true", help="Serve the API over HTTPS with a self-signed cert.")

    return parser.parse_args()


def print_launch_message():
    # Print the welcome message to the CLI
    with open(os.path.join(os.path.dirname(__file__), "transformerlab/launch_header_text.txt"), "r") as f:
        text = f.read()
        shared.print_in_rainbow(text)
    print("https://lab.cloud\nhttps://github.com/transformerlab/transformerlab-api\n")


def run():
    args = parse_args()

    print(f"args: {args}")
    if args.allowed_origins == ["*"]:
        args.allowed_credentials = False

    app.add_middleware(
        CORSMiddleware,
        allow_origins=args.allowed_origins,
        allow_credentials=args.allow_credentials,
        allow_methods=args.allowed_methods,
        allow_headers=args.allowed_headers,
    )

    if args.https:
        import asyncio

        cert_path, key_path = asyncio.run(ensure_persistent_self_signed_cert())
        uvicorn.run(
            "api:app", host=args.host, port=args.port, log_level="warning", ssl_certfile=cert_path, ssl_keyfile=key_path
        )
    else:
        uvicorn.run("api:app", host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    run()
