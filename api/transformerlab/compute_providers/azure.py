"""Azure compute provider implementation."""

from __future__ import annotations

import asyncio
import io
from typing import Any, Dict, List, Optional, Union

from .base import ComputeProvider
from .models import ClusterConfig, ClusterState, ClusterStatus, JobConfig, JobInfo, ResourceInfo


# ---------------------------------------------------------------------------
# Instance selection tables
# ---------------------------------------------------------------------------

_GPU_VM_SIZE_MAP: Dict[tuple, str] = {
    ("T4", 1): "Standard_NC4as_T4_v3",
    ("T4", 4): "Standard_NC16as_T4_v3",
    ("T4", 16): "Standard_NC64as_T4_v3",
    ("A100", 1): "Standard_NC24ads_A100_v4",
    ("A100", 2): "Standard_NC48ads_A100_v4",
    ("A100", 4): "Standard_NC96ads_A100_v4",
    ("A100", 8): "Standard_ND96asr_v4",
    ("H100", 1): "Standard_NC40ads_H100_v5",
    ("H100", 2): "Standard_NC80adis_H100_v5",
    ("H100", 8): "Standard_ND96isr_H100_v5",
    ("A10", 1): "Standard_NV36ads_A10_v5",
    ("A10", 2): "Standard_NV72ads_A10_v5",
    ("V100", 1): "Standard_NC6s_v3",
    ("V100", 2): "Standard_NC12s_v3",
    ("V100", 4): "Standard_NC24s_v3",
}

_CPU_VM_SIZE_OPTIONS: List[tuple] = sorted(
    [
        (2, 4, "Standard_F2s_v2"),
        (2, 8, "Standard_D2s_v3"),
        (2, 16, "Standard_E2s_v3"),
        (4, 8, "Standard_F4s_v2"),
        (4, 16, "Standard_D4s_v3"),
        (4, 32, "Standard_E4s_v3"),
        (8, 16, "Standard_F8s_v2"),
        (8, 32, "Standard_D8s_v3"),
        (8, 64, "Standard_E8s_v3"),
        (16, 32, "Standard_F16s_v2"),
        (16, 64, "Standard_D16s_v3"),
        (16, 128, "Standard_E16s_v3"),
        (32, 64, "Standard_F32s_v2"),
        (32, 128, "Standard_D32s_v3"),
        (32, 256, "Standard_E32s_v3"),
        (64, 128, "Standard_F64s_v2"),
        (64, 256, "Standard_D64s_v3"),
        (64, 512, "Standard_E64s_v3"),
        (96, 192, "Standard_F96s_v2"),
        (96, 384, "Standard_D96s_v3"),
        (96, 672, "Standard_E96s_v3"),
    ],
    key=lambda x: (x[0], x[1]),
)

_AZURE_POWER_STATE_MAP: Dict[str, ClusterState] = {
    "powerstate/starting": ClusterState.INIT,
    "powerstate/running": ClusterState.UP,
    "powerstate/stopping": ClusterState.STOPPED,
    "powerstate/stopped": ClusterState.STOPPED,
    "powerstate/deallocating": ClusterState.DOWN,
    "powerstate/deallocated": ClusterState.DOWN,
}

_AZURE_PROV_STATE_MAP: Dict[str, ClusterState] = {
    "creating": ClusterState.INIT,
    "updating": ClusterState.INIT,
    "deleting": ClusterState.DOWN,
    "failed": ClusterState.FAILED,
    "succeeded": ClusterState.UP,
}


def _resolve_gpu_vm_size(accelerators: str) -> str:
    """Map an accelerator spec (e.g. 'A100:8') to an Azure VM size.

    Raises ValueError for unrecognized types or unsupported counts.
    """
    parts = accelerators.strip().split(":")
    accel_type = parts[0].strip()
    count = int(parts[1].strip()) if len(parts) > 1 else 1
    key = (accel_type, count)
    if key not in _GPU_VM_SIZE_MAP:
        valid = sorted(f"{t}:{c}" for t, c in _GPU_VM_SIZE_MAP)
        raise ValueError(
            f"Unsupported accelerator spec '{accelerators}'. Valid options: {', '.join(valid)}"
        )
    return _GPU_VM_SIZE_MAP[key]


def _parse_memory_gb(memory: Union[int, float, str, None]) -> float:
    """Parse memory field (int GB, float GB, '16GB' string, or None) to float GB."""
    if memory is None:
        return 0.0
    if isinstance(memory, (int, float)):
        return float(memory)
    stripped = str(memory).strip().upper()
    for suffix in ("GB", "G", "MB", "M"):
        if stripped.endswith(suffix):
            stripped = stripped[: -len(suffix)].strip()
            break
    try:
        return float(stripped)
    except ValueError:
        return 0.0


def _resolve_cpu_vm_size(
    cpus: Union[int, str, None],
    memory: Union[int, float, str, None],
) -> str:
    """Select smallest Azure CPU VM satisfying both vCPU and memory constraints.

    Raises ValueError if the combination exceeds available options.
    """
    requested_cpus = int(cpus) if cpus else 0
    requested_memory = _parse_memory_gb(memory)
    for vcpus, mem_gb, vm_size in _CPU_VM_SIZE_OPTIONS:
        if vcpus >= requested_cpus and mem_gb >= requested_memory:
            return vm_size
    raise ValueError(
        f"No Azure CPU VM found for cpus={requested_cpus}, memory={requested_memory}GB. "
        f"Maximum available: 96 vCPUs, 672 GB memory."
    )


def _ssh_read_file(host: str, key_bytes: bytes, remote_path: str, tail_lines: int = 500) -> str:
    """SSH to host and read a file. Returns string content or error message."""
    import paramiko

    pkey = None
    key_file = io.StringIO(key_bytes.decode("utf-8"))
    for key_class in (paramiko.Ed25519Key, paramiko.RSAKey):
        try:
            pkey = key_class.from_private_key(key_file)
            break
        except Exception:
            key_file.seek(0)

    if pkey is None:
        return "Failed to load SSH key."

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(hostname=host, port=22, username="azureuser", pkey=pkey, timeout=15, banner_timeout=15)
        cmd = f"tail -n {tail_lines} {remote_path} 2>/dev/null || echo 'No log file yet.'"
        _, stdout, _ = ssh.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip() or "No output yet."
    except Exception as e:
        return f"SSH failed: {e}"
    finally:
        ssh.close()
