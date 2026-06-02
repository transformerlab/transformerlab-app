"""Google Compute Engine compute provider implementation."""

from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import shlex
from typing import Any, Dict, List, Optional, Union

from transformerlab.shared.ssh_policy import get_add_if_verified_policy

from .base import ComputeProvider, format_status_snapshot
from .models import ClusterConfig, ClusterState, ClusterStatus, JobConfig, JobInfo, ResourceInfo

logger = logging.getLogger(__name__)


_ATTACHED_GPU_MAP: Dict[tuple[str, int], tuple[str, str]] = {
    ("T4", 1): ("n1-standard-4", "nvidia-tesla-t4"),
    ("T4", 2): ("n1-standard-8", "nvidia-tesla-t4"),
    ("T4", 4): ("n1-standard-16", "nvidia-tesla-t4"),
    ("V100", 1): ("n1-standard-8", "nvidia-tesla-v100"),
    ("V100", 4): ("n1-standard-32", "nvidia-tesla-v100"),
    ("P100", 1): ("n1-standard-8", "nvidia-tesla-p100"),
    ("P100", 4): ("n1-standard-32", "nvidia-tesla-p100"),
}

_ACCELERATOR_MACHINE_MAP: Dict[tuple[str, int], str] = {
    ("L4", 1): "g2-standard-4",
    ("L4", 4): "g2-standard-48",
    ("L4", 8): "g2-standard-96",
    ("A100", 1): "a2-highgpu-1g",
    ("A100", 2): "a2-highgpu-2g",
    ("A100", 4): "a2-highgpu-4g",
    ("A100", 8): "a2-highgpu-8g",
    ("A100-80GB", 1): "a2-ultragpu-1g",
    ("A100-80GB", 2): "a2-ultragpu-2g",
    ("A100-80GB", 4): "a2-ultragpu-4g",
    ("A100-80GB", 8): "a2-ultragpu-8g",
    ("H100", 8): "a3-highgpu-8g",
}

_CPU_MACHINE_OPTIONS: List[tuple[int, int, str]] = sorted(
    [
        (2, 8, "e2-standard-2"),
        (4, 16, "e2-standard-4"),
        (8, 32, "e2-standard-8"),
        (16, 64, "e2-standard-16"),
        (32, 128, "n2-standard-32"),
        (48, 192, "n2-standard-48"),
        (64, 256, "n2-standard-64"),
        (80, 320, "n2-standard-80"),
        (96, 384, "n2-standard-96"),
    ],
    key=lambda x: (x[0], x[1]),
)

_DEFAULT_GPU_IMAGE_CANDIDATES: List[str] = [
    "projects/deeplearning-platform-release/global/images/family/common-cu129-ubuntu-2404-nvidia-580",
    "projects/deeplearning-platform-release/global/images/family/common-cu129-ubuntu-2204-nvidia-580",
    "projects/deeplearning-platform-release/global/images/family/common-cu128-ubuntu-2204-nvidia-570",
    "projects/deeplearning-platform-release/global/images/family/common-cu124",
    "projects/deeplearning-platform-release/global/images/family/common-cu121",
    "projects/deeplearning-platform-release/global/images/family/common-cu118",
]

_GCE_STATE_TO_CLUSTER_STATE: Dict[str, ClusterState] = {
    "PROVISIONING": ClusterState.INIT,
    "STAGING": ClusterState.INIT,
    "RUNNING": ClusterState.UP,
    "STOPPING": ClusterState.STOPPED,
    "SUSPENDING": ClusterState.STOPPED,
    "SUSPENDED": ClusterState.STOPPED,
    "TERMINATED": ClusterState.DOWN,
}


def _parse_memory_gb(memory: Union[int, float, str, None]) -> float:
    if memory is None:
        return 0.0
    if isinstance(memory, (int, float)):
        return float(memory)
    stripped = str(memory).strip().upper()
    for suffix in ("GB", "G", "MB", "M"):
        if stripped.endswith(suffix):
            value = stripped[: -len(suffix)].strip()
            try:
                parsed = float(value)
                return parsed / 1024.0 if suffix in ("MB", "M") else parsed
            except ValueError:
                return 0.0
    try:
        return float(stripped)
    except ValueError:
        return 0.0


