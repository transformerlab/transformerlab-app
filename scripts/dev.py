#!/usr/bin/env python3
"""Run frontend (npm start) and API (api/run.sh) side by side, interleaving output."""

import subprocess
import sys
import threading
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROCS: list[subprocess.Popen] = []


def stream(label: str, proc: subprocess.Popen) -> None:
    assert proc.stdout is not None
    for raw_line in proc.stdout:
        line = raw_line.decode("utf-8", errors="replace").rstrip("\n")
        print(f"[{label}] {line}", flush=True)


def main() -> None:
    api = subprocess.Popen(
        ["bash", "./run.sh"],
        cwd=os.path.join(ROOT, "api"),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    PROCS.append(api)

    frontend = subprocess.Popen(
        ["npm", "run", "start"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
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
        for p in PROCS:
            p.terminate()
        for p in PROCS:
            p.wait()
        sys.exit(0)


if __name__ == "__main__":
    main()
