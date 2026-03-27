"""
Process sandboxing helpers for the local compute provider.

Two backends are supported:
  - macOS: Apple Seatbelt (sandbox_init_with_parameters from libSystem.dylib).
    The policy restricts the child process to read/write only within the job's
    workspace directory, read-only access to shared caches (HF, pip), and
    read-only access to GPU/system devices. Applied via subprocess preexec_fn.
  - Linux: bubblewrap (bwrap). Constructs a bwrap invocation that wraps the
    original command with filesystem namespace isolation.

If neither backend is available the helpers return a no-op so existing
behaviour is preserved.

Linux bwrap flags used below are standard bubblewrap options; see bwrap(1)
(e.g. https://man.archlinux.org/man/bwrap.1). Notably there is no --share-pid;
the host PID namespace is retained unless --unshare-pid is used.
"""

from __future__ import annotations

import ctypes
import os
import shutil
import sys
from typing import Callable, Optional

# ---------------------------------------------------------------------------
# macOS Seatbelt backend
# ---------------------------------------------------------------------------

_SEATBELT_AVAILABLE: Optional[bool] = None
_libc: Optional[ctypes.CDLL] = None


def _load_seatbelt() -> bool:
    global _SEATBELT_AVAILABLE, _libc
    if _SEATBELT_AVAILABLE is not None:
        return _SEATBELT_AVAILABLE
    if sys.platform != "darwin":
        _SEATBELT_AVAILABLE = False
        return False
    try:
        lib = ctypes.CDLL("libSystem.dylib", use_errno=True)
        # Verify the symbol exists
        _ = lib.sandbox_init_with_parameters
        _libc = lib
        _SEATBELT_AVAILABLE = True
    except (OSError, AttributeError):
        _SEATBELT_AVAILABLE = False
    return _SEATBELT_AVAILABLE


def _build_seatbelt_profile(
    workspace_dir: str, extra_read_paths: list[str], extra_rw_paths: list[str] | None = None
) -> bytes:
    """
    Build a Seatbelt (SBPL) profile that:
      - Denies everything by default
      - Imports bsd.sb for essential OS services
      - Allows read+write under workspace_dir
      - Allows read-only under each path in extra_read_paths (shared caches)
      - Allows read+write under extra_rw_paths (e.g. job directory as CWD)
      - Allows GPU / DRI device access
      - Allows process operations (fork, exec, signal) for subprocesses
      - Allows outbound network (models download from HuggingFace etc.)
    """
    rules = [
        "(version 1)",
        "(deny default)",
        # Essential POSIX / BSD services (clock, mach, sysctl, etc.)
        '(import "bsd.sb")',
        # Full access to the per-job workspace
        f'(allow file* (subpath "{workspace_dir}"))',
    ]
    # Read-write access to extra paths (e.g. job_dir used as CWD)
    for p in extra_rw_paths or []:
        if p:
            rules.append(f'(allow file* (subpath "{p}"))')
    # Read-only access to shared cache paths (HF models, uv/pip cache, conda)
    for p in extra_read_paths:
        if p:
            rules.append(f'(allow file-read* (subpath "{p}"))')
    # macOS system libraries and developer tools (needed by git, xcrun, etc.)
    rules += [
        '(allow file-read* (subpath "/Library"))',
        '(allow file-read* (subpath "/usr"))',
        '(allow file-read* (subpath "/bin"))',
        '(allow file-read* (subpath "/sbin"))',
        # SSL config needed for HTTPS git clone
        '(allow file-read* (subpath "/private/etc"))',
        # xcrun writes temp cache files under /private/var/folders
        '(allow file* (subpath "/private/var/folders"))',
    ]
    # GPU device files (CUDA / Metal)
    rules += [
        '(allow file-read* file-write* (subpath "/dev"))',
        # IOKit for GPU
        "(allow iokit*)",
        # Network – needed for HuggingFace downloads, etc.
        "(allow network*)",
        # Process operations
        "(allow process*)",
        "(allow signal)",
        # Mach IPC (needed by many macOS system libraries)
        "(allow mach*)",
        # sysctl reads (needed by Python, PyTorch)
        "(allow sysctl*)",
        # Metal / Apple Silicon GPU: framework dylibs and private frameworks
        '(allow file-read* (subpath "/System"))',
        # Unified memory mapping (Metal + PyTorch mmap model loading)
        "(allow vm-map)",
        # POSIX shared memory (PyTorch DataLoader workers, multiprocessing, Metal IPC)
        "(allow ipc-posix-shm)",
        # Timezone data (Python datetime / zoneinfo)
        '(allow file-read* (subpath "/private/var/db/timezone"))',
    ]
    return "\n".join(rules).encode()


