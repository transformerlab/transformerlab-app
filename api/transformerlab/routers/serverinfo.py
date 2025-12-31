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
from fastapi_cache.decorator import cache

# Could also use https://github.com/gpuopenanalytics/pynvml but this is simpler
import psutil
import torch
from lab.dirs import get_global_log_path
from lab import HOME_DIR
from lab import storage


try:
    from pynvml import (
        nvmlDeviceGetCount,
        nvmlDeviceGetHandleByIndex,
        nvmlDeviceGetMemoryInfo,
        nvmlDeviceGetName,
        nvmlDeviceGetUtilizationRates,
        nvmlInit,
    )

    HAS_AMD = False
except Exception:
    from pyrsmi import rocml

    HAS_AMD = True


pyTorch_version = torch.__version__
print(f"🔥 PyTorch version: {pyTorch_version}")

# # Check for version of flash_attn:
# flash_attn_version = ""
# try:
#     from flash_attn import __version__ as flash_attn_version

#     print(f"⚡️ Flash Attention is installed, version {flash_attn_version}")
# except ImportError:
#     flash_attn_version = "n/a"
#     print(
#         "🟡 Flash Attention is not installed. If you are running on GPU, install to accelerate inference and training. https://github.com/Dao-AILab/flash-attention"
#     )


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
    "pytorch_version": torch.__version__,
    # "flash_attn_version": flash_attn_version,
}

# Determine which device to use (cuda/mps/cpu)
if torch.cuda.is_available():
    system_info["device"] = "cuda"
    if not HAS_AMD:
        nvmlInit()
        system_info["cuda_version"] = torch.version.cuda
        system_info["device_type"] = "nvidia"
        pytorch_device = "CUDA"
    elif HAS_AMD:
        if not IS_WSL_SYSTEM:
            rocml.smi_initialize()
        system_info["device_type"] = "amd"
        system_info["cuda_version"] = torch.version.hip
        pytorch_device = "ROCm"

    print(f"🏄 PyTorch is using {pytorch_device}, version {system_info['cuda_version']}")

elif torch.backends.mps.is_available():
    system_info["device"] = "mps"
    system_info["device_type"] = "apple_silicon"
    print("🏄 PyTorch is using MPS for Apple Metal acceleration")

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


async def get_macmon_data():
    if sys.platform != "darwin":
        return None  # Ensure it only runs on macOS

    try:
        from macmon import MacMon

        macmon = MacMon()
        data = await macmon.get_metrics_async()
        json_data = json.loads(data)
        return json_data

    except Exception as e:
        print(f"Error retrieving macmon data: {e}")

    return None


@router.get("/info")
@cache(expire=60)
async def get_computer_information():
    # start with our static system information and add current performance details
    r = system_info

    # Get the current disk usage if its a mac
    mac_disk_usage = await get_mac_disk_usage()

    # Get data from macmon if its a mac
    macmon_data = await get_macmon_data()

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

    if macmon_data:
        r["mac_metrics"] = macmon_data

    try:
        if HAS_AMD and not IS_WSL_SYSTEM:
            deviceCount = rocml.smi_get_device_count()
        elif HAS_AMD and IS_WSL_SYSTEM:
            deviceCount = torch.cuda.device_count()
        else:
            deviceCount = nvmlDeviceGetCount()
        # print('device count: ', deviceCount)
        for i in range(deviceCount):
            info = {}
            if HAS_AMD and not IS_WSL_SYSTEM:
                handle = rocml.smi_get_device_id(i)
            elif HAS_AMD and IS_WSL_SYSTEM:
                handle = i
            else:
                handle = nvmlDeviceGetHandleByIndex(i)

            # Certain versions of the NVML library on WSL return a byte string,
            # and this creates a utf error. This is a workaround:
            if not HAS_AMD:
                device_name = nvmlDeviceGetName(handle)
            elif HAS_AMD and not IS_WSL_SYSTEM:
                device_name = rocml.smi_get_device_name(i)
            elif HAS_AMD and IS_WSL_SYSTEM:
                device_name = torch.cuda.get_device_name(i)
            else:
                raise Exception("Unsupported GPU type for rocm-smi")
            # print('device name: ', device_name)

            # check if device_name is a byte string, if so convert to string:
            if isinstance(device_name, bytes):
                device_name = device_name.decode(errors="ignore")

            info["name"] = device_name
            if not HAS_AMD:
                memory = nvmlDeviceGetMemoryInfo(handle)
                info["total_memory"] = memory.total
                info["free_memory"] = memory.free
                info["used_memory"] = memory.used

                u = nvmlDeviceGetUtilizationRates(handle)
                info["utilization"] = u.gpu
            elif HAS_AMD and not IS_WSL_SYSTEM:
                info["total_memory"] = rocml.smi_get_device_memory_total(i)
                info["used_memory"] = rocml.smi_get_device_memory_used(i)
                info["free_memory"] = rocml.smi_get_device_memory_total(i) - rocml.smi_get_device_memory_used(i)
                info["utilization"] = rocml.smi_get_device_utilization(i)
            elif HAS_AMD and IS_WSL_SYSTEM:
                free_memory, total_memory = torch.cuda.mem_get_info(i)
                info["total_memory"] = total_memory
                info["used_memory"] = total_memory - free_memory
                info["free_memory"] = free_memory
                info["utilization"] = ((total_memory - free_memory) / total_memory) * 100
            else:
                raise Exception("Unsupported GPU type")

            # info["temp"] = nvmlDeviceGetTemperature(handle)
            g.append(info)
    except Exception:  # Catch all exceptions and print them
        g.append(
            {
                "name": "cpu",
                "total_memory": "n/a",
                "free_memory": "n/a",
                "used_memory": "n/a",
                "utilization": "n/a",
            }
        )

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
    # run python -m torch.utils.collect_env and return the output
    output = subprocess.check_output(sys.executable + " -m torch.utils.collect_env", shell=True)
    return output.decode("utf-8")


