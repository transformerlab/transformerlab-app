"""
The Entrypoint File for Transformer Lab's API Server.
"""

import os
import argparse
import re

import json
from contextlib import asynccontextmanager
import sys

import fastapi

import uvicorn
from fastapi import FastAPI, Request, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

import logging

from dotenv import load_dotenv

load_dotenv()

# Allow the log level for all transformerlab.* loggers to be controlled via
# an env var.  Set TLAB_LOG_LEVEL=DEBUG to enable debug output across the
# entire application (e.g. sweep-status cycle timings).  Defaults to WARNING
# so debug/info messages are silent unless explicitly requested.
logging.getLogger("transformerlab").setLevel(
    getattr(logging, os.getenv("TLAB_LOG_LEVEL", "WARNING").upper(), logging.WARNING)
)

from fastchat.constants import (  # noqa: E402
    ErrorCode,
)
from fastchat.protocol.openai_api_protocol import (  # noqa: E402
    ErrorResponse,
)

from transformerlab.services.experiment_init import (  # noqa: E402
    seed_default_experiments,
)
import transformerlab.db.session as db  # noqa: E402

from transformerlab.shared.ssl_utils import ensure_persistent_self_signed_cert  # noqa: E402
from transformerlab.routers import (  # noqa: E402
    data,
    model,
    serverinfo,
    plugins,
    config,
    teams,
    compute_provider,
    auth,
    api_keys,
    quota,
    ssh_keys,
    trackio,
)
from transformerlab.routers.auth import get_user_and_team  # noqa: E402


