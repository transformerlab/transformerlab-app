"""Local compute provider: runs tasks in a uv venv synced with the base environment."""

import hashlib
import json
import os
import shlex
import contextlib
import signal
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from lab.dirs import HOME_DIR

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


def _read_local_provider_config() -> Optional[Dict[str, Any]]:
    """
    Read the local provider config snapshot written by `transformerlab.scripts.local_provider_config`.

    This is the same JSON payload that was previously served by `/server/config`.
    """
    config_path = Path(HOME_DIR) / "local_provider_config.json"
    if not config_path.exists():
        return None
    try:
        raw = config_path.read_text(encoding="utf-8")
        return json.loads(raw)
    except (OSError, json.JSONDecodeError):
        return None


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


_PYTHON_VERSION = "3.11"


def _terminate_process_tree(pid: int, sig: int = signal.SIGTERM) -> None:
    """
    Best-effort termination of a process and all of its descendants.

    Uses psutil when available to walk the full process tree and then force-kill
    any survivors; otherwise falls back to killing the process group (if possible)
    and then the single pid.
    """
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception:
        psutil = None  # type: ignore[assignment]

    if psutil is not None:
        try:
            parent = psutil.Process(pid)
        except psutil.NoSuchProcess:
            parent = None

        if parent is not None:
            procs = [parent] + parent.children(recursive=True)

            # First try graceful termination
            for proc in procs:
                with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
                    proc.send_signal(sig)

            # Give processes a short window to exit, then force kill survivors
            gone, alive = psutil.wait_procs(procs, timeout=3)  # type: ignore[assignment]
            for proc in alive:
                with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
                    proc.kill()
            return

    # Fallback path when psutil is unavailable or parent no longer exists
    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, sig)
    except Exception:
        os.kill(pid, sig)