async def watch_s3_file(
    filename: str, start_from_beginning=False, poll_interval_ms: int = 500
) -> AsyncGenerator[str, None]:
    """
    Watch an S3 file by polling it periodically.
    This is used for remote filesystems like S3 that don't support file watching.
    """
    print(f"👀 Watching S3 file: {filename}")

    # create the file if it doesn't already exist:
    if not storage.exists(filename):
        with storage.open(filename, "w") as f:
            f.write("")

    last_content = ""
    if start_from_beginning:
        try:
            with storage.open(filename, "r") as f:
                last_content = f.read()
                if last_content:
                    lines = last_content.splitlines(keepends=True)
                    yield (f"data: {json.dumps(lines)}\n\n")
        except Exception as e:
            print(f"Error reading S3 file from beginning: {e}")
            last_content = ""
    else:
        # Start from current end of file
        try:
            with storage.open(filename, "r") as f:
                last_content = f.read()
        except Exception as e:
            print(f"Error reading S3 file: {e}")
            last_content = ""

    # Poll the file periodically
    while True:
        await asyncio.sleep(poll_interval_ms / 1000.0)
        try:
            with storage.open(filename, "r") as f:
                current_content = f.read()

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
    if not storage.exists(filename):
        with storage.open(filename, "w") as f:
            f.write("")

    last_position = 0
    if start_from_beginning:
        last_position = 0
        with storage.open(filename, "r") as f:
            f.seek(last_position)
            new_lines = f.readlines()
            yield (f"data: {json.dumps(new_lines)}\n\n")
            last_position = f.tell()
    else:
        try:
            with storage.open(filename, "r") as f:
                f.seek(0, os.SEEK_END)
                last_position = f.tell()
        except Exception as e:
            print(f"Error seeking to end of file: {e}")

    async for changes in awatch(filename, force_polling=force_polling, poll_delay_ms=100):
        with storage.open(filename, "r") as f:
            f.seek(last_position)
            new_lines = f.readlines()
            yield (f"data: {json.dumps(new_lines)}\n\n")
            last_position = f.tell()


@router.get("/stream_log")
async def watch_log():
    global_log_path = get_global_log_path()

    if not storage.exists(global_log_path):
        # Create the file
        with storage.open(global_log_path, "w") as f:
            f.write("")
    try:
        # Check if the path is an S3 or other remote filesystem path
        is_remote_path = global_log_path.startswith(("s3://", "gs://", "abfs://", "gcs://"))

        if is_remote_path:
            # Use S3 polling watcher for remote filesystems
            return StreamingResponse(
                watch_s3_file(global_log_path),
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
    transformerlab_log_path = get_global_log_path()

    # Check which files exist and add them to the list
    if storage.exists(local_server_log_path):
        log_files.append(("local_server.log", local_server_log_path))

    if storage.exists(transformerlab_log_path):
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
                    with storage.open(file_path, "rb") as log_file:
                        content = log_file.read()
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
