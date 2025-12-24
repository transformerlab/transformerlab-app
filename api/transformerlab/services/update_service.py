"""Update service for downloading and applying Transformer Lab updates."""

import asyncio
import json
import os
import subprocess
from typing import Optional

import httpx
from lab.dirs import get_workspace_dir, HOME_DIR
from lab import storage

# GitHub repository for Transformer Lab
GITHUB_REPO = "transformerlab/transformerlab-app"
GITHUB_API_BASE = "https://api.github.com/repos"

# Directories
TLAB_DIR = HOME_DIR
TLAB_CODE_DIR = storage.join(TLAB_DIR, "src")
TLAB_STATIC_WEB_DIR = storage.join(TLAB_DIR, "webapp")


def get_update_settings_file() -> str:
    """Get the path to the update.json file in team workspace."""
    workspace_dir = get_workspace_dir()
    return storage.join(workspace_dir, "update.json")


def get_update_log_file() -> str:
    """Get the path to the update log file in team workspace."""
    workspace_dir = get_workspace_dir()
    return storage.join(workspace_dir, "update.log")


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
    version_file = storage.join(TLAB_CODE_DIR, "LATEST_VERSION")
    if storage.exists(version_file):
        try:
            with storage.open(version_file, "r") as f:
                version = f.read().strip()
                if version:
                    return version
        except Exception:
            pass

    return "unknown"


async def download_file(url: str, dest_path: str) -> bool:
    """Download a file from URL to destination path. Follows redirects automatically."""
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            async with client.stream("GET", url, timeout=300.0) as response:
                response.raise_for_status()

                # For local filesystem, use regular file operations
                if not dest_path.startswith(("s3://", "gs://", "abfs://", "gcs://")):
                    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
                    with open(dest_path, "wb") as f:
                        async for chunk in response.aiter_bytes():
                            f.write(chunk)
                else:
                    # For remote storage, write in chunks
                    chunks = []
                    async for chunk in response.aiter_bytes():
                        chunks.append(chunk)
                    content = b"".join(chunks)
                    with storage.open(dest_path, "wb") as f:
                        f.write(content)

        return True
    except Exception as e:
        print(f"Error downloading file from {url}: {e}")
        return False


async def perform_update() -> dict:
    """Main update function that runs in background. Runs the install script to update."""
    settings = read_update_settings()

    try:
        # Set update in progress
        settings["update_in_progress"] = True
        write_update_settings(settings)

        print("Starting update process...")

        # 1. Check for updates
        latest_version = await get_latest_version()
        if not latest_version:
            raise Exception("Failed to fetch latest version from GitHub")

        current_version = get_current_version()

        if latest_version == current_version:
            print("Already on latest version")
            settings["update_in_progress"] = False
            write_update_settings(settings)
            return {"status": "complete", "message": "Already on latest version"}

        print(f"Updating from {current_version} to {latest_version}")

        # 2. Run the install script to perform the update
        print("Running install script to update...")
        install_script_url = "https://lab.cloud/install.sh"

        # Clear previous log file
        log_file = get_update_log_file()
        workspace_dir = get_workspace_dir()
        storage.makedirs(workspace_dir, exist_ok=True)
        with storage.open(log_file, "w") as f:
            f.write("")  # Clear log file

        # Download and run the install script asynchronously
        # Use asyncio.to_thread to run the blocking subprocess call
        def run_install_script():
            # Run script and capture both stdout and stderr, writing to log file in real-time
            process = subprocess.Popen(
                ["bash", "-c", f"curl -fsSL {install_script_url} | bash"],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            # Write output to log file in real-time
            if not log_file.startswith(("s3://", "gs://", "abfs://", "gcs://")):
                # Local filesystem - can use regular file operations
                with open(log_file, "a", encoding="utf-8") as log:
                    for line in iter(process.stdout.readline, ""):
                        if not line:
                            break
                        log.write(line)
                        log.flush()
            else:
                # Remote storage - collect all output first
                output_lines = []
                for line in iter(process.stdout.readline, ""):
                    if not line:
                        break
                    output_lines.append(line)

                # Write all at once to remote storage
                with storage.open(log_file, "a") as log:
                    log.write("".join(output_lines))

            process.wait()
            return subprocess.CompletedProcess(process.args, process.returncode, "", "")

        result = await asyncio.to_thread(run_install_script)

        if result.returncode != 0:
            error_output = result.stderr or result.stdout
            raise Exception(f"Install script failed with exit code {result.returncode}: {error_output}")

        # 3. Update version tracking
        settings["last_update_version"] = latest_version
        settings["update_in_progress"] = False
        write_update_settings(settings)

        print("Update completed successfully!")
        return {
            "status": "complete",
            "message": "Update completed successfully! Please restart the API server.",
            "version": latest_version,
        }

    except subprocess.TimeoutExpired:
        error_msg = "Update timed out after 10 minutes"
        print(f"Update failed: {error_msg}")
        settings["update_in_progress"] = False
        write_update_settings(settings)
        return {
            "status": "error",
            "message": error_msg,
        }
    except Exception as e:
        print(f"Update failed: {e}")
        import traceback

        traceback.print_exc()

        # Set update_in_progress to false on error
        settings["update_in_progress"] = False
        write_update_settings(settings)

        return {
            "status": "error",
            "message": f"Update failed: {str(e)}",
        }