def _is_process_zombie(pid: int) -> bool:
    """
    Return True if the process is a zombie/defunct process.

    Uses psutil when available; if psutil is not installed or status cannot be
    determined, returns False so callers can fall back to basic pid checks.
    """
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception:
        return False

    try:
        proc = psutil.Process(pid)
        try:
            status = proc.status()
        except psutil.Error:
            return False
    except psutil.NoSuchProcess:
        # Process went away between checks; treat as non-zombie here and let the
        # caller handle it as not running.
        return False

    zombie_status = getattr(psutil, "STATUS_ZOMBIE", "zombie")
    return status == zombie_status


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

    def _get_source_code_and_pyproject(self) -> Path:
        """Return path to pyproject.toml in the transformerlab API source tree."""
        source_code_dir = os.environ.get("_TFL_SOURCE_CODE_DIR")
        if not source_code_dir or not os.path.isdir(source_code_dir):
            raise FileNotFoundError("_TFL_SOURCE_CODE_DIR is not set or not a directory; cannot sync base environment")
        pyproject_path = Path(source_code_dir) / "pyproject.toml"
        if not pyproject_path.exists():
            raise FileNotFoundError(f"pyproject.toml not found at {pyproject_path}")
        return pyproject_path

    def _compute_team_venv_hash(self, pyproject_path: Path) -> str:
        """Compute a hash representing the desired team venv contents."""
        extra = _get_pyproject_extra()
        additional_flags = _get_uv_pip_install_flags()
        h = hashlib.sha256()
        h.update(pyproject_path.read_bytes())
        h.update(extra.encode("utf-8"))
        h.update(additional_flags.encode("utf-8"))
        h.update(_PYTHON_VERSION.encode("utf-8"))
        return h.hexdigest()

    def _ensure_job_venv_from_team(self, venv_path: Path, team_requirements: Path) -> None:
        """Create or refresh a per-job venv by installing from the shared team requirements."""
        team_requirements = Path(team_requirements)
        if not team_requirements.exists():
            raise FileNotFoundError(f"team requirements file not found at {team_requirements}")

        venv_path = Path(venv_path)
        venv_path.mkdir(parents=True, exist_ok=True)

        # uv venv --python (match plugin install default)
        subprocess.run(
            ["uv", "venv", str(venv_path), "--python", _PYTHON_VERSION, "--clear"],
            cwd=venv_path.parent,
            check=True,
            capture_output=True,
            timeout=120,
        )

        additional_flags = _get_uv_pip_install_flags()

        # Use uv pip with an explicit --python target so installs go into this venv.
        python_bin = venv_path / "bin" / "python"
        env = os.environ.copy()

        install_cmd = ["uv", "pip", "install"]
        if additional_flags:
            install_cmd.extend(shlex.split(additional_flags))
        install_cmd.extend(["--python", str(python_bin), "-r", str(team_requirements)])

        result = subprocess.run(
            install_cmd,
            cwd=venv_path.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=900,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"uv pip install failed for job venv: {result.stderr or result.stdout or 'unknown error'}"
            )

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
        # Use a per-job workspace directory as HOME for local runs so tools that
        # rely on ~ and $HOME resolve inside the job workspace instead of the
        # user's real home directory. This makes it easier to clone and run
        # code in an isolated workspace for each job.
        workspace_home = job_dir / "workspace"
        workspace_home.mkdir(parents=True, exist_ok=True)

        # Create the venv inside the per-job workspace HOME directory so that all
        # environment state (including Python packages) lives under HOME.
        venv_path = workspace_home / "venv"

        # Ensure the shared base venv (common across all teams) exists and is up to date,
        # then create a per-job venv from its frozen requirements.
        base_requirements = ensure_base_venv_and_requirements()
        self._ensure_job_venv_from_team(venv_path, base_requirements)

        venv_bin = venv_path / "bin"
        env = os.environ.copy()
        env.update(config.env_vars or {})
        env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"
        env["HOME"] = str(workspace_home)

        if config.setup:
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
        """Stop the local process tree for this cluster (SIGTERM)."""
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
            _terminate_process_tree(pid, signal.SIGTERM)
            return {"cluster_name": cluster_name, "status": "stopped", "message": "Sent SIGTERM to process tree"}
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
                state=ClusterState.UNKNOWN,
                status_message="No pid file (cluster may be starting)",
            )
        try:
            pid = int(pid_file.read_text().strip())
            os.kill(pid, 0)
            if _is_process_zombie(pid):
                raise ProcessLookupError("Process is zombie/defunct")
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.UP,
                status_message="Process running",
            )
        except (ValueError, ProcessLookupError, OSError):
            return ClusterStatus(
                cluster_name=cluster_name,
                state=ClusterState.DOWN,
                status_message="Process not running",
            )

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """
        Return a single "local machine" cluster snapshot.

        We model the local machine as a fixed (non-elastic) cluster so the UI can use the same
        response type as remote providers: a list of clusters with nodes + resource summaries.
        """
        cfg = _read_local_provider_config()
        if not cfg:
            return []

        def _bytes_to_gb(value: Any) -> float:
            try:
                v = float(value)
                return round(v / (1024.0**3), 2)
            except Exception:
                return 0.0

        cpu_count = int(cfg.get("cpu_count") or 0)

        mem = cfg.get("memory") or {}
        mem_total_b = mem.get("total") or 0
        mem_avail_b = mem.get("available") or 0
        mem_used_b = max(float(mem_total_b) - float(mem_avail_b), 0.0) if mem_total_b and mem_avail_b else 0.0

        gpu_list = cfg.get("gpu") or []
        gpu_counts: Dict[str, int] = {}
        if isinstance(gpu_list, list):
            for g in gpu_list:
                if not isinstance(g, dict):
                    continue
                name = g.get("name")
                if not name or name == "cpu":
                    continue
                gpu_counts[str(name)] = gpu_counts.get(str(name), 0) + 1

        node_name = str(cfg.get("name") or "local")

        cluster: Dict[str, Any] = {
            "cluster_id": "local",
            "cluster_name": "Local Machine",
            "backend_type": "local",
            "elastic_enabled": False,
            "max_nodes": 1,
            "nodes": [
                {
                    "node_name": node_name,
                    "is_fixed": True,
                    "is_active": True,
                    "state": "UP",
                    "reason": "",
                    "resources": {
                        "cpus_total": cpu_count,
                        "cpus_allocated": 0,
                        "gpus": gpu_counts,
                        "memory_gb_total": _bytes_to_gb(mem_total_b),
                        "memory_gb_allocated": _bytes_to_gb(mem_used_b),
                    },
                }
            ],
            # Keep the full snapshot for richer UI use (GPU names, CUDA version, etc.)
            "provider_data": cfg,
        }

        return [cluster]

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
        """Local provider is available when uv is installed and local config exists."""
        from pathlib import Path

        config_path = Path(HOME_DIR) / "local_provider_config.json"
        return config_path.exists()


