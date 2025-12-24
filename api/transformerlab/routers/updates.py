"""Update management endpoints for Transformer Lab."""

import asyncio
import json
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException

from transformerlab.routers.auth import require_team_owner
from lab.dirs import get_workspace_dir, HOME_DIR
from lab import storage
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator

router = APIRouter(prefix="/server/updates", tags=["updates"])

# GitHub repository for Transformer Lab
GITHUB_REPO = "transformerlab/transformerlab-app"
GITHUB_API_BASE = "https://api.github.com/repos"


def get_update_settings_file() -> str:
    """Get the path to the update.json file in team workspace."""
    workspace_dir = get_workspace_dir()
    return storage.join(workspace_dir, "update.json")


def read_update_settings() -> dict:
    """Read update settings from workspace update.json file."""
    update_file = get_update_settings_file()

    default_settings = {
        "last_update_version": None,
        "update_in_progress": False,
        "update_job_id": None,
    }

    if storage.exists(update_file):
        try:
            with storage.open(update_file, "r") as f:
                settings = json.load(f)
                return {**default_settings, **settings}
        except Exception as e:
            print(f"Error reading update.json: {e}")

    return default_settings


def write_update_settings(settings: dict) -> None:
    """Write update settings to workspace update.json file."""
    update_file = get_update_settings_file()
    workspace_dir = get_workspace_dir()

    storage.makedirs(workspace_dir, exist_ok=True)
    with storage.open(update_file, "w") as f:
        json.dump(settings, f, indent=2)


