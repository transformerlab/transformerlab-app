"""Start and supervise a localhost-bound JuiceFS S3 gateway for the API server.

The gateway exposes the JuiceFS volume over the S3 protocol in multi-bucket mode:
each top-level directory `workspace-<team_id>` of the volume appears as a bucket.
The SDK talks to it via fsspec/s3fs with endpoint_url=TFL_JUICEFS_GATEWAY_ENDPOINT.

No FUSE is involved: the gateway is a user-space process that talks directly to
the JuiceFS metadata service and the backing object store.
"""

import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from typing import Optional
from urllib.parse import urlparse

READINESS_TIMEOUT_SECONDS = 30
RESTART_DELAY_SECONDS = 2.0

_gateway_process: Optional[subprocess.Popen] = None
_supervisor_thread: Optional[threading.Thread] = None
_shutdown_event = threading.Event()


def gateway_endpoint() -> str:
    return os.getenv("TFL_JUICEFS_GATEWAY_ENDPOINT", "http://127.0.0.1:9000")


def _gateway_listen_address() -> str:
    parsed = urlparse(gateway_endpoint())
    return f"{parsed.hostname or '127.0.0.1'}:{parsed.port or 9000}"


def _gateway_log_path() -> str:
    home = os.getenv("TFL_HOME_DIR", os.path.join(os.path.expanduser("~"), ".transformerlab"))
    os.makedirs(home, exist_ok=True)
    return os.path.join(home, "juicefs-gateway.log")


def is_gateway_ready(timeout_seconds: float = 1.0) -> bool:
    """Return True when the gateway health endpoint answers successfully."""
    url = f"{gateway_endpoint()}/minio/health/ready"
    try:
        with urllib.request.urlopen(url, timeout=timeout_seconds) as resp:
            return 200 <= resp.status < 300
    except (urllib.error.URLError, OSError):
        return False


def _run_juicefs_auth() -> None:
    """Authenticate the juicefs client against the volume (writes the client config file)."""
    volume_name = os.environ["TFL_JUICEFS_VOLUME_NAME"]
    cmd = ["juicefs", "auth", volume_name, "--token", os.environ["TFL_JUICEFS_TOKEN"]]
    console_url = os.getenv("TFL_JUICEFS_CONSOLE_URL")
    if console_url:
        cmd += ["--console-url", console_url]
    if os.getenv("TFL_JUICEFS_STORAGE_BACKEND") == "aws":
        # Lazy imports to avoid circular imports at module load time.
        from transformerlab.shared.remote_workspace import get_default_aws_profile
        from transformerlab.services.compute_provider.launch_credentials import get_aws_credentials_from_file

        access_key, secret_key = get_aws_credentials_from_file(get_default_aws_profile())
        if access_key and secret_key:
            cmd += ["--access-key", access_key, "--secret-key", secret_key]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def _spawn_gateway() -> subprocess.Popen:
    env = os.environ.copy()
    env["MINIO_ROOT_USER"] = os.environ["TFL_JUICEFS_GATEWAY_ACCESS_KEY"]
    env["MINIO_ROOT_PASSWORD"] = os.environ["TFL_JUICEFS_GATEWAY_SECRET_KEY"]
    # Popen duplicates the fd into the child; close the parent's handle right away
    # so supervisor respawns don't accumulate open files.
    with open(_gateway_log_path(), "ab") as log_file:
        return subprocess.Popen(
            [
                "juicefs",
                "gateway",
                os.environ["TFL_JUICEFS_VOLUME_NAME"],
                _gateway_listen_address(),
                "--multi-buckets",
                "--keep-etag",
            ],
            env=env,
            stdout=log_file,
            stderr=log_file,
        )


def _wait_until_ready() -> bool:
    deadline = time.monotonic() + READINESS_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if is_gateway_ready():
            return True
        time.sleep(0.5)
    return is_gateway_ready()


def _supervise() -> None:
    """Restart the gateway if it crashes (runs in a daemon thread)."""
    global _gateway_process
    while not _shutdown_event.is_set():
        proc = _gateway_process
        if proc is None:
            return
        proc.wait()
        if _shutdown_event.is_set():
            return
        print(
            f"⚠️ JuiceFS gateway exited with code {proc.returncode}; restarting in {RESTART_DELAY_SECONDS}s",
            file=sys.stderr,
        )
        time.sleep(RESTART_DELAY_SECONDS)
        _gateway_process = _spawn_gateway()


def _start_supervisor() -> None:
    global _supervisor_thread
    _supervisor_thread = threading.Thread(target=_supervise, name="juicefs-gateway-supervisor", daemon=True)
    _supervisor_thread.start()


def ensure_juicefs_gateway() -> None:
    """Start the local JuiceFS S3 gateway if needed. No-op unless TFL_STORAGE_PROVIDER=juicefs.

    Idempotent: when another process already serves the endpoint (e.g. a second
    API worker on the same host), it is reused instead of spawning a conflicting
    gateway on the same port.

    Raises:
        SystemExit: when configuration is invalid or the gateway cannot start.
    """
    global _gateway_process
    if (os.getenv("TFL_STORAGE_PROVIDER") or "").strip().lower() != "juicefs":
        return

    # Validate configuration first so missing env vars produce a clear error.
    from transformerlab.shared.remote_workspace import _validate_juicefs_config

    _validate_juicefs_config()

    if is_gateway_ready():
        print(f"✅ JuiceFS gateway already running at {gateway_endpoint()}")
        return

    try:
        _run_juicefs_auth()
    except subprocess.CalledProcessError as e:
        print(f"❌ ERROR: juicefs auth failed: {e.stderr}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(
            "❌ ERROR: juicefs binary not found on PATH; install it to use TFL_STORAGE_PROVIDER=juicefs",
            file=sys.stderr,
        )
        sys.exit(1)

    _gateway_process = _spawn_gateway()
    if not _wait_until_ready():
        print(
            f"❌ ERROR: JuiceFS gateway did not become ready within {READINESS_TIMEOUT_SECONDS}s; "
            f"see {_gateway_log_path()}",
            file=sys.stderr,
        )
        sys.exit(1)
    _start_supervisor()
    print(f"✅ JuiceFS gateway running at {gateway_endpoint()} (multi-bucket mode)")


def stop_juicefs_gateway() -> None:
    """Terminate the supervised gateway (called on app shutdown)."""
    global _gateway_process
    _shutdown_event.set()
    proc = _gateway_process
    if proc is not None and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
    _gateway_process = None
