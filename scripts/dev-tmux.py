#!/usr/bin/env python3
"""Run frontend and API side by side in a tmux session with two panes."""

import os
import socket
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

API_PORT = 8338
FRONTEND_PORT = 1212
SESSION_NAME = "tlab-dev"


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


def has_tmux() -> bool:
    """Check if tmux is installed."""
    return subprocess.call(["which", "tmux"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0


def main() -> None:
    if not has_tmux():
        print("❌ tmux is not installed. Install it with: brew install tmux", file=sys.stderr)
        sys.exit(1)

    check_ports()

    # Kill existing session if it exists
    subprocess.run(["tmux", "kill-session", "-t", SESSION_NAME], capture_output=True)

    api_dir = os.path.join(ROOT, "api")

    # Create a new tmux session with the API pane
    subprocess.run(
        ["tmux", "new-session", "-d", "-s", SESSION_NAME, "-n", "dev", "-c", api_dir, "bash ./run.sh"],
        check=True,
    )

    # Split horizontally and run the frontend in the right pane
    subprocess.run(
        ["tmux", "split-window", "-h", "-t", SESSION_NAME, "-c", ROOT, "npm run start"],
        check=True,
    )

    # Label the panes
    subprocess.run(["tmux", "select-pane", "-t", f"{SESSION_NAME}:0.0", "-T", "API"])
    subprocess.run(["tmux", "select-pane", "-t", f"{SESSION_NAME}:0.1", "-T", "Frontend"])

    # Enable pane titles
    subprocess.run(["tmux", "set-option", "-t", SESSION_NAME, "pane-border-status", "top"])
    subprocess.run(["tmux", "set-option", "-t", SESSION_NAME, "pane-border-format", " #{pane_title} "])

    # Focus on the API pane
    subprocess.run(["tmux", "select-pane", "-t", f"{SESSION_NAME}:0.0"])

    # Attach to the session
    os.execvp("tmux", ["tmux", "attach-session", "-t", SESSION_NAME])


if __name__ == "__main__":
    main()
