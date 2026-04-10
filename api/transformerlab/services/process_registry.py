"""
Centralized subprocess registry for TransformerLab.

All subprocesses launched by local providers and Trackio are registered here
so they can be killed correctly (full recursive process tree) on explicit stop
or on API server shutdown.

Key scheme:
  local:{org_id}:{exp_id}:{job_id}    - local provider jobs
  trackio:{org_id}:{exp_id}:{job_id}  - Trackio dashboard processes

A secondary index keyed by workspace_dir allows lookups when only the
filesystem path is known (e.g. at stop/cancel time).
"""

import contextlib
import fcntl
import json
import logging
import os
import signal
import subprocess
import tempfile
import threading
from collections.abc import Generator
from typing import Any, Optional

from lab.dirs import get_local_provider_root

logger = logging.getLogger(__name__)


def _terminate_process_tree(pid: int, sig: int = signal.SIGTERM) -> None:
    """
    Best-effort termination of a process and all of its descendants (recursive).

    Uses psutil when available to walk the full process tree (parent + all
    grandchildren at any depth) and then force-kill any survivors; otherwise
    falls back to killing the process group (if possible) and then the single pid.
    """
    try:
        import psutil  # type: ignore[import-not-found]
    except Exception:
        psutil = None  # type: ignore[assignment]

    if psutil is not None:
        try:
            try:
                parent = psutil.Process(pid)
            except psutil.NoSuchProcess:
                parent = None

            if parent is not None:
                procs = [parent] + parent.children(recursive=True)
                for proc in procs:
                    with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
                        proc.send_signal(sig)
                _, alive = psutil.wait_procs(procs, timeout=3)  # type: ignore[assignment]
                for proc in alive:
                    with contextlib.suppress(psutil.NoSuchProcess, psutil.AccessDenied, psutil.Error):
                        proc.kill()
                return
        except Exception:
            pass

    try:
        pgid = os.getpgid(pid)
        os.killpg(pgid, sig)
    except Exception:
        try:
            os.kill(pid, sig)
        except Exception:
            pass


class ProcessRegistry:
    """Thread-safe JSON-backed registry of running subprocesses."""

    def __init__(self, registry_dir: Optional[str] = None) -> None:
        self._registry_dir = registry_dir or get_local_provider_root()
        self._state_path = os.path.join(self._registry_dir, "process_registry.json")
        self._lock_path = os.path.join(self._registry_dir, "process_registry.lock")
        self._lock = threading.Lock()
        os.makedirs(self._registry_dir, exist_ok=True)
        if not os.path.exists(self._state_path):
            self._write_state({"procs": {}, "workspace_index": {}})

    def _read_state(self) -> dict[str, Any]:
        try:
            with open(self._state_path, encoding="utf-8") as f:
                state = json.loads(f.read())
        except (OSError, json.JSONDecodeError):
            return {"procs": {}, "workspace_index": {}}
        if not isinstance(state, dict):
            return {"procs": {}, "workspace_index": {}}
        procs = state.get("procs", {})
        workspace_index = state.get("workspace_index", {})
        if not isinstance(procs, dict) or not isinstance(workspace_index, dict):
            return {"procs": {}, "workspace_index": {}}
        return {"procs": procs, "workspace_index": workspace_index}

    def _write_state(self, state: dict[str, Any]) -> None:
        os.makedirs(self._registry_dir, exist_ok=True)
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=self._registry_dir, delete=False) as tmp_file:
            tmp_file.write(json.dumps(state))
            tmp_path = tmp_file.name
        os.replace(tmp_path, self._state_path)

    @contextlib.contextmanager
    def _locked_state(self) -> Generator[dict[str, Any], None, None]:
        os.makedirs(self._registry_dir, exist_ok=True)
        with open(self._lock_path, "w", encoding="utf-8") as lock_file:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                state = self._read_state()
                yield state
                self._write_state(state)
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def register(self, key: str, proc: subprocess.Popen, workspace_dir: Optional[str] = None) -> None:
        """
        Store proc under key. If key already exists, warn and kill old process.
        """
        existing_pid: Optional[int] = None
        with self._lock:
            with self._locked_state() as state:
                procs = state["procs"]
                workspace_index = state["workspace_index"]
                existing = procs.get(key)
                if isinstance(existing, dict):
                    existing_pid = existing.get("pid")
                if existing_pid is not None:
                    logger.warning(
                        "ProcessRegistry: key %r already registered (pid=%s); killing old process before re-registering.",
                        key,
                        existing_pid,
                    )
                procs[key] = {
                    "pid": proc.pid,
                    "workspace_dir": workspace_dir,
                }
                stale = [wd for wd, k in workspace_index.items() if k == key]
                for wd in stale:
                    workspace_index.pop(wd, None)
                if workspace_dir:
                    workspace_index[workspace_dir] = key

        if existing_pid is not None:
            try:
                _terminate_process_tree(existing_pid)
            except Exception:
                pass

    def unregister(self, key: str) -> None:
        """Remove an entry by key. No-op if key not found."""
        with self._lock:
            with self._locked_state() as state:
                procs = state["procs"]
                workspace_index = state["workspace_index"]
                proc = procs.pop(key, None)
                if proc is None:
                    return
                stale = [wd for wd, k in workspace_index.items() if k == key]
                for wd in stale:
                    workspace_index.pop(wd, None)

    def kill(self, key: str) -> None:
        """Terminate process tree for key, then unregister it."""
        pid: Optional[int] = None
        with self._lock:
            with self._locked_state() as state:
                procs = state["procs"]
                workspace_index = state["workspace_index"]
                proc = procs.pop(key, None)
                if isinstance(proc, dict):
                    pid = proc.get("pid")
                stale = [wd for wd, k in workspace_index.items() if k == key]
                for wd in stale:
                    workspace_index.pop(wd, None)

        if pid is None:
            return

        try:
            _terminate_process_tree(pid)
        except Exception as e:
            logger.debug("ProcessRegistry.kill: error terminating pid=%s key=%r: %s", pid, key, e)

    def kill_by_workspace(self, workspace_dir: str) -> None:
        """Look up registry key by workspace_dir and kill the process."""
        with self._lock:
            with self._locked_state() as state:
                key = state["workspace_index"].get(workspace_dir)
        if key is None:
            return
        self.kill(key)

    def kill_all(self) -> None:
        """Terminate every registered process."""
        with self._lock:
            with self._locked_state() as state:
                procs = state["procs"]
                entries: list[tuple[str, int]] = []
                for key, proc_entry in procs.items():
                    if not isinstance(proc_entry, dict):
                        continue
                    pid = proc_entry.get("pid")
                    if isinstance(pid, int):
                        entries.append((key, pid))
                state["procs"] = {}
                state["workspace_index"] = {}

        for key, pid in entries:
            try:
                _terminate_process_tree(pid)
            except Exception as e:
                logger.warning("ProcessRegistry.kill_all: error killing %r (pid=%s): %s", key, pid, e)

    def list_keys(self) -> list[str]:
        """Return currently registered keys."""
        with self._lock:
            with self._locked_state() as state:
                return list(state["procs"].keys())


_registry: Optional[ProcessRegistry] = None
_registry_lock = threading.Lock()


def get_registry() -> ProcessRegistry:
    """Return the module-level ProcessRegistry singleton."""
    global _registry
    if _registry is None:
        with _registry_lock:
            if _registry is None:
                _registry = ProcessRegistry()
    return _registry
