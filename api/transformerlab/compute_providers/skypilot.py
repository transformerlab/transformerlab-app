"""SkyPilot provider implementation."""

import requests
import json
import re
import time
import logging
import warnings
import sys
from io import StringIO
from contextlib import contextmanager
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


@contextmanager
def suppress_warnings_and_logs():
    """
    Context manager to suppress warnings and verbose logging from SkyPilot and urllib3.
    This is useful when checking for optional resources like Kubernetes clusters or SSH pools.
    Also suppresses Rich console output and stdout/stderr from SkyPilot operations.
    """

    # Save original logging levels
    loggers_to_suppress = [
        "urllib3.connectionpool",
        "sky",
        "kubernetes",
        "rich",
    ]
    original_levels = {}

    for logger_name in loggers_to_suppress:
        logger = logging.getLogger(logger_name)
        original_levels[logger_name] = logger.level
        logger.setLevel(logging.CRITICAL)  # Use CRITICAL instead of ERROR to suppress more

    # Save original stdout/stderr
    original_stdout = sys.stdout
    original_stderr = sys.stderr

    # Suppress Python warnings
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore")
        try:
            # Redirect stdout/stderr to suppress Rich output and sky-payload messages
            sys.stdout = StringIO()
            sys.stderr = StringIO()

            yield
        finally:
            # Restore stdout/stderr
            sys.stdout = original_stdout
            sys.stderr = original_stderr

            # Restore original logging levels
            for logger_name, level in original_levels.items():
                logging.getLogger(logger_name).setLevel(level)


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
                    print("Error getting job records from request payload")
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

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """
        Get detailed cluster information including all nodes and their resources.

        Returns:
            List of cluster details with nodes and resources
        """
        all_clusters = []

        # Step 1: Get all existing clusters and categorize them
        # Track which clusters are running on SSH pools vs cloud
        ssh_clusters_by_pool = {}  # pool_name -> [cluster_status, ...]
        cloud_clusters = []

        try:
            existing_clusters = self.list_clusters()

            for cluster_status in existing_clusters:
                provider_data = cluster_status.provider_data or {}
                cloud = provider_data.get("cloud", "").lower()

                # Check if this cluster is running on an SSH pool
                if cloud == "ssh":
                    # The region field contains the SSH context (e.g., "ssh-ml-homelab-001")
                    region = provider_data.get("region", "")
                    if region and region.startswith("ssh-"):
                        pool_name = region[4:]  # Remove "ssh-" prefix
                        if pool_name not in ssh_clusters_by_pool:
                            ssh_clusters_by_pool[pool_name] = []
                        ssh_clusters_by_pool[pool_name].append(cluster_status)
                    continue  # Don't add SSH clusters to cloud list

                # This is a cloud cluster
                cloud_clusters.append(cluster_status)
        except Exception as e:
            print(f"Warning: Failed to list clusters: {e}")

        # Step 2: Process cloud clusters (AWS, GCP, Azure, etc.)
        for cluster_status in cloud_clusters:
            try:
                cluster_name = cluster_status.cluster_name
                provider_data = cluster_status.provider_data or {}

                # Determine cloud provider
                cloud_str = str(provider_data.get("cloud", "")).upper()
                cloud_provider = None
                if "AWS" in cloud_str:
                    cloud_provider = "AWS"
                elif "GCP" in cloud_str:
                    cloud_provider = "GCP"
                elif "AZURE" in cloud_str:
                    cloud_provider = "AZURE"
                elif "KUBERNETES" in cloud_str or "K8S" in cloud_str:
                    cloud_provider = "KUBERNETES"

                # Get cluster resources
                resource_info = self.get_cluster_resources(cluster_name)
                num_nodes = resource_info.num_nodes or 1

                # Convert GPUs list to dict
                gpus_dict = {}
                if resource_info.gpus:
                    for gpu_info in resource_info.gpus:
                        if isinstance(gpu_info, dict):
                            gpu_type = gpu_info.get("gpu")
                            gpu_count = gpu_info.get("count", 0)
                            if gpu_type:
                                gpus_dict[gpu_type] = gpu_count

                # Check cluster state
                state_str = (
                    cluster_status.state.name if hasattr(cluster_status.state, "name") else str(cluster_status.state)
                )
                is_cluster_up = state_str.upper() in ["UP", "INIT"]

                # Get running jobs to determine resource allocation
                running_jobs = []
                try:
                    jobs = self.list_jobs(cluster_name)
                    running_jobs = [j for j in jobs if j.state.name in ["RUNNING", "PENDING"]]
                except Exception:
                    pass

                has_running_jobs = len(running_jobs) > 0

                # Build nodes for this cloud cluster
                nodes = []
                for i in range(num_nodes):
                    node_name = f"{cluster_name}-node-{i + 1}" if num_nodes > 1 else cluster_name

                    # Determine if this node is active (cluster is UP and has running jobs)
                    is_active = is_cluster_up and has_running_jobs

                    # Determine state
                    if not is_cluster_up:
                        node_state = state_str.upper()
                    elif has_running_jobs:
                        node_state = "ALLOCATED"
                    else:
                        node_state = "IDLE"

                    # Build reason
                    if has_running_jobs and i == 0:
                        job_names = [j.job_name or f"job-{j.job_id}" for j in running_jobs[:3]]
                        reason = f"Running: {', '.join(job_names)}"
                    else:
                        reason = cluster_status.status_message or node_state

                    # Calculate allocated resources (assume first node gets allocation if jobs running)
                    cpus_allocated = (resource_info.cpus or 0) if (has_running_jobs and i == 0) else 0
                    memory_allocated = (resource_info.memory_gb or 0) if (has_running_jobs and i == 0) else 0
                    gpus_free = {} if (has_running_jobs and i == 0) else gpus_dict.copy()

                    node = {
                        "node_name": node_name,
                        "is_fixed": False,  # Cloud nodes are elastic
                        "is_active": is_active,
                        "state": node_state,
                        "reason": reason,
                        "resources": {
                            "cpus_total": resource_info.cpus or 0,
                            "cpus_allocated": cpus_allocated,
                            "gpus": gpus_dict,
                            "gpus_free": gpus_free,
                            "memory_gb_total": resource_info.memory_gb or 0,
                            "memory_gb_allocated": memory_allocated,
                        },
                    }
                    nodes.append(node)

                # Build cluster detail
                cluster_detail = {
                    "cluster_id": cluster_name,
                    "cluster_name": cluster_name,
                    "backend_type": "SkyPilot",
                    "elastic_enabled": True,
                    "max_nodes": num_nodes,
                    "head_node_ip": provider_data.get("head_ip"),
                    "nodes": nodes,
                }

                if cloud_provider:
                    cluster_detail["cloud_provider"] = cloud_provider

                all_clusters.append(cluster_detail)
            except Exception as e:
                print(f"Warning: Failed to process cloud cluster {cluster_status.cluster_name}: {e}")

        # Step 3: Process SSH node pools
        try:
            # Get SSH node pools
            response = self._make_authenticated_request("GET", "/ssh_node_pools", json_data=None, timeout=10)

            if response and hasattr(response, "json"):
                ssh_pools = response.json()
                if isinstance(ssh_pools, dict):
                    for pool_name, pool_info in ssh_pools.items():
                        try:
                            # Get node info using kubernetes_node_info endpoint
                            ssh_context = f"ssh-{pool_name}"

                            body = payloads.KubernetesNodeInfoRequestBody(context=ssh_context)
                            body_json = json.loads(body.model_dump_json())

                            if self.default_env_vars:
                                body_json.setdefault("env_vars", {}).update(self.default_env_vars)
                            if self.default_entrypoint_command:
                                body_json.setdefault("entrypoint_command", self.default_entrypoint_command)
                            body_json.setdefault("using_remote_api_server", False)
                            body_json.setdefault("override_skypilot_config", {})

                            node_info_response = self._make_authenticated_request(
                                "POST", "/kubernetes_node_info", json_data=body_json, timeout=30
                            )

                            if not node_info_response:
                                continue

                            # Get request ID from headers
                            request_id = None
                            if self._server_common:
                                try:
                                    request_id = self._server_common.get_request_id(node_info_response)
                                except Exception:
                                    pass

                            if not request_id and hasattr(node_info_response, "headers"):
                                request_id = node_info_response.headers.get("X-Skypilot-Request-ID")

                            if not request_id:
                                continue

                            # Poll for result
                            import time

                            node_info_dict = {}
                            for attempt in range(10):
                                time.sleep(0.5)
                                try:
                                    node_info_result = self._get_request_result(request_id)
                                    if isinstance(node_info_result, dict) and "node_info_dict" in node_info_result:
                                        node_info_dict = node_info_result["node_info_dict"]
                                        break
                                except Exception:
                                    if attempt == 9:
                                        break

                            if not node_info_dict:
                                continue

                            # Get the list of all hosts in the pool
                            pool_hosts = pool_info.get("hosts", [])

                            # Get clusters running on this pool
                            running_clusters = ssh_clusters_by_pool.get(pool_name, [])

                            # Build a map of cluster info with their resource usage
                            cluster_resource_map = {}
                            for cluster_status in running_clusters:
                                try:
                                    cluster_name = cluster_status.cluster_name
                                    state_str = (
                                        cluster_status.state.name
                                        if hasattr(cluster_status.state, "name")
                                        else str(cluster_status.state)
                                    )
                                    is_cluster_up = state_str.upper() in ["UP", "INIT"]

                                    # Get cluster resources
                                    resource_info = self.get_cluster_resources(cluster_name)

                                    # Get running jobs
                                    running_jobs = []
                                    try:
                                        jobs = self.list_jobs(cluster_name)
                                        running_jobs = [j for j in jobs if j.state.name in ["RUNNING", "PENDING"]]
                                    except Exception:
                                        pass

                                    # Convert GPUs to dict
                                    cluster_gpus = {}
                                    if resource_info.gpus:
                                        for gpu_info in resource_info.gpus:
                                            if isinstance(gpu_info, dict):
                                                gpu_type = gpu_info.get("gpu")
                                                gpu_count = gpu_info.get("count", 0)
                                                if gpu_type:
                                                    cluster_gpus[gpu_type] = cluster_gpus.get(gpu_type, 0) + gpu_count

                                    cluster_resource_map[cluster_name] = {
                                        "status": cluster_status,
                                        "state": state_str,
                                        "is_up": is_cluster_up,
                                        "running_jobs": running_jobs,
                                        "gpus": cluster_gpus,
                                        "cpus": resource_info.cpus or 0,
                                        "memory_gb": resource_info.memory_gb or 0,
                                    }
                                except Exception as e:
                                    print(f"Warning: Failed to get info for cluster {cluster_status.cluster_name}: {e}")

                            # Build nodes list - only physical nodes
                            nodes = []

                            # Process each physical node in the pool
                            for k8s_node_name, k8s_node_info in node_info_dict.items():
                                # Get GPU info from kubernetes
                                total_info = k8s_node_info.get("total", {})
                                free_info = k8s_node_info.get("free", {})
                                accelerator_type = k8s_node_info.get("accelerator_type")
                                is_ready = k8s_node_info.get("is_ready", True)

                                total_gpus = total_info.get("accelerator_count", 0)
                                free_gpus_from_k8s = free_info.get("accelerators_available", 0)

                                # Build GPU dicts
                                gpus_dict = {}
                                if accelerator_type and total_gpus > 0:
                                    gpus_dict[accelerator_type] = total_gpus

                                # Calculate actual GPU allocation by checking running clusters
                                # Since k8s_node_info might not reflect real-time allocation,
                                # we manually calculate based on clusters running on this pool
                                allocated_gpus = 0
                                using_clusters = []

                                for cluster_name, cluster_info in cluster_resource_map.items():
                                    if cluster_info["is_up"] and cluster_info["gpus"]:
                                        # This cluster is using GPUs
                                        for gpu_type, gpu_count in cluster_info["gpus"].items():
                                            if gpu_type == accelerator_type:
                                                allocated_gpus += gpu_count
                                                using_clusters.append({"name": cluster_name, "info": cluster_info})

                                # Calculate free GPUs
                                free_gpus = max(0, total_gpus - allocated_gpus)
                                gpus_free_dict = {}
                                if accelerator_type and free_gpus > 0:
                                    gpus_free_dict[accelerator_type] = free_gpus

                                # Determine state and is_active based on calculated allocation
                                if not is_ready:
                                    state = "DOWN"
                                    is_active = False
                                    reason = "Node not ready"
                                elif allocated_gpus > 0:
                                    # GPUs are in use
                                    if free_gpus == 0:
                                        state = "ALLOCATED"
                                    else:
                                        state = "MIXED"
                                    is_active = True

                                    # Build reason with cluster info
                                    if using_clusters:
                                        cluster_details = []
                                        for uc in using_clusters[:2]:  # Show max 2 clusters
                                            cluster_name = uc["name"]
                                            cluster_info = uc["info"]
                                            if cluster_info["running_jobs"]:
                                                job_names = [
                                                    j.job_name or f"job-{j.job_id}"
                                                    for j in cluster_info["running_jobs"][:1]
                                                ]
                                                cluster_details.append(f"{cluster_name}: {job_names[0]}")
                                            else:
                                                cluster_details.append(f"{cluster_name} ({cluster_info['state']})")
                                        reason = "; ".join(cluster_details)
                                    else:
                                        reason = f"{allocated_gpus}/{total_gpus} GPUs allocated"
                                else:
                                    state = "IDLE"
                                    is_active = False
                                    reason = f"{total_gpus} GPUs available" if total_gpus > 0 else "Available"

                                node_name = k8s_node_info.get("name", k8s_node_name)
                                node_ip = k8s_node_info.get("ip_address", node_name)

                                # Create fixed node entry for the physical node
                                node = {
                                    "node_name": node_name,
                                    "is_fixed": True,
                                    "is_active": is_active,
                                    "state": state,
                                    "reason": reason,
                                    "resources": {
                                        "cpus_total": 0,  # Not provided by k8s node info
                                        "cpus_allocated": 0,
                                        "gpus": gpus_dict,
                                        "gpus_free": gpus_free_dict,
                                        "memory_gb_total": 0,  # Not provided by k8s node info
                                        "memory_gb_allocated": 0,
                                    },
                                }
                                nodes.append(node)

                            # Add CPU-only nodes (hosts that don't appear in node_info_dict)
                            # These are hosts without GPUs but can run CPU-only jobs
                            gpu_node_ips = set()
                            gpu_node_names = set()
                            for k8s_node_info in node_info_dict.values():
                                ip = k8s_node_info.get("ip_address")
                                name = k8s_node_info.get("name")
                                if ip:
                                    gpu_node_ips.add(ip)
                                if name:
                                    gpu_node_names.add(name)

                            for host in pool_hosts:
                                host_ip = host.get("ip")
                                # Skip if this host is already shown as a GPU node
                                if host_ip and host_ip not in gpu_node_ips and host_ip not in gpu_node_names:
                                    # This is a CPU-only node
                                    # Check if any CPU-only clusters are using it
                                    cpu_clusters_using = []
                                    total_cpus_allocated = 0
                                    total_memory_allocated = 0

                                    for cluster_name, cluster_info in cluster_resource_map.items():
                                        if cluster_info["is_up"] and not cluster_info["gpus"]:
                                            # This is a CPU-only cluster
                                            cpu_clusters_using.append({"name": cluster_name, "info": cluster_info})
                                            total_cpus_allocated += cluster_info["cpus"]
                                            total_memory_allocated += cluster_info["memory_gb"]

                                    # Determine state for CPU node
                                    if cpu_clusters_using:
                                        is_active = True
                                        state = "ALLOCATED"

                                        # Build reason with cluster info
                                        cluster_details = []
                                        for uc in cpu_clusters_using[:2]:
                                            cluster_name = uc["name"]
                                            cluster_info = uc["info"]
                                            if cluster_info["running_jobs"]:
                                                job_names = [
                                                    j.job_name or f"job-{j.job_id}"
                                                    for j in cluster_info["running_jobs"][:1]
                                                ]
                                                cluster_details.append(f"{cluster_name}: {job_names[0]}")
                                            else:
                                                cluster_details.append(f"{cluster_name} ({cluster_info['state']})")
                                        reason = "; ".join(cluster_details)
                                    else:
                                        is_active = False
                                        state = "IDLE"
                                        reason = "CPU-only node available"

                                    cpu_node = {
                                        "node_name": host_ip,
                                        "is_fixed": True,
                                        "is_active": is_active,
                                        "state": state,
                                        "reason": reason,
                                        "resources": {
                                            "cpus_total": total_cpus_allocated if total_cpus_allocated > 0 else 0,
                                            "cpus_allocated": total_cpus_allocated,
                                            "gpus": {},  # No GPUs
                                            "gpus_free": {},
                                            "memory_gb_total": total_memory_allocated
                                            if total_memory_allocated > 0
                                            else 0,
                                            "memory_gb_allocated": total_memory_allocated,
                                        },
                                    }
                                    nodes.append(cpu_node)

                            # Create SSH pool cluster entry
                            if nodes:
                                cluster_detail = {
                                    "cluster_id": f"ssh-{pool_name}",
                                    "cluster_name": pool_name,
                                    "backend_type": "SkyPilot",
                                    "elastic_enabled": False,  # SSH pools are fixed infrastructure
                                    "max_nodes": len(nodes),
                                    "head_node_ip": None,
                                    "nodes": nodes,
                                }
                                all_clusters.append(cluster_detail)
                        except Exception as e:
                            print(f"Warning: Failed to process SSH pool {pool_name}: {e}")
        except Exception as e:
            print(f"Warning: Failed to get SSH pools: {e}")

        # Step 4: Add available cloud providers (no active clusters)
        try:
            with suppress_warnings_and_logs():
                if SKYPILOT_AVAILABLE:
                    try:
                        enabled_clouds = get_cached_enabled_clouds_or_refresh(
                            capability=CloudCapability.COMPUTE, raise_if_no_cloud_access=False
                        )

                        # Get set of existing cloud providers
                        existing_providers = {c.get("cloud_provider") for c in all_clusters if c.get("elastic_enabled")}

                        # Add available clouds that don't have clusters
                        for cloud in enabled_clouds:
                            cloud_name = str(cloud).lower()
                            if "ssh" in cloud_name:
                                continue  # Skip SSH, handled separately

                            cloud_upper = cloud_name.upper()
                            if cloud_upper not in existing_providers:
                                cluster_detail = {
                                    "cluster_id": f"{cloud_name}-available",
                                    "cluster_name": cloud_upper,
                                    "cloud_provider": cloud_upper,
                                    "backend_type": "SkyPilot",
                                    "elastic_enabled": True,
                                    "max_nodes": None,
                                    "head_node_ip": None,
                                    "nodes": [],
                                }
                                all_clusters.append(cluster_detail)
                    except Exception:
                        pass
        except Exception:
            pass

        return all_clusters

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