from transformerlab import fastchat_openai_api  # noqa: E402
from transformerlab.routers.experiment import experiment  # noqa: E402
from transformerlab.routers.experiment import jobs  # noqa: E402
from transformerlab.shared import shared  # noqa: E402
from transformerlab.shared import galleries  # noqa: E402
from lab.dirs import get_workspace_dir  # noqa: E402
from transformerlab.shared import dirs  # noqa: E402
from lab.dirs import set_organization_id as lab_set_org_id  # noqa: E402
from lab import storage  # noqa: E402
from transformerlab.shared.remote_workspace import validate_cloud_credentials  # noqa: E402
from transformerlab.services.sweep_status_service import start_sweep_status_worker, stop_sweep_status_worker  # noqa: E402
from transformerlab.services.cache_service import setup as setup_cache  # noqa: E402


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

    # Configure the response cache (backend set via CACHE_URL in cache_service.py)
    setup_cache()
    print("✅ CACHE ENABLED")

    # Set the temporary image directory for transformerlab (computed async)
    temp_image_dir = storage.join(await get_workspace_dir(), "temp", "images")
    os.environ["TLAB_TEMP_IMAGE_DIR"] = str(temp_image_dir)
    # Validate cloud credentials early - fail fast if missing
    validate_cloud_credentials()
    await galleries.update_gallery_cache()
    await db.init()  # This now runs Alembic migrations internally
    print("✅ SEED DATA")
    # Initialize experiments
    await seed_default_experiments()

    # Create buckets/folders for all existing teams if cloud or localfs storage is enabled
    tfl_remote_storage_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    if tfl_remote_storage_enabled or (os.getenv("TFL_STORAGE_PROVIDER") == "localfs" and os.getenv("TFL_STORAGE_URI")):
        print("✅ CHECKING STORAGE FOR EXISTING TEAMS")
        try:
            from transformerlab.db.session import async_session
            from transformerlab.shared.remote_workspace import create_buckets_for_all_teams

            async with async_session() as session:
                success_count, failure_count, error_messages = await create_buckets_for_all_teams(
                    session, profile_name="transformerlab-s3"
                )
                if success_count > 0:
                    print(f"✅ Created/verified storage for {success_count} team(s)")
                if failure_count > 0:
                    print(f"⚠️  Failed to create storage for {failure_count} team(s)")
                    for error in error_messages:
                        print(f"   - {error}")
        except Exception as e:
            print(f"⚠️  Error creating storage for existing teams: {e}")

    if "--reload" in sys.argv:
        await install_all_plugins()

    # Start background sweep status updater after all startup steps succeed.
    await start_sweep_status_worker()
    # Start background remote job status poller (replaces inline provider polling in check-status).
    from transformerlab.services.remote_job_status_service import (
        start_remote_job_status_worker,
        stop_remote_job_status_worker,
    )
    from transformerlab.services.notification_service import (
        start_notification_worker,
        stop_notification_worker,
    )

    await start_remote_job_status_worker()
    await start_notification_worker()
    print("FastAPI LIFESPAN: 🏁 🏁 🏁 Begin API Server 🏁 🏁 🏁", flush=True)
    yield
    # Do the following at API Shutdown:
    await stop_sweep_status_worker()
    await stop_remote_job_status_worker()
    await stop_notification_worker()
    await db.close()
    # Run the clean up function
    cleanup_at_exit()
    print("FastAPI LIFESPAN: Complete")


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
    from sentry_sdk.integrations.fastapi import FastApiIntegration

    sentry_sdk.init(
        dsn=os.environ["SENTRY_DSN"],
        integrations=[FastApiIntegration()],
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

# CORS configuration
# When using cookies, allow_credentials must be True and allow_origins cannot be ["*"]
# Use FRONTEND_URL env var to specify allowed origins (comma-separated), or default to "*" without credentials
cors_origins_env = os.getenv("FRONTEND_URL", "*")
if cors_origins_env == "*":

    class DynamicCORSMiddleware(CORSMiddleware):
        def is_allowed_origin(self, origin: str) -> bool:
            try:
                return origin.endswith(":8338") or origin.endswith(":1212")
            except Exception:
                return False

    app.add_middleware(
        DynamicCORSMiddleware,
        allow_origins=[],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

else:
    cors_origins = [origin.strip() for origin in cors_origins_env.split(",")]
    cors_credentials = True

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=cors_credentials,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# Middleware to set context var for organization id per request (multitenant)
# Determines team_id from X-Team-Id header or API key, and sets context early.
@app.middleware("http")
async def set_org_context(request: Request, call_next):
    # Avoid any org / DB resolution on lightweight health checks so they
    # remain responsive even if other requests are busy or holding DB locks.
    path = request.url.path
    if path == "/healthz":
        return await call_next(request)

    try:
        # First check X-Team-Id header (fastest path)
        org_id = request.headers.get("X-Team-Id")

        # If no X-Team-Id, try to determine from API key
        if not org_id:
            from transformerlab.services.api_key_auth import determine_team_id_from_request
            from transformerlab.db.session import async_session

            # Create a session for the middleware check
            async with async_session() as session:
                try:
                    org_id = await determine_team_id_from_request(request, session)
                except Exception:
                    # If determination fails, leave as None (will be handled by dependency)
                    pass

        if lab_set_org_id is not None:
            lab_set_org_id(org_id)
        response = await call_next(request)
        return response
    finally:
        # Clear at end of request
        if lab_set_org_id is not None:
            lab_set_org_id(None)


def create_error_response(code: int, message: str) -> JSONResponse:
    return JSONResponse(ErrorResponse(message=message, code=code).model_dump(), status_code=400)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    return create_error_response(ErrorCode.VALIDATION_TYPE_ERROR, str(exc))


app.include_router(model.router, dependencies=[Depends(get_user_and_team)])
app.include_router(serverinfo.router, dependencies=[Depends(get_user_and_team)])
app.include_router(data.router, dependencies=[Depends(get_user_and_team)])
app.include_router(experiment.router, dependencies=[Depends(get_user_and_team)])
app.include_router(plugins.router, dependencies=[Depends(get_user_and_team)])
app.include_router(jobs.router, dependencies=[Depends(get_user_and_team)])
app.include_router(config.router, dependencies=[Depends(get_user_and_team)])
app.include_router(fastchat_openai_api.router)
app.include_router(teams.router, dependencies=[Depends(get_user_and_team)])
app.include_router(compute_provider.router)
app.include_router(auth.router)
app.include_router(api_keys.router)
app.include_router(quota.router)
app.include_router(ssh_keys.router, dependencies=[Depends(get_user_and_team)])
app.include_router(trackio.router, dependencies=[Depends(get_user_and_team)])


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


@app.get("/healthz")
async def healthz():
    """
    Health check endpoint to verify server status and mode.
    """
    # MULTIUSER flag: default to true unless explicitly set to 'false'
    IS_MULTIUSER = os.getenv("MULTIUSER", "true").lower() == "true"
    # Determine mode: multiuser or local
    mode = "multiuser" if IS_MULTIUSER else "local"

    return {
        "message": "OK",
        "mode": mode,
    }


# Middleware to set cache-control headers for static frontend assets.
# index.html is never cached so users always get the latest version,
# while content-hashed JS/CSS files are cached for 1 year.
@app.middleware("http")
async def static_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    # Hashed assets (e.g. main.a1b2c3d4.js, style.e5f6g7h8.css) — cache immutably
    if re.search(r"\.[0-9a-f]{8}\.(js|css)$", path):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    # HTML files — never cache
    elif path == "/" or path.endswith(".html"):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


# Add an endpoint that serves the static files in the ~/.transformerlab/webapp directory:
app.mount("/", StaticFiles(directory=dirs.STATIC_FILES_DIR, html=True), name="application")


def cleanup_at_exit():
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
    print("https://lab.cloud\nhttps://github.com/transformerlab/transformerlab-app\n")


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
