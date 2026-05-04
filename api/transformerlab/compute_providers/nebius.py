"""Nebius AI Cloud compute provider implementation.

This provider uses the Nebius CLI as the supported control-plane client. The
Nebius docs show VM creation via `nebius compute instance create --format json -`
with a JSON instance spec, cloud-init user data, managed boot disks, and public
network interfaces. Keeping the integration on top of the CLI avoids vendoring
Nebius generated gRPC clients while still following the documented API shape.
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import shlex
import shutil
import subprocess
from typing import Any, Dict, List, Optional, Union

from transformerlab.services.ssh_key_service import get_org_ssh_private_key
from transformerlab.shared.ssh_policy import get_add_if_verified_policy

from .base import ComputeProvider
from .models import ClusterConfig, ClusterState, ClusterStatus, JobConfig, JobInfo, ResourceInfo

logger = logging.getLogger(__name__)

NEBIUS_RUN_LOGS_PATH = "/workspace/run_logs.txt"
DEFAULT_NEBIUS_USER = "tflab"


_NEBIUS_STATE_TO_CLUSTER_STATE: Dict[str, ClusterState] = {
    "CREATING": ClusterState.INIT,
    "STARTING": ClusterState.INIT,
    "RUNNING": ClusterState.UP,
    "UPDATING": ClusterState.UP,
    "STOPPING": ClusterState.STOPPED,
    "STOPPED": ClusterState.STOPPED,
    "DELETING": ClusterState.DOWN,
    "DELETED": ClusterState.DOWN,
    "FAILED": ClusterState.FAILED,
    "ERROR": ClusterState.FAILED,
}


_GPU_PLATFORM_PRESET_MAP: Dict[tuple[str, int], tuple[str, str]] = {
    ("B300", 1): ("gpu-b300-sxm", "1gpu-24vcpu-346gb"),
    ("B300", 8): ("gpu-b300-sxm", "8gpu-192vcpu-2768gb"),
    ("B200", 1): ("gpu-b200-sxm", "1gpu-20vcpu-224gb"),
    ("B200", 8): ("gpu-b200-sxm", "8gpu-160vcpu-1792gb"),
    ("H200", 1): ("gpu-h200-sxm", "1gpu-16vcpu-200gb"),
    ("H200", 8): ("gpu-h200-sxm", "8gpu-128vcpu-1600gb"),
    ("H100", 1): ("gpu-h100-sxm", "1gpu-16vcpu-200gb"),
    ("H100", 8): ("gpu-h100-sxm", "8gpu-128vcpu-1600gb"),
    ("RTX6000", 1): ("gpu-rtx6000", "1gpu-24vcpu-218gb"),
    ("RTXPRO6000", 1): ("gpu-rtx6000", "1gpu-24vcpu-218gb"),
    ("RTX6000", 8): ("gpu-rtx6000", "8gpu-192vcpu-1744gb"),
    ("RTXPRO6000", 8): ("gpu-rtx6000", "8gpu-192vcpu-1744gb"),
    ("L40S", 1): ("gpu-l40s-d", "1gpu-16vcpu-96gb"),
    ("L40S", 2): ("gpu-l40s-d", "2gpu-64vcpu-384gb"),
    ("L40S", 4): ("gpu-l40s-d", "4gpu-128vcpu-768gb"),
}

_CPU_PRESET_OPTIONS: List[tuple[int, int, str]] = [
    (4, 16, "4vcpu-16gb"),
    (8, 32, "8vcpu-32gb"),
    (16, 64, "16vcpu-64gb"),
    (32, 128, "32vcpu-128gb"),
    (48, 192, "48vcpu-192gb"),
    (64, 256, "64vcpu-256gb"),
    (96, 384, "96vcpu-384gb"),
    (128, 512, "128vcpu-512gb"),
    (160, 640, "160vcpu-640gb"),
    (192, 768, "192vcpu-768gb"),
    (224, 896, "224vcpu-896gb"),
    (256, 1024, "256vcpu-1024gb"),
]


def _parse_memory_gb(memory: Union[int, float, str, None]) -> float:
    if memory is None:
        return 0.0
    if isinstance(memory, (int, float)):
        return float(memory)
    stripped = str(memory).strip().upper()
    for suffix in ("GIB", "GB", "G", "MIB", "MB", "M"):
        if stripped.endswith(suffix):
            value = stripped[: -len(suffix)].strip()
            try:
                parsed = float(value)
            except ValueError:
                return 0.0
            return parsed / 1024.0 if suffix in ("MIB", "MB", "M") else parsed
    try:
        return float(stripped)
    except ValueError:
        return 0.0


def _resolve_cpu_preset(cpus: Union[int, str, None], memory: Union[int, float, str, None]) -> str:
    requested_cpus = int(cpus) if cpus else 0
    requested_memory = _parse_memory_gb(memory)
    for preset_cpus, preset_memory, preset in _CPU_PRESET_OPTIONS:
        if preset_cpus >= requested_cpus and preset_memory >= requested_memory:
            return preset
    raise ValueError(
        f"No Nebius CPU preset found for cpus={requested_cpus}, memory={requested_memory}GB. "
        "Maximum mapped preset: 256 vCPUs, 1024 GB memory."
    )


def _resolve_gpu_platform_preset(accelerators: str) -> tuple[str, str]:
    parts = accelerators.strip().split(":")
    accelerator_type = re.sub(r"[^A-Za-z0-9]", "", parts[0].upper())
    count = int(parts[1].strip()) if len(parts) > 1 else 1
    key = (accelerator_type, count)
    if key not in _GPU_PLATFORM_PRESET_MAP:
        valid = sorted(f"{gpu}:{count}" for gpu, count in _GPU_PLATFORM_PRESET_MAP)
        raise ValueError(f"Unsupported Nebius accelerator spec '{accelerators}'. Valid options: {', '.join(valid)}")
    return _GPU_PLATFORM_PRESET_MAP[key]


def _nested_get(data: Dict[str, Any], path: List[Union[str, int]]) -> Any:
    current: Any = data
    for key in path:
        if isinstance(key, int):
            if not isinstance(current, list) or len(current) <= key:
                return None
            current = current[key]
        else:
            if not isinstance(current, dict):
                return None
            current = current.get(key)
    return current


def _extract_resource_id(data: Dict[str, Any]) -> Optional[str]:
    for path in (["metadata", "id"], ["id"]):
        value = _nested_get(data, list(path))
        if value:
            return str(value)
    return None


def _extract_public_ip(instance: Dict[str, Any]) -> Optional[str]:
    interfaces = _nested_get(instance, ["status", "network_interfaces"])
    if not isinstance(interfaces, list):
        return None
    for interface in interfaces:
        if not isinstance(interface, dict):
            continue
        public_ip = interface.get("public_ip_address") or {}
        if isinstance(public_ip, dict):
            address = public_ip.get("address") or public_ip.get("ip")
            if address:
                return str(address).split("/")[0]
    return None


def _ssh_read_file(host: str, username: str, key_bytes: bytes, remote_path: str, tail_lines: int = 500) -> str:
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
    ssh.set_missing_host_key_policy(get_add_if_verified_policy())
    try:
        ssh.connect(hostname=host, port=22, username=username, pkey=pkey, timeout=15, banner_timeout=15)
        cmd = f"tail -n {tail_lines} {remote_path} 2>/dev/null || echo 'No log file yet.'"
        _, stdout, _ = ssh.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip() or "No output yet."
    except Exception as exc:
        return f"SSH failed: {exc}"
    finally:
        ssh.close()


class NebiusProvider(ComputeProvider):
    """Compute provider that launches Nebius AI Cloud VMs with cloud-init."""

    def __init__(
        self,
        team_id: str,
        parent_id: Optional[str] = None,
        subnet_id: Optional[str] = None,
        profile: Optional[str] = None,
        region: Optional[str] = None,
        default_platform: Optional[str] = None,
        default_preset: Optional[str] = None,
        boot_image_family: Optional[str] = None,
        disk_size_gib: Optional[int] = None,
        ssh_user: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.team_id = team_id
        self.parent_id = parent_id
        self.subnet_id = subnet_id
        self.profile = profile
        self.region = region
        self.default_platform = default_platform
        self.default_preset = default_preset
        self.boot_image_family = boot_image_family
        self.disk_size_gib = disk_size_gib or 200
        self.ssh_user = ssh_user or DEFAULT_NEBIUS_USER
        self.extra_config = extra_config or {}

    def _base_cmd(self) -> List[str]:
        cmd = ["nebius"]
        if self.profile:
            cmd.extend(["--profile", self.profile])
        return cmd

    def _run_nebius(self, args: List[str], stdin_json: Optional[Dict[str, Any]] = None, timeout: int = 120) -> Any:
        if not shutil.which("nebius"):
            raise RuntimeError("Nebius CLI is not installed or not on PATH. Install and authenticate `nebius` first.")

        cmd = self._base_cmd() + args
        input_text = json.dumps(stdin_json) if stdin_json is not None else None
        proc = subprocess.run(
            cmd,
            input=input_text,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        if proc.returncode != 0:
            stderr = (proc.stderr or proc.stdout or "").strip()
            raise RuntimeError(f"Nebius CLI command failed ({' '.join(shlex.quote(c) for c in cmd)}): {stderr}")
        output = (proc.stdout or "").strip()
        if not output:
            return {}
        try:
            return json.loads(output)
        except json.JSONDecodeError:
            return output

    def check(self) -> tuple[bool, str | None]:
        try:
            args = ["profile", "current", "--format", "json"]
            self._run_nebius(args, timeout=30)
            return True, None
        except Exception as exc:
            reason = f"Nebius provider check failed: {exc}"
            logger.warning(reason)
            return False, reason

    def _resolve_platform_preset(self, config: ClusterConfig) -> tuple[str, str]:
        provider_config = config.provider_config or {}
        platform = provider_config.get("platform") or provider_config.get("resources_platform")
        preset = provider_config.get("preset") or provider_config.get("resources_preset")
        if platform and preset:
            return str(platform), str(preset)
        if self.default_platform and self.default_preset:
            return self.default_platform, self.default_preset
        if config.instance_type:
            if ":" in config.instance_type:
                parsed_platform, parsed_preset = config.instance_type.split(":", 1)
                return parsed_platform, parsed_preset
            if self.default_platform:
                return self.default_platform, config.instance_type
        if config.accelerators:
            return _resolve_gpu_platform_preset(config.accelerators)
        return "cpu-d3", _resolve_cpu_preset(config.cpus, config.memory)

    def _image_family_for_platform(self, platform: str) -> str:
        if self.boot_image_family:
            return self.boot_image_family
        if platform.startswith("gpu-"):
            return "ubuntu24.04-cuda13.0"
        return "ubuntu24.04-driverless"

    def _build_cloud_init(self, config: ClusterConfig, public_key: str) -> str:
        env_exports_lines = []
        for key, value in config.env_vars.items():
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
                raise ValueError(f"Invalid environment variable name: {key!r}")
            env_exports_lines.append(f"export {key}={shlex.quote(str(value))}")
        env_exports = "\n".join(env_exports_lines)
        setup_block = config.setup or ""
        run_cmd = config.run or ""
        script = f"""set -eo pipefail
