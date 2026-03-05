"""Local compute provider: runs tasks in a uv venv synced with the base environment."""

import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

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


def _check_nvidia_gpu() -> bool:
    """Return True if NVIDIA GPU is available."""
    import shutil

    if shutil.which("nvidia-smi") is None:
        return False
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        return bool(result.stdout.strip())
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def _check_amd_gpu() -> bool:
    """Return True if AMD GPU (ROCm) is available."""
    import shutil

    if shutil.which("rocminfo") is None:
        return False
    try:
        subprocess.run(["rocminfo"], capture_output=True, check=True, timeout=10)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def _is_dgx_spark() -> bool:
    """Return True if running on NVIDIA DGX Spark (use cu130 PyTorch index)."""
    try:
        with open("/etc/dgx-release", encoding="utf-8") as f:
            return "dgx spark" in f.read().lower()
    except (OSError, FileNotFoundError):
        return False


def _get_pyproject_extra() -> str:
    """Return the pyproject extra for the current platform (same as plugin install)."""
    if _check_nvidia_gpu():
        return "[nvidia]"
    if _check_amd_gpu():
        return "[rocm]"
    if sys.platform == "darwin":
        return "[cpu]"
    return "[cpu]"


def _get_uv_pip_install_flags() -> str:
    """Return extra flags for uv pip install (e.g. ROCm/CUDA index)."""
    if _check_amd_gpu():
        return "--index https://download.pytorch.org/whl/rocm6.4 --index-strategy unsafe-best-match"
    if _check_nvidia_gpu():
        cuda_index = "cu130" if _is_dgx_spark() else "cu128"
        if cuda_index == "cu130":
            return "--index https://download.pytorch.org/whl/cu130 --index-strategy unsafe-best-match"
        else:
            return ""
    if not sys.platform == "darwin":
        return "--index https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match"
    return ""


