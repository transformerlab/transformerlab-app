"""dstack compute provider implementation."""

import base64
import logging
from typing import Any, Dict, List, Optional, Union

import requests

from .base import ComputeProvider
from .models import (
    ClusterConfig,
    ClusterState,
    ClusterStatus,
    JobConfig,
    JobInfo,
    JobState,
    ResourceInfo,
)

logger = logging.getLogger(__name__)


class DstackProvider(ComputeProvider):
    """Provider implementation for dstack (REST API)."""

    def __init__(
        self,
        server_url: str,
        api_token: str,
        project_name: str = "main",
        extra_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.server_url = server_url.rstrip("/")
        self.api_token = api_token
        self.project_name = project_name or "main"
        self.extra_config = extra_config or {}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: int = 30,
        stream: bool = False,
    ) -> requests.Response:
        url = f"{self.server_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        try:
            response = requests.request(
                method,
                url=url,
                json=json_data,
                headers=headers,
                timeout=timeout,
                stream=stream,
            )
            response.raise_for_status()

            return response

        except requests.exceptions.HTTPError as exc:
            response = exc.response
            status = response.status_code if response is not None else "unknown"
            body = ""
            if response is not None:
                try:
                    body = response.text.strip()
                except Exception:
                    body = ""
            body_suffix = f" response: {body}" if body else ""
            raise RuntimeError(
                f"dstack API request failed ({method} {endpoint}) with status {status}.{body_suffix}"
            ) from exc
        except requests.exceptions.ConnectionError as exc:
            raise ConnectionError(f"dstack server at {self.server_url} is unreachable: {exc}") from exc

    def _parse_accelerators(self, accelerators: Optional[str]) -> Optional[Dict[str, Any]]:
        """Parse TLab accelerator string ("A100:2") into dstack GPUSpec dict."""
        if not accelerators:
            return None
        parts = accelerators.split(":")
        gpu_name = parts[0].strip()
        if not gpu_name:
            return None
        try:
            count = int(parts[1].strip()) if len(parts) > 1 else 1
        except ValueError:
            raise ValueError(f"Invalid accelerator format '{accelerators}': count must be an integer (e.g. 'A100:2')")
        return {"name": [gpu_name], "count": {"min": count, "max": count}}

    def _build_resources(self, config: ClusterConfig) -> Optional[Dict[str, Any]]:
        """
        Build dstack resources spec.

        If fleet_name is present in provider_config, resources are omitted and
        fleet selection is sent via the top-level "fleets" task configuration
        field in _build_run_spec().
        """
        resources: Dict[str, Any] = {}
        gpu_spec = self._parse_accelerators(config.accelerators)
        if gpu_spec:
            resources["gpu"] = gpu_spec
        if config.cpus is not None:
            resources["cpu"] = {"count": {"min": int(config.cpus)}}
        if config.memory is not None:
            resources["memory"] = config.memory if isinstance(config.memory, str) else f"{config.memory}GB"
        if config.disk_size is not None:
            resources["disk"] = {"size": f"{config.disk_size}GB"}

        return resources or None

    def _build_run_spec(self, run_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """Build the dstack RunSpec dict from a TLab ClusterConfig."""
        resources = self._build_resources(config)
        run_type = config.provider_config.get("run_type", "task")
        fleet_name = (config.provider_config.get("fleet_name") or "").strip()

        # Merge env vars: provider defaults < job-level (job wins on conflict)
        env_vars: Dict[str, str] = {
            **self.extra_config.get("default_env_vars", {}),
            **config.env_vars,
        }

        run_command = f"tfl-remote-trap {config.run}" if config.run else ""

        configuration: Dict[str, Any] = {
            "type": run_type,
            "env": env_vars,
        }

        if run_type == "task":
            if not config.run and not config.setup:
                raise ValueError("dstack task run requires at least a run command or setup script")
            if config.setup:
                configuration["commands"] = [config.setup, run_command] if run_command else [config.setup]
            else:
                configuration["commands"] = [run_command]
        elif run_type == "dev-environment":
            configuration["ide"] = config.provider_config.get("ide", "vscode")
            if run_command:
                configuration["init"] = [run_command]

        if resources and not fleet_name:
            configuration["resources"] = resources
        if fleet_name:
            configuration["fleets"] = [fleet_name]

        ssh_key_pub = config.provider_config.get("ssh_key_pub", self.extra_config.get("ssh_key_pub", ""))

        return {
            "run_name": run_name,
            "repo_id": "virtual",
            "repo_data": {"repo_type": "virtual"},
            "configuration": configuration,
            "ssh_key_pub": ssh_key_pub,
        }

    def _map_status(self, dstack_status: str) -> ClusterState:
        mapping: Dict[str, ClusterState] = {
            "PENDING": ClusterState.INIT,
            "SUBMITTED": ClusterState.INIT,
            "PROVISIONING": ClusterState.INIT,
            "RUNNING": ClusterState.UP,
            "TERMINATING": ClusterState.STOPPED,
            "TERMINATED": ClusterState.DOWN,
            "DONE": ClusterState.DOWN,
            "FAILED": ClusterState.FAILED,
        }
        return mapping.get(dstack_status.upper(), ClusterState.UNKNOWN)

    def _map_job_state(self, cluster_state: ClusterState) -> JobState:
        mapping: Dict[ClusterState, JobState] = {
            ClusterState.INIT: JobState.PENDING,
            ClusterState.UP: JobState.RUNNING,
            ClusterState.STOPPED: JobState.CANCELLED,
            ClusterState.DOWN: JobState.COMPLETED,
            ClusterState.FAILED: JobState.FAILED,
            ClusterState.UNKNOWN: JobState.UNKNOWN,
        }
        return mapping.get(cluster_state, JobState.UNKNOWN)

    def _list_runs(self, limit: int, timeout: int = 30) -> requests.Response:
        """List runs with compatibility fallbacks across dstack API variants."""

        try:
            return self._make_request(
                "POST",
                "/api/runs/list",
                json_data={"project_name": self.project_name, "only_active": False, "limit": limit},
                timeout=timeout,
            )
        except Exception as exc:
            if hasattr(exc, "response") and exc.response.status_code not in [404, 405]:
                raise
            logger.error("Unable to list dstack runs: %s", exc)
            raise RuntimeError("Unable to list dstack runs") from exc

    # ------------------------------------------------------------------
    # ComputeProvider interface
    # ------------------------------------------------------------------

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        run_spec = self._build_run_spec(cluster_name, config)
        response = self._make_request(
            "POST",
            f"/api/project/{self.project_name}/runs/apply",
            json_data={"plan": {"run_spec": run_spec}, "force": False},
        )
        data = response.json()
        if not isinstance(data, dict):
            logger.debug(
                "dstack launch returned non-dict response; falling back to requested cluster name",
                extra={"cluster_name": cluster_name, "response_type": type(data).__name__},
            )
            return {"run_name": cluster_name, "status": None}

        response_run_spec = data.get("run_spec")
        if response_run_spec is None:
            logger.debug(
                "dstack launch response missing run_spec",
                extra={"cluster_name": cluster_name, "response_keys": list(data.keys())},
            )
            response_run_spec_dict: Dict[str, Any] = {}
        elif not isinstance(response_run_spec, dict):
            logger.debug(
                "dstack launch response run_spec is not a dict",
                extra={
                    "cluster_name": cluster_name,
                    "run_spec_type": type(response_run_spec).__name__,
                },
            )
            response_run_spec_dict = {}
        else:
            response_run_spec_dict = response_run_spec

        run_name = response_run_spec_dict.get("run_name") or data.get("run_name")
        if not run_name:
            logger.debug(
                "dstack launch response missing run_name; using requested cluster name",
                extra={"cluster_name": cluster_name},
            )
            run_name = cluster_name
        return {"run_name": run_name, "status": data.get("status")}

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        self._make_request(
            "POST",
            f"/api/project/{self.project_name}/runs/stop",
            json_data={"runs_names": [cluster_name], "abort": False},
        )
        return {"status": "stopped", "run_name": cluster_name}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        response = self._make_request(
            "POST",
            f"/api/project/{self.project_name}/runs/get",
            json_data={"run_name": cluster_name},
        )
        data = response.json()
        return ClusterStatus(
            cluster_name=cluster_name,
            state=self._map_status(data.get("status", "")),
            status_message=data.get("status_message"),
            provider_data=data,
        )

    def list_clusters(self) -> List[ClusterStatus]:
        response = self._list_runs(limit=100)
        runs = response.json()
        return [
            ClusterStatus(
                cluster_name=run.get("run_name", ""),
                state=self._map_status(run.get("status", "")),
                status_message=run.get("status_message"),
                provider_data=run,
            )
            for run in (runs if isinstance(runs, list) else [])
        ]

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        return [s.provider_data for s in self.list_clusters()]

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        response = self._make_request(
            "POST",
            f"/api/project/{self.project_name}/runs/get",
            json_data={"run_name": cluster_name},
        )
        data = response.json()
        gpus: List[Dict[str, Any]] = []
        for job in data.get("jobs", []) or []:
            submissions = job.get("job_submissions") or []
            if not submissions:
                continue
            requirements = submissions[-1].get("job_spec", {}).get("requirements", {})
            gpu_spec = requirements.get("resources", {}).get("gpu", {})
            if gpu_spec:
                names = gpu_spec.get("name") or ["unknown"]
                gpus.append({"name": names[0], "count": gpu_spec.get("count", {}).get("min", 1)})
        return ResourceInfo(cluster_name=cluster_name, gpus=gpus, provider_data=data)

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        provider_config = dict(job_config.provider_config or {})
        if job_config.timeout is not None:
            provider_config["timeout"] = job_config.timeout
        config = ClusterConfig(
            run=job_config.run,
            env_vars=job_config.env_vars,
            num_nodes=job_config.num_nodes,
            provider_config=provider_config,
        )
        return self.launch_cluster(cluster_name, config)

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> str:
        # Note: follow=True (streaming) is not yet implemented for the dstack provider.
        # All log fetches are point-in-time snapshots via /logs/poll.
        # Step 1: get run to find latest_job_submission ID
        try:
            run_response = self._make_request(
                "POST",
                f"/api/project/{self.project_name}/runs/get",
                json_data={"run_name": cluster_name},
            )
            run_data = run_response.json()
        except Exception as exc:
            return f"Error fetching run status: {exc}"

        latest_submission = run_data.get("latest_job_submission") or {}
        job_submission_id = latest_submission.get("id")
        if not job_submission_id:
            return "Waiting for job to start..."

        # Step 2: poll logs
        try:
            logs_response = self._make_request(
                "POST",
                f"/api/project/{self.project_name}/logs/poll",
                json_data={
                    "run_name": cluster_name,
                    "job_submission_id": job_submission_id,
                    "limit": tail_lines or 100,
                    "descending": False,
                },
            )
            logs_data = logs_response.json()
        except Exception as exc:
            return f"Error fetching logs: {exc}"

        log_entries = logs_data.get("logs", [])
        if not log_entries:
            return "Waiting for logs..."

        lines: List[str] = []
        for entry in log_entries:
            msg = entry.get("message", "")
            try:
                lines.append(base64.b64decode(msg).decode("utf-8", errors="replace"))
            except Exception:
                lines.append(str(msg))
        return "".join(lines)

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        return self.stop_cluster(cluster_name)

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        try:
            status = self.get_cluster_status(cluster_name)
            return [
                JobInfo(
                    job_id=cluster_name,
                    job_name=cluster_name,
                    state=self._map_job_state(status.state),
                    cluster_name=cluster_name,
                )
            ]
        except Exception:
            return []

    def check(self) -> bool:
        try:
            self._list_runs(limit=1, timeout=10)
            return True
        except Exception:
            return False