mkdir -p /workspace
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv python3-pip curl ca-certificates >/dev/null 2>&1
python3 -m venv /opt/transformerlab-venv
export PATH="/opt/transformerlab-venv/bin:$PATH"
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:/root/.local/bin:/home/{self.ssh_user}/.local/bin:$PATH"
if [ -x /root/.local/bin/uv ]; then cp /root/.local/bin/uv /usr/local/bin/uv && chmod +x /usr/local/bin/uv; fi
if [ -x /root/.local/bin/uvx ]; then cp /root/.local/bin/uvx /usr/local/bin/uvx && chmod +x /usr/local/bin/uvx; fi
{env_exports}
{setup_block}
set +e
({run_cmd}) 2>&1 | tee {NEBIUS_RUN_LOGS_PATH}
_exit_code=${{PIPESTATUS[0]}}
set -e
sync
# With recovery_policy=FAIL, guest shutdown stops the VM after the task finishes.
shutdown -h now || true
exit $_exit_code
"""
        indented_script = "\n".join(f"      {line}" for line in script.splitlines())
        return f"""#cloud-config
users:
  - name: {self.ssh_user}
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - {public_key.strip()}
write_files:
  - path: /opt/transformerlab-run.sh
    permissions: '0755'
    content: |
{indented_script}
runcmd:
  - [ bash, -lc, /opt/transformerlab-run.sh ]
