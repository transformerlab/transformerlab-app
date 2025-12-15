"""SkyPilot provider implementation."""

import requests
import json
import re
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
    JobState,
)

# SkyPilot SDK imports - try to import, but allow graceful failure if not available
SKYPILOT_AVAILABLE = False
SKYPILOT_IMPORT_ERROR = None

try:
    import sky
    from sky import resources as sky_resources
    from sky.utils import dag_utils
    from sky.server.requests import payloads
    from sky.backends import backend_utils
    from sky.server import common as server_common
    from sky.utils import common as sky_common
    from sky.check import get_cached_enabled_clouds_or_refresh
    from sky.clouds import CloudCapability
    from sky.clouds import SSH
    from sky.provision.kubernetes import utils as k8s_utils

    SKYPILOT_AVAILABLE = True
except ImportError:
    raise ImportError("SkyPilot SDK is required. Install with: pip install skypilot")
except Exception:
    raise ImportError("SkyPilot SDK is required. Install with: pip install skypilot")


class SkyPilotProvider(ComputeProvider):
    """Provider implementation for SkyPilot remote server API."""

    def __init__(
        self,
        server_url: str,
        api_token: Optional[str] = None,
        default_env_vars: Optional[Dict[str, str]] = None,
        default_entrypoint_command: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize SkyPilot provider.

        Args:
            server_url: Base URL of the SkyPilot server
            api_token: Optional API token for authentication
            default_env_vars: Default environment variables to include in requests
            default_entrypoint_command: Default entrypoint command
            extra_config: Additional provider-specific configuration
        """
        self.server_url = server_url.rstrip("/")
        self.api_token = api_token
        self.default_env_vars = default_env_vars or {}
        self.default_entrypoint_command = default_entrypoint_command
        self.extra_config = extra_config or {}

        # Store server_common reference if available
        self._server_common = server_common if SKYPILOT_AVAILABLE else None

        if not SKYPILOT_AVAILABLE:
            error_msg = "SkyPilot SDK is required. Install with: pip install skypilot"
            if SKYPILOT_IMPORT_ERROR:
                error_msg += f"\nImport error details: {SKYPILOT_IMPORT_ERROR}"
            # Check if sky command is available but Python package isn't
            import shutil

            if shutil.which("sky"):
                error_msg += "\nNote: 'sky' command is available, but Python package imports are failing."
                error_msg += "\nThis may indicate a mismatch between CLI and Python package installations."
                error_msg += "\nTry: pip install --upgrade skypilot"
            raise ImportError(error_msg)

    def _make_authenticated_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: Union[int, tuple] = 5,
        stream: bool = False,
    ):
        """
        Make authenticated request to SkyPilot API using server_common.
        Matches SkyPilot SDK's make_authenticated_request but with custom server URL.
        """
        if self._server_common:
            try:
                # Try to use SkyPilot's make_authenticated_request
                # We need to temporarily override the API server URL
                # Make the request using SkyPilot's method
                # Note: SkyPilot's make_authenticated_request may not support server_url parameter
                # If it doesn't, we'll fall back to manual request
                kwargs = {"json": json_data, "timeout": timeout}
                if stream:
                    kwargs["stream"] = stream
                if hasattr(self._server_common.make_authenticated_request, "__code__"):
                    # Check if server_url parameter is supported
                    import inspect

                    sig = inspect.signature(self._server_common.make_authenticated_request)
                    if "server_url" in sig.parameters:
                        kwargs["server_url"] = self.server_url

                response = self._server_common.make_authenticated_request(method, endpoint, **kwargs)
                return response
            except Exception:
                # Fall back to manual request if SkyPilot's method fails
                pass

        # Fallback: manual request using requests
        url = f"{self.server_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if self.api_token:
            headers["Authorization"] = f"Bearer {self.api_token}"

        response = requests.request(
            method=method, url=url, json=json_data, headers=headers, timeout=timeout, stream=stream
        )
        response.raise_for_status()
        return response

    def _get_request_result(self, request_id: str):
        """
        Get the result of a request by its request ID.
        This implements the same logic as sky.client.common.get() but uses our custom server_url.

        Args:
            request_id: The request ID to get results for

        Returns:
            The return_value from the request task
        """
        # Get timeout from client_common if available
        try:
            from sky.client import common as client_common

            timeout = (
                getattr(client_common, "API_SERVER_REQUEST_CONNECTION_TIMEOUT_SECONDS", 5),
                None,  # No read timeout
            )
        except (ImportError, AttributeError):
            timeout = (5, None)

        # Make GET request to /api/get?request_id={request_id}
        response = self._make_authenticated_request(
            "GET", f"/api/get?request_id={request_id}", json_data=None, timeout=timeout
        )

        # Parse the response
        if hasattr(response, "status_code"):
            if response.status_code == 200:
                try:
                    response_json = response.json()
                    # The response should be a RequestPayload
                    # We need to decode it using requests_lib.Request.decode
                    try:
                        from sky.server import requests_lib

                        request_task = requests_lib.Request.decode(payloads.RequestPayload(**response_json))
                    except (ImportError, AttributeError, Exception):
                        # Fallback: try to extract return_value directly
                        if isinstance(response_json, dict):
                            return_value = response_json.get("return_value")
                            if return_value:
                                # return_value might be a JSON string
                                try:
                                    return json.loads(return_value)
                                except (json.JSONDecodeError, TypeError):
                                    return return_value
                        return response_json

                    # Check for errors
                    error = request_task.get_error() if hasattr(request_task, "get_error") else None
                    if error is not None:
                        error_obj = error.get("object") if isinstance(error, dict) else error
                        raise RuntimeError(f"Request failed with error: {error_obj}")

                    # Check if cancelled
                    if hasattr(request_task, "status"):
                        try:
                            from sky.server import requests_lib as req_lib

                            if request_task.status == req_lib.RequestStatus.CANCELLED:
                                raise RuntimeError(f"Request {request_id} was cancelled")
                        except (ImportError, AttributeError):
                            pass

                    # Get return value
                    if hasattr(request_task, "get_return_value"):
                        return request_task.get_return_value()
                    elif hasattr(request_task, "return_value"):
                        return_value = request_task.return_value
                        if isinstance(return_value, str):
                            try:
                                return json.loads(return_value)
                            except json.JSONDecodeError:
                                return return_value
                        return return_value
                    else:
                        return response_json
                except Exception as e:
                    raise RuntimeError(f"Failed to parse response for request {request_id}: {e}")
            elif response.status_code == 500:
                try:
                    response_json = response.json()
                    detail = response_json.get("detail", response_json)
                    try:
                        from sky.server import requests_lib

                        request_task = requests_lib.Request.decode(payloads.RequestPayload(**detail))
                        error = request_task.get_error() if hasattr(request_task, "get_error") else None
                        if error:
                            error_obj = error.get("object") if isinstance(error, dict) else error
                            raise RuntimeError(f"Request failed with error: {error_obj}")
                    except (ImportError, AttributeError):
                        pass
                except Exception:
                    pass
                raise RuntimeError(f"Failed to get request {request_id}: {response.status_code} {response.text}")
            else:
                raise RuntimeError(f"Failed to get request {request_id}: {response.status_code} {response.text}")
        else:
            raise RuntimeError(f"Invalid response for request {request_id}")

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """Launch a cluster using SkyPilot."""

        # Build sky.Task object from ClusterConfig
        if config.env_vars:
            task = sky.Task(envs=config.env_vars)
        else:
            task = sky.Task()

        # Set run command
        if config.command:
            task.run = config.command

        # Set setup commands
        if config.setup:
            task.setup = config.setup

        # Set file mounts (remote path -> local path)
        # This mirrors the SkyPilot SDK: task.set_file_mounts({...})
        if getattr(config, "file_mounts", None):
            try:
                task.set_file_mounts(config.file_mounts)
            except Exception:
                # If file mounts fail to set (e.g., invalid paths), continue without them
                pass

        # Build Resources object
        resources_kwargs = {}
        if config.instance_type:
            resources_kwargs["instance_type"] = config.instance_type
        if config.cpus:
            resources_kwargs["cpus"] = str(config.cpus)
        if config.memory:
            resources_kwargs["memory"] = str(config.memory)
        if config.accelerators:
            resources_kwargs["accelerators"] = config.accelerators
        if config.disk_size:
            resources_kwargs["disk_size"] = config.disk_size
        if config.cloud:
            # Convert cloud string to sky.clouds.Cloud object
            try:
                cloud_obj = sky.clouds.CLOUD_REGISTRY.from_str(config.cloud)
                resources_kwargs["cloud"] = cloud_obj
            except Exception:
                # If cloud string is invalid, skip it
                pass
        if config.region:
            resources_kwargs["region"] = config.region
        if config.zone:
            resources_kwargs["zone"] = config.zone
        if config.use_spot:
            resources_kwargs["use_spot"] = True

        if resources_kwargs:
            task.set_resources(sky_resources.Resources(**resources_kwargs))

        # Set num_nodes if specified
        if config.num_nodes and config.num_nodes > 1:
            task.num_nodes = config.num_nodes

        # Convert Task to DAG and then to YAML string using SkyPilot's built-in method
        # This matches how the SDK does it internally
        dag = dag_utils.convert_entrypoint_to_dag(task)

        # Upload mounts if needed (for file mounts, etc.)
        try:
            # Try to import upload_mounts_to_api_server - it may be in different locations
            client_common = None
            if SKYPILOT_AVAILABLE:
                try:
                    from sky.client import common as client_common
                except ImportError:
                    try:
                        from sky import client_common
                    except ImportError:
                        pass

            if client_common and hasattr(client_common, "upload_mounts_to_api_server"):
                dag = client_common.upload_mounts_to_api_server(dag)
        except Exception:
            # If upload_mounts fails, continue without it
            pass

        dag_str = dag_utils.dump_chain_dag_to_yaml_str(dag)

        # Get backend if specified in provider_config
        backend = None
        if config.provider_config.get("backend"):
            try:
                backend = backend_utils.get_backend_from_str(config.provider_config["backend"])
            except Exception:
                pass

        # Build LaunchBody using SkyPilot's payload class
        body = payloads.LaunchBody(
            task=dag_str,
            cluster_name=cluster_name,
            retry_until_up=config.provider_config.get("retry_until_up", False),
            idle_minutes_to_autostop=config.idle_minutes_to_autostop,
            dryrun=config.provider_config.get("dryrun", False),
            down=True,  # Always tear down cluster after jobs finish
            backend=backend.NAME if backend else None,
            optimize_target=config.provider_config.get("optimize_target", 0),  # 0 = COST
            no_setup=config.provider_config.get("no_setup", False),
            clone_disk_from=config.provider_config.get("clone_disk_from"),
            fast=config.provider_config.get("fast", False),
            quiet_optimizer=config.provider_config.get("quiet_optimizer", False),
            is_launched_by_jobs_controller=config.provider_config.get("is_launched_by_jobs_controller", False),
            is_launched_by_sky_serve_controller=config.provider_config.get(
                "is_launched_by_sky_serve_controller", False
            ),
            disable_controller_check=config.provider_config.get("disable_controller_check", False),
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        # Note: LaunchBody may already include env_vars and entrypoint_command fields
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command if not already in LaunchBody
        # These are typically added by the SDK's request building, but we add them here
        # to match the expected API format
        # Merge user-provided env_vars with default_env_vars (user vars take precedence)
        if config.env_vars or self.default_env_vars:
            if "env_vars" not in body_json:
                body_json["env_vars"] = {}
            # First add defaults, then override with user-provided env_vars
            if self.default_env_vars:
                body_json["env_vars"].update(self.default_env_vars)
            if config.env_vars:
                body_json["env_vars"].update(config.env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        # This matches: server_common.make_authenticated_request('POST', '/launch', json=json.loads(body.model_dump_json()), timeout=5)
        response = self._make_authenticated_request("POST", "/launch", json_data=body_json, timeout=5)

        # Get request ID using SkyPilot's method (matches SDK exactly)
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
                return {"request_id": request_id}
            except Exception:
                pass

        # Fallback: try to extract request_id from response
        try:
            if hasattr(response, "json"):
                result = response.json()
                if isinstance(result, dict):
                    return result
            return {"response": response}
        except Exception:
            return {}

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        """Stop a cluster."""

        # Build StopOrDownBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.StopOrDownBody(
            cluster_name=cluster_name,
            purge=False,  # stop doesn't purge, only down does
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/down", json_data=body_json, timeout=30)

        # Get request ID using SkyPilot's method (matches SDK exactly)
        request_id = None
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
            except Exception:
                pass

        # Fallback: try to extract request_id from response
        if not request_id:
            try:
                if hasattr(response, "json"):
                    result = response.json()
                    if isinstance(result, dict):
                        request_id = result.get("request_id")
            except Exception:
                pass

        # If we have a request_id, wait for the operation to complete
        if request_id:
            try:
                # Wait for the stop operation to complete
                result = self._get_request_result(request_id)
                return {
                    "status": "success",
                    "message": f"Cluster '{cluster_name}' stopped successfully",
                    "cluster_name": cluster_name,
                    "request_id": request_id,
                    "result": result,
                }
            except Exception:
                return {
                    "status": "error",
                    "message": f"Failed to stop cluster '{cluster_name}'",
                    "cluster_name": cluster_name,
                    "request_id": request_id,
                }

        # Fallback: return basic response if we can't get request_id
        return {
            "status": "initiated",
            "message": f"Cluster '{cluster_name}' stop initiated",
            "cluster_name": cluster_name,
        }

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """Get cluster status."""
        # Get StatusRefreshMode from SkyPilot
        if sky_common and hasattr(sky_common, "StatusRefreshMode"):
            refresh_mode = sky_common.StatusRefreshMode.NONE
        else:
            # Fallback if StatusRefreshMode is not available
            refresh_mode = "NONE"

        # Build StatusBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.StatusBody(
            cluster_names=[cluster_name],
            refresh=refresh_mode,
            all_users=False,
            include_credentials=False,
            summary_response=False,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})
        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/status", json_data=body_json, timeout=10)

        # Check response status
        if hasattr(response, "status_code"):
            if response.status_code != 200:
                return ClusterStatus(
                    cluster_name=cluster_name,
                    state=ClusterState.UNKNOWN,
                    status_message=f"API returned status code {response.status_code}",
                )

        # Parse response content
        response_content = None
        is_null_response = False
        if hasattr(response, "content"):
            if response.content == b"null" or response.content == b"":
                is_null_response = True
            else:
                try:
                    response_content = response.json() if hasattr(response, "json") else None
                except Exception as e:
                    print(f"Warning: Could not parse response as JSON: {e}")
                    response_content = None

        # Get request ID using SkyPilot's method (matches SDK exactly)
        request_id = None
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
                # For debugging: return early after getting request_id
                # print(f"Got request_id: {request_id}")
                # return ClusterStatus(
                #     cluster_name=cluster_name,
                #     state=ClusterState.UNKNOWN,
                #     status_message=f"Debug: Got request_id {request_id}",
                # )
            except Exception as e:
                # If get_request_id fails, try to extract from response directly
                if response_content and isinstance(response_content, dict):
                    request_id = response_content.get("request_id")
                # Also check headers
                if not request_id and hasattr(response, "headers"):
                    request_id = (
                        response.headers.get("X-Request-ID")
                        or response.headers.get("Request-ID")
                        or response.headers.get("X-Request-Id")
                    )
                if not request_id:
                    print(f"Warning: Could not extract request_id: {e}")
                    print(f"Response status: {getattr(response, 'status_code', 'unknown')}")
                    print(f"Response headers: {getattr(response, 'headers', {})}")
                    print(f"Response content: {getattr(response, 'content', b'')[:200]}")

        # If response is null and we don't have a request ID, the cluster likely doesn't exist
        if is_null_response and not request_id:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="API returned null response - cluster may not exist or request format is incorrect",
            )

        # Get the actual result from the request ID
        clusters = []
        if request_id:
            try:
                # Use our custom _get_request_result() to get the actual response
                # This makes a GET request to /api/get?request_id={request_id}
                # and returns the return_value from the request task
                clusters = self._get_request_result(request_id)
                # The return value should be a list of clusters
                if not isinstance(clusters, list):
                    # If it's not a list, try to convert it
                    if isinstance(clusters, str):
                        clusters = json.loads(clusters)
                    elif isinstance(clusters, dict):
                        clusters = clusters.get("clusters", [clusters])
                    else:
                        clusters = [clusters] if clusters else []
            except Exception as e:
                print(f"Warning: Could not get clusters from request_id {request_id}: {e}")
                # Fallback: try to parse response directly
                try:
                    if response_content:
                        clusters = (
                            response_content
                            if isinstance(response_content, list)
                            else response_content.get("clusters", [])
                        )
                    elif hasattr(response, "json"):
                        result = response.json()
                        clusters = result if isinstance(result, list) else result.get("clusters", [])
                except Exception as parse_error:
                    print(f"Warning: Could not parse response: {parse_error}")
                    clusters = []
        else:
            # Fallback: try to parse response directly
            try:
                if response_content:
                    clusters = (
                        response_content if isinstance(response_content, list) else response_content.get("clusters", [])
                    )
                elif hasattr(response, "json"):
                    result = response.json()
                    clusters = result if isinstance(result, list) else result.get("clusters", [])
            except Exception as e:
                print(f"Warning: Could not parse response directly: {e}")
                clusters = []

        # Handle empty or invalid responses
        if not clusters or not isinstance(clusters, list):
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="Cluster not found or no response from SkyPilot API",
            )

        # Find the cluster in the response
        cluster_data = None
        for cluster in clusters:
            if cluster.get("name") == cluster_name:
                cluster_data = cluster
                break

        if not cluster_data:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="Cluster not found",
            )

        # Parse SkyPilot status response
        # The status field is a sky.ClusterStatus enum, convert to string
        status_value = cluster_data.get("status")
        if hasattr(status_value, "value"):
            state_str = status_value.value.upper()
        elif isinstance(status_value, str):
            state_str = status_value.upper()
        else:
            state_str = "UNKNOWN"

        try:
            state = ClusterState[state_str]
        except KeyError:
            state = ClusterState.UNKNOWN

        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message=str(status_value) if status_value else "",
            launched_at=str(cluster_data.get("launched_at")) if cluster_data.get("launched_at") else None,
            last_use=cluster_data.get("last_use"),
            autostop=cluster_data.get("autostop"),
            num_nodes=cluster_data.get("num_nodes"),
            resources_str=cluster_data.get("resources_str_full"),
            provider_data=cluster_data,
        )

    def list_clusters(self) -> List[ClusterStatus]:
        """List all clusters."""
        # Get StatusRefreshMode from SkyPilot
        if sky_common and hasattr(sky_common, "StatusRefreshMode"):
            refresh_mode = sky_common.StatusRefreshMode.NONE
        else:
            # Fallback if StatusRefreshMode is not available
            refresh_mode = "NONE"

        # Build StatusBody using SkyPilot's payload class
        # Set cluster_names to None or empty to get all clusters
        body = payloads.StatusBody(
            cluster_names=None,  # None means get all clusters
            refresh=refresh_mode,
            all_users=False,
            include_credentials=False,
            summary_response=False,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/status", json_data=body_json, timeout=10)

        # Check response status
        if hasattr(response, "status_code"):
            if response.status_code != 200:
                return []

        # Parse response content
        response_content = None
        if hasattr(response, "content"):
            if response.content == b"null" or response.content == b"":
                response_content = None
            else:
                try:
                    response_content = response.json() if hasattr(response, "json") else None
                except Exception as e:
                    print(f"Warning: Could not parse response as JSON: {e}")
                    response_content = None

        # Get request ID using SkyPilot's method (matches SDK exactly)
        request_id = None
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
            except Exception as e:
                # If get_request_id fails, try to extract from response directly
                if response_content and isinstance(response_content, dict):
                    request_id = response_content.get("request_id")
                # Also check headers
                if not request_id and hasattr(response, "headers"):
                    request_id = (
                        response.headers.get("X-Request-ID")
                        or response.headers.get("Request-ID")
                        or response.headers.get("X-Request-Id")
                    )
                if not request_id:
                    print(f"Warning: Could not extract request_id: {e}")

        # Get the actual result from the request ID
        clusters = []
        if request_id:
            try:
                # Use our custom _get_request_result() to get the actual response
                clusters = self._get_request_result(request_id)
                # The return value should be a list of clusters
                if not isinstance(clusters, list):
                    # If it's not a list, try to convert it
                    if isinstance(clusters, str):
                        clusters = json.loads(clusters)
                    elif isinstance(clusters, dict):
                        clusters = clusters.get("clusters", [clusters])
                    else:
                        clusters = [clusters] if clusters else []
            except Exception as e:
                print(f"Warning: Could not get clusters from request_id {request_id}: {e}")
                # Fallback: try to parse response directly
                try:
                    if response_content:
                        clusters = (
                            response_content
                            if isinstance(response_content, list)
                            else response_content.get("clusters", [])
                        )
                    elif hasattr(response, "json"):
                        result = response.json()
                        clusters = result if isinstance(result, list) else result.get("clusters", [])
                except Exception as parse_error:
                    print(f"Warning: Could not parse response: {parse_error}")
                    clusters = []
        else:
            # Fallback: try to parse response directly
            try:
                if response_content:
                    clusters = (
                        response_content if isinstance(response_content, list) else response_content.get("clusters", [])
                    )
                elif hasattr(response, "json"):
                    result = response.json()
                    clusters = result if isinstance(result, list) else result.get("clusters", [])
            except Exception as e:
                print(f"Warning: Could not parse response directly: {e}")
                clusters = []

        # Handle empty or invalid responses
        if not clusters or not isinstance(clusters, list):
            return []

        # Parse cluster data into ClusterStatus objects
        cluster_statuses = []
        for cluster_data in clusters:
            # Parse SkyPilot status response
            # The status field is a sky.ClusterStatus enum, convert to string
            status_value = cluster_data.get("status")
            if hasattr(status_value, "value"):
                state_str = status_value.value.upper()
            elif isinstance(status_value, str):
                state_str = status_value.upper()
            else:
                state_str = "UNKNOWN"

            try:
                state = ClusterState[state_str]
            except KeyError:
                state = ClusterState.UNKNOWN

            cluster_statuses.append(
                ClusterStatus(
                    cluster_name=cluster_data.get("name", "unknown"),
                    state=state,
                    status_message=str(status_value) if status_value else "",
                    launched_at=str(cluster_data.get("launched_at")) if cluster_data.get("launched_at") else None,
                    last_use=cluster_data.get("last_use"),
                    autostop=cluster_data.get("autostop"),
                    num_nodes=cluster_data.get("num_nodes"),
                    resources_str=cluster_data.get("resources_str_full"),
                    provider_data=cluster_data,
                )
            )

        return cluster_statuses

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """Get cluster resources."""
        # SkyPilot doesn't have a dedicated resources endpoint,
        # so we get it from status
        status = self.get_cluster_status(cluster_name)

        # Use resources_str_full if available, otherwise fall back to resources_str
        resources_str = status.provider_data.get("resources_str_full") or status.resources_str or ""

        # Also check provider_data for direct resource fields
        provider_data = status.provider_data or {}
        num_nodes = status.num_nodes or provider_data.get("nodes") or 1

        # Parse resources from resources_str_full
        # Format: "1x(gpus=RTX3090:1, cpus=4, mem=16, 4CPU--16GB--RTX3090:1, disk=256)"
        gpus = []
        cpus = None
        memory_gb = None
        disk_gb = None

        if resources_str:
            # Extract num_nodes from prefix (e.g., "1x(...)" or "2x(...)")
            node_match = re.match(r"(\d+)x\(", resources_str)
            if node_match:
                num_nodes = int(node_match.group(1))

            # Extract GPUs: gpus=RTX3090:1 or gpus=V100:2
            gpu_match = re.search(r"gpus=([\w\d]+):(\d+)", resources_str)
            if gpu_match:
                gpu_type = gpu_match.group(1)
                gpu_count = int(gpu_match.group(2))
                gpus.append({"gpu": gpu_type, "count": gpu_count})

            # Extract CPUs: cpus=4
            cpu_match = re.search(r"cpus=([\d.]+)", resources_str)
            if cpu_match:
                cpus = int(float(cpu_match.group(1)))

            # Extract Memory: mem=16 (in GB)
            mem_match = re.search(r"mem=([\d.]+)", resources_str)
            if mem_match:
                memory_gb = float(mem_match.group(1))

            # Extract Disk: disk=256 (in GB)
            disk_match = re.search(r"disk=([\d.]+)", resources_str)
            if disk_match:
                disk_gb = int(float(disk_match.group(1)))

        # Also try to get from provider_data directly if available
        if not cpus and provider_data.get("cpus"):
            try:
                cpus = int(float(provider_data["cpus"]))
            except (ValueError, TypeError):
                pass

        if not gpus and provider_data.get("accelerators"):
            try:
                # accelerators might be a string like "{'RTX3090': 1}" or a dict
                accel_str = provider_data["accelerators"]
                if isinstance(accel_str, str):
                    # Try to parse string representation
                    import ast

                    accel_dict = ast.literal_eval(accel_str)
                else:
                    accel_dict = accel_str

                if isinstance(accel_dict, dict):
                    for gpu_type, count in accel_dict.items():
                        gpus.append({"gpu": gpu_type, "count": int(count)})
            except (ValueError, TypeError, SyntaxError):
                pass

        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=gpus,
            cpus=cpus,
            memory_gb=memory_gb,
            disk_gb=disk_gb,
            num_nodes=num_nodes,
            provider_data={"resources_str": resources_str, **provider_data},
        )

    def _get_ssh_node_pools_from_remote(self) -> List[Dict[str, Any]]:
        """
        Get SSH node pools with GPU information from remote SkyPilot server.
        Uses the /ssh_node_pools and /kubernetes_node_info endpoints.
        """
        ssh_node_pools = []

        try:
            # First, get the list of SSH node pools
            response = self._make_authenticated_request("GET", "/ssh_node_pools", json_data=None, timeout=10)

            if hasattr(response, "json"):
                pools_data = response.json()
            else:
                print("Could not get SSH node pools from remote server")
                return ssh_node_pools

            # Parse the pools data
            # Format: {"pool_name": {"hosts": [{"ip": "...", "user": "...", "identity_file": "..."}]}, ...}
            for pool_name, pool_info in pools_data.items():
                # Skip non-pool entries (env_vars, override_skypilot_config, etc.)
                if not isinstance(pool_info, dict) or "hosts" not in pool_info:
                    continue

                # For each pool, get detailed node info using kubernetes_node_info endpoint
                context_name = f"ssh-{pool_name}"

                try:
                    # Build KubernetesNodeInfoRequestBody
                    body = payloads.KubernetesNodeInfoRequestBody(context=context_name)
                    body_json = json.loads(body.model_dump_json())

                    # Add default env_vars
                    if self.default_env_vars:
                        body_json.setdefault("env_vars", {}).update(self.default_env_vars)
                    if self.default_entrypoint_command:
                        body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
                    body_json.setdefault("using_remote_api_server", False)
                    body_json.setdefault("override_skypilot_config", {})

                    # Make the request
                    node_info_response = self._make_authenticated_request(
                        "POST", "/kubernetes_node_info", json_data=body_json, timeout=30
                    )

                    # Get request ID
                    request_id = None
                    if self._server_common:
                        try:
                            request_id = self._server_common.get_request_id(node_info_response)
                        except Exception:
                            pass

                    if not request_id and hasattr(node_info_response, "headers"):
                        request_id = node_info_response.headers.get("x-skypilot-request-id")

                    if request_id:
                        # Wait and get result
                        time.sleep(3)
                        node_info_result = self._get_request_result(request_id)

                        # Parse node info
                        nodes = []
                        total_gpus = {}

                        if isinstance(node_info_result, dict) and "node_info_dict" in node_info_result:
                            node_dict = node_info_result["node_info_dict"]

                            for node_name, node_info in node_dict.items():
                                # Extract GPU information
                                gpu_type = node_info.get("accelerator_type")
                                total_accel = node_info.get("total", {})
                                free_accel = node_info.get("free", {})

                                gpu_count = (
                                    total_accel.get("accelerator_count", 0) if isinstance(total_accel, dict) else 0
                                )
                                free_count = (
                                    free_accel.get("accelerators_available", 0) if isinstance(free_accel, dict) else 0
                                )

                                if gpu_type and gpu_count > 0:
                                    if gpu_type not in total_gpus:
                                        total_gpus[gpu_type] = 0
                                    total_gpus[gpu_type] += gpu_count

                                # Add node information
                                nodes.append(
                                    {
                                        "name": node_info.get("name", node_name),
                                        "ip": node_info.get("ip_address", node_name),
                                        "gpu_type": gpu_type,
                                        "gpu_count": gpu_count,
                                        "gpu_free": free_count,
                                    }
                                )

                        # Add this node pool
                        ssh_node_pools.append({"name": pool_name, "nodes": nodes, "total_gpus": total_gpus})

                except Exception as e:
                    print(f"Could not get node info for SSH pool '{pool_name}': {e}")
                    # Add pool without detailed node info
                    hosts = pool_info.get("hosts", [])
                    nodes = []
                    for host in hosts:
                        nodes.append(
                            {
                                "name": host.get("ip", "unknown"),
                                "ip": host.get("ip", "unknown"),
                                "gpu_type": None,
                                "gpu_count": 0,
                                "gpu_free": 0,
                            }
                        )

                    ssh_node_pools.append({"name": pool_name, "nodes": nodes, "total_gpus": {}})

        except Exception as e:
            print(f"Error getting SSH node pools from remote server: {e}")

        return ssh_node_pools

    def _get_ssh_node_pool_info(self) -> List[Dict[str, Any]]:
        """
        Get SSH node pool information with GPU details using SkyPilot's API.
        Similar to 'sky show-gpus --cloud ssh' command.
        Returns a list of SSH node pools with their GPU information.

        Works both locally and with remote SkyPilot servers.
        """
        ssh_node_pools = []

        # Check if we're using a remote server
        is_remote = self.server_url and "localhost" not in self.server_url and "127.0.0.1" not in self.server_url

        if is_remote:
            # For remote servers, use the /ssh_node_pools and /kubernetes_node_info endpoints
            try:
                ssh_node_pools = self._get_ssh_node_pools_from_remote()
            except Exception as e:
                print(f"Error getting SSH node pools from remote server: {e}")
        else:
            # For local SkyPilot, use direct SDK calls
            try:
                # Get SSH contexts (node pools)
                contexts = SSH.get_ssh_node_pool_contexts()

                # Get node information for each context
                for context in contexts:
                    try:
                        # Get Kubernetes node info for this SSH context
                        nodes_info = k8s_utils.get_kubernetes_node_info(context)

                        # Extract node pool name (remove 'ssh-' prefix)
                        pool_name = context.replace("ssh-", "") if context.startswith("ssh-") else context

                        # Parse the nodes info
                        nodes = []
                        total_gpus = {}

                        # nodes_info is a KubernetesNodesInfo object with node_info_dict
                        if hasattr(nodes_info, "node_info_dict"):
                            node_dict = nodes_info.node_info_dict

                            for node_name, node_info in node_dict.items():
                                # Extract GPU information
                                gpu_type = getattr(node_info, "accelerator_type", None)
                                total_accel = getattr(node_info, "total", {})
                                free_accel = getattr(node_info, "free", {})

                                gpu_count = 0
                                if isinstance(total_accel, dict):
                                    gpu_count = total_accel.get("accelerator_count", 0)

                                free_count = 0
                                if isinstance(free_accel, dict):
                                    free_count = free_accel.get("accelerators_available", 0)

                                if gpu_type and gpu_count > 0:
                                    if gpu_type not in total_gpus:
                                        total_gpus[gpu_type] = 0
                                    total_gpus[gpu_type] += gpu_count

                                # Add node information
                                nodes.append(
                                    {
                                        "name": node_name,
                                        "ip": getattr(node_info, "ip_address", node_name),
                                        "gpu_type": gpu_type,
                                        "gpu_count": gpu_count,
                                        "gpu_free": free_count,
                                    }
                                )

                        # Add this node pool
                        ssh_node_pools.append({"name": pool_name, "nodes": nodes, "total_gpus": total_gpus})

                    except Exception as e:
                        print(f"Error getting node info for context {context}: {e}")

            except Exception as e:
                print(f"Error getting SSH node pools: {e}")

        return ssh_node_pools

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """
        Get detailed cluster information for SkyPilot.
        """
        clusters = self.list_clusters()
        detailed = []

        for cluster in clusters:
            try:
                cluster_detail = self._build_cluster_detail(cluster)
                detailed.append(cluster_detail)
            except Exception:
                # If getting resources fails, skip this cluster
                print(f"Failed to get resources for cluster {cluster.cluster_name}")
                continue

        # Add SSH node pool information using the new API
        self._add_ssh_node_pools(detailed)

        # Add available cloud backends with zero clusters
        self._add_available_cloud_backends(detailed)

        return detailed

    def _build_cluster_detail(self, cluster) -> Dict[str, Any]:
        """Build detailed information for a single cluster."""
        resources = self.get_cluster_resources(cluster.cluster_name)

        # Determine if this is a fixed (SSH) or elastic (cloud) cluster
        provider_data = cluster.provider_data or {}
        cloud = provider_data.get("cloud", "").lower()
        is_ssh = cloud == "ssh" or "ssh" in str(provider_data).lower()
        is_fixed = is_ssh
        elastic_enabled = not is_fixed

        # Use lowercase cloud names directly
        cloud_provider = cloud.upper() if cloud else "UNKNOWN"
        if is_ssh:
            cloud_provider = "SSH"

        # Get head node IP if available
        head_node_ip = provider_data.get("head_node_ip") or provider_data.get("head_ip")

        # Create nodes list
        nodes = self._build_cluster_nodes(cluster, resources, is_fixed)

        return {
            "cluster_id": cluster.cluster_name,
            "cluster_name": cluster.cluster_name,
            "cloud_provider": cloud_provider,
            "backend_type": "SkyPilot",
            "elastic_enabled": elastic_enabled,
            "max_nodes": resources.num_nodes or 1,
            "head_node_ip": head_node_ip,
            "nodes": nodes,
            "provider_data": provider_data,
        }

    def _build_cluster_nodes(self, cluster, resources, is_fixed: bool) -> List[Dict[str, Any]]:
        """Build the nodes list for a cluster."""
        nodes = []
        for i in range(resources.num_nodes or 1):
            node_name = (
                f"{cluster.cluster_name}-node-{i + 1}" if resources.num_nodes > 1 else f"{cluster.cluster_name}-node"
            )
            node = {
                "node_name": node_name,
                "is_fixed": is_fixed,
                "is_active": cluster.state == ClusterState.UP,
                "state": cluster.state.value if hasattr(cluster.state, "value") else str(cluster.state),
                "reason": cluster.status_message or "N/A",
                "resources": {
                    "cpus_total": resources.cpus or 0,
                    "cpus_allocated": 0,  # SkyPilot doesn't provide allocated resources directly
                    "gpus": {gpu["gpu"]: gpu["count"] for gpu in resources.gpus} if resources.gpus else {},
                    "memory_gb_total": resources.memory_gb or 0,
                    "memory_gb_allocated": 0,  # SkyPilot doesn't provide allocated resources directly
                },
            }
            nodes.append(node)
        return nodes

    def _add_ssh_node_pools(self, detailed: List[Dict[str, Any]]) -> None:
        """Add SSH node pool information to the detailed clusters list."""
        ssh_node_pools = self._get_ssh_node_pool_info()

        # Track running SSH clusters by their node pool and calculate GPU usage
        ssh_clusters_by_pool = {}  # pool_name -> list of running clusters
        ssh_clusters_to_remove = []  # indices of clusters to remove from detailed list
        
        for idx, cluster in enumerate(detailed):
            provider_data = cluster.get("provider_data", {})
            if isinstance(provider_data, dict):
                cloud = provider_data.get("cloud", "").lower()
                if "ssh" in cloud:
                    # This is an SSH cluster - identify which pool it belongs to
                    # The zone field contains the pool name (e.g., "ml-nvidia-001")
                    pool_name = provider_data.get("zone", "ssh")
                    
                    if pool_name not in ssh_clusters_by_pool:
                        ssh_clusters_by_pool[pool_name] = []
                    
                    ssh_clusters_by_pool[pool_name].append({
                        "cluster_name": cluster.get("cluster_name"),
                        "cluster_data": cluster
                    })
                    
                    # Mark this cluster for removal - we'll add it under the pool instead
                    ssh_clusters_to_remove.append(idx)

        # Remove SSH clusters from the main list (in reverse order to maintain indices)
        for idx in reversed(ssh_clusters_to_remove):
            detailed.pop(idx)

        # Add SSH node pools with updated availability
        if ssh_node_pools:
            for pool in ssh_node_pools:
                pool_name = pool.get("name", "ssh")
                pool_nodes = pool.get("nodes", [])
                total_gpus = pool.get("total_gpus", {})
                
                # Get running clusters for this pool
                running_clusters = ssh_clusters_by_pool.get(pool_name, [])
                num_active_clusters = len(running_clusters)
                
                # Calculate GPU usage from running clusters
                gpus_allocated = {}
                for cluster_info in running_clusters:
                    cluster_data = cluster_info["cluster_data"]
                    for node in cluster_data.get("nodes", []):
                        node_gpus = node.get("resources", {}).get("gpus", {})
                        for gpu_type, count in node_gpus.items():
                            gpus_allocated[gpu_type] = gpus_allocated.get(gpu_type, 0) + count

                # Create nodes for this SSH pool with updated availability
                nodes = self._build_ssh_pool_nodes(pool_name, pool_nodes, total_gpus, gpus_allocated)

                ssh_cluster = {
                    "cluster_id": f"ssh-{pool_name}",
                    "cluster_name": pool_name,
                    "backend_type": "SkyPilot",
                    "elastic_enabled": False,
                    "max_nodes": len(nodes),
                    "head_node_ip": None,
                    "nodes": nodes,
                    "active_clusters": num_active_clusters,
                    "running_clusters": [c["cluster_name"] for c in running_clusters],
                }
                detailed.append(ssh_cluster)

    def _build_ssh_pool_nodes(self, pool_name: str, pool_nodes: List[Dict], total_gpus: Dict, gpus_allocated: Dict = None) -> List[Dict[str, Any]]:
        """Build nodes list for an SSH pool."""
        if gpus_allocated is None:
            gpus_allocated = {}
            
        nodes = []
        for node_data in pool_nodes:
            node_name = node_data.get("name", pool_name)
            gpu_type = node_data.get("gpu_type")
            gpu_count = node_data.get("gpu_count", 0)
            gpu_free = node_data.get("gpu_free", 0)
            
            # Calculate actual free GPUs based on allocations
            # If we have allocation data, use that; otherwise use the reported free count
            if gpu_type and gpu_type in gpus_allocated:
                allocated_count = gpus_allocated[gpu_type]
                actual_free = max(0, gpu_count - allocated_count)
            else:
                actual_free = gpu_free

            # Build GPU dict for this node
            node_gpus = {}
            if gpu_type and gpu_count > 0:
                node_gpus[gpu_type] = gpu_count
            
            # Determine if node is active (has running workloads)
            is_active = gpu_type and gpu_type in gpus_allocated and gpus_allocated[gpu_type] > 0

            node = {
                "node_name": node_name,
                "is_fixed": True,
                "is_active": is_active,
                "state": "IN_USE" if is_active else "AVAILABLE",
                "reason": f"{actual_free} of {gpu_count} free" if gpu_type else "Available for use",
                "resources": {
                    "cpus_total": 0,
                    "cpus_allocated": 0,
                    "gpus": node_gpus,
                    "gpus_allocated": {gpu_type: gpus_allocated.get(gpu_type, 0)} if gpu_type else {},
                    "gpus_free": {gpu_type: actual_free} if gpu_type and actual_free >= 0 else {},
                    "memory_gb_total": 0,
                    "memory_gb_allocated": 0,
                },
            }
            nodes.append(node)

        # If no nodes were added, create at least one placeholder
        if not nodes:
            # Calculate free GPUs for placeholder
            placeholder_gpus_free = {}
            for gpu_type, total_count in total_gpus.items():
                allocated = gpus_allocated.get(gpu_type, 0)
                free_count = max(0, total_count - allocated)
                placeholder_gpus_free[gpu_type] = free_count
            
            is_active = any(count > 0 for count in gpus_allocated.values())
            
            nodes.append(
                {
                    "node_name": pool_name,
                    "is_fixed": True,
                    "is_active": is_active,
                    "state": "IN_USE" if is_active else "AVAILABLE",
                    "reason": "Available for use",
                    "resources": {
                        "cpus_total": 0,
                        "cpus_allocated": 0,
                        "gpus": total_gpus,
                        "gpus_allocated": gpus_allocated,
                        "gpus_free": placeholder_gpus_free,
                        "memory_gb_total": 0,
                        "memory_gb_allocated": 0,
                    },
                }
            )

        return nodes

    def _add_available_cloud_backends(self, detailed: List[Dict[str, Any]]) -> None:
        """Add available cloud backends with zero clusters."""
        # Skip for remote servers - this queries local Kubernetes which isn't accessible
        is_remote = self.server_url and "localhost" not in self.server_url and "127.0.0.1" not in self.server_url
        if is_remote:
            return
        
        try:
            # Get enabled clouds with COMPUTE capability using SkyPilot's Python API
            enabled_cloud_objects = get_cached_enabled_clouds_or_refresh(
                capability=CloudCapability.COMPUTE, raise_if_no_cloud_access=False
            )
            # Convert cloud objects to lowercase strings and exclude SSH (handled separately)
            enabled_clouds = [str(cloud).lower() for cloud in enabled_cloud_objects if "ssh" not in str(cloud).lower()]

            # For each enabled cloud without an active cluster, add a placeholder
            existing_cloud_providers = {c.get("cloud_provider") for c in detailed if c.get("elastic_enabled")}
            for cloud in enabled_clouds:
                # Use lowercase cloud names directly
                cloud_provider_name = cloud.upper()

                # Check if we already have a cluster on this cloud provider
                if cloud_provider_name not in existing_cloud_providers:
                    cluster_detail = {
                        "cluster_id": f"{cloud}-available",
                        "cluster_name": cloud_provider_name,
                        "cloud_provider": cloud_provider_name,
                        "backend_type": "SkyPilot",
                        "elastic_enabled": True,
                        "max_nodes": None,  # Unlimited or default
                        "head_node_ip": None,
                        "nodes": [],  # Empty nodes list for zero clusters
                    }
                    detailed.append(cluster_detail)
        except Exception as e:
            print(f"Failed to fetch enabled clouds: {e}")
            # Continue without adding available backends if query fails

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """Submit a job to an existing cluster."""
        # Build sky.Task object from JobConfig
        task = sky.Task()
        task.run = job_config.command

        # Set num_nodes if specified
        if job_config.num_nodes and job_config.num_nodes > 1:
            task.num_nodes = job_config.num_nodes

        # Convert Task to DAG (matches SDK exactly)
        dag = dag_utils.convert_entrypoint_to_dag(task)

        # Validate DAG (matches SDK exactly)
        try:
            from sky.dag import dag_utils as validate_utils

            if hasattr(validate_utils, "validate"):
                validate_utils.validate(dag, workdir_only=True)
            else:
                # Try alternative import path
                from sky import validate

                validate(dag, workdir_only=True)
        except (ImportError, AttributeError):
            # If validate is not available, skip validation
            pass

        # Upload mounts if needed (matches SDK exactly)
        try:
            client_common = None
            if SKYPILOT_AVAILABLE:
                try:
                    from sky.client import common as client_common
                except ImportError:
                    try:
                        from sky import client_common
                    except ImportError:
                        pass

            if client_common and hasattr(client_common, "upload_mounts_to_api_server"):
                dag = client_common.upload_mounts_to_api_server(dag, workdir_only=True)
        except Exception:
            # If upload_mounts fails, continue without it
            pass

        # Dump DAG to YAML string (matches SDK exactly)
        dag_str = dag_utils.dump_chain_dag_to_yaml_str(dag)

        # Get backend if specified in provider_config
        backend = None
        if job_config.provider_config.get("backend"):
            try:
                backend = backend_utils.get_backend_from_str(job_config.provider_config["backend"])
            except Exception:
                pass

        # Build ExecBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.ExecBody(
            task=dag_str,
            cluster_name=cluster_name,
            dryrun=job_config.provider_config.get("dryrun", False),
            down=job_config.provider_config.get("down", False),
            backend=backend.NAME if backend else None,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/exec", json_data=body_json, timeout=5)

        # Get request ID using SkyPilot's method (matches SDK exactly)
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
                return {"request_id": request_id}
            except Exception:
                pass

        # Fallback: try to extract request_id from response
        try:
            if hasattr(response, "json"):
                result = response.json()
                if isinstance(result, dict):
                    return result
            return {"response": response}
        except Exception:
            return {}

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """Get job logs."""
        # Convert job_id to int if it's a string
        job_id_int = int(job_id) if isinstance(job_id, str) and job_id.isdigit() else job_id

        # Build ClusterJobBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.ClusterJobBody(
            cluster_name=cluster_name,
            job_id=job_id_int,
            follow=follow,
            tail=tail_lines or 0,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Get timeout - SkyPilot uses a tuple for connection/read timeouts
        try:
            from sky.client import common as client_common

            timeout = (
                getattr(client_common, "API_SERVER_REQUEST_CONNECTION_TIMEOUT_SECONDS", 5),
                None,  # No read timeout for streaming
            )
        except (ImportError, AttributeError):
            timeout = (5, None)

        # Use SkyPilot's make_authenticated_request with streaming (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/logs", json_data=body_json, timeout=timeout, stream=True)

        # # Get request ID using SkyPilot's method (matches SDK exactly)
        # request_id = None
        # if self._server_common:
        #     try:
        #         request_id = self._server_common.get_request_id(response)
        #     except Exception:
        #         pass

        if follow:
            # For streaming, return an iterator
            # The SDK uses stream_response for this, but we'll return the response stream
            if hasattr(response, "iter_lines"):
                return response.iter_lines(decode_unicode=True)
            elif hasattr(response, "iter_content"):
                return response.iter_content(chunk_size=8192, decode_unicode=True)
            else:
                # Fallback: return response object for manual streaming
                return response
        else:
            # For non-streaming, get the full content
            # The SDK uses stream_response with preload_content=True which returns exit code
            # But we need the actual log content, so we'll read from the response
            try:
                # Read the streamed response content
                if hasattr(response, "iter_lines"):
                    # Collect all lines from the stream
                    lines = []
                    for line in response.iter_lines(decode_unicode=True):
                        if line:
                            lines.append(line)
                    return "\n".join(lines)
                elif hasattr(response, "text"):
                    return response.text
                elif hasattr(response, "content"):
                    return response.content.decode("utf-8")
                elif hasattr(response, "json"):
                    result = response.json()
                    if isinstance(result, str):
                        return result
                    elif isinstance(result, dict):
                        return result.get("logs", str(result))
                    return str(result)
                else:
                    return ""
            except Exception as e:
                print(f"Error reading logs: {str(e)}")
                return "Error reading logs"

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """Cancel a job."""
        # Convert job_id to int if it's a string
        job_id_int = int(job_id) if isinstance(job_id, str) and job_id.isdigit() else job_id

        # Build CancelBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.CancelBody(
            cluster_name=cluster_name,
            all=False,
            all_users=False,
            job_ids=[job_id_int] if job_id_int is not None else None,
            try_cancel_if_cluster_is_init=False,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/cancel", json_data=body_json, timeout=5)

        # Get request ID using SkyPilot's method (matches SDK exactly)
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
                return {"request_id": request_id}
            except Exception:
                pass

        # Fallback: try to extract request_id from response
        try:
            if hasattr(response, "json"):
                result = response.json()
                if isinstance(result, dict):
                    return result
            return {"response": response}
        except Exception:
            return {}

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """List jobs for a cluster."""
        # Build QueueBody using SkyPilot's payload class (matches SDK exactly)
        body = payloads.QueueBody(
            cluster_name=cluster_name,
            skip_finished=False,
            all_users=False,
        )

        # Convert to JSON using SkyPilot's method (matches SDK exactly)
        body_json = json.loads(body.model_dump_json())

        # Add default env_vars and entrypoint_command to match API format
        if self.default_env_vars:
            body_json.setdefault("env_vars", {}).update(self.default_env_vars)
        if self.default_entrypoint_command:
            body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
        body_json.setdefault("using_remote_api_server", False)
        body_json.setdefault("override_skypilot_config", {})

        # Use SkyPilot's make_authenticated_request (matches SDK exactly)
        response = self._make_authenticated_request("POST", "/queue", json_data=body_json, timeout=5)

        # Get request ID using SkyPilot's method (matches SDK exactly)
        request_id = None
        if self._server_common:
            try:
                request_id = self._server_common.get_request_id(response)
            except Exception:
                pass

        # Get the actual job records from the request ID
        job_records = []
        if request_id:
            try:
                # Use our custom _get_request_result() to get the actual response
                # This makes a GET request to /api/get?request_id={request_id}
                # and returns the return_value from the request task
                job_records = self._get_request_result(request_id)
                # The return value should be a list of job records
                if not isinstance(job_records, list):
                    # If it's not a list, try to convert it
                    if isinstance(job_records, str):
                        job_records = json.loads(job_records)
                    elif isinstance(job_records, dict):
                        job_records = job_records.get("jobs", [job_records])
                    else:
                        job_records = [job_records] if job_records else []
            except Exception as e:
                if "ClusterNotUpError" in str(e):
                    pass
                elif "does not exist" in str(e):
                    pass
                else:
                    print(f"Error getting job records from request payload: {e}")
                # Fallback: try to parse response directly
                try:
                    if hasattr(response, "json"):
                        result = response.json()
                        job_records = result if isinstance(result, list) else result.get("jobs", [])
                    else:
                        job_records = []
                except Exception:
                    job_records = []
        else:
            # Fallback: try to parse response directly
            try:
                if hasattr(response, "json"):
                    result = response.json()
                    job_records = result if isinstance(result, list) else result.get("jobs", [])
                else:
                    job_records = []
            except Exception:
                job_records = []

        # Handle empty or invalid responses
        if not job_records or not isinstance(job_records, list):
            return []

        # Parse job records into JobInfo objects
        jobs = []
        for job_data in job_records:
            # Parse status - could be a JobStatus enum or string
            status_value = job_data.get("status")
            if hasattr(status_value, "value"):
                state_str = status_value.value.upper()
            elif isinstance(status_value, str):
                state_str = status_value.upper()
            else:
                state_str = "UNKNOWN"

            try:
                state = JobState[state_str]
            except KeyError:
                # Map common SkyPilot job statuses to our JobState enum
                status_mapping = {
                    "PENDING": JobState.PENDING,
                    "RUNNING": JobState.RUNNING,
                    "SUCCEEDED": JobState.COMPLETED,
                    "FAILED": JobState.FAILED,
                    "CANCELLED": JobState.CANCELLED,
                }
                state = status_mapping.get(state_str, JobState.UNKNOWN)

            # Convert timestamps to strings if they're integers
            submitted_at = job_data.get("submitted_at")
            if submitted_at is not None:
                submitted_at = str(submitted_at) if isinstance(submitted_at, (int, float)) else submitted_at

            start_at = job_data.get("start_at")
            if start_at is not None:
                start_at = str(start_at) if isinstance(start_at, (int, float)) else start_at

            end_at = job_data.get("end_at")
            if end_at is not None:
                end_at = str(end_at) if isinstance(end_at, (int, float)) else end_at

            jobs.append(
                JobInfo(
                    job_id=job_data.get("job_id", 0),
                    job_name=job_data.get("job_name"),
                    state=state,
                    cluster_name=cluster_name,
                    command=None,  # Queue endpoint doesn't return command
                    submitted_at=submitted_at,
                    started_at=start_at,
                    finished_at=end_at,
                    exit_code=None,  # Queue endpoint doesn't return exit_code
                    error_message=None,  # Queue endpoint doesn't return error
                    provider_data=job_data,
                )
            )

        return jobs

    def check(self) -> bool:
        """Check if the SkyPilot provider is active and accessible."""
        try:
            # Use the /api/health endpoint to check if the server is healthy
            response = self._make_authenticated_request("GET", "/api/health", json_data=None, timeout=5)

            # Parse the JSON response
            if hasattr(response, "json"):
                health_data = response.json()
                # Check if the status is "healthy"
                return health_data.get("status") == "healthy"
            else:
                # If response doesn't have json method, check status code
                return hasattr(response, "status_code") and response.status_code == 200
        except requests.exceptions.ConnectionError:
            # Connection error means server is not accessible
            return False
        except requests.exceptions.Timeout:
            # Timeout means server is not responding
            return False
        except Exception:
            # For any other exceptions, assume provider is not active
            return False
