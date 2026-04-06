"""File-lock-based leader election for background workers.

Only one API process should run background job-queue workers at a time.
This module uses ``fcntl.flock`` to acquire a non-blocking exclusive lock on
``~/.transformerlab/.worker_leader.lock``.  The first process to grab the lock
becomes the *leader* and is responsible for starting all background workers
(job-queue drainers, sweep-status poller, etc.).

On platforms where ``fcntl`` is unavailable (e.g. Windows) the module falls
back to always reporting leadership, preserving single-process behaviour.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)

# Module-level state -------------------------------------------------------
_leader: bool = False
_lock_fd = None  # file descriptor kept open for process lifetime


def _lock_path() -> Path:
    """Return the path to the leader lock file.

    Uses ``~/.transformerlab/.worker_leader.lock``, consistent with
    how the rest of the codebase resolves ``~/.transformerlab/``.
    """
    home_dir = os.environ.get("TFL_HOME_DIR") or os.path.join(os.path.expanduser("~"), ".transformerlab")
    return Path(home_dir) / ".worker_leader.lock"


def try_acquire_leadership() -> bool:
    """Attempt to grab an exclusive lock; return ``True`` if this process is now the leader."""
    global _leader, _lock_fd

    if _leader:
        return True

    try:
        import fcntl
    except ImportError:
        # Platform without fcntl (Windows) – assume single-process deployment.
        _leader = True
        logger.info("[leader] fcntl unavailable; assuming single-process leadership")
        return True

    lock_file = _lock_path()
    lock_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        fd = open(lock_file, "w")  # noqa: SIM115
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        # Write PID for debugging visibility.
        fd.write(str(os.getpid()))
        fd.flush()
        _lock_fd = fd
        _leader = True
        logger.info("[leader] This process acquired worker leadership (pid=%s)", os.getpid())
        return True
    except BlockingIOError:
        # Another process already holds the lock.
        _leader = False
        logger.info("[worker] This process is not the leader (pid=%s); background workers will not start", os.getpid())
        fd.close()
        return False


def is_leader() -> bool:
    """Return whether this process has previously acquired leadership."""
    return _leader