def _parse_accelerators(accelerators: str) -> tuple[str, int]:
    parts = accelerators.strip().split(":")
    accel_type = parts[0].strip().upper()
    count = int(parts[1].strip()) if len(parts) > 1 else 1
    canonical = {
        "NVIDIA_TESLA_T4": "T4",
        "TESLA_T4": "T4",
        "NVIDIA_TESLA_V100": "V100",
        "TESLA_V100": "V100",
        "NVIDIA_TESLA_P100": "P100",
        "TESLA_P100": "P100",
        "NVIDIA_L4": "L4",
        "NVIDIA_A100_80GB": "A100-80GB",
        "A100_80GB": "A100-80GB",
        "NVIDIA_A100": "A100",
        "NVIDIA_H100_80GB": "H100",
        "H100_80GB": "H100",
    }.get(accel_type, parts[0].strip())
    return canonical, count


def _resolve_machine_and_accelerator(accelerators: Optional[str]) -> tuple[str, Optional[str], int]:
    if not accelerators:
        raise ValueError("accelerators is required for GPU machine resolution")
    accel_type, count = _parse_accelerators(accelerators)
    attached_key = (accel_type, count)
    if attached_key in _ATTACHED_GPU_MAP:
        machine_type, accelerator_type = _ATTACHED_GPU_MAP[attached_key]
        return machine_type, accelerator_type, count
    machine_key = (accel_type, count)
    if machine_key in _ACCELERATOR_MACHINE_MAP:
        return _ACCELERATOR_MACHINE_MAP[machine_key], None, count
    valid = sorted({f"{t}:{c}" for t, c in [*_ATTACHED_GPU_MAP.keys(), *_ACCELERATOR_MACHINE_MAP.keys()]})
    raise ValueError(f"Unsupported GCP accelerator spec '{accelerators}'. Valid options: {', '.join(valid)}")


def _resolve_cpu_machine(cpus: Union[int, str, None], memory: Union[int, float, str, None]) -> str:
    requested_cpus = int(cpus) if cpus else 0
    requested_memory = _parse_memory_gb(memory)
    for vcpus, mem_gb, machine_type in _CPU_MACHINE_OPTIONS:
        if vcpus >= requested_cpus and mem_gb >= requested_memory:
            return machine_type
    raise ValueError(
        f"No GCP CPU machine found for cpus={requested_cpus}, memory={requested_memory}GB. "
        "Maximum configured option: 96 vCPUs, 384 GB memory."
    )


def _label_value(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_-]", "-", str(value).lower())
    normalized = re.sub(r"-+", "-", normalized).strip("-_")
    return (normalized or "value")[:63]


def _instance_name(value: str) -> str:
    """Return a valid GCE instance name derived from the Transformer Lab cluster name."""
    normalized = re.sub(r"[^a-z0-9-]", "-", str(value).lower())
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    if not normalized or not re.match(r"^[a-z]", normalized):
        normalized = f"tfl-{normalized or 'job'}"
    return normalized[:63].rstrip("-") or "tfl-job"


def _is_missing_image_error(error: Exception) -> bool:
    """Detect GCP 'image family not found' errors from Compute API responses."""
    message = str(error).lower()
    return "not found" in message and "images/family" in message


def _is_already_exists_error(error: Exception) -> bool:
    """Detect GCP 'already exists' conflicts from Compute API responses."""
    message = str(error).lower()
    return "409" in message and "already" in message and "exist" in message


def _ssh_read_file(host: str, key_bytes: bytes, remote_path: str, tail_lines: int = 500) -> str:
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
        ssh.connect(hostname=host, port=22, username="ubuntu", pkey=pkey, timeout=15, banner_timeout=15)
        cmd = f"tail -n {tail_lines} {remote_path} 2>/dev/null || echo 'No log file yet.'"
        _, stdout, _ = ssh.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip() or "No output yet."
    except Exception as e:
        return f"SSH failed: {e}"
    finally:
        ssh.close()


