"""
Job profiling: background sampler for CPU, memory, and GPU resource usage.

Usage in tfl-remote-trap (or any process wrapper):

    import subprocess
    from lab.profiling import maybe_start_profiling, finalize_profiling

    proc = subprocess.Popen(...)
    profiling_thread = maybe_start_profiling(proc.pid, job_dir)

    exit_code = proc.wait()
    wall_time = time.monotonic() - start_time

    finalize_profiling(profiling_thread, job_dir, wall_time)

Activation:
    Set _TFL_PROFILING=1 in the job environment.
    Set _TFL_PROFILING_INTERVAL=<seconds> to change sampling interval (default 5).
    Set _TFL_PROFILING_TORCH=1 to also inject torch.profiler tracing.
"""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
import threading
import time
from typing import Any, Dict, List, Optional

_PROFILING_SAMPLES_FILE = "profiling_samples.jsonl"
_PROFILING_REPORT_FILE = "profiling_report.json"
_TORCH_PROFILE_DIR = "torch_profile"
_DEFAULT_INTERVAL_SEC = 5.0


def _sample_cpu_memory(pid: int) -> Dict[str, Any]:
    """Return CPU percent and RSS memory (MB) for the pid and its children."""
    try:
        import psutil  # type: ignore[import-not-found]
    except ImportError:
        return {}

    try:
        parent = psutil.Process(pid)
        procs = [parent] + parent.children(recursive=True)
        cpu_total = 0.0
        rss_total = 0.0
        for p in procs:
            try:
                cpu_total += p.cpu_percent(interval=None)
                rss_total += p.memory_info().rss
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return {
            "cpu_percent": round(cpu_total, 2),
            "memory_rss_mb": round(rss_total / (1024 * 1024), 2),
        }
    except Exception:
        return {}


