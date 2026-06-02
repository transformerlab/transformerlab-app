"""Vast.ai compute provider implementation."""

import logging
import re
import time
from typing import Any, Dict, List, Optional, Union

import requests

from .base import ComputeProvider, format_status_snapshot
from .models import (
    ClusterConfig,
    ClusterState,
    ClusterStatus,
    JobConfig,
    JobInfo,
    ResourceInfo,
)

logger = logging.getLogger(__name__)

VASTAI_API_BASE_URL = "https://console.vast.ai/api/v0"
VASTAI_DEFAULT_IMAGE = "pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime"
VASTAI_DEFAULT_DISK_GB = 50
VASTAI_RUN_LOGS_PATH = "/workspace/run_logs.txt"


class VastAIProvider(ComputeProvider):
    """Provider implementation for Vast.ai GPU marketplace."""

    def __init__(self, api_key: str, extra_config: Optional[Dict[str, Any]] = None):
        self.api_key = api_key
        self.extra_config = extra_config or {}
        self._cluster_name_to_instance_id: Dict[str, int] = {}

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
    ) -> requests.Response:
        url = f"{VASTAI_API_BASE_URL}{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        response = requests.request(method=method, url=url, json=json_data, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response

    def _parse_accelerators(self, accelerators: str) -> tuple[str, int]:
        """Parse 'GPU_TYPE:COUNT' string into (gpu_type, count)."""
        parts = accelerators.split(":")
        gpu_type = parts[0].strip()
        count = 1
        if len(parts) > 1:
            try:
                count = int(parts[1].strip())
            except ValueError:
                count = 1
        return gpu_type, count

    def _build_gpu_name_candidates(self, gpu_type: str) -> List[str]:
        """
        Build likely Vast.ai GPU-name variants.

        Users may enter compact names (e.g. RTX5090) while Vast offers are
        commonly listed as 'RTX 5090' or 'RTX_5090'.
        """
        base = (gpu_type or "").strip()
        if not base:
            return []

        candidates: List[str] = [base]

        underscored = base.replace(" ", "_")
        if underscored and underscored not in candidates:
            candidates.append(underscored)

        spaced = base.replace("_", " ")
        if spaced and spaced not in candidates:
            candidates.append(spaced)

        compact = re.sub(r"[\s_]+", "", base)
        split_alpha_num = re.sub(r"([A-Za-z])(\d)", r"\1 \2", compact)
        if split_alpha_num and split_alpha_num not in candidates:
            candidates.append(split_alpha_num)

        split_alpha_num_underscored = split_alpha_num.replace(" ", "_")
        if split_alpha_num_underscored and split_alpha_num_underscored not in candidates:
            candidates.append(split_alpha_num_underscored)

        return candidates

    def _find_best_offer(self, gpu_type: str, num_gpus: int) -> int:
        """Search Vast.ai marketplace for the cheapest offer matching GPU type and count."""
        gpu_candidates = self._build_gpu_name_candidates(gpu_type)

        query = {
            # Vast.ai POST /bundles/ expects filters at the top level.
            "gpu_name": {"in": gpu_candidates},
            "num_gpus": {"eq": num_gpus},
            "rentable": {"eq": True},
            "order": [["dph_total", "asc"]],
            "limit": 10,
        }
        response = self._make_request("POST", "/bundles/", json_data=query)
        data = response.json()
        offers = data.get("offers", []) if isinstance(data, dict) else data
        if not offers:
            raise RuntimeError(
                f"No Vast.ai offers found for GPU type '{gpu_type}' x{num_gpus}. Check the GPU type name and try again."
            )
        return offers[0]["id"]

    def _find_instance_by_name(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        """Find an instance by its label, using in-memory ID cache."""
        if cluster_name in self._cluster_name_to_instance_id:
            instance_id = self._cluster_name_to_instance_id[cluster_name]
            try:
                response = self._make_request("GET", f"/instances/{instance_id}/")
                data = response.json()
                if isinstance(data, dict) and "instances" in data:
                    instances = data["instances"]
                    if isinstance(instances, list):
                        return instances[0] if instances else None
                    if isinstance(instances, dict):
                        return instances
                    return None
                return data
            except requests.exceptions.HTTPError:
                del self._cluster_name_to_instance_id[cluster_name]

        try:
            response = self._make_request("GET", "/instances/")
            data = response.json()
            instances = data.get("instances", []) if isinstance(data, dict) else data
            for instance in instances:
                if instance.get("label") == cluster_name:
                    instance_id = instance.get("id")
                    if instance_id:
                        self._cluster_name_to_instance_id[cluster_name] = int(instance_id)
                    return instance
        except Exception as exc:
            logger.warning("Error searching for Vast.ai instance '%s': %s", cluster_name, exc)
        return None

    def _map_status_to_cluster_state(self, status: str) -> ClusterState:
        mapping = {
            "running": ClusterState.UP,
            "loading": ClusterState.INIT,
            "stopped": ClusterState.STOPPED,
            "exited": ClusterState.DOWN,
            "failed": ClusterState.FAILED,
        }
        return mapping.get((status or "").lower(), ClusterState.UNKNOWN)

    @staticmethod
    def _build_onstart_script(setup: Optional[str], run: Optional[str]) -> str:
        """Build Vast onstart script with EXIT trap that destroys the instance."""
        cmds: List[str] = []
        if setup:
            cmds.append(setup)
        if run:
            cmds.append(run)
        combined = " && ".join(cmds)
        if not combined:
            return ""

        # Vast injects CONTAINER_ID and CONTAINER_API_KEY into the container.
        # Use those to self-destroy on EXIT so failed setup/run doesn't leak costs.
        return (
            "set -eo pipefail; "
            "_tfl_self_terminate() { "
            'if [ -n "${CONTAINER_ID:-}" ] && [ -n "${CONTAINER_API_KEY:-}" ]; then '
            'curl -sS -X DELETE "https://console.vast.ai/api/v0/instances/${CONTAINER_ID}/" '
            '-H "Authorization: Bearer ${CONTAINER_API_KEY}" '
            '-H "Content-Type: application/json" >/dev/null 2>&1 || true; '
            "fi; "
            "return 0; "
            "}; "
            "trap _tfl_self_terminate EXIT; "
            f"mkdir -p /workspace && (({combined}) 2>&1 | tee {VASTAI_RUN_LOGS_PATH})"
        )

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        if not config.accelerators:
            raise ValueError(
                "Vast.ai provider requires accelerators to be specified (e.g. 'RTX_3090:1'). "
                "CPU-only instances are not supported."
            )
        gpu_type, num_gpus = self._parse_accelerators(config.accelerators)
        offer_id = self._find_best_offer(gpu_type, num_gpus)

        onstart = self._build_onstart_script(config.setup, config.run)

        env_vars = {str(key): str(value) for key, value in (config.env_vars or {}).items()}

        payload: Dict[str, Any] = {
            "client_id": "me",
            "image": VASTAI_DEFAULT_IMAGE,
            "disk": config.disk_size or VASTAI_DEFAULT_DISK_GB,
            "label": cluster_name,
            "onstart": onstart,
        }
        if env_vars:
            payload["env"] = env_vars

        try:
            response = self._make_request("PUT", f"/asks/{offer_id}/", json_data=payload)
            data = response.json()
            instance_id = data.get("id") or data.get("new_contract")
            if instance_id:
                self._cluster_name_to_instance_id[cluster_name] = int(instance_id)
                return {"instance_id": instance_id, "request_id": str(instance_id)}
            return {"instance_id": None, "request_id": None, "response": data}
        except requests.exceptions.HTTPError as exc:
            msg = f"Failed to create Vast.ai instance: {exc}"
            if hasattr(exc.response, "text"):
                msg += f" - {exc.response.text}"
            raise RuntimeError(msg) from exc

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return {"status": "error", "message": f"Instance '{cluster_name}' not found"}
        instance_id = instance.get("id")
        if not instance_id:
            return {"status": "error", "message": f"Instance '{cluster_name}' has no ID"}
        try:
            self._make_request("DELETE", f"/instances/{instance_id}/")
            self._cluster_name_to_instance_id.pop(cluster_name, None)
            return {"status": "success", "message": f"Instance '{cluster_name}' terminated"}
        except requests.exceptions.HTTPError as exc:
            return {"status": "error", "message": f"Failed to terminate instance: {exc}"}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="Instance not found",
            )
        status = instance.get("actual_status", "unknown")
        return ClusterStatus(
            cluster_name=cluster_name,
            state=self._map_status_to_cluster_state(status),
            status_message=status,
            launched_at=str(instance["start_date"]) if instance.get("start_date") else None,
            num_nodes=1,
            resources_str=instance.get("gpu_name", ""),
            provider_data=instance,
        )

    def get_request_logs(self, request_id: str, tail_lines: Optional[int] = None) -> str:
        """Return an orchestration status snapshot for a Vast.ai instance."""
        try:
            response = self._make_request("GET", f"/instances/{request_id}/")
            data = response.json()
        except Exception as e:  # noqa: BLE001
            return f"Failed to fetch Vast.ai instance status for '{request_id}': {e}"
        instance = data.get("instances") if isinstance(data, dict) else None
        if isinstance(instance, list):
            instance = instance[0] if instance else None
        if not isinstance(instance, dict):
            instance = data if isinstance(data, dict) else {}
        if not instance:
            return f"Vast.ai instance '{request_id}' not found."
        fields = {
            "Instance ID": instance.get("id", request_id),
            "Label": instance.get("label"),
            "Status": instance.get("actual_status") or instance.get("cur_state"),
            "Status message": instance.get("status_msg"),
            "GPU": instance.get("gpu_name"),
            "GPU count": instance.get("num_gpus"),
            "Public IP": instance.get("public_ipaddr"),
            "Image": instance.get("image_uuid") or instance.get("image"),
            "Started": instance.get("start_date"),
        }
        return format_status_snapshot(f"Vast.ai instance {request_id}", fields)

    def list_clusters(self) -> List[ClusterStatus]:
        try:
            response = self._make_request("GET", "/instances/")
            data = response.json()
            instances = data.get("instances", []) if isinstance(data, dict) else data
            result = []
            for inst in instances:
                name = inst.get("label") or f"instance-{inst.get('id', 'unknown')}"
                status = inst.get("actual_status", "unknown")
                instance_id = inst.get("id")
                if instance_id:
                    self._cluster_name_to_instance_id[name] = int(instance_id)
                result.append(
                    ClusterStatus(
                        cluster_name=name,
                        state=self._map_status_to_cluster_state(status),
                        status_message=status,
                        launched_at=str(inst["start_date"]) if inst.get("start_date") else None,
                        num_nodes=1,
                        resources_str=inst.get("gpu_name", ""),
                        provider_data=inst,
                    )
                )
            return result
        except Exception as exc:
            logger.warning("Error listing Vast.ai instances: %s", exc)
            return []

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return ResourceInfo(cluster_name=cluster_name, gpus=[], num_nodes=1)
        gpus = []
        gpu_name = instance.get("gpu_name")
        num_gpus = instance.get("num_gpus", 1)
        if gpu_name:
            gpus.append({"gpu": gpu_name, "count": num_gpus})
        ram_mb = instance.get("ram")
        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=gpus,
            cpus=instance.get("cpu_cores"),
            memory_gb=ram_mb / 1024 if ram_mb else None,
            disk_gb=instance.get("disk_space"),
            num_nodes=1,
            provider_data=instance,
        )

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> str:
        instance = self._find_instance_by_name(cluster_name)
        if not instance:
            return f"Instance '{cluster_name}' not found."
        instance_id = instance.get("id")
        body: Dict[str, Any] = {}
        if tail_lines:
            body["tail"] = str(tail_lines)
        try:
            response = self._make_request("PUT", f"/instances/request_logs/{instance_id}/", json_data=body)
            data = response.json()
            result_url = data.get("result_url", "")
            if not result_url:
                return "Logs not yet available — instance may still be starting."
            # Vast.ai log URLs can return transient 403/404 for a brief period
            # immediately after request_logs succeeds. Retry before failing.
            max_attempts = 4
            for attempt in range(max_attempts):
                log_response = requests.get(result_url, timeout=30)
                try:
                    log_response.raise_for_status()
                    return log_response.text.strip() or "No log output yet."
                except requests.exceptions.HTTPError:
                    status = getattr(log_response, "status_code", None)
                    if status in (403, 404) and attempt < max_attempts - 1:
                        time.sleep(1)
                        continue
                    raise
        except Exception as exc:
            return f"Failed to retrieve logs: {exc}"

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        clusters = self.list_clusters()
        detailed = []
        for cluster_status in clusters:
            cluster_name = cluster_status.cluster_name
            resource_info = self.get_cluster_resources(cluster_name)
            gpus_dict: Dict[str, int] = {}
            for gpu_info in resource_info.gpus:
                if isinstance(gpu_info, dict):
                    gpu_type = gpu_info.get("gpu")
                    gpu_count = gpu_info.get("count", 0)
                    if gpu_type:
                        gpus_dict[gpu_type] = gpu_count
            state_str = (
                cluster_status.state.name if hasattr(cluster_status.state, "name") else str(cluster_status.state)
            )
            is_up = state_str.upper() in ["UP", "INIT"]
            node = {
                "node_name": cluster_name,
                "is_fixed": False,
                "is_active": is_up,
                "state": state_str.upper(),
                "reason": cluster_status.status_message or state_str,
                "resources": {
                    "cpus_total": resource_info.cpus or 0,
                    "cpus_allocated": resource_info.cpus or 0 if is_up else 0,
                    "gpus": gpus_dict,
                    "gpus_free": {} if is_up else gpus_dict,
                    "memory_gb_total": resource_info.memory_gb or 0,
                    "memory_gb_allocated": resource_info.memory_gb or 0 if is_up else 0,
                },
            }
            detailed.append(
                {
                    "cluster_id": cluster_name,
                    "cluster_name": cluster_name,
                    "backend_type": "Vast.ai",
                    "elastic_enabled": True,
                    "max_nodes": 1,
                    "head_node_ip": cluster_status.provider_data.get("public_ipaddr"),
                    "nodes": [node],
                }
            )
        return detailed

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        raise NotImplementedError("Vast.ai does not have a job submission endpoint; jobs run via onstart script")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        raise NotImplementedError("Vast.ai does not have a job queue system")

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        raise NotImplementedError("Vast.ai does not have a job cancellation endpoint")

    def check(self) -> tuple[bool, str | None]:
        try:
            self._make_request("GET", "/instances/", timeout=5)
            return True, None
        except Exception as exc:
            reason = f"Vast.ai provider check failed: {exc}"
            logger.warning(reason)
            return False, reason
