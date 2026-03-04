"""
Manages PTY-based SSH authentication sessions for SLURM providers.

This module handles interactive SSH auth (password / 2FA) by spawning the system SSH
binary with a real PTY, proxying PTY I/O over WebSocket, and leaving a
ControlMaster socket (ControlPersist=86400) so subsequent SSH calls can reuse
the authenticated session without re-prompting.

NOTE: os.openpty() and TIOCSCTTY are POSIX-only (Linux / macOS).
"""

import fcntl
import logging
import os
import re
import subprocess
import termios
import uuid
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Directory where ControlMaster sockets are stored
_SSH_CTL_DIR = os.path.expanduser("~/.transformerlab/ssh_ctl")


def _sanitize(value: str) -> str:
    """Replace characters that are not alphanumeric, dash, or underscore with '_'."""
    return re.sub(r"[^A-Za-z0-9_-]", "_", value)


def _control_socket_path(ssh_user: str, ssh_host: str, ssh_port: int) -> str:
    """Return the canonical ControlMaster socket path for a connection.

    Format matches SLURMProvider._get_control_path() in compute_providers/slurm.py
    so that the fast-path check in _is_control_master_alive() finds the socket
    created here.
    """
    safe = f"{_sanitize(ssh_user)}_{_sanitize(ssh_host)}_{ssh_port}"
    os.makedirs(_SSH_CTL_DIR, mode=0o700, exist_ok=True)
    return os.path.join(_SSH_CTL_DIR, safe)


@dataclass
class SlurmAuthSession:
    session_id: str
    master_fd: int
    process: subprocess.Popen
    control_path: str
    provider_id: str
    # provider_id + user pair for deduplication
    owner_key: str = field(default="")


class SlurmAuthManager:
    """In-process manager for PTY-based SLURM SSH auth sessions."""

    def __init__(self) -> None:
        self._sessions: dict[str, SlurmAuthSession] = {}
        # Maps owner_key → session_id so we can evict stale sessions
        self._by_owner: dict[str, str] = {}

    def create_session(
        self,
        provider_id: str,
        ssh_host: str,
        ssh_user: str,
        ssh_port: int,
        ssh_key_path: Optional[str],
        control_path: Optional[str] = None,
    ) -> str:
        """
        Spawn an SSH process with a PTY for interactive auth.

        Returns the new session_id.
        Cleans up any previous session for the same (provider_id, ssh_user) pair.
        If the ControlMaster socket already exists the owner is considered authenticated;
        we still create a lightweight session record but without spawning a new process.
        """
        owner_key = f"{provider_id}:{ssh_user}@{ssh_host}:{ssh_port}"

        # Evict any previous session for this owner
        if owner_key in self._by_owner:
            self.cleanup_session(self._by_owner[owner_key])

        if control_path is None:
            control_path = _control_socket_path(ssh_user, ssh_host, ssh_port)

        # If already authenticated, return a sentinel session with master_fd = -1
        if os.path.exists(control_path):
            session_id = str(uuid.uuid4())
            session = SlurmAuthSession(
                session_id=session_id,
                master_fd=-1,
                process=None,  # type: ignore[arg-type]
                control_path=control_path,
                provider_id=provider_id,
                owner_key=owner_key,
            )
            self._sessions[session_id] = session
            self._by_owner[owner_key] = session_id
            return session_id

        # Build SSH command: ControlMaster with -N (no remote command) so it stays
        # alive purely to keep the mux socket open.
        cmd = [
            "ssh",
            "-o", "ControlMaster=yes",
            "-o", "ControlPersist=86400",
            "-o", f"ControlPath={control_path}",
            "-o", "StrictHostKeyChecking=accept-new",
            "-p", str(ssh_port),
        ]
        if ssh_key_path and os.path.exists(os.path.expanduser(ssh_key_path)):
            cmd += ["-i", os.path.expanduser(ssh_key_path)]
        cmd += ["-N", f"{ssh_user}@{ssh_host}"]

        # Open PTY: master_fd stays in this process; slave_fd becomes the SSH child's
        # controlling terminal.
        master_fd, slave_fd = os.openpty()

        def _preexec() -> None:
            # Detach from parent's session and make slave PTY the controlling terminal
            os.setsid()
            try:
                fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)
            except Exception:
                pass

        process = subprocess.Popen(
            cmd,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            preexec_fn=_preexec,
            close_fds=True,
        )
        # Close slave_fd in the parent — child has its own copy
        os.close(slave_fd)

        session_id = str(uuid.uuid4())
        session = SlurmAuthSession(
            session_id=session_id,
            master_fd=master_fd,
            process=process,
            control_path=control_path,
            provider_id=provider_id,
            owner_key=owner_key,
        )
        self._sessions[session_id] = session
        self._by_owner[owner_key] = session_id
        return session_id

    def get_session(self, session_id: str) -> Optional[SlurmAuthSession]:
        return self._sessions.get(session_id)

    def cleanup_session(self, session_id: str) -> None:
        """
        Close the PTY master fd and terminate the SSH process for a session.

        The ControlMaster socket is intentionally left on disk because
        ControlPersist keeps the mux daemon running even after we close our end.
        """
        session = self._sessions.pop(session_id, None)
        if session is None:
            return

        self._by_owner.pop(session.owner_key, None)

        if session.master_fd >= 0:
            try:
                os.close(session.master_fd)
            except OSError:
                pass

        if session.process is not None:
            try:
                session.process.terminate()
            except Exception:
                pass

    def is_control_master_alive(self, control_path: str) -> bool:
        """Return True if the ControlMaster socket file exists."""
        return os.path.exists(control_path)


# Module-level singleton
_manager = SlurmAuthManager()


def get_slurm_auth_manager() -> SlurmAuthManager:
    return _manager