"""

    @staticmethod
    def _extract_list_response(response: Any) -> List[Dict[str, Any]]:
        if isinstance(response, list):
            return [item for item in response if isinstance(item, dict)]
        if isinstance(response, dict):
            for key in ("items", "instances", "resources"):
                value = response.get(key)
                if isinstance(value, list):
                    return [item for item in value if isinstance(item, dict)]
        return []

    def _find_instance_by_cluster_name(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        args = ["compute", "instance", "list", "--format", "json"]
        if self.parent_id:
            args.extend(["--parent-id", self.parent_id])
        response = self._run_nebius(args, timeout=60)
        instances = self._extract_list_response(response)
        for instance in instances:
            name = _nested_get(instance, ["metadata", "name"]) or instance.get("name")
            if name == cluster_name:
                return instance
        return None

    def _get_instance(self, instance_id: str) -> Dict[str, Any]:
        return self._run_nebius(["compute", "instance", "get", "--id", instance_id, "--format", "json"], timeout=60)

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        from transformerlab.services.ssh_key_service import get_or_create_org_ssh_key_pair, get_org_ssh_public_key

        if not self.subnet_id:
            raise ValueError("Nebius provider requires subnet_id in config")

        async def _ensure_and_get_public_key() -> str:
            await get_or_create_org_ssh_key_pair(self.team_id)
            return await get_org_ssh_public_key(self.team_id)

        public_key = asyncio.run(_ensure_and_get_public_key())
        platform, preset = self._resolve_platform_preset(config)
        image_family = self._image_family_for_platform(platform)
        cloud_init_user_data = self._build_cloud_init(config, public_key)

        metadata: Dict[str, Any] = {"name": cluster_name}
        if self.parent_id:
            metadata["parent_id"] = self.parent_id

        spec: Dict[str, Any] = {
            "stopped": False,
            "cloud_init_user_data": cloud_init_user_data,
            "resources": {"platform": platform, "preset": preset},
            "recovery_policy": "FAIL",
            "boot_disk": {
                "attach_mode": "READ_WRITE",
                "managed_disk": {
                    "name": f"{cluster_name}-boot",
                    "spec": {
                        "type": "NETWORK_SSD",
                        "size_gibibytes": int(config.disk_size or self.disk_size_gib),
                        "block_size_bytes": 4096,
                        "source_image_family": {"image_family": image_family},
                    },
                },
            },
            "network_interfaces": [
                {"name": "eth0", "subnet_id": self.subnet_id, "ip_address": {}, "public_ip_address": {}}
            ],
        }
        if self.parent_id:
            spec["boot_disk"]["managed_disk"]["spec"]["source_image_family"]["parent_id"] = self.parent_id
        if config.use_spot:
            spec["preemptible"] = {"on_preemption": "STOP"}
        if self.extra_config.get("service_account_id"):
            spec["service_account_id"] = self.extra_config["service_account_id"]
        if config.provider_config.get("gpu_cluster_id") or self.extra_config.get("gpu_cluster_id"):
            spec["gpu_cluster"] = {
                "id": config.provider_config.get("gpu_cluster_id") or self.extra_config["gpu_cluster_id"]
            }

        payload = {"metadata": metadata, "spec": spec}
        args = ["compute", "instance", "create", "--format", "json"]
        if self.parent_id:
            args.extend(["--parent-id", self.parent_id])
        args.append("-")
        response = self._run_nebius(args, stdin_json=payload, timeout=300)
        instance_id = _extract_resource_id(response) if isinstance(response, dict) else None
        if not instance_id:
            instance = self._find_instance_by_cluster_name(cluster_name)
            instance_id = _extract_resource_id(instance or {})
        if not instance_id:
            raise RuntimeError(f"Nebius instance was created but its ID could not be determined: {response}")
        return {"instance_id": instance_id, "request_id": instance_id, "platform": platform, "preset": preset}

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return {"status": "error", "message": f"Instance '{cluster_name}' not found", "cluster_name": cluster_name}
        instance_id = _extract_resource_id(instance)
        if not instance_id:
            return {"status": "error", "message": "Instance ID not found", "cluster_name": cluster_name}
        try:
            self._run_nebius(["compute", "instance", "delete", "--id", instance_id, "--format", "json"], timeout=180)
            return {"status": "success", "message": f"Instance '{cluster_name}' deleted", "instance_id": instance_id}
        except Exception as exc:
            return {"status": "error", "message": str(exc), "cluster_name": cluster_name, "instance_id": instance_id}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return ClusterStatus(
                cluster_name=cluster_name, state=ClusterState.UNKNOWN, status_message="Instance not found"
            )
        state_raw = (
            _nested_get(instance, ["status", "state"])
            or _nested_get(instance, ["status", "status"])
            or instance.get("state")
            or "UNKNOWN"
        )
        state_text = str(state_raw).upper()
        state = _NEBIUS_STATE_TO_CLUSTER_STATE.get(state_text, ClusterState.UNKNOWN)
        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=state_text,
            provider_data=instance,
        )

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> str:
        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return f"Instance '{cluster_name}' not found."
        public_ip = _extract_public_ip(instance)
        if not public_ip:
            return "Instance has no public IP yet (still starting)."
        key_bytes = asyncio.run(get_org_ssh_private_key(self.team_id))
        return _ssh_read_file(public_ip, self.ssh_user, key_bytes, NEBIUS_RUN_LOGS_PATH, tail_lines or 500)

    def list_clusters(self) -> List[ClusterStatus]:
        args = ["compute", "instance", "list", "--format", "json"]
        if self.parent_id:
            args.extend(["--parent-id", self.parent_id])
        response = self._run_nebius(args, timeout=60)
        instances = self._extract_list_response(response)
        statuses: List[ClusterStatus] = []
        for instance in instances:
            cluster_name = str(
                _nested_get(instance, ["metadata", "name"]) or _extract_resource_id(instance) or "unknown"
            )
            state_text = str(_nested_get(instance, ["status", "state"]) or instance.get("state") or "UNKNOWN").upper()
            statuses.append(
                ClusterStatus(
                    cluster_name=cluster_name,
                    state=_NEBIUS_STATE_TO_CLUSTER_STATE.get(state_text, ClusterState.UNKNOWN),
                    status_message=state_text,
                    provider_data=instance,
                )
            )
        return statuses

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        instance = self._find_instance_by_cluster_name(cluster_name)
        return ResourceInfo(cluster_name=cluster_name, gpus=[], num_nodes=1, provider_data=instance or {})

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        detailed = []
        for status in self.list_clusters():
            state_str = status.state.name if hasattr(status.state, "name") else str(status.state)
            resources = (status.provider_data or {}).get("spec", {}).get("resources", {})
            detailed.append(
                {
                    "cluster_id": status.cluster_name,
                    "cluster_name": status.cluster_name,
                    "backend_type": "Nebius Compute",
                    "cloud_provider": "Nebius",
                    "elastic_enabled": True,
                    "max_nodes": 1,
                    "head_node_ip": _extract_public_ip(status.provider_data or {}),
                    "nodes": [
                        {
                            "node_name": status.cluster_name,
                            "is_fixed": False,
                            "is_active": state_str.upper() in ("UP", "INIT"),
                            "state": state_str.upper(),
                            "reason": status.status_message or state_str,
                            "resources": {
                                "platform": resources.get("platform"),
                                "preset": resources.get("preset"),
                                "cpus_total": 0,
                                "cpus_allocated": 0,
                                "gpus": {},
                                "gpus_free": {},
                                "memory_gb_total": 0,
                                "memory_gb_allocated": 0,
                            },
                        }
                    ],
                }
            )
        return detailed

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        raise NotImplementedError("Nebius provider uses cloud-init/tfl-remote-trap for job dispatch")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        raise NotImplementedError("Nebius provider uses cloud-init/tfl-remote-trap for job dispatch")

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        raise NotImplementedError("Nebius provider uses cloud-init/tfl-remote-trap for job dispatch")