def make_seatbelt_preexec(
    workspace_dir: str,
    extra_read_paths: list[str],
    extra_rw_paths: list[str] | None = None,
) -> Optional[Callable[[], None]]:
    """
    Return a preexec_fn callable that applies a Seatbelt policy to the child
    process before exec. Returns None if Seatbelt is unavailable.
    """
    if not _load_seatbelt():
        return None

    profile = _build_seatbelt_profile(workspace_dir, extra_read_paths, extra_rw_paths)
    lib = _libc

    def _apply() -> None:
        errp = ctypes.c_char_p()
        # sandbox_init_with_parameters(profile, flags, params, errp)
        # flags=0, params=NULL (no parameter substitution used here)
        ret = lib.sandbox_init_with_parameters(  # type: ignore[union-attr]
            profile,
            ctypes.c_uint64(0),
            None,
            ctypes.byref(errp),
        )
        if ret != 0:
            err = errp.value.decode() if errp.value else "unknown"
            # Don't abort the child – just log. The job will still run,
            # just without the extra sandbox layer.
            import sys as _sys

            print(f"[sandbox] seatbelt apply failed: {err}", file=_sys.stderr)

    return _apply


# ---------------------------------------------------------------------------
# Linux bubblewrap backend
# ---------------------------------------------------------------------------

_BWRAP_BIN: Optional[str] = None
_BWRAP_AVAILABLE: Optional[bool] = None
_LINUX_BASE_RO_PATHS: tuple[str, ...] = (
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/etc",
    "/var",
    "/opt",
)


def _find_bwrap() -> bool:
    global _BWRAP_BIN, _BWRAP_AVAILABLE
    if _BWRAP_AVAILABLE is not None:
        return _BWRAP_AVAILABLE
    if sys.platform == "darwin":
        _BWRAP_AVAILABLE = False
        return False
    path = shutil.which("bwrap")
    if path:
        _BWRAP_BIN = path
        _BWRAP_AVAILABLE = True
    else:
        _BWRAP_AVAILABLE = False
    return _BWRAP_AVAILABLE


def wrap_command_with_bwrap(
    cmd: list[str],
    workspace_dir: str,
    extra_read_paths: list[str],
    extra_rw_paths: list[str] | None = None,
) -> list[str]:
    """
    Wrap *cmd* in a bwrap invocation that:
      - Creates a new filesystem namespace
      - Bind-mounts common Linux system paths read-only
      - Bind-mounts workspace_dir read-write
      - Bind-mounts extra_read_paths read-only (shared caches)
      - Bind-mounts /dev (needed for GPU device files)
      - Bind-mounts /proc and /sys
      - Shares the host network namespace (models still download); see --share-net
      - Uses a new IPC namespace (--unshare-ipc); host PID namespace unchanged

    Returns the original *cmd* unchanged if bwrap is not available.
    """
    if not _find_bwrap():
        return cmd

    bwrap = _BWRAP_BIN
    if not bwrap:
        return cmd

    # Order matches bwrap(1): filesystem operations apply in argument order.
    args: list[str] = [
        bwrap,
        "--share-net",
        "--unshare-ipc",
        "--dev-bind",
        "/dev",
        "/dev",
        "--proc",
        "/proc",
        "--bind",
        "/sys",
        "/sys",
        "--tmpfs",
        "/tmp",
        "--bind",
        workspace_dir,
        workspace_dir,
    ]

    # Keep core system binaries/libs/config readable without exposing the entire
    # host filesystem like "--ro-bind / /".
    for p in _LINUX_BASE_RO_PATHS:
        if os.path.exists(p):
            args += ["--ro-bind", p, p]

    for p in extra_read_paths:
        if p and os.path.exists(p):
            args += ["--ro-bind", p, p]

    for p in extra_rw_paths or []:
        if p and os.path.exists(p):
            args += ["--bind", p, p]

    args += cmd
    return args


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------


def sandbox_available() -> bool:
    """Return True if any sandboxing backend is usable on this platform."""
    if sys.platform == "darwin":
        return _load_seatbelt()
    return _find_bwrap()


def get_backend_name() -> str:
    if sys.platform == "darwin":
        return "seatbelt" if _load_seatbelt() else "none"
    return "bwrap" if _find_bwrap() else "none"