async def get_latest_version() -> Optional[str]:
    """Get the latest version from GitHub releases."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GITHUB_API_BASE}/{GITHUB_REPO}/releases/latest",
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()
            return data.get("tag_name")  # e.g., "v0.27.6"
    except Exception as e:
        print(f"Error fetching latest version from GitHub: {e}")
        return None


def get_current_version() -> str:
    """Get the current installed version."""
    # Try reading from LATEST_VERSION file
    version_file = storage.join(HOME_DIR, "src", "LATEST_VERSION")
    if storage.exists(version_file):
        try:
            with storage.open(version_file, "r") as f:
                version = f.read().strip()
                if version:
                    return version
        except Exception:
            pass

    # Fallback: try reading from package.json in root
    try:
        package_json_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
            "..",
            "package.json",
        )
        if os.path.exists(package_json_path):
            with open(package_json_path, "r") as f:
                package_data = json.load(f)
                version = package_data.get("version", "unknown")
                return f"v{version}" if not version.startswith("v") else version
    except Exception:
        pass

    return "unknown"


@router.get("/check")
async def check_for_updates(
    owner_info=Depends(require_team_owner),
):
    """Check for available updates. Returns latest version info. Only team owners can check."""
    current_version = get_current_version()
    latest_version = await get_latest_version()

    if not latest_version:
        raise HTTPException(status_code=503, detail="Failed to fetch latest version from GitHub")

    available = latest_version != current_version

    return {
        "available": available,
        "current_version": current_version,
        "latest_version": latest_version,
    }


@router.get("/settings")
async def get_update_settings(
    owner_info=Depends(require_team_owner),
):
    """Get update settings from team workspace. Only team owners can view."""
    settings = read_update_settings()

    return {
        "last_update_version": settings.get("last_update_version"),
        "update_in_progress": settings.get("update_in_progress", False),
    }


@router.get("/version")
async def get_current_version_endpoint(
    owner_info=Depends(require_team_owner),
):
    """Get current installed version. Only team owners can view."""
    version = get_current_version()
    return {"version": version}


async def watch_update_log_file(log_file: str) -> AsyncGenerator[str, None]:
    """Watch the update log file and yield new lines as they're written."""
    from watchfiles import awatch
    import json

    # Create the file if it doesn't exist
    if not storage.exists(log_file):
        workspace_dir = get_workspace_dir()
        storage.makedirs(workspace_dir, exist_ok=True)
        with storage.open(log_file, "w") as f:
            f.write("")

    # Check if it's a remote filesystem (can't use awatch)
    is_remote_path = log_file.startswith(("s3://", "gs://", "abfs://", "gcs://"))

    last_position = 0
    # Start from beginning to show existing logs
    if storage.exists(log_file):
        try:
            with storage.open(log_file, "r") as f:
                content = f.read()
                if content:
                    lines = content.split("\n")
                    new_lines = [line for line in lines if line.strip()]
                    # Send existing logs line by line
                    for line in new_lines:
                        yield f"data: {json.dumps([line])}\n\n"
                if not is_remote_path:
                    last_position = f.tell()
                else:
                    last_position = len(content.encode("utf-8")) if content else 0
        except Exception as e:
            print(f"Error reading initial log content: {e}")

    if is_remote_path:
        # For remote storage, use polling
        while True:
            try:
                # Check if update is still in progress
                settings = read_update_settings()
                if not settings.get("update_in_progress", False):
                    # Update finished, check for any remaining content
                    with storage.open(log_file, "r") as f:
                        full_content = f.read()
                        current_size = len(full_content.encode("utf-8"))
                        if current_size > last_position:
                            new_content = full_content[last_position:]
                            lines = new_content.split("\n")
                            for line in lines:
                                if line.strip():
                                    yield f"data: {json.dumps([line])}\n\n"
                        break

                # Read new content
                with storage.open(log_file, "r") as f:
                    full_content = f.read()
                    current_size = len(full_content.encode("utf-8"))
                    if current_size > last_position:
                        new_content = full_content[last_position:]
                        lines = new_content.split("\n")
                        for line in lines:
                            if line.strip():
                                yield f"data: {json.dumps([line])}\n\n"
                        last_position = current_size

                await asyncio.sleep(0.2)  # Poll every 200ms
            except Exception as e:
                print(f"Error watching update log file: {e}")
                await asyncio.sleep(1)
    else:
        # For local filesystem, use awatch for real-time file watching
        try:
            async for changes in awatch(log_file, force_polling=True, poll_delay_ms=100):
                # Check if update is still in progress
                settings = read_update_settings()
                if not settings.get("update_in_progress", False):
                    # Update finished, check for any remaining content
                    with storage.open(log_file, "r") as f:
                        f.seek(last_position)
                        remaining = f.read()
                        if remaining:
                            lines = remaining.split("\n")
                            for line in lines:
                                if line.strip():
                                    yield f"data: {json.dumps([line])}\n\n"
                    break

                # Read new content
                with storage.open(log_file, "r") as f:
                    f.seek(last_position)
                    new_lines = f.readlines()
                    for line in new_lines:
                        line = line.rstrip("\n\r")
                        if line.strip():
                            yield f"data: {json.dumps([line])}\n\n"
                    last_position = f.tell()
        except Exception as e:
            print(f"Error watching update log file with awatch: {e}")
            # Fallback to polling
            while True:
                try:
                    settings = read_update_settings()
                    if not settings.get("update_in_progress", False):
                        break

                    with storage.open(log_file, "r") as f:
                        f.seek(last_position)
                        new_content = f.read()
                        if new_content:
                            lines = new_content.split("\n")
                            for line in lines:
                                if line.strip():
                                    yield f"data: {json.dumps([line])}\n\n"
                            last_position = f.tell()

                    await asyncio.sleep(0.2)
                except Exception as e2:
                    print(f"Error in fallback polling: {e2}")
                    await asyncio.sleep(1)


@router.get("/status")
async def get_update_status(
    owner_info=Depends(require_team_owner),
):
    """Get current update status. Only team owners can view."""
    settings = read_update_settings()
    in_progress = settings.get("update_in_progress", False)

    return {
        "in_progress": in_progress,
        "status": "idle" if not in_progress else "in_progress",
        "progress": 0,
    }


@router.get("/stream_logs")
async def stream_update_logs(
    owner_info=Depends(require_team_owner),
):
    """Stream update logs in real-time using Server-Sent Events. Only team owners can view."""
    from transformerlab.services.update_service import get_update_log_file

    log_file = get_update_log_file()

    try:
        return StreamingResponse(
            watch_update_log_file(log_file),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            },
        )
    except Exception as e:
        print(f"Error streaming update logs: {e}")
        return StreamingResponse(
            iter([f"data: {json.dumps(['Error: An internal error has occurred!'])}\n\n"]),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            },
        )


@router.post("/trigger")
async def trigger_update(
    owner_info=Depends(require_team_owner),
):
    """Manually trigger an update. Only team owners can trigger."""
    from transformerlab.services.update_service import perform_update

    settings = read_update_settings()

    if settings.get("update_in_progress"):
        raise HTTPException(status_code=400, detail="Update already in progress")

    # Start update job in background
    import asyncio

    asyncio.create_task(perform_update())

    return {
        "status": "started",
        "message": "Update process started in background",
    }
