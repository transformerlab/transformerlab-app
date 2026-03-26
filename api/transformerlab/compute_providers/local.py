"""Local compute provider: runs tasks in a uv venv synced with the base environment."""

import contextlib
import json
import os
import re
import signal
import shlex
import subprocess
import sys
import threading
import time
import tempfile
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional, Union, Callable

from lab.dirs import HOME_DIR, get_local_provider_config_path, get_local_provider_root

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
    config_path = Path(get_local_provider_config_path())
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
_BASE_SETUP_LOCK = threading.Lock()
_BASE_STATE_FILE = "local_provider_base_state.json"
_LOCAL_PROVIDER_PYPROJECT = "localprovider_pyproject.toml"
_TLAB_DIR = Path.home() / ".transformerlab"
_MINIFORGE_ROOT = _TLAB_DIR / "miniforge3"
_CONDA_BIN = _MINIFORGE_ROOT / "bin" / "conda"
_CONDA_ENV_DIR = _TLAB_DIR / "envs" / "transformerlab"
_INSTALL_LOG_FILE = "local_provider_install.log"


def _get_base_state_path() -> Path:
    return Path(get_local_provider_root()) / _BASE_STATE_FILE


def _read_base_state() -> Optional[Dict[str, Any]]:
    state_path = _get_base_state_path()
    if not state_path.exists():
        return None
    try:
        return json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _write_base_state(*, ready: bool, message: str) -> None:
    payload = {
        "ready": ready,
        "message": message,
        "updated_at": time.time(),
        "python_version": _PYTHON_VERSION,
    }
    _get_base_state_path().write_text(json.dumps(payload), encoding="utf-8")


def _get_install_log_path() -> Path:
    root = Path(get_local_provider_root())
    root.mkdir(parents=True, exist_ok=True)
    return root / _INSTALL_LOG_FILE


def _resolve_lab_sdk_dir(localprovider_pyproject: Path) -> Optional[Path]:
    """Return sibling ``lab-sdk`` next to the api directory (monorepo or ~/.transformerlab/src layout)."""
    lab_sdk = (localprovider_pyproject.parent.parent / "lab-sdk").resolve()
    if (lab_sdk / "pyproject.toml").is_file():
        return lab_sdk
    return None


def _strip_transformerlab_version_pin(pyproject_path: Path) -> bool:
    """
    Remove the ``transformerlab==...`` dependency line so ``uv pip install .[extra]`` does not
    pull PyPI after we install from a local tree. Returns True if a line was removed.
    """
    text = pyproject_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    out: List[str] = []
    removed = False
    for line in lines:
        if re.match(r'^\s*"transformerlab==', line):
            removed = True
            continue
        out.append(line)
    if removed:
        pyproject_path.write_text("".join(out), encoding="utf-8")
    return removed


