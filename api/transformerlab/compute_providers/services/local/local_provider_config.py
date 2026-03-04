import asyncio
import json
import os
import platform
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List

import torch
from lab.dirs import HOME_DIR

try:
    import psutil  # type: ignore[import-not-found]
except Exception:  # pragma: no cover - psutil may be missing in some envs
    psutil = None  # type: ignore[assignment]


def _is_wsl() -> bool:
    try:
        kernel_output = subprocess.check_output(["uname", "-r"], text=True).lower()
        return "microsoft" in kernel_output or "wsl2" in kernel_output
    except subprocess.CalledProcessError:
        return False


IS_WSL_SYSTEM = _is_wsl()


HAS_NVIDIA_NVML = False
HAS_AMD_ROCM = False

try:  # Prefer NVIDIA NVML when available
    from pynvml import (  # type: ignore[import-not-found]
        nvmlDeviceGetCount,
        nvmlDeviceGetHandleByIndex,
        nvmlDeviceGetMemoryInfo,
        nvmlDeviceGetName,
        nvmlDeviceGetUtilizationRates,
        nvmlInit,
    )

    HAS_NVIDIA_NVML = True
except Exception:  # pragma: no cover - NVML not available
    try:
        from pyrsmi import rocml  # type: ignore[import-not-found]

        HAS_AMD_ROCM = True
    except Exception:
        # Neither NVML nor ROCm libraries are available; we'll fall back to CPU-only GPU info.
        HAS_NVIDIA_NVML = False
        HAS_AMD_ROCM = False


def _base_system_info() -> Dict[str, Any]:
    """Return static system info snapshot (mirrors serverinfo.system_info)."""
    info: Dict[str, Any] = {
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
    }

    if torch.cuda.is_available():
        info["device"] = "cuda"
        if HAS_NVIDIA_NVML:
            nvmlInit()
            info["cuda_version"] = torch.version.cuda
            info["device_type"] = "nvidia"
        elif HAS_AMD_ROCM:
            if not IS_WSL_SYSTEM:
                rocml.smi_initialize()
            info["device_type"] = "amd"
            info["cuda_version"] = torch.version.hip
    elif torch.backends.mps.is_available():
        info["device"] = "mps"
        info["device_type"] = "apple_silicon"

    return info