class LocalProvider(ComputeProvider):
    """
    Provider that runs each "cluster" (task run) in a dedicated uv venv
    synced with the base environment (same as plugin install: uv venv + uv pip install .[extra]).

    Resource fields (cpus, memory, accelerators, num_nodes, disk_size) from ClusterConfig
    are ignored; runs use the local machine. Launches are serialized via a queue so only
    one local task launch runs at a time.
    """

    def __init__(self, extra_config: Optional[Dict[str, Any]] = None):
        self.extra_config = extra_config or {}

    def _ensure_venv_and_sync(self, venv_path: Path) -> None:
        """Create uv venv and sync with base env (pyproject.toml from source)."""
        source_code_dir = os.environ.get("_TFL_SOURCE_CODE_DIR")
        if not source_code_dir or not os.path.isdir(source_code_dir):
            raise FileNotFoundError("_TFL_SOURCE_CODE_DIR is not set or not a directory; cannot sync base environment")
        pyproject_path = Path(source_code_dir) / "pyproject.toml"
        if not pyproject_path.exists():
            raise FileNotFoundError(f"pyproject.toml not found at {pyproject_path}")

        venv_path = Path(venv_path)
        venv_path.mkdir(parents=True, exist_ok=True)

        # uv venv --python 3.11 (match plugin install default)
        subprocess.run(
            ["uv", "venv", str(venv_path), "--python", "3.11", "--clear"],
            cwd=venv_path.parent,
            check=True,
            capture_output=True,
            timeout=120,
        )

        extra = _get_pyproject_extra()
        additional_flags = _get_uv_pip_install_flags()
        # Run with venv activated: source venv/bin/activate && cd source_code_dir && uv pip install ...
        activate = str(venv_path / "bin" / "activate")
        full_cmd = f"source {activate} && cd {source_code_dir} && uv pip install {additional_flags} .{extra}"
        result = subprocess.run(
            ["/bin/bash", "-c", full_cmd],
            cwd=venv_path.parent,
            capture_output=True,
            text=True,
            timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(f"uv pip install failed: {result.stderr or result.stdout or 'unknown error'}")

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """
        Create a uv venv synced with base, run setup (if any), then run command in background.
        workspace_dir in provider_config is the job directory (per-run workspace).
        Resource fields (cpus, memory, accelerators, etc.) are ignored.
        Returns dict with job_id (cluster_name) and pid for status polling.
        """
        job_dir = (config.provider_config or {}).get("workspace_dir")
        if not job_dir or not os.path.isdir(job_dir):
            raise ValueError("Local provider requires workspace_dir (job directory) in provider_config")
        job_dir = Path(job_dir)
        venv_path = job_dir / "venv"
        venv_path.mkdir(parents=True, exist_ok=True)

        self._ensure_venv_and_sync(venv_path)

        venv_bin = venv_path / "bin"
        env = os.environ.copy()
        env.update(config.env_vars or {})
        env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"

        print(f"DEBUG: LocalProvider.launch_cluster: cluster_name={cluster_name}")
        print(f"DEBUG: LocalProvider.launch_cluster: job_dir={job_dir}")
        if config.setup:
            print(f"DEBUG: LocalProvider.launch_cluster: running setup: {config.setup}")
            setup_result = subprocess.run(
                ["/bin/bash", "-c", config.setup],
                cwd=job_dir,
                env=env,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if setup_result.returncode != 0:
                print(f"DEBUG: LocalProvider.launch_cluster: setup failed with code {setup_result.returncode}")
                print(f"DEBUG: LocalProvider.launch_cluster: setup stderr: {setup_result.stderr}")
                raise RuntimeError(f"Setup failed: {setup_result.stderr or setup_result.stdout or 'unknown'}")

        # Start main command in background (detached subprocess)
        print(f"DEBUG: LocalProvider.launch_cluster: running command: {config.command}")
        proc = subprocess.Popen(
            ["/bin/bash", "-c", config.command or "true"],
            cwd=str(job_dir),
            env=env,
            stdout=open(job_dir / "stdout.log", "w"),
            stderr=open(job_dir / "stderr.log", "w"),
            start_new_session=True,
        )
        pid = proc.pid
        with open(job_dir / "pid", "w") as f:
            f.write(str(pid))

        return {
            "cluster_name": cluster_name,
            "job_id": cluster_name,
            "pid": pid,
            "status": "submitted",
            "message": "Local job started",
        }

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        """Stop the local process for this cluster (SIGTERM)."""
        job_dir = self.extra_config.get("workspace_dir")
        if not job_dir:
            return {
                "cluster_name": cluster_name,
                "message": "workspace_dir (job dir) not set",
                "status": "unknown",
            }
        pid_file = Path(job_dir) / "pid"
        if not pid_file.exists():
            return {
                "cluster_name": cluster_name,
                "message": "No pid file found",
                "status": "stopped",
            }
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 15)
            return {"cluster_name": cluster_name, "status": "stopped", "message": "Sent SIGTERM"}
        except (ValueError, ProcessLookupError, OSError) as e:
            return {"cluster_name": cluster_name, "status": "stopped", "message": str(e)}

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """Return UP if the process is still running, DOWN otherwise."""
        job_dir = self.extra_config.get("workspace_dir")
        if not job_dir:
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UNKNOWN,
                status_message="workspace_dir (job dir) not set",
            )
        pid_file = Path(job_dir) / "pid"
        if not pid_file.exists():
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.DOWN,
                status_message="No pid file",
            )
        try:
            pid = int(pid_file.read_text().strip())
            os_killed = os.kill(pid, 0)
            # Return up only if the process is not running
            if os_killed is not None:
                return ClusterStatus(
                    cluster_name=cluster_name,
                    state=ClusterState.UP,
                    status_message="Process running",
                )
            else:
                return ClusterStatus(
                    cluster_name=cluster_name,
                    state=ClusterState.DOWN,
                    status_message="Process not running",
                )
        except (ValueError, ProcessLookupError, OSError):
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.DOWN,
                status_message="Process not running",
            )

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """Local provider has no persistent clusters; return empty list."""
        return []

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """Return minimal local resource info. Resources are not applicable for local runs."""
        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=[],
            cpus=None,
            memory_gb=None,
            disk_gb=None,
            num_nodes=1,
        )

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """Not used for local (launch_cluster runs the command directly)."""
        raise NotImplementedError("Local provider runs the command in launch_cluster; submit_job is not used")

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """Read stdout/stderr logs from job directory."""
        job_dir = self.extra_config.get("workspace_dir")
        if not job_dir:
            return "workspace_dir (job dir) not set"
        job_dir = Path(job_dir)
        log_file = job_dir / "stdout.log"
        err_file = job_dir / "stderr.log"
        if not log_file.exists() and not err_file.exists():
            return "No log files found"
        lines = []
        if log_file.exists():
            lines.append(log_file.read_text())
        if err_file.exists():
            lines.append(err_file.read_text())
        out = "\n".join(lines)
        if tail_lines is not None:
            out_lines = out.splitlines()
            out = "\n".join(out_lines[-tail_lines:])
        return out

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """Send SIGTERM to the local process."""
        self.stop_cluster(cluster_name)
        return {"job_id": job_id, "cluster_name": cluster_name, "status": "cancelled"}

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """Return a single job for this cluster (running or completed)."""
        status = self.get_cluster_status(cluster_name)
        state = JobState.RUNNING if status.state == ClusterState.UP else JobState.COMPLETED
        return [
            JobInfo(
                job_id=cluster_name,
                job_name=cluster_name,
                state=state,
                cluster_name=cluster_name,
            )
        ]

    def check(self) -> bool:
        """Local provider is always available if uv is installed."""
        import shutil

        return shutil.which("uv") is not None