def _run_local_provider_conda_install(source_code_dir: str) -> None:
    installer_script = Path(source_code_dir) / "local_provider_conda_install.sh"
    if not installer_script.exists():
        raise FileNotFoundError(f"local_provider_conda_install.sh not found at {installer_script}")

    cmd = ["/bin/bash", str(installer_script)]
    log_path = _get_install_log_path()
    with log_path.open("a", encoding="utf-8") as log_file:
        log_file.write(f"\n=== Local provider install start ({time.strftime('%Y-%m-%d %H:%M:%S')}) ===\n")
        log_file.write(f"Command: {' '.join(cmd)}\n")
        log_file.flush()
        result = subprocess.run(
            cmd,
            cwd=source_code_dir,
            stdout=log_file,
            stderr=log_file,
            text=True,
            timeout=3600,
        )
        log_file.write(f"=== Local provider install end (exit={result.returncode}) ===\n")
        log_file.flush()
    if result.returncode != 0:
        raise RuntimeError(f"local_provider_conda_install.sh failed with exit code {result.returncode}")


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

    def setup(
        self,
        progress_callback: Optional["Callable[[str, int, str], None]"] = None,
        force_refresh: bool = False,
    ) -> None:
        """
        Perform provider-level setup for local runs.

        This currently ensures the shared base uv virtual environment under
        HOME_DIR is created and up to date. This can be slow on first run, so callers may choose
        to invoke it ahead of time and surface progress in the UI.

        Args:
            progress_callback: Optional callback accepting (phase, percent, message)
                for reporting coarse-grained progress information. When provided,
                it is invoked before and after the heavy setup work.
        """
        if progress_callback is not None:
            progress_callback(
                "provider_setup_start",
                0,
                "Refreshing local provider base environment..."
                if force_refresh
                else "Preparing local provider base environment (this may take a few minutes)...",
            )

        ensure_base_venv_and_requirements(progress_callback=progress_callback, force_refresh=force_refresh)

        if progress_callback is not None:
            progress_callback(
                "provider_setup_complete",
                100,
                "Local provider base environment refreshed."
                if force_refresh
                else "Local provider base environment is ready.",
            )

    def _get_source_code_and_pyproject(self) -> Path:
        """Return path to local-provider pyproject in the transformerlab API source tree."""
        source_code_dir = os.environ.get("_TFL_SOURCE_CODE_DIR")
        if not source_code_dir or not os.path.isdir(source_code_dir):
            raise FileNotFoundError("_TFL_SOURCE_CODE_DIR is not set or not a directory; cannot sync base environment")
        pyproject_path = Path(source_code_dir) / _LOCAL_PROVIDER_PYPROJECT
        if not pyproject_path.exists():
            raise FileNotFoundError(f"{_LOCAL_PROVIDER_PYPROJECT} not found at {pyproject_path}")
        return pyproject_path

    def _ensure_job_venv_from_base(self, venv_path: Path, localprovider_pyproject: Path) -> None:
        """Create or refresh a per-job venv using the local-provider pinned manifest."""
        venv_path = Path(venv_path)
        venv_path.mkdir(parents=True, exist_ok=True)

        if not _CONDA_BIN.exists():
            raise FileNotFoundError(f"Conda executable not found at {_CONDA_BIN}")

        # Create per-job uv venv while running under the local-provider conda env.
        subprocess.run(
            [
                str(_CONDA_BIN),
                "run",
                "--prefix",
                str(_CONDA_ENV_DIR),
                "uv",
                "venv",
                str(venv_path),
                "--python",
                _PYTHON_VERSION,
                "--clear",
            ],
            cwd=venv_path.parent,
            check=True,
            capture_output=True,
            timeout=300,
        )

        additional_flags = _get_uv_pip_install_flags()
        extra = _get_pyproject_extra()

        # Use uv pip with an explicit --python target so installs go into this venv.
        python_bin = venv_path / "bin" / "python"
        env = os.environ.copy()

        tmp_project_dir = Path(tempfile.mkdtemp(prefix="tfl-local-provider-job-"))
        try:
            shutil.copy2(localprovider_pyproject, tmp_project_dir / "pyproject.toml")
            shutil.copytree(localprovider_pyproject.parent / "tlab_package_init", tmp_project_dir / "tlab_package_init")
        except Exception:
            shutil.rmtree(tmp_project_dir, ignore_errors=True)
            raise

        tmp_pyproject = tmp_project_dir / "pyproject.toml"
        lab_sdk_dir = _resolve_lab_sdk_dir(localprovider_pyproject)
        if lab_sdk_dir is not None:
            _strip_transformerlab_version_pin(tmp_pyproject)
            ed_cmd = [
                str(_CONDA_BIN),
                "run",
                "--prefix",
                str(_CONDA_ENV_DIR),
                "uv",
                "pip",
                "install",
                "--python",
                str(python_bin),
                "-e",
                str(lab_sdk_dir),
            ]
            ed_result = subprocess.run(
                ed_cmd,
                cwd=str(tmp_project_dir),
                env=env,
                capture_output=True,
                text=True,
                timeout=900,
            )
            if ed_result.returncode != 0:
                shutil.rmtree(tmp_project_dir, ignore_errors=True)
                raise RuntimeError(
                    "uv pip install -e lab-sdk failed for job venv: "
                    f"{ed_result.stderr or ed_result.stdout or 'unknown error'}"
                )

        install_cmd = [str(_CONDA_BIN), "run", "--prefix", str(_CONDA_ENV_DIR), "uv", "pip", "install"]
        if additional_flags:
            install_cmd.extend(shlex.split(additional_flags))
        install_cmd.extend(["--python", str(python_bin), f".{extra}"])

        result = subprocess.run(
            install_cmd,
            cwd=str(tmp_project_dir),
            env=env,
            capture_output=True,
            text=True,
            timeout=900,
        )
        shutil.rmtree(tmp_project_dir, ignore_errors=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"uv pip install failed for job venv: {result.stderr or result.stdout or 'unknown error'}"
            )

    def launch_cluster(
        self,
        cluster_name: str,
        config: ClusterConfig,
        on_status: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """
        Create a uv venv synced with base, run setup (if any), then run command in background.
        workspace_dir in provider_config is the job directory (per-run workspace).
        Resource fields (cpus, memory, accelerators, etc.) are ignored.
        Returns dict with job_id (cluster_name) and pid for status polling.

        on_status: optional callback invoked with a human-readable status string
        at each lifecycle phase (e.g. "Preparing environment", "Running setup").
        """
        job_dir = (config.provider_config or {}).get("workspace_dir")
        if not job_dir or not os.path.isdir(job_dir):
            raise ValueError("Local provider requires workspace_dir (job directory) in provider_config")
        job_dir = Path(job_dir)

        def _status(msg: str) -> None:
            if on_status:
                try:
                    on_status(msg)
                except Exception:
                    pass

        _status("Preparing environment")

        # Use a per-job workspace directory as HOME for local runs so tools that
        # rely on ~ and $HOME resolve inside the job workspace instead of the
        # user's real home directory. This makes it easier to clone and run
        # code in an isolated workspace for each job.
        workspace_home = job_dir / "workspace"
        workspace_home.mkdir(parents=True, exist_ok=True)

        # Create the venv inside the per-job workspace HOME directory so that all
        # environment state (including Python packages) lives under HOME.
        venv_path = workspace_home / "venv"

        # Ensure shared local-provider base environment exists (one-time for all orgs),
        # then create a per-job venv from the pinned local-provider manifest.
        ensure_base_venv_and_requirements()
        localprovider_pyproject = self._get_source_code_and_pyproject()
        self._ensure_job_venv_from_base(venv_path, localprovider_pyproject)

        venv_bin = venv_path / "bin"
        env = os.environ.copy()
        env.update(config.env_vars or {})
        env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"
        env["VIRTUAL_ENV"] = str(venv_path)
        env["HOME"] = str(workspace_home)
        env["UV_CACHE_DIR"] = os.path.join(get_local_provider_root(), "uv_cache")
        # Share the host user's cache directories so that each run does not
        # re-download large assets (HF models, pip wheels, etc.).  Fixes #1604.
        real_home = str(Path.home())
        env.setdefault("HF_HOME", os.path.join(real_home, ".cache", "huggingface"))
        env.setdefault("XDG_CACHE_HOME", os.path.join(real_home, ".cache"))

        # Open log files early so setup output is visible to get_job_logs / tunnel_info
        # while packages are still being installed.
        stdout_log = open(job_dir / "stdout.log", "w")
        stderr_log = open(job_dir / "stderr.log", "w")
        try:
            if config.setup:
                _status("Running setup")
                print(f"[LocalProvider] Running setup in {job_dir}: {config.setup!r}")
                setup_result = subprocess.run(
                    ["/bin/bash", "-c", config.setup],
                    cwd=job_dir,
                    env=env,
                    stdout=stdout_log,
                    stderr=stderr_log,
                    text=True,
                    timeout=600,
                )

                # Flush so tunnel_info can see the output immediately
                stdout_log.flush()
                stderr_log.flush()

                if setup_result.returncode != 0:
                    tail = ""
                    try:
                        with open(job_dir / "stderr.log") as f:
                            lines = f.readlines()
                            tail = "".join(lines[-20:])
                    except OSError:
                        pass
                    print(f"[LocalProvider] Setup failed with code {setup_result.returncode}")
                    raise RuntimeError(f"Setup failed (exit {setup_result.returncode}). Last lines:\n{tail}")

            # Start main run command in background (detached subprocess)
            _status("Starting service")
            print(f"[LocalProvider] Launching run in {job_dir}: {config.run!r}")
            proc = subprocess.Popen(
                ["/bin/bash", "-c", config.run or "true"],
                cwd=str(job_dir),
                env=env,
                stdout=stdout_log,
                stderr=stderr_log,
                start_new_session=True,
            )
        finally:
            # Close parent-side file descriptors after setup/launch. The child
            # process keeps its own inherited descriptors for log streaming.
            stdout_log.close()
            stderr_log.close()
        pid = proc.pid
        with open(job_dir / "pid", "w") as f:
            f.write(str(pid))
        print(f"[LocalProvider] Process started with pid={pid}, logs at {job_dir}/stdout.log")

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
            print(f"[LocalProvider.get_job_logs] workspace_dir not set for cluster={cluster_name}")
            return "workspace_dir (job dir) not set"
        job_dir = Path(job_dir)
        log_file = job_dir / "stdout.log"
        err_file = job_dir / "stderr.log"
        stdout_exists = log_file.exists()
        stderr_exists = err_file.exists()
        if not stdout_exists and not stderr_exists:
            print(f"[LocalProvider.get_job_logs] No log files in {job_dir}")
            return "No log files found"
        lines = []
        # Put stderr first (setup messages like git hints) so that stdout
        # (which grows with runtime output) is at the end and new content
        # appears at the bottom of the log view.
        if stderr_exists:
            lines.append(err_file.read_text())
        if stdout_exists:
            lines.append(log_file.read_text())
        out = "\n".join(lines)
        total_lines = out.count("\n")
        if tail_lines is not None:
            out_lines = out.splitlines()
            out = "\n".join(out_lines[-tail_lines:])
        print(
            f"[LocalProvider.get_job_logs] cluster={cluster_name}: "
            f"stdout={stdout_exists} ({log_file.stat().st_size if stdout_exists else 0}B), "
            f"stderr={stderr_exists} ({err_file.stat().st_size if stderr_exists else 0}B), "
            f"total_lines={total_lines}, tail_lines={tail_lines}"
        )
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
        """Local provider is available local config exists."""
        from pathlib import Path

        config_path = Path(get_local_provider_config_path())
        if config_path.exists():
            return True
        # Backward-compat: allow existing installs that still have the file in HOME_DIR.
        legacy_config_path = Path(HOME_DIR) / "local_provider_config.json"
        return legacy_config_path.exists()


def ensure_base_venv_and_requirements(
    progress_callback: Optional[Callable[[str, int, str], None]] = None,
    force_refresh: bool = False,
) -> Path:
    """
    Ensure the shared conda base environment for local provider exists and is up to date.

    This setup is common across all teams and is provisioned at:
        ~/.transformerlab/envs/transformerlab

    Returns the path to the conda environment directory.
    """
    if progress_callback is not None:
        progress_callback(
            "provider_setup_resolve_project",
            10,
            "Resolving Transformer Lab project metadata...",
        )

    pyproject_path = LocalProvider()._get_source_code_and_pyproject()
    local_provider_root = Path(get_local_provider_root())
    local_provider_root.mkdir(parents=True, exist_ok=True)

    source_code_dir = str(pyproject_path.parent)

    with _BASE_SETUP_LOCK:
        base_state = _read_base_state()
        if not force_refresh and base_state and base_state.get("ready"):
            if progress_callback is not None:
                progress_callback(
                    "provider_setup_reused",
                    100,
                    "Reusing existing shared local provider base environment.",
                )
            return _CONDA_ENV_DIR

        if progress_callback is not None:
            progress_callback(
                "provider_setup_conda_install",
                25,
                "Installing/updating local provider conda base environment...",
            )

        if progress_callback is not None:
            progress_callback(
                "provider_setup_install_deps",
                60,
                "Installing conda environment, local provider dependencies, and CUDA (if applicable)...",
            )
        _run_local_provider_conda_install(source_code_dir)

        # Always ensure the local provider config snapshot is generated via the base conda env.
        # This uses the same logic as /server/info but runs inside the shared env and
        # writes the result to HOME_DIR/local_provider/local_provider_config.json.
        python_bin = _CONDA_ENV_DIR / "bin" / "python"
        script_path = (
            Path(source_code_dir)
            / "transformerlab"
            / "compute_providers"
            / "services"
            / "local"
            / "local_provider_config.py"
        )
        env = os.environ.copy()
        venv_bin = _CONDA_ENV_DIR / "bin"
        env["PATH"] = f"{venv_bin}{os.pathsep}{env.get('PATH', '')}"

        if progress_callback is not None:
            progress_callback(
                "provider_setup_collect_metrics",
                90,
                "Collecting local machine metrics for the provider...",
            )

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

        _write_base_state(
            ready=True,
            message="Base environment prepared and local provider config generated.",
        )

    if progress_callback is not None:
        progress_callback(
            "provider_setup_done",
            100,
            "Local provider base environment and metrics are ready.",
        )

    return _CONDA_ENV_DIR
