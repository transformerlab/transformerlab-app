"""Launch openvscode-server and stream logs."""

from __future__ import annotations

import pathlib
import subprocess
import sys
import time

LOG_FILE = pathlib.Path("/tmp/openvscode.log")
CHECK_INTERVAL = 5


def _tail_and_monitor(proc: subprocess.Popen) -> None:
    offset = 0
    last_check = time.monotonic()

    while True:
        saw_data = False
        try:
            with LOG_FILE.open("r", encoding="utf-8", errors="replace") as handle:
                handle.seek(offset)
                chunk = handle.read()
                offset = handle.tell()
        except FileNotFoundError:
            chunk = ""

        if chunk:
            saw_data = True
            for line in chunk.splitlines():
                print(f"[openvscode] {line}", flush=True)

        now = time.monotonic()
        if now - last_check >= CHECK_INTERVAL:
            last_check = now
            rc = proc.poll()
            if rc is not None:
                print(f"ERROR: openvscode-server exited with code {rc}", file=sys.stderr, flush=True)
                try:
                    text = LOG_FILE.read_text(encoding="utf-8", errors="replace").strip()
                    if text:
                        print("=== START openvscode.log ===", file=sys.stderr, flush=True)
                        print(text, file=sys.stderr, flush=True)
                        print("=== END openvscode.log ===", file=sys.stderr, flush=True)
                except Exception:
                    pass
                sys.exit(1)

        if not saw_data:
            time.sleep(0.25)


def main() -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    LOG_FILE.touch(exist_ok=True)

    log_handle = open(LOG_FILE, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [
            "openvscode-server",
            "--host",
            "0.0.0.0",
            "--port",
            "3000",
            "--without-connection-token",
        ],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
    )
    time.sleep(3)
    rc = proc.poll()
    if rc is not None:
        print(f"ERROR: openvscode-server failed to start (exit code {rc})", file=sys.stderr, flush=True)
        sys.exit(1)

    _tail_and_monitor(proc)


if __name__ == "__main__":
    main()
