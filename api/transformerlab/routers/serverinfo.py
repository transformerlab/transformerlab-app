from watchfiles import awatch
import json
import os
import asyncio
import subprocess
import zipfile
import tempfile
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, FileResponse
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


router = APIRouter(prefix="/server", tags=["serverinfo"])


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


@router.get("/version")
async def get_version():
    """Return current API version and latest available version from GitHub."""
    from transformerlab.services.version_service import get_version_info

    return await get_version_info()


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
