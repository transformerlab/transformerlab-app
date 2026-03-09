#!/usr/bin/env python3
"""Run frontend (npm start) and API (api/run.sh) side by side, interleaving output."""

import os
import signal
import socket
import subprocess
import sys
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

API_PORT = 8338
FRONTEND_PORT = 1212

PROCS: list[subprocess.Popen] = []


def check_port(port: int) -> bool:
    """Return True if the port is already in use."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(1)
        return s.connect_ex(("127.0.0.1", port)) == 0


def check_ports() -> None:
    """Check if required ports are free and abort if not."""
    busy: list[str] = []
    if check_port(API_PORT):
        busy.append(f"  • Port {API_PORT} (API) is already in use")
    if check_port(FRONTEND_PORT):
        busy.append(f"  • Port {FRONTEND_PORT} (Frontend) is already in use")
    if busy:
        print("❌ Cannot start — the following ports are occupied:", file=sys.stderr)
        for msg in busy:
            print(msg, file=sys.stderr)
        print(
            "\nKill the processes using those ports and try again.\n"
            f"  lsof -ti :{API_PORT} | xargs kill\n"
            f"  lsof -ti :{FRONTEND_PORT} | xargs kill",
            file=sys.stderr,
        )
        sys.exit(1)


def stream(label: str, proc: subprocess.Popen) -> None:
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
        print(f"[{label}] {line}", flush=True)


def kill_proc_tree(proc: subprocess.Popen) -> None:
    """Send SIGTERM to the entire process group, then wait."""
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        try:
            pgid = os.getpgid(proc.pid)
            os.killpg(pgid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
        proc.wait(timeout=3)


def main() -> None:
    check_ports()

    api = subprocess.Popen(
        ["bash", "./run.sh"],
        cwd=os.path.join(ROOT, "api"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    PROCS.append(api)

    frontend = subprocess.Popen(
        ["npm", "run", "start"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    PROCS.append(frontend)

    t_api = threading.Thread(target=stream, args=("api", api), daemon=True)
    t_fe = threading.Thread(target=stream, args=("web", frontend), daemon=True)
    t_api.start()
    t_fe.start()

    try:
        api.wait()
        frontend.wait()
    except KeyboardInterrupt:
        print("\nShutting down…")
    finally:
        for p in PROCS:
            kill_proc_tree(p)


if __name__ == "__main__":
    main()
