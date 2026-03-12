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


def kill_ports(ports: list[int]) -> None:
    """Kill processes using the given ports."""
    port_args = " ".join(f":{p}" for p in ports)
    subprocess.run(f"lsof -ti {port_args} | xargs kill", shell=True)


def check_ports() -> None:
    """Check if required ports are free, offer to kill blockers, and abort if not."""
    busy_ports: list[int] = []
    busy_msgs: list[str] = []
    if check_port(API_PORT):
        busy_ports.append(API_PORT)
        busy_msgs.append(f"  • Port {API_PORT} (API) is already in use")
    if check_port(FRONTEND_PORT):
        busy_ports.append(FRONTEND_PORT)
        busy_msgs.append(f"  • Port {FRONTEND_PORT} (Frontend) is already in use")
    if not busy_ports:
        return

    print("❌ Cannot start — the following ports are occupied:", file=sys.stderr)
    for msg in busy_msgs:
        print(msg, file=sys.stderr)

    port_args = " ".join(f":{p}" for p in busy_ports)
    kill_cmd = f"lsof -ti {port_args} | xargs kill"

    try:
        answer = input("\nKill those processes? [Y/n] ").strip().lower()
    except (EOFError, KeyboardInterrupt):
        answer = "n"
        print()

    if answer in ("", "y", "yes"):
        kill_ports(busy_ports)
        print("Done — processes killed.")
    else:
        print(
            f"\nRun this to kill them manually:\n  {kill_cmd}",
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
