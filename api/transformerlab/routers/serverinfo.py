from watchfiles import awatch
import json
import os
import platform
import asyncio
import sys
import subprocess
import zipfile
import tempfile
from datetime import datetime
from fastapi.responses import StreamingResponse, FileResponse
from fastapi import APIRouter, HTTPException
from typing import AsyncGenerator

import psutil
from lab.dirs import get_global_log_path
from lab import HOME_DIR
from lab import storage
from transformerlab.shared import galleries


def is_wsl():
    try:
        kernel_output = subprocess.check_output(["uname", "-r"], text=True).lower()
        return "microsoft" in kernel_output or "wsl2" in kernel_output
    except subprocess.CalledProcessError:
        return False


IS_WSL_SYSTEM = is_wsl()
if IS_WSL_SYSTEM:
    print("🏄 Running on WSL")


# Read in static system info
system_info = {
    "cpu": platform.machine(),
    "name": platform.node(),
    "platform": platform.platform(),
    "python_version": platform.python_version(),
    "os": platform.system(),
    "os_alias": platform.system_alias(platform.system(), platform.release(), platform.version()),
    "gpu": [],
    "gpu_memory": "",
    "device": "cpu",
    "device_type": "cpu",
    "cuda_version": "n/a",
    "conda_environment": os.environ.get("CONDA_DEFAULT_ENV", "n/a"),
    "conda_prefix": os.environ.get("CONDA_PREFIX", "n/a"),
    "pytorch_version": "n/a",
}

router = APIRouter(prefix="/server", tags=["serverinfo"])


