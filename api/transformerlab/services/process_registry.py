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
import logging
import os
import signal
import subprocess
import threading
from typing import Optional

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
    """Thread-safe in-memory registry of running subprocesses."""

    def __init__(self) -> None:
        self._procs: dict[str, subprocess.Popen] = {}
        self._workspace_index: dict[str, str] = {}
        self._lock = threading.Lock()

    def register(self, key: str, proc: subprocess.Popen, workspace_dir: Optional[str] = None) -> None:
        """
        Store proc under key. If key already exists, warn and kill old process.
        """
        with self._lock:
            existing = self._procs.get(key)
            if existing is not None:
                logger.warning(
                    "ProcessRegistry: key %r already registered (pid=%s); killing old process before re-registering.",
                    key,
                    existing.pid,
                )
                try:
                    _terminate_process_tree(existing.pid)
                except Exception:
                    pass
            self._procs[key] = proc
            if workspace_dir:
                self._workspace_index[workspace_dir] = key

    def unregister(self, key: str) -> None:
        """Remove an entry by key. No-op if key not found."""
        with self._lock:
            proc = self._procs.pop(key, None)
            if proc is None:
                return
            stale = [wd for wd, k in self._workspace_index.items() if k == key]
            for wd in stale:
                self._workspace_index.pop(wd, None)

    def kill(self, key: str) -> None:
        """Terminate process tree for key, then unregister it."""
        with self._lock:
            proc = self._procs.get(key)
            if proc is None:
                return
            pid = proc.pid

        try:
            _terminate_process_tree(pid)
        except Exception as e:
            logger.debug("ProcessRegistry.kill: error terminating pid=%s key=%r: %s", pid, key, e)
        finally:
            self.unregister(key)

    def kill_by_workspace(self, workspace_dir: str) -> None:
        """Look up registry key by workspace_dir and kill the process."""
        with self._lock:
            key = self._workspace_index.get(workspace_dir)
        if key is None:
            return
        self.kill(key)

    def kill_all(self) -> None:
        """Terminate every registered process."""
        with self._lock:
            keys = list(self._procs.keys())

        for key in keys:
            try:
                self.kill(key)
            except Exception as e:
                logger.warning("ProcessRegistry.kill_all: error killing %r: %s", key, e)

    def list_keys(self) -> list[str]:
        """Return currently registered keys."""
        with self._lock:
            return list(self._procs.keys())


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