def ensure_base_venv_and_requirements() -> Path:
    """
    Ensure the shared base venv under HOME_DIR and its frozen requirements exist and are up to date.

    This base venv is common across all teams and is created at:
        HOME_DIR / "local_provider_base_venv"

    Returns the path to the base requirements file.
    """
    pyproject_path = LocalProvider()._get_source_code_and_pyproject()
    home_dir_path = Path(HOME_DIR)
    home_dir_path.mkdir(parents=True, exist_ok=True)

    base_venv_path = home_dir_path / "local_provider_base_venv"
    base_requirements = home_dir_path / "local_provider_base_requirements.txt"

    source_code_dir = str(pyproject_path.parent)

    base_venv_path.mkdir(parents=True, exist_ok=True)

    # uv venv --python (match plugin install default)
    subprocess.run(
        ["uv", "venv", str(base_venv_path), "--python", _PYTHON_VERSION, "--clear"],
        cwd=base_venv_path.parent,
        check=True,
        capture_output=True,
        timeout=120,
    )

    extra = _get_pyproject_extra()
    additional_flags = _get_uv_pip_install_flags()

    # Use uv pip with an explicit --python target so installs go into the base venv.
    python_bin = base_venv_path / "bin" / "python"
    env = os.environ.copy()

    install_cmd = ["uv", "pip", "install"]
    if additional_flags:
        install_cmd.extend(shlex.split(additional_flags))
    install_cmd.extend(["--python", str(python_bin), f".{extra}"])

    result = subprocess.run(
        install_cmd,
        cwd=source_code_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=900,
    )

    if result.returncode != 0:
        raise RuntimeError(f"uv pip install failed for base venv: {result.stderr or result.stdout or 'unknown error'}")

    freeze_cmd = ["uv", "pip", "freeze", "--python", str(python_bin)]
    try:
        with base_requirements.open("w", encoding="utf-8") as req_file:
            result = subprocess.run(
                freeze_cmd,
                cwd=source_code_dir,
                env=env,
                stdout=req_file,
                stderr=subprocess.PIPE,
                text=True,
                timeout=300,
            )
    except OSError as exc:
        raise RuntimeError(f"Failed to write base requirements file: {exc}") from exc

    if result.returncode != 0:
        raise RuntimeError(f"uv pip freeze failed for base venv: {result.stderr or 'unknown error'}")

    # Always ensure the local provider config snapshot is generated via the base venv.
    # This uses the same logic as /server/info but runs inside the shared base venv and
    # writes the result to HOME_DIR/local_provider_config.json.
    python_bin = base_venv_path / "bin" / "python"
    script_path = Path(source_code_dir) / "transformerlab" / "scripts" / "local_provider_config.py"
    env = os.environ.copy()
    venv_bin = base_venv_path / "bin"
    env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"

    result = subprocess.run(
        [str(python_bin), str(script_path)],
        cwd=source_code_dir,
        env=env,
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "Failed to generate local provider config "
            f"(exit {result.returncode}): {result.stderr or result.stdout or 'unknown error'}"
        )

    return base_requirements