async def get_mac_disk_usage():
    if sys.platform != "darwin":
        return None  # Ensure it only runs on macOS

    try:
        # Run the subprocess asynchronously
        process = await asyncio.create_subprocess_shell(
            "diskutil apfs list | awk '/Capacity In Use By Volumes/'",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if stderr:
            print(f"Error retrieving disk usage: {stderr.decode().strip()}")
            return None

        mac_disk_usage = stdout.decode("utf-8").strip()

        # Extract the numeric value before "B" (Bytes) and convert to int
        if "Capacity In Use By Volumes:" in mac_disk_usage:
            mac_disk_usage_cleaned = int(
                mac_disk_usage.split("Capacity In Use By Volumes:")[1].strip().split("B")[0].strip()
            )
            return mac_disk_usage_cleaned

    except Exception as e:
        print(f"Error retrieving disk usage: {e}")

    return None



@router.get("/info")
async def get_computer_information():
    # start with our static system information and add current performance details
    r = system_info

    # Get the current disk usage if its a mac
    mac_disk_usage = await get_mac_disk_usage()

    disk_usage = psutil.disk_usage("/")._asdict()
    if mac_disk_usage:
        disk_usage["used"] = mac_disk_usage
        disk_usage["free"] = disk_usage["total"] - mac_disk_usage
        disk_usage["percent"] = round((mac_disk_usage / disk_usage["total"]) * 100, 2)

    r.update(
        {
            "cpu_percent": psutil.cpu_percent(),
            "cpu_count": psutil.cpu_count(),
            "memory": psutil.virtual_memory()._asdict(),
            "disk": disk_usage,
            "gpu_memory": "",
        }
    )

    g = []
    r["gpu"] = g

    return r


@router.get("/python_libraries")
async def get_python_library_versions():
    # Prefer importlib.metadata (std lib, no subprocess) to enumerate installed distributions.
    # Fallback to invoking pip only if necessary.
    try:
        try:
            from importlib import metadata
        except ImportError:  # pragma: no cover
            import importlib_metadata as metadata  # type: ignore

        dists = []
        for dist in metadata.distributions():
            name = dist.metadata.get("Name") or dist.metadata.get("Summary") or dist.metadata.get("name")
            version = dist.version if hasattr(dist, "version") else dist.metadata.get("Version", "")
            if name and version:
                dists.append({"name": name, "version": version})

        if dists:
            dists.sort(key=lambda x: x["name"].lower())
            return dists

        # If we got no distributions, attempt pip as a fallback
        try:
            pip_output = subprocess.check_output(
                [sys.executable, "-m", "pip", "list", "--format=json"],
                stderr=subprocess.STDOUT,
            )
            parsed = json.loads(pip_output.decode("utf-8"))
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
    except Exception:
        return []
    return []


@router.get("/pytorch_collect_env")
async def get_pytorch_collect_env():
    return "torch is not available"


async def watch_remote_file(
    filename: str, start_from_beginning=False, poll_interval_ms: int = 500
) -> AsyncGenerator[str, None]:
    """
    Watch an S3 file by polling it periodically.
    This is used for remote filesystems like S3 that don't support file watching.
    """
    print(f"👀 Watching S3 file: {filename}")

    # create the file if it doesn't already exist:
    if not await storage.exists(filename):
        async with await storage.open(filename, "w") as f:
            await f.write("")

    last_content = ""
    if start_from_beginning:
        try:
            async with await storage.open(filename, "r") as f:
                last_content = await f.read()
                if last_content:
                    lines = last_content.splitlines(keepends=True)
                    yield (f"data: {json.dumps(lines)}\n\n")
        except Exception as e:
            print(f"Error reading S3 file from beginning: {e}")
            last_content = ""
    else:
        # Start from current end of file
        try:
            async with await storage.open(filename, "r") as f:
                last_content = await f.read()
        except Exception as e:
            print(f"Error reading S3 file: {e}")
            last_content = ""

    # Poll the file periodically
    while True:
        await asyncio.sleep(poll_interval_ms / 1000.0)
        try:
            async with await storage.open(filename, "r") as f:
                current_content = await f.read()

            # Check if file has grown
            if len(current_content) > len(last_content):
                # Extract new content
                new_content = current_content[len(last_content) :]
                new_lines = new_content.splitlines(keepends=True)
                if new_lines:
                    yield (f"data: {json.dumps(new_lines)}\n\n")
                last_content = current_content
            elif len(current_content) < len(last_content):
                # File was truncated or rewritten, send all current content
                if current_content:
                    lines = current_content.splitlines(keepends=True)
                    yield (f"data: {json.dumps(lines)}\n\n")
                last_content = current_content
        except Exception as e:
            print(f"Error polling S3 file: {e}")
            await asyncio.sleep(poll_interval_ms / 1000.0)


async def watch_file(filename: str, start_from_beginning=False, force_polling=True) -> AsyncGenerator[str, None]:
    print(f"👀 Watching file: {filename}")

    # create the file if it doesn't already exist:
    if not await storage.exists(filename):
        async with await storage.open(filename, "w") as f:
            await f.write("")

    last_position = 0
    if start_from_beginning:
        last_position = 0
        async with await storage.open(filename, "r") as f:
            await f.seek(last_position)
            new_lines = await f.readlines()
            yield (f"data: {json.dumps(new_lines)}\n\n")
            last_position = await f.tell()
    else:
        try:
            async with await storage.open(filename, "r") as f:
                await f.seek(0, os.SEEK_END)
                last_position = await f.tell()
        except Exception as e:
            print(f"Error seeking to end of file: {e}")

    async for changes in awatch(filename, force_polling=force_polling, poll_delay_ms=100):
        async with await storage.open(filename, "r") as f:
            await f.seek(last_position)
            new_lines = await f.readlines()
            yield (f"data: {json.dumps(new_lines)}\n\n")
            last_position = await f.tell()


@router.get("/stream_log")
async def watch_log():
    global_log_path = await get_global_log_path()

    # Check if the path is an S3 or other remote filesystem path
    is_remote_path = storage.is_remote_path(global_log_path)

    if not await storage.exists(global_log_path):
        # Create the file using appropriate method
        if is_remote_path:
            async with await storage.open(global_log_path, "w") as f:
                await f.write("")
        else:
            async with await storage.open(global_log_path, "w") as f:
                await f.write("")
    try:
        if is_remote_path:
            # Use S3 polling watcher for remote filesystems
            return StreamingResponse(
                watch_remote_file(global_log_path),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
            )
        else:
            # Use local file watcher for local filesystems
            return StreamingResponse(
                watch_file(global_log_path),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
            )
    except Exception as e:
        print(f"Error streaming log: {e}")
        return StreamingResponse(
            iter(["data: Error: An internal error has occurred!\n\n"]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"},
        )


@router.get("/announcements")
async def get_announcements():
    """
    Get announcements from the announcements gallery.
    Returns a list of announcements that can be displayed to users.
    """
    announcements = await galleries.get_announcements_gallery()
    return {"status": "success", "data": announcements}


@router.get("/download_logs")
async def download_logs():
    """
    Download API logs as a zip file containing:
    - local_server.log (from HOME_DIR)
    - transformerlab.log (from workspace_dir)

    Returns a zip file with available log files. If no files exist, returns an error.
    """
    log_files = []

    # Path to local_server.log in HOME_DIR
    local_server_log_path = storage.join(HOME_DIR, "local_server.log")

    # Path to transformerlab.log in workspace_dir
    transformerlab_log_path = await get_global_log_path()

    # Check which files exist and add them to the list
    if await storage.exists(local_server_log_path):
        log_files.append(("local_server.log", local_server_log_path))

    if await storage.exists(transformerlab_log_path):
        log_files.append(("transformerlab.log", transformerlab_log_path))

    # If no files exist, return an error
    if not log_files:
        raise HTTPException(status_code=404, detail="No log files found. The log files may not have been created yet.")

    # Create a temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip.close()

    try:
        with zipfile.ZipFile(temp_zip.name, "w", zipfile.ZIP_DEFLATED) as zipf:
            for filename, file_path in log_files:
                try:
                    # Read file content (works with both local and remote storage)
                    async with await storage.open(file_path, "rb") as log_file:
                        content = await log_file.read()
                        zipf.writestr(filename, content)
                except Exception as e:
                    # If we can't read a file, log it but continue with others
                    print(f"Warning: Could not read log file {file_path}: {e}")

        # Generate a filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_filename = f"transformerlab_logs_{timestamp}.zip"

        return FileResponse(
            temp_zip.name,
            media_type="application/zip",
            filename=zip_filename,
            headers={"Content-Disposition": f"attachment; filename={zip_filename}"},
        )
    except Exception as e:
        # Clean up temp file on error
        if os.path.exists(temp_zip.name):
            os.unlink(temp_zip.name)
        raise HTTPException(status_code=500, detail=f"Failed to create zip file: {str(e)}")