async def _get_mac_disk_usage() -> int | None:
    """Return disk usage on macOS using diskutil, or None on failure / non-mac."""
    if sys.platform != "darwin":
        return None

    try:
        process = await asyncio.create_subprocess_shell(
            "diskutil apfs list | awk '/Capacity In Use By Volumes/'",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        if stderr:
            return None
        mac_disk_usage = stdout.decode("utf-8").strip()
        if "Capacity In Use By Volumes:" in mac_disk_usage:
            mac_disk_usage_cleaned = int(
                mac_disk_usage.split("Capacity In Use By Volumes:")[1].strip().split("B")[0].strip()
            )
            return mac_disk_usage_cleaned
    except Exception:
        return None
    return None


async def _get_macmon_data() -> Dict[str, Any] | None:
    """Return metrics from macmon on macOS, or None if unavailable."""
    if sys.platform != "darwin":
        return None
    try:
        from macmon import MacMon  # type: ignore[import-not-found]

        macmon = MacMon()
        data = await macmon.get_metrics_async()
        return json.loads(data)
    except Exception:
        return None


async def collect_server_info() -> Dict[str, Any]:
    """Collect a full server info snapshot (equivalent to /server/info)."""
    r = _base_system_info()

    mac_disk_usage = await _get_mac_disk_usage()
    macmon_data = await _get_macmon_data()

    # CPU, memory, disk metrics – best-effort when psutil is available.
    if psutil is not None:
        disk_usage = psutil.disk_usage("/")._asdict()
        if mac_disk_usage:
            disk_usage["used"] = mac_disk_usage
            disk_usage["free"] = disk_usage["total"] - mac_disk_usage
            disk_usage["percent"] = round((mac_disk_usage / disk_usage["total"]) * 100, 2)

        cpu_percent = psutil.cpu_percent()
        cpu_count = psutil.cpu_count()
        memory = psutil.virtual_memory()._asdict()
    else:
        # Fallback when psutil is not installed in the base venv
        total_disk = 0
        used_disk = mac_disk_usage or 0
        free_disk = max(total_disk - used_disk, 0)
        disk_usage = {
            "total": total_disk,
            "used": used_disk,
            "free": free_disk,
            "percent": 0,
        }
        cpu_percent = 0
        cpu_count = os.cpu_count() or 0
        memory = {
            "total": 0,
            "available": 0,
            "percent": 0,
            "used": 0,
            "free": 0,
        }

    r.update(
        {
            "cpu_percent": cpu_percent,
            "cpu_count": cpu_count,
            "memory": memory,
            "disk": disk_usage,
            "gpu_memory": "",
        }
    )

    if macmon_data:
        r["mac_metrics"] = macmon_data

    g: List[Dict[str, Any]] = []

    try:
        if HAS_AMD_ROCM and not IS_WSL_SYSTEM:
            device_count = rocml.smi_get_device_count()
        elif HAS_AMD_ROCM and IS_WSL_SYSTEM:
            device_count = torch.cuda.device_count()
        elif HAS_NVIDIA_NVML:
            device_count = nvmlDeviceGetCount()
        else:
            device_count = 0

        for i in range(device_count):
            info: Dict[str, Any] = {}
            if HAS_AMD_ROCM and not IS_WSL_SYSTEM:
                handle = rocml.smi_get_device_id(i)
            elif HAS_AMD_ROCM and IS_WSL_SYSTEM:
                handle = i
            else:
                handle = nvmlDeviceGetHandleByIndex(i)  # type: ignore[name-defined]

            if HAS_NVIDIA_NVML and not HAS_AMD_ROCM:
                device_name = nvmlDeviceGetName(handle)  # type: ignore[name-defined]
            elif HAS_AMD_ROCM and not IS_WSL_SYSTEM:
                device_name = rocml.smi_get_device_name(i)
            elif HAS_AMD_ROCM and IS_WSL_SYSTEM:
                device_name = torch.cuda.get_device_name(i)
            else:
                device_name = "Unknown GPU"

            if isinstance(device_name, bytes):
                device_name = device_name.decode(errors="ignore")

            info["name"] = device_name
            if HAS_NVIDIA_NVML and not HAS_AMD_ROCM:
                memory = nvmlDeviceGetMemoryInfo(handle)  # type: ignore[name-defined]
                info["total_memory"] = memory.total
                info["free_memory"] = memory.free
                info["used_memory"] = memory.used

                u = nvmlDeviceGetUtilizationRates(handle)  # type: ignore[name-defined]
                info["utilization"] = u.gpu
            elif HAS_AMD_ROCM and not IS_WSL_SYSTEM:
                info["total_memory"] = rocml.smi_get_device_memory_total(i)
                info["used_memory"] = rocml.smi_get_device_memory_used(i)
                info["free_memory"] = rocml.smi_get_device_memory_total(i) - rocml.smi_get_device_memory_used(i)
                info["utilization"] = rocml.smi_get_device_utilization(i)
            elif HAS_AMD_ROCM and IS_WSL_SYSTEM:
                free_memory, total_memory = torch.cuda.mem_get_info(i)
                info["total_memory"] = total_memory
                info["used_memory"] = total_memory - free_memory
                info["free_memory"] = free_memory
                info["utilization"] = ((total_memory - free_memory) / total_memory) * 100

            g.append(info)
    except Exception:
        # Best-effort GPU info; fall back to a CPU-only sentinel entry on failure
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


def main() -> None:
    """Entry point: write server info snapshot to local_provider_config.json under HOME_DIR."""
    data = asyncio.run(collect_server_info())
    output_path = Path(HOME_DIR) / "local_provider_config.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