def _sample_gpus_nvidia() -> List[Dict[str, Any]]:
    """Try pynvml first, then fall back to nvidia-smi subprocess."""
    # Try pynvml
    try:
        import pynvml  # type: ignore[import-not-found]

        pynvml.nvmlInit()
        count = pynvml.nvmlDeviceGetCount()
        gpus = []
        for i in range(count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
            gpus.append(
                {
                    "index": i,
                    "util_percent": util.gpu,
                    "mem_used_mb": round(mem.used / (1024 * 1024), 2),
                    "mem_total_mb": round(mem.total / (1024 * 1024), 2),
                }
            )
        return gpus
    except Exception:
        pass

    # Fall back to nvidia-smi
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return []
        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 4:
                continue
            try:
                gpus.append(
                    {
                        "index": int(parts[0]),
                        "util_percent": float(parts[1]),
                        "mem_used_mb": float(parts[2]),
                        "mem_total_mb": float(parts[3]),
                    }
                )
            except (ValueError, IndexError):
                pass
        return gpus
    except Exception:
        return []


def _sample_gpus_amd() -> List[Dict[str, Any]]:
    """Sample AMD GPU stats via rocm-smi."""
    try:
        result = subprocess.run(
            ["rocm-smi", "--showuse", "--showmemuse", "--csv"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return []
        lines = result.stdout.strip().splitlines()
        # rocm-smi CSV format can vary; best-effort parse
        gpus = []
        for i, line in enumerate(lines[1:]):  # skip header
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 2:
                continue
            try:
                gpus.append(
                    {
                        "index": i,
                        "util_percent": float(parts[1].rstrip("%")),
                        "mem_used_mb": None,
                        "mem_total_mb": None,
                    }
                )
            except (ValueError, IndexError):
                pass
        return gpus
    except Exception:
        return []


def _sample_gpus() -> List[Dict[str, Any]]:
    """Detect and sample GPU stats from NVIDIA or AMD hardware."""
    import shutil

    if shutil.which("nvidia-smi"):
        return _sample_gpus_nvidia()
    if shutil.which("rocm-smi"):
        return _sample_gpus_amd()
    return []


class _ProfilingThread(threading.Thread):
    """Background thread that periodically samples resource stats and writes to JSONL."""

    def __init__(self, pid: int, job_dir: str, interval_sec: float = _DEFAULT_INTERVAL_SEC) -> None:
        super().__init__(daemon=True, name="tfl-profiler")
        self.pid = pid
        self.job_dir = job_dir
        self.interval_sec = interval_sec
        self._stop_event = threading.Event()
        self.samples: List[Dict[str, Any]] = []

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        samples_path = os.path.join(self.job_dir, _PROFILING_SAMPLES_FILE)
        # Initialise cpu_percent (first call always returns 0.0 for psutil)
        try:
            import psutil  # type: ignore[import-not-found]

            psutil.Process(self.pid).cpu_percent(interval=None)
        except Exception:
            pass

        try:
            f = open(samples_path, "w", encoding="utf-8")
        except OSError:
            return

        try:
            while not self._stop_event.wait(self.interval_sec):
                sample: Dict[str, Any] = {"timestamp": time.time()}
                sample.update(_sample_cpu_memory(self.pid))
                gpus = _sample_gpus()
                if gpus:
                    sample["gpus"] = gpus
                self.samples.append(sample)
                try:
                    f.write(json.dumps(sample) + "\n")
                    f.flush()
                except OSError:
                    pass
        finally:
            try:
                f.close()
            except OSError:
                pass


def _aggregate_samples(samples: List[Dict[str, Any]], wall_time_sec: float, interval_sec: float) -> Dict[str, Any]:
    """Summarise a list of samples into a profiling report dict."""
    report: Dict[str, Any] = {
        "wall_time_sec": round(wall_time_sec, 2),
        "sample_count": len(samples),
        "interval_sec": interval_sec,
    }

    if not samples:
        return report

    cpu_values = [s["cpu_percent"] for s in samples if "cpu_percent" in s]
    mem_values = [s["memory_rss_mb"] for s in samples if "memory_rss_mb" in s]

    if cpu_values:
        report["cpu"] = {
            "peak_percent": round(max(cpu_values), 2),
            "avg_percent": round(sum(cpu_values) / len(cpu_values), 2),
        }
    if mem_values:
        report["memory"] = {
            "peak_rss_mb": round(max(mem_values), 2),
            "avg_rss_mb": round(sum(mem_values) / len(mem_values), 2),
        }

    # GPU aggregation: group by index
    gpu_samples: Dict[int, List[Dict[str, Any]]] = {}
    for s in samples:
        for g in s.get("gpus", []):
            idx = g.get("index", 0)
            gpu_samples.setdefault(idx, []).append(g)

    if gpu_samples:
        gpu_summaries = []
        for idx in sorted(gpu_samples.keys()):
            gs = gpu_samples[idx]
            utils = [g["util_percent"] for g in gs if g.get("util_percent") is not None]
            mems_used = [g["mem_used_mb"] for g in gs if g.get("mem_used_mb") is not None]
            mem_total = next((g["mem_total_mb"] for g in reversed(gs) if g.get("mem_total_mb") is not None), None)
            entry: Dict[str, Any] = {"index": idx}
            if utils:
                entry["peak_util_percent"] = round(max(utils), 2)
                entry["avg_util_percent"] = round(sum(utils) / len(utils), 2)
            if mems_used:
                entry["peak_mem_used_mb"] = round(max(mems_used), 2)
                entry["avg_mem_used_mb"] = round(sum(mems_used) / len(mems_used), 2)
            if mem_total is not None:
                entry["mem_total_mb"] = round(mem_total, 2)
            gpu_summaries.append(entry)
        report["gpus"] = gpu_summaries

    return report


def maybe_start_profiling(pid: int, job_dir: str) -> Optional[_ProfilingThread]:
    """
    Start a profiling thread if _TFL_PROFILING=1 is set in the environment.

    Returns the thread (caller must call finalize_profiling later) or None if profiling
    is disabled or the job_dir is unavailable.
    """
    if os.environ.get("_TFL_PROFILING") != "1":
        return None
    if not job_dir or not os.path.isdir(job_dir):
        return None
    try:
        interval = float(os.environ.get("_TFL_PROFILING_INTERVAL", str(_DEFAULT_INTERVAL_SEC)))
    except ValueError:
        interval = _DEFAULT_INTERVAL_SEC

    thread = _ProfilingThread(pid=pid, job_dir=job_dir, interval_sec=interval)
    thread.start()
    return thread


def finalize_profiling(
    thread: Optional[_ProfilingThread],
    job_dir: str,
    wall_time_sec: float,
) -> None:
    """
    Stop the profiling thread and write profiling_report.json to job_dir.

    Safe to call even when thread is None (profiling disabled).
    """
    if thread is None:
        return
    try:
        thread.stop()
        thread.join(timeout=10)
    except Exception:
        pass

    try:
        report = _aggregate_samples(thread.samples, wall_time_sec, thread.interval_sec)
        report_path = os.path.join(job_dir, _PROFILING_REPORT_FILE)
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Optional PyTorch profiler injection via sitecustomize.py
# ---------------------------------------------------------------------------

_SITECUSTOMIZE_TEMPLATE = """\
# Auto-injected by tfl-profile-trap (lab-sdk profiling).
# Activates torch.profiler.profile() and exports a Chrome trace to the job dir.
import os as _os
import atexit as _atexit

_TFL_TORCH_PROFILE_DIR = _os.environ.get("_TFL_TORCH_PROFILE_DIR", "")
if _TFL_TORCH_PROFILE_DIR:
    try:
        import torch  # noqa: F401
        from torch.profiler import profile as _profile, ProfilerActivity as _PA

        _prof = _profile(
            activities=[_PA.CPU, _PA.CUDA],
            with_stack=False,
            record_shapes=False,
        )
        _prof.__enter__()

        def _export_trace():
            try:
                _prof.__exit__(None, None, None)
                import pathlib as _pl
                _pl.Path(_TFL_TORCH_PROFILE_DIR).mkdir(parents=True, exist_ok=True)
                _trace_path = _pl.Path(_TFL_TORCH_PROFILE_DIR) / "trace.json"
                _prof.export_chrome_trace(str(_trace_path))
            except Exception:
                pass

        _atexit.register(_export_trace)
    except Exception:
        pass
"""


def inject_torch_profiler(job_dir: str, env: dict) -> str:
    """
    If _TFL_PROFILING_TORCH=1, write a sitecustomize.py to a temp dir and
    prepend it to PYTHONPATH in env so torch.profiler auto-activates in the job.

    Returns the temp dir path (caller should clean up after the job exits).
    """
    if os.environ.get("_TFL_PROFILING_TORCH") != "1":
        return ""

    try:
        torch_profile_dir = os.path.join(job_dir, _TORCH_PROFILE_DIR)
        os.makedirs(torch_profile_dir, exist_ok=True)

        tmp_dir = tempfile.mkdtemp(prefix="tfl_sitecustomize_")
        sitecustomize_path = os.path.join(tmp_dir, "sitecustomize.py")
        with open(sitecustomize_path, "w", encoding="utf-8") as f:
            f.write(_SITECUSTOMIZE_TEMPLATE)

        env["_TFL_TORCH_PROFILE_DIR"] = torch_profile_dir
        existing_pythonpath = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = (
            f"{tmp_dir}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else tmp_dir
        )
        return tmp_dir
    except Exception:
        return ""
