"""Runpod provider implementation."""

import requests
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


class RunpodProvider(ComputeProvider):
    """Provider implementation for Runpod API."""

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
        Initialize Runpod provider.

        Args:
            api_key: Runpod API key (required)
            api_base_url: Base URL for Runpod API (defaults to https://rest.runpod.io/v1)
            default_gpu_type: Default GPU type (e.g., "RTX 3090", "A100")
            default_region: Default region
            default_template_id: Default Docker template ID
            default_network_volume_id: Default network volume ID
            extra_config: Additional provider-specific configuration
        """
        self.api_key = api_key
        self.api_base_url = (api_base_url or "https://rest.runpod.io/v1").rstrip("/")
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
        Make authenticated request to Runpod API.

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
        Find a pod by cluster name. Runpod uses pod IDs, not names, so we need to
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
        Map accelerator specification to Runpod GPU type ID.

        Args:
            accelerators: Accelerator string (e.g., "A100:1", "RTX 3090:1")

        Returns:
            Runpod GPU type ID or None
        """
        if not accelerators:
            return self.default_gpu_type

        # Parse accelerator string (e.g., "A100:1" -> "A100")
        parts = accelerators.split(":")
        gpu_type = parts[0].strip()

        # Common GPU type mappings (abbreviation -> full Runpod name)
        gpu_mappings = {
            "RTX3090": "NVIDIA GeForce RTX 3090",
            "RTX3080": "NVIDIA GeForce RTX 3080",
            "RTX3070": "NVIDIA GeForce RTX 3070",
            "RTX4090": "NVIDIA GeForce RTX 4090",
            "RTX4080": "NVIDIA GeForce RTX 4080",
            "RTX4070TI": "NVIDIA GeForce RTX 4070 Ti",
            "RTX3080TI": "NVIDIA GeForce RTX 3080 Ti",
            "RTX3090TI": "NVIDIA GeForce RTX 3090 Ti",
            "RTX5080": "NVIDIA GeForce RTX 5080",
            "RTX5090": "NVIDIA GeForce RTX 5090",
            "A100": "NVIDIA A100-SXM4-80GB",  # Default to SXM4-80GB
            "A100-80GB": "NVIDIA A100-SXM4-80GB",
            "A100-PCIE": "NVIDIA A100 80GB PCIe",
            "A40": "NVIDIA A40",
            "A30": "NVIDIA A30",
            "A5000": "NVIDIA RTX A5000",
            "A4500": "NVIDIA RTX A4500",
            "A4000": "NVIDIA RTX A4000",
            "A6000": "NVIDIA RTX A6000",
            "A2000": "NVIDIA RTX A2000",
            "L40": "NVIDIA L40",
            "L40S": "NVIDIA L40S",
            "L4": "NVIDIA L4",
            "H100": "NVIDIA H100 80GB HBM3",  # Default to 80GB HBM3
            "H100-PCIE": "NVIDIA H100 PCIe",
            "H100-NVL": "NVIDIA H100 NVL",
            "H200": "NVIDIA H200",
            "H200-NVL": "NVIDIA H200 NVL",
            "V100": "Tesla V100-PCIE-16GB",  # Default to PCIE-16GB
            "V100-16GB": "Tesla V100-PCIE-16GB",
            "V100-32GB": "Tesla V100-PCIE-32GB",
            "T4": "Tesla T4",
            "RTX6000": "NVIDIA RTX 6000 Ada Generation",
            "RTX5000": "NVIDIA RTX 5000 Ada Generation",
            "RTX4000": "NVIDIA RTX 4000 Ada Generation",
            "RTX2000": "NVIDIA RTX 2000 Ada Generation",
        }

        # Check if we have a direct mapping
        if gpu_type.upper() in gpu_mappings:
            gpu_type = gpu_mappings[gpu_type.upper()]

        # Try to get GPU types from Runpod API
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
            # If API call fails, return the mapped value
            pass

        # Fallback: return the mapped GPU type (might be a valid ID)
        return gpu_type

    def _map_runpod_status_to_cluster_state(self, runpod_status: str) -> ClusterState:
        """
        Map Runpod pod status to ClusterState.

        Args:
            runpod_status: Runpod status string

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
        """Launch a pod using Runpod API."""
        # Determine compute type based on accelerators
        if config.accelerators:
            # GPU pod
            compute_type = "GPU"
            gpu_type_id = self._map_gpu_type_to_runpod(config.accelerators)
            if not gpu_type_id:
                raise ValueError(
                    "GPU type is required. Specify accelerators or set default_gpu_type in provider config."
                )

            # Parse GPU count from accelerator string (e.g., "RTX3090:2" -> 2)
            parts = config.accelerators.split(":")
            gpu_count = 1
            if len(parts) > 1:
                try:
                    gpu_count = int(parts[1].strip())
                except ValueError:
                    gpu_count = 1

            # Use GPU-enabled image
            default_image = "runpod/pytorch:2.1.0-py3.10-cuda11.8.0-devel-ubuntu22.04"
        else:
            # CPU pod
            compute_type = "CPU"
            gpu_type_id = None
            gpu_count = None
            # Use basic CPU image
            default_image = "ubuntu:22.04"

        # Get image name from config or use default
        image_name = config.provider_config.get("template_id") or self.default_template_id or default_image

        # Build pod creation payload
        pod_data = {
            "name": cluster_name,
            "imageName": image_name,
            "computeType": compute_type,
        }

        # Add GPU-specific fields if GPU pod
        if compute_type == "GPU":
            pod_data["gpuTypeIds"] = [gpu_type_id]
            pod_data["gpuCount"] = gpu_count

        # Add CPU-specific fields if CPU pod
        elif compute_type == "CPU":
            # Set default CPU resources if not specified
            pod_data["vcpuCount"] = config.cpus or 2
            if config.memory:
                # Convert memory to GB if specified as string with units
                try:
                    if isinstance(config.memory, str):
                        # Parse memory string like "4GB" or "4096"
                        if config.memory.upper().endswith("GB"):
                            memory_gb = float(config.memory[:-2])
                        elif config.memory.upper().endswith("MB"):
                            memory_gb = float(config.memory[:-2]) / 1024
                        else:
                            memory_gb = float(config.memory)
                    else:
                        memory_gb = float(config.memory)
                    pod_data["memoryInGb"] = memory_gb
                except (ValueError, TypeError):
                    pass  # Use default if parsing fails
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

        # Build dockerStartCmd - Runpod expects a single command string or array
        # that will be executed by the container's entrypoint
        docker_cmds = []

        if config.setup:
            # Setup commands should run first
            docker_cmds.append(config.setup)

        if config.command:
            # Main command to execute
            docker_cmds.append(config.command)

        # Join commands with && so they run sequentially
        # Wrap in sh -c so complex commands with arguments work properly
        if docker_cmds:
            # If we have multiple commands, join them
            combined_cmd = " && ".join(docker_cmds)
            # Wrap in sh -c to ensure proper command execution
            # This prevents issues with exec trying to find "echo hello" as a single executable
            pod_data["dockerStartCmd"] = ["sh", "-c", combined_cmd]
        elif config.setup:
            # Just setup, no command
            pod_data["dockerStartCmd"] = ["sh", "-c", config.setup]
        elif config.command:
            # Just command, no setup
            pod_data["dockerStartCmd"] = ["sh", "-c", config.command]

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

        # Map Runpod status to ClusterState
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
            num_nodes=1,  # Runpod pods are single-node
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

        Note: Runpod doesn't have a traditional job queue. We'll execute the command
        via the pod's exec endpoint or SSH if available.
        """
        raise NotImplementedError("Runpod doesn't have a job submission endpoint")

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """
        List jobs for a pod.

        Note: Runpod doesn't have a job queue. We return empty list or could
        track jobs via pod execution history.
        """
        raise NotImplementedError("Runpod doesn't have a job queue system")

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """
        Get job logs.

        Note: Runpod doesn't have a job logs endpoint. We might need to
        SSH into the pod or use Runpod's logs feature if available.
        """
        # Runpod doesn't have a direct job logs endpoint
        # Would need to SSH into pod or use Runpod's pod logs endpoint
        return "Logs not available via Runpod API. Use Runpod console."

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """
        Cancel a job.

        Note: Runpod doesn't have a job cancellation endpoint. We might need to
        SSH into the pod and kill the process.
        """
        raise NotImplementedError("Runpod doesn't have a job cancellation endpoint")

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

            # Build node entry (Runpod pods are single-node)
            node = {
                "node_name": cluster_name,
                "is_fixed": False,  # Runpod pods are elastic
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
                "backend_type": "Runpod",
                "elastic_enabled": True,
                "max_nodes": 1,
                "head_node_ip": cluster_status.provider_data.get("runtime", {}).get("publicIp"),
                "nodes": [node],
            }

            detailed.append(cluster_detail)

        return detailed

    def check(self) -> bool:
        """Check if the Runpod provider is active and accessible."""
        try:
            # Make a lightweight API call to verify API key is valid

            self._make_request("GET", "/pods", timeout=5)
            # If we get a response (even empty), the API key is valid
            return True
        except requests.exceptions.HTTPError as e:
            # 401/403 means invalid API key
            if hasattr(e, "response") and e.response.status_code in [401, 403]:
                print(f"Runpod provider check failed: {e.response.text}")
                return False
            # Other errors might be temporary
            print(f"Runpod provider check failed: {e.response.text}")
            return False
        except Exception as e:
            print(f"Runpod provider check failed: {e}")
            # Connection errors, timeouts, etc.
            return False
