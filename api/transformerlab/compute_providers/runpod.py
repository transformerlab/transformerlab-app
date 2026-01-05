"""RunPod provider implementation."""

import requests
import time
from typing import Dict, Any, Optional, Union, List

from .base import ComputeProvider
from .models import (
    ClusterConfig,
    JobConfig,
    ClusterStatus,
    JobInfo,
    ResourceInfo,
    ClusterState,
)


class RunPodProvider(ComputeProvider):
    """Provider implementation for RunPod API."""

    def __init__(
        self,
        api_key: str,
        api_base_url: Optional[str] = None,
        default_gpu_type: Optional[str] = None,
        default_region: Optional[str] = None,
        default_template_id: Optional[str] = None,
        default_network_volume_id: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize RunPod provider.

        Args:
            api_key: RunPod API key (required)
            api_base_url: Base URL for RunPod API (defaults to https://api.runpod.io/v1)
            default_gpu_type: Default GPU type (e.g., "RTX 3090", "A100")
            default_region: Default region
            default_template_id: Default Docker template ID
            default_network_volume_id: Default network volume ID
            extra_config: Additional provider-specific configuration
        """
        self.api_key = api_key
        self.api_base_url = (api_base_url or "https://api.runpod.io/v1").rstrip("/")
        self.default_gpu_type = default_gpu_type
        self.default_region = default_region
        self.default_template_id = default_template_id
        self.default_network_volume_id = default_network_volume_id
        self.extra_config = extra_config or {}

        # Cache for cluster_name -> pod_id mapping
        self._cluster_name_to_pod_id: Dict[str, str] = {}

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
    ) -> requests.Response:
        """
        Make authenticated request to RunPod API.

        Args:
            method: HTTP method (GET, POST, DELETE, etc.)
            endpoint: API endpoint (e.g., "/pods")
            json_data: Optional JSON payload
            timeout: Request timeout in seconds

        Returns:
            Response object
        """
        url = f"{self.api_base_url}{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        response = requests.request(method=method, url=url, json=json_data, headers=headers, timeout=timeout)
        response.raise_for_status()
        return response

    def _find_pod_by_name(self, cluster_name: str) -> Optional[Dict[str, Any]]:
        """
        Find a pod by cluster name. RunPod uses pod IDs, not names, so we need to
        search through pods and match by name or use cached mapping.

        Args:
            cluster_name: Cluster name to find

        Returns:
            Pod data dictionary or None if not found
        """
        # Check cache first
        if cluster_name in self._cluster_name_to_pod_id:
            pod_id = self._cluster_name_to_pod_id[cluster_name]
            try:
                response = self._make_request("GET", f"/pods/{pod_id}")
                pod_data = response.json()
                return pod_data
            except requests.exceptions.HTTPError:
                # Pod might have been deleted, remove from cache
                del self._cluster_name_to_pod_id[cluster_name]
                return None

        # Search through all pods
        try:
            response = self._make_request("GET", "/pods")
            pods = response.json()
            if isinstance(pods, list):
                for pod in pods:
                    # Check if pod name matches cluster_name
                    pod_name = pod.get("name", "")
                    if pod_name == cluster_name:
                        pod_id = pod.get("id")
                        if pod_id:
                            self._cluster_name_to_pod_id[cluster_name] = pod_id
                        return pod
            elif isinstance(pods, dict):
                # Some APIs return {"data": [...]}
                pod_list = pods.get("data", [])
                for pod in pod_list:
                    pod_name = pod.get("name", "")
                    if pod_name == cluster_name:
                        pod_id = pod.get("id")
                        if pod_id:
                            self._cluster_name_to_pod_id[cluster_name] = pod_id
                        return pod
        except Exception as e:
            print(f"Error searching for pod by name: {e}")

        return None

    def _map_gpu_type_to_runpod(self, accelerators: Optional[str]) -> Optional[str]:
        """
        Map accelerator specification to RunPod GPU type ID.

        Args:
            accelerators: Accelerator string (e.g., "A100:1", "RTX 3090:1")

        Returns:
            RunPod GPU type ID or None
        """
        if not accelerators:
            return self.default_gpu_type

        # Parse accelerator string (e.g., "A100:1" -> "A100")
        parts = accelerators.split(":")
        gpu_type = parts[0].strip()

        # Try to get GPU types from RunPod API
        try:
            response = self._make_request("GET", "/gpu-types")
            gpu_types = response.json()
            if isinstance(gpu_types, list):
                for gt in gpu_types:
                    if gt.get("id") == gpu_type or gt.get("name") == gpu_type:
                        return gt.get("id")
            elif isinstance(gpu_types, dict):
                gpu_list = gpu_types.get("data", [])
                for gt in gpu_list:
                    if gt.get("id") == gpu_type or gt.get("name") == gpu_type:
                        return gt.get("id")
        except Exception:
            # If API call fails, return the original value or default
            pass

        # Fallback: return the GPU type as-is (might be a valid ID)
        return gpu_type or self.default_gpu_type

    def _map_runpod_status_to_cluster_state(self, runpod_status: str) -> ClusterState:
        """
        Map RunPod pod status to ClusterState.

        Args:
            runpod_status: RunPod status string

        Returns:
            ClusterState enum value
        """
        status_upper = runpod_status.upper()
        mapping = {
            "RUNNING": ClusterState.UP,
            "STOPPED": ClusterState.STOPPED,
            "TERMINATED": ClusterState.DOWN,
            "CREATING": ClusterState.INIT,
            "FAILED": ClusterState.FAILED,
            "RESTARTING": ClusterState.INIT,
        }
        return mapping.get(status_upper, ClusterState.UNKNOWN)

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """Launch a pod using RunPod API."""
        # Map GPU type
        gpu_type_id = self._map_gpu_type_to_runpod(config.accelerators)

        if not gpu_type_id:
            raise ValueError("GPU type is required. Specify accelerators or set default_gpu_type in provider config.")

        # Build pod creation payload
        pod_data = {
            "name": cluster_name,
            "imageName": config.provider_config.get("template_id") or self.default_template_id,
            "gpuTypeId": gpu_type_id,
        }

        # Add optional fields
        if config.disk_size:
            pod_data["volumeInGb"] = config.disk_size
        elif self.extra_config.get("default_volume_gb"):
            pod_data["volumeInGb"] = self.extra_config["default_volume_gb"]

        if config.provider_config.get("container_disk_gb"):
            pod_data["containerDiskInGb"] = config.provider_config["container_disk_gb"]

        if config.env_vars:
            pod_data["env"] = config.env_vars

        if self.default_network_volume_id or config.provider_config.get("network_volume_id"):
            pod_data["networkVolumeId"] = (
                config.provider_config.get("network_volume_id") or self.default_network_volume_id
            )

        if config.setup:
            # RunPod doesn't have a setup script field, but we can use dockerArgs
            pod_data["dockerArgs"] = config.setup

        if config.command:
            # Store command in provider_config for later execution
            pod_data["dockerArgs"] = (pod_data.get("dockerArgs", "") + f" && {config.command}").strip()

        if self.default_region or config.region:
            pod_data["region"] = config.region or self.default_region

        # Create pod
        try:
            response = self._make_request("POST", "/pods", json_data=pod_data)
            result = response.json()

            # Extract pod ID
            pod_id = None
            if isinstance(result, dict):
                pod_id = result.get("id") or result.get("pod", {}).get("id")
            elif isinstance(result, str):
                pod_id = result

            if pod_id:
                # Cache the mapping
                self._cluster_name_to_pod_id[cluster_name] = pod_id
                return {"pod_id": pod_id, "request_id": pod_id}
            else:
                return {"pod_id": None, "request_id": None, "response": result}
        except requests.exceptions.HTTPError as e:
            error_msg = f"Failed to create pod: {e}"
            if hasattr(e.response, "text"):
                error_msg += f" - {e.response.text}"
            raise RuntimeError(error_msg) from e

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        """Stop/terminate a pod."""
        pod = self._find_pod_by_name(cluster_name)
        if not pod:
            return {
                "status": "error",
                "message": f"Pod with name '{cluster_name}' not found",
                "cluster_name": cluster_name,
            }

        pod_id = pod.get("id")
        if not pod_id:
            return {
                "status": "error",
                "message": f"Pod '{cluster_name}' has no ID",
                "cluster_name": cluster_name,
            }

        try:
            # Terminate the pod
            response = self._make_request("DELETE", f"/pods/{pod_id}")
            result = response.json()

            # Remove from cache
            if cluster_name in self._cluster_name_to_pod_id:
                del self._cluster_name_to_pod_id[cluster_name]

            return {
                "status": "success",
                "message": f"Pod '{cluster_name}' terminated successfully",
                "cluster_name": cluster_name,
                "pod_id": pod_id,
                "result": result,
            }
        except requests.exceptions.HTTPError as e:
            error_msg = f"Failed to terminate pod: {e}"
            if hasattr(e.response, "text"):
                error_msg += f" - {e.response.text}"
            return {
                "status": "error",
                "message": error_msg,
                "cluster_name": cluster_name,
                "pod_id": pod_id,
            }

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """Get pod status."""
        pod = self._find_pod_by_name(cluster_name)
        if not pod:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="Pod not found",
            )

        # Map RunPod status to ClusterState
        runpod_status = pod.get("status", "UNKNOWN")
        state = self._map_runpod_status_to_cluster_state(runpod_status)

        # Extract additional info
        launched_at = pod.get("createdAt") or pod.get("created_at")
        last_use = pod.get("lastUsedAt") or pod.get("last_used_at")

        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=runpod_status,
            launched_at=str(launched_at) if launched_at else None,
            last_use=str(last_use) if last_use else None,
            num_nodes=1,  # RunPod pods are single-node
            resources_str=pod.get("gpuTypeId") or pod.get("gpuType", {}).get("name", ""),
            provider_data=pod,
        )

    def list_clusters(self) -> List[ClusterStatus]:
        """List all pods."""
        try:
            response = self._make_request("GET", "/pods")
            pods_data = response.json()

            # Handle different response formats
            pods = []
            if isinstance(pods_data, list):
                pods = pods_data
            elif isinstance(pods_data, dict):
                pods = pods_data.get("data", [])

            cluster_statuses = []
            for pod in pods:
                pod_name = pod.get("name", f"pod-{pod.get('id', 'unknown')}")
                runpod_status = pod.get("status", "UNKNOWN")
                state = self._map_runpod_status_to_cluster_state(runpod_status)

                # Cache the mapping
                pod_id = pod.get("id")
                if pod_id:
                    self._cluster_name_to_pod_id[pod_name] = pod_id

                launched_at = pod.get("createdAt") or pod.get("created_at")
                last_use = pod.get("lastUsedAt") or pod.get("last_used_at")

                cluster_statuses.append(
                    ClusterStatus(
                        cluster_name=pod_name,
                        state=state,
                        status_message=runpod_status,
                        launched_at=str(launched_at) if launched_at else None,
                        last_use=str(last_use) if last_use else None,
                        num_nodes=1,
                        resources_str=pod.get("gpuTypeId") or pod.get("gpuType", {}).get("name", ""),
                        provider_data=pod,
                    )
                )

            return cluster_statuses
        except Exception as e:
            print(f"Error listing pods: {e}")
            return []

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """Get pod resource information."""
        pod = self._find_pod_by_name(cluster_name)
        if not pod:
            return ResourceInfo(
                cluster_name=cluster_name,
                gpus=[],
                cpus=None,
                memory_gb=None,
                disk_gb=None,
                num_nodes=1,
            )

        # Extract GPU info
        gpus = []
        gpu_type = pod.get("gpuTypeId") or pod.get("gpuType", {})
        if isinstance(gpu_type, dict):
            gpu_name = gpu_type.get("name")
            gpu_count = gpu_type.get("count", 1)
            if gpu_name:
                gpus.append({"gpu": gpu_name, "count": gpu_count})
        elif isinstance(gpu_type, str):
            gpus.append({"gpu": gpu_type, "count": 1})

        # Extract disk info
        disk_gb = pod.get("volumeInGb") or pod.get("volumeInGB")

        # CPU and memory might not be directly available in pod data
        # They're typically determined by the GPU type
        cpus = pod.get("cpus")
        memory_gb = pod.get("memoryInGb") or pod.get("memoryInGB")

        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=gpus,
            cpus=cpus,
            memory_gb=memory_gb,
            disk_gb=disk_gb,
            num_nodes=1,
            provider_data=pod,
        )

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """
        Submit a job to a pod.

        Note: RunPod doesn't have a traditional job queue. We'll execute the command
        via the pod's exec endpoint or SSH if available.
        """
        pod = self._find_pod_by_name(cluster_name)
        if not pod:
            raise ValueError(f"Pod '{cluster_name}' not found")

        pod_id = pod.get("id")
        if not pod_id:
            raise ValueError(f"Pod '{cluster_name}' has no ID")

        # RunPod doesn't have a job submission endpoint
        # We'll return a job ID based on the pod and command
        # In practice, you might need to SSH into the pod or use RunPod's exec feature
        job_id = f"{pod_id}-{int(time.time())}"

        return {
            "job_id": job_id,
            "pod_id": pod_id,
            "cluster_name": cluster_name,
            "message": "Job execution initiated (RunPod uses pod-based execution)",
        }

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """
        List jobs for a pod.

        Note: RunPod doesn't have a job queue. We return empty list or could
        track jobs via pod execution history.
        """
        # RunPod doesn't have a job queue system
        # Return empty list or implement custom job tracking if needed
        return []

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """
        Get job logs.

        Note: RunPod doesn't have a job logs endpoint. We might need to
        SSH into the pod or use RunPod's logs feature if available.
        """
        # RunPod doesn't have a direct job logs endpoint
        # Would need to SSH into pod or use RunPod's pod logs endpoint
        return "Logs not available via RunPod API. Use pod SSH access or RunPod console."

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """
        Cancel a job.

        Note: RunPod doesn't have a job cancellation endpoint. We might need to
        SSH into the pod and kill the process.
        """
        return {
            "status": "error",
            "message": "Job cancellation not supported via RunPod API. Use pod SSH access.",
            "job_id": job_id,
            "cluster_name": cluster_name,
        }

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """Get detailed cluster information."""
        clusters = self.list_clusters()
        detailed = []

        for cluster_status in clusters:
            cluster_name = cluster_status.cluster_name
            resource_info = self.get_cluster_resources(cluster_name)

            # Convert GPUs list to dict
            gpus_dict = {}
            if resource_info.gpus:
                for gpu_info in resource_info.gpus:
                    if isinstance(gpu_info, dict):
                        gpu_type = gpu_info.get("gpu")
                        gpu_count = gpu_info.get("count", 0)
                        if gpu_type:
                            gpus_dict[gpu_type] = gpu_count

            state_str = (
                cluster_status.state.name if hasattr(cluster_status.state, "name") else str(cluster_status.state)
            )
            is_pod_up = state_str.upper() in ["UP", "INIT"]

            # Build node entry (RunPod pods are single-node)
            node = {
                "node_name": cluster_name,
                "is_fixed": False,  # RunPod pods are elastic
                "is_active": is_pod_up,
                "state": state_str.upper(),
                "reason": cluster_status.status_message or state_str,
                "resources": {
                    "cpus_total": resource_info.cpus or 0,
                    "cpus_allocated": resource_info.cpus or 0 if is_pod_up else 0,
                    "gpus": gpus_dict,
                    "gpus_free": {} if is_pod_up else gpus_dict,
                    "memory_gb_total": resource_info.memory_gb or 0,
                    "memory_gb_allocated": resource_info.memory_gb or 0 if is_pod_up else 0,
                },
            }

            cluster_detail = {
                "cluster_id": cluster_name,
                "cluster_name": cluster_name,
                "backend_type": "RunPod",
                "elastic_enabled": True,
                "max_nodes": 1,
                "head_node_ip": cluster_status.provider_data.get("runtime", {}).get("publicIp"),
                "nodes": [node],
            }

            detailed.append(cluster_detail)

        return detailed

    def check(self) -> bool:
        """Check if the RunPod provider is active and accessible."""
        try:
            # Make a lightweight API call to verify API key is valid
            self._make_request("GET", "/pods", timeout=5)
            # If we get a response (even empty), the API key is valid
            return True
        except requests.exceptions.HTTPError as e:
            # 401/403 means invalid API key
            if hasattr(e, "response") and e.response.status_code in [401, 403]:
                return False
            # Other errors might be temporary
            return False
        except Exception:
            # Connection errors, timeouts, etc.
            return False