class GCPProvider(ComputeProvider):
    """Compute provider that launches ephemeral Google Compute Engine VMs per job."""

    def __init__(
        self,
        project_id: str,
        zone: Optional[str],
        region: Optional[str],
        team_id: str,
        credentials_path: Optional[str] = None,
        service_account_json: Optional[Dict[str, Any]] = None,
        service_account_email: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.project_id = project_id
        self.region = region
        self.zone = zone or (f"{region}-a" if region else None)
        if not self.zone:
            raise ValueError("GCP provider requires zone or region")
        self.team_id = team_id
        self.credentials_path = credentials_path
        self.service_account_json = service_account_json
        self.service_account_email = service_account_email
        self.extra_config = extra_config or {}
        self._session = None

    def _get_session(self):
        if self._session is not None:
            return self._session
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account

        scopes = ["https://www.googleapis.com/auth/cloud-platform"]
        if self.service_account_json:
            credentials = service_account.Credentials.from_service_account_info(
                self.service_account_json, scopes=scopes
            )
        elif self.credentials_path:
            credentials = service_account.Credentials.from_service_account_file(self.credentials_path, scopes=scopes)
        else:
            credentials, project_id = google.auth.default(scopes=scopes)
            if not self.project_id and project_id:
                self.project_id = project_id
        self._session = AuthorizedSession(credentials)
        return self._session

    def _zone_base_url(self) -> str:
        return f"https://compute.googleapis.com/compute/v1/projects/{self.project_id}/zones/{self.zone}"

    def _global_base_url(self) -> str:
        return f"https://compute.googleapis.com/compute/v1/projects/{self.project_id}/global"

    def _request(self, method: str, url: str, **kwargs) -> Dict[str, Any]:
        response = self._get_session().request(method, url, timeout=60, **kwargs)
        if response.status_code == 404:
            raise FileNotFoundError(response.text)
        if response.status_code >= 400:
            raise RuntimeError(f"GCP API error {response.status_code}: {response.text}")
        if not response.text:
            return {}
        return response.json()

    def check(self) -> tuple[bool, str | None]:
        try:
            self._request("GET", f"{self._zone_base_url()}/machineTypes?maxResults=1")
            return True, None
        except Exception as e:
            reason = f"GCP provider check failed: {e}"
            logger.warning(reason)
            return False, reason

    @staticmethod
    def _build_startup_script(config: ClusterConfig, project_id: str, zone: str, instance_name: str) -> str:
        env_exports_lines = []
        for key, value in config.env_vars.items():
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
                raise ValueError(f"Invalid environment variable name: {key!r}")
            env_exports_lines.append(f"export {key}={shlex.quote(str(value))}")
        env_exports = "\n".join(env_exports_lines)
        setup_block = config.setup or ""
        run_cmd = config.run or ""
        quoted_project = shlex.quote(project_id)
        quoted_zone = shlex.quote(zone)
        quoted_instance = shlex.quote(instance_name)
        return f"""#!/bin/bash
set -eo pipefail
mkdir -p /workspace

_tfl_self_delete() {{
  local _token
  _token=$(curl -sf -H "Metadata-Flavor: Google" \
    http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token", ""))' 2>/dev/null) || true
  if [ -n "$_token" ]; then
    curl -sf -X DELETE \
      -H "Authorization: Bearer $_token" \
      "https://compute.googleapis.com/compute/v1/projects/{quoted_project}/zones/{quoted_zone}/instances/{quoted_instance}" \
      >/dev/null 2>&1 || true
  fi
  return 0
}}
trap _tfl_self_delete EXIT

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3 python3-venv python3-pip curl >/dev/null 2>&1
python3 -m venv /opt/transformerlab-venv
export PATH="/opt/transformerlab-venv/bin:$PATH"
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:/root/.local/bin:/home/ubuntu/.local/bin:$PATH"
if [ -x /root/.local/bin/uv ]; then cp /root/.local/bin/uv /usr/local/bin/uv && chmod +x /usr/local/bin/uv; fi
if [ -x /root/.local/bin/uvx ]; then cp /root/.local/bin/uvx /usr/local/bin/uvx && chmod +x /usr/local/bin/uvx; fi
{env_exports}
{setup_block}
({run_cmd}) 2>&1 | tee /workspace/run_logs.txt
"""

    def _find_instance_by_cluster_name(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        safe_cluster = _label_value(cluster_name)
        safe_team = _label_value(self.team_id)
        filter_expr = (
            f"(labels.transformerlab-cluster-name = {safe_cluster}) (labels.transformerlab-team-id = {safe_team})"
        )
        data = self._request("GET", f"{self._zone_base_url()}/instances", params={"filter": filter_expr})
        items = data.get("items", [])
        return items[0] if items else None

    def _ensure_ssh_firewall_rule(self) -> None:
        """Ensure instances tagged transformerlab-compute accept SSH for provider log retrieval."""
        rule_name = _instance_name(f"tfl-{self.team_id}-ssh")
        rule_url = f"{self._global_base_url()}/firewalls/{rule_name}"
        try:
            self._request("GET", rule_url)
            return
        except FileNotFoundError:
            pass

        body = {
            "name": rule_name,
            "description": f"Transformer Lab SSH access for team {self.team_id}",
            "network": f"{self._global_base_url()}/networks/default",
            "direction": "INGRESS",
            "priority": 1000,
            "sourceRanges": ["0.0.0.0/0"],
            "targetTags": ["transformerlab-compute"],
            "allowed": [{"IPProtocol": "tcp", "ports": ["22"]}],
        }
        try:
            self._request("POST", f"{self._global_base_url()}/firewalls", json=body)
        except RuntimeError as e:
            if _is_already_exists_error(e):
                return
            raise

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        from transformerlab.services.ssh_key_service import get_or_create_org_ssh_key_pair, get_org_ssh_public_key

        async def _ensure_and_get_public_key() -> str:
            await get_or_create_org_ssh_key_pair(self.team_id)
            return await get_org_ssh_public_key(self.team_id)

        public_key = asyncio.run(_ensure_and_get_public_key()).strip()
        instance_name = _instance_name(cluster_name)
        disk_size = int(config.disk_size or 100)
        has_gpu = bool(config.accelerators)
        accelerator_type = None
        accelerator_count = 0
        if has_gpu:
            machine_type, accelerator_type, accelerator_count = _resolve_machine_and_accelerator(config.accelerators)
        else:
            machine_type = _resolve_cpu_machine(config.cpus, config.memory)

        if has_gpu:
            configured_gpu_image = self.extra_config.get("gpu_image")
            if configured_gpu_image:
                image_candidates = [configured_gpu_image]
            else:
                image_candidates = _DEFAULT_GPU_IMAGE_CANDIDATES
        else:
            image_candidates = [
                self.extra_config.get("cpu_image") or "projects/ubuntu-os-cloud/global/images/family/ubuntu-2204-lts"
            ]
        startup_script = self._build_startup_script(config, self.project_id, self.zone, instance_name)
        self._ensure_ssh_firewall_rule()

        body: Dict[str, Any] = {
            "name": instance_name,
            "machineType": f"{self._zone_base_url()}/machineTypes/{machine_type}",
            "labels": {
                "transformerlab-team-id": _label_value(self.team_id),
                "transformerlab-cluster-name": _label_value(cluster_name),
            },
            "disks": [
                {
                    "boot": True,
                    "autoDelete": True,
                    "initializeParams": {
                        "sourceImage": image_candidates[0],
                        "diskSizeGb": str(disk_size),
                        "diskType": f"{self._zone_base_url()}/diskTypes/pd-balanced",
                    },
                }
            ],
            "networkInterfaces": [
                {
                    "network": f"{self._global_base_url()}/networks/default",
                    "accessConfigs": [{"name": "External NAT", "type": "ONE_TO_ONE_NAT"}],
                }
            ],
            "metadata": {
                "items": [
                    {"key": "startup-script", "value": startup_script},
                    {"key": "ssh-keys", "value": f"ubuntu:{public_key}"},
                ]
            },
            "tags": {"items": ["transformerlab-compute"]},
        }

        service_account_email = self.service_account_email or self.extra_config.get("service_account_email")
        if service_account_email:
            body["serviceAccounts"] = [
                {
                    "email": service_account_email,
                    "scopes": ["https://www.googleapis.com/auth/cloud-platform"],
                }
            ]

        if accelerator_type:
            body["guestAccelerators"] = [
                {
                    "acceleratorType": f"{self._zone_base_url()}/acceleratorTypes/{accelerator_type}",
                    "acceleratorCount": accelerator_count,
                }
            ]
            body["scheduling"] = {"onHostMaintenance": "TERMINATE", "automaticRestart": False}
        elif has_gpu:
            body["scheduling"] = {"onHostMaintenance": "TERMINATE", "automaticRestart": False}

        # Spot VMs: set provisioningModel SPOT. Spot VMs can't auto-restart, so
        # automaticRestart must be False. Merge into any existing scheduling dict
        # (also handles CPU-only spot launches, which otherwise have no scheduling).
        if config.use_spot:
            scheduling = body.get("scheduling", {})
            scheduling["provisioningModel"] = "SPOT"
            scheduling["automaticRestart"] = False
            body["scheduling"] = scheduling

        last_error: Exception | None = None
        for image in image_candidates:
            body["disks"][0]["initializeParams"]["sourceImage"] = image
            try:
                operation = self._request("POST", f"{self._zone_base_url()}/instances", json=body)
                operation_id = operation.get("name") or instance_name
                return {"instance_name": instance_name, "request_id": operation_id, "operation": operation}
            except Exception as e:
                if has_gpu and _is_missing_image_error(e) and len(image_candidates) > 1:
                    logger.warning("GCP image family %s not found; trying next candidate.", image)
                    last_error = e
                    continue
                raise RuntimeError(f"Failed to launch GCE instance: {e}") from e

        raise RuntimeError(
            "Failed to launch GCE instance: none of the default GPU image families were found "
            f"({', '.join(image_candidates)}). Last error: {last_error}"
        )

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return {"status": "error", "message": f"Instance '{cluster_name}' not found", "cluster_name": cluster_name}
        name = instance["name"]
        try:
            operation = self._request("DELETE", f"{self._zone_base_url()}/instances/{name}")
            return {"status": "success", "message": f"Instance '{cluster_name}' deleted", "operation": operation}
        except Exception as e:
            return {"status": "error", "message": str(e), "cluster_name": cluster_name}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        try:
            instance = self._find_instance_by_cluster_name(cluster_name)
        except FileNotFoundError:
            instance = None
        if not instance:
            return ClusterStatus(
                cluster_name=cluster_name, state=ClusterState.DOWN, status_message="Instance not found"
            )
        gce_state = instance.get("status", "UNKNOWN")
        state = _GCE_STATE_TO_CLUSTER_STATE.get(gce_state, ClusterState.UNKNOWN)
        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=gce_state,
            provider_data=instance,
        )

    def get_request_logs(self, request_id: str, tail_lines: Optional[int] = None) -> str:
        """Return an orchestration snapshot for a GCP launch (operation + instance + serial)."""
        zone_base = self._zone_base_url()

        operation = None
        try:
            operation = self._request("GET", f"{zone_base}/operations/{request_id}")
        except FileNotFoundError:
            operation = None
        except Exception as e:  # noqa: BLE001
            return f"Failed to fetch GCP operation '{request_id}': {e}"

        instance_name = request_id
        if operation:
            target_link = operation.get("targetLink") or ""
            if target_link:
                instance_name = target_link.rstrip("/").split("/")[-1]

        fields: dict = {}
        if operation:
            fields["Operation"] = operation.get("name")
            fields["Operation status"] = operation.get("status")
            fields["Operation type"] = operation.get("operationType")
            fields["Progress"] = operation.get("progress")
            if operation.get("error"):
                fields["Error"] = json.dumps(operation["error"])

        try:
            instance = self._request("GET", f"{zone_base}/instances/{instance_name}")
        except Exception:  # noqa: BLE001
            instance = None
        if instance:
            fields["Instance"] = instance.get("name")
            fields["Instance status"] = instance.get("status")
            fields["Machine type"] = str(instance.get("machineType", "")).split("/")[-1] or None

        serial = ""
        try:
            serial_data = self._request("GET", f"{zone_base}/instances/{instance_name}/serialPort", params={"port": 1})
            serial = serial_data.get("contents", "") if isinstance(serial_data, dict) else ""
        except Exception as e:  # noqa: BLE001
            serial = f"(serial port output unavailable: {e})"
        if serial and tail_lines:
            serial = "\n".join(serial.splitlines()[-tail_lines:])
        footer = ("--- Serial port output ---\n" + serial) if serial else None

        return format_status_snapshot(f"GCP launch {request_id}", fields, footer=footer)

    def list_clusters(self) -> List[ClusterStatus]:
        safe_team = _label_value(self.team_id)
        data = self._request(
            "GET",
            f"{self._zone_base_url()}/instances",
            params={"filter": f"labels.transformerlab-team-id = {safe_team}"},
        )
        statuses: List[ClusterStatus] = []
        for instance in data.get("items", []):
            labels = instance.get("labels", {})
            cluster_name = labels.get("transformerlab-cluster-name", instance.get("name", "unknown"))
            gce_state = instance.get("status", "UNKNOWN")
            statuses.append(
                ClusterStatus(
                    cluster_name=cluster_name,
                    state=_GCE_STATE_TO_CLUSTER_STATE.get(gce_state, ClusterState.UNKNOWN),
                    status_message=gce_state,
                    provider_data=instance,
                )
            )
        return statuses

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return ResourceInfo(cluster_name=cluster_name, gpus=[], num_nodes=1)
        accelerators = instance.get("guestAccelerators") or []
        gpus = []
        for accelerator in accelerators:
            accelerator_type = str(accelerator.get("acceleratorType", "")).split("/")[-1]
            count = int(accelerator.get("acceleratorCount", 0) or 0)
            gpus.extend([accelerator_type] * count)
        return ResourceInfo(cluster_name=cluster_name, gpus=gpus, num_nodes=1, provider_data=instance)

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> str:
        from transformerlab.services.ssh_key_service import get_org_ssh_private_key

        instance = self._find_instance_by_cluster_name(cluster_name)
        if not instance:
            return f"Instance '{cluster_name}' not found or not running."
        public_ip = None
        for nic in instance.get("networkInterfaces", []):
            for access_config in nic.get("accessConfigs", []):
                public_ip = access_config.get("natIP")
                if public_ip:
                    break
            if public_ip:
                break
        if not public_ip:
            return "Instance has no public IP yet (still starting)."
        key_bytes = asyncio.run(get_org_ssh_private_key(self.team_id))
        return _ssh_read_file(public_ip, key_bytes, "/workspace/run_logs.txt", tail_lines or 500)

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        detailed = []
        for status in self.list_clusters():
            state_str = status.state.name if hasattr(status.state, "name") else str(status.state)
            provider_data = status.provider_data or {}
            public_ip = None
            for nic in provider_data.get("networkInterfaces", []):
                for access_config in nic.get("accessConfigs", []):
                    public_ip = access_config.get("natIP") or public_ip
            detailed.append(
                {
                    "cluster_id": status.cluster_name,
                    "cluster_name": status.cluster_name,
                    "backend_type": "GCP Compute Engine",
                    "elastic_enabled": True,
                    "max_nodes": 1,
                    "head_node_ip": public_ip,
                    "nodes": [
                        {
                            "node_name": status.cluster_name,
                            "is_fixed": False,
                            "is_active": state_str.upper() in ("UP", "INIT"),
                            "state": state_str.upper(),
                            "reason": status.status_message or state_str,
                            "resources": {
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
        raise NotImplementedError("GCP provider uses tfl-remote-trap for job dispatch")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        raise NotImplementedError("GCP provider uses tfl-remote-trap for job dispatch")

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        raise NotImplementedError("GCP provider uses tfl-remote-trap for job dispatch")
