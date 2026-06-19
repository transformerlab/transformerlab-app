"""JuiceFS helpers for remote pod launch: install, auth, localhost S3 gateway, and backing-storage credentials."""

import asyncio
import os
import secrets
import shlex

from transformerlab.shared.models.models import ProviderType
from transformerlab.services.compute_provider.launch_credentials import (
    RUNPOD_AWS_CREDENTIALS_DIR,
    generate_aws_credentials_setup,
    generate_azure_credentials_setup,
    generate_gcp_credentials_setup,
    get_aws_credentials_from_file,
)

# Each pod runs its own localhost-private JuiceFS gateway, so the port is fixed rather
# than configurable: nothing outside the pod connects to it, and there is no host process
# to conflict with. This is intentionally NOT tied to the API server's
# TFL_JUICEFS_GATEWAY_ENDPOINT override — that override only relocates the API host's own
# gateway (to avoid conflicts on that host) and is meaningless for an isolated pod.
GATEWAY_PORT = 9000
GATEWAY_ENDPOINT = f"http://127.0.0.1:{GATEWAY_PORT}"


def build_juicefs_install_command() -> str:
    """Return a shell snippet that installs the JuiceFS binary if not already present."""
    return (
        "if ! command -v juicefs >/dev/null 2>&1; then "
        "curl -fsSL https://juicefs.com/static/juicefs -o /tmp/juicefs; "
        "chmod +x /tmp/juicefs; "
        "mv /tmp/juicefs /usr/local/bin/juicefs 2>/dev/null || "
        '(mkdir -p "$HOME/.local/bin"; '
        'mv /tmp/juicefs "$HOME/.local/bin/juicefs"; '
        'export PATH="$HOME/.local/bin:$PATH"); '
        "fi"
    )


def build_juicefs_pod_config(team_id: str) -> tuple[dict[str, str], str, str]:
    """Return (env_vars, gateway_setup_command, tfl_storage_uri) for a JuiceFS pod launch.

    The pod runs its own localhost-bound JuiceFS S3 gateway (no FUSE needed);
    the SDK accesses the org workspace as s3://workspace-<team_id> through it.
    The gateway runs with --multi-buckets so the top-level workspace-<team_id>
    directory of the volume appears as that bucket.
    """
    volume_name = os.getenv("TFL_JUICEFS_VOLUME_NAME", "")
    if not volume_name:
        raise ValueError("TFL_JUICEFS_VOLUME_NAME must be set when TFL_STORAGE_PROVIDER=juicefs")
    juicefs_token = os.getenv("TFL_JUICEFS_TOKEN", "")
    if not juicefs_token:
        raise ValueError("TFL_JUICEFS_TOKEN must be set when TFL_STORAGE_PROVIDER=juicefs")

    # Per-pod gateway credentials: the gateway only listens on 127.0.0.1, so these
    # just guard against other processes on the same pod.
    gateway_access_key = secrets.token_urlsafe(12)
    gateway_secret_key = secrets.token_urlsafe(24)

    env_vars: dict[str, str] = {
        "TFL_JUICEFS_METADATA_URL": os.getenv("TFL_JUICEFS_METADATA_URL", ""),
        "TFL_JUICEFS_VOLUME_NAME": volume_name,
        "TFL_JUICEFS_TOKEN": juicefs_token,
        "TFL_JUICEFS_GATEWAY_ENDPOINT": GATEWAY_ENDPOINT,
        "TFL_JUICEFS_GATEWAY_ACCESS_KEY": gateway_access_key,
        "TFL_JUICEFS_GATEWAY_SECRET_KEY": gateway_secret_key,
        "TFL_REMOTE_STORAGE_ENABLED": "true",
    }
    juicefs_console_url = os.getenv("TFL_JUICEFS_CONSOLE_URL", "")
    if juicefs_console_url:
        env_vars["TFL_JUICEFS_CONSOLE_URL"] = juicefs_console_url

    console_flag = ' --console-url "$TFL_JUICEFS_CONSOLE_URL"' if juicefs_console_url else ""
    auth_cmd = (
        'if [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ]; then '
        f'juicefs auth {shlex.quote(volume_name)} --token "$TFL_JUICEFS_TOKEN"{console_flag} '
        '--access-key "$ACCESS_KEY" --secret-key "$SECRET_KEY"; '
        "else "
        f'juicefs auth {shlex.quote(volume_name)} --token "$TFL_JUICEFS_TOKEN"{console_flag}; '
        "fi"
    )
    gateway_cmd = (
        "(nohup env "
        'MINIO_ROOT_USER="$TFL_JUICEFS_GATEWAY_ACCESS_KEY" '
        'MINIO_ROOT_PASSWORD="$TFL_JUICEFS_GATEWAY_SECRET_KEY" '
        f"juicefs gateway {shlex.quote(volume_name)} 127.0.0.1:{GATEWAY_PORT} "
        # umask 000: gateways run under different uids on different nodes (API server
        # vs pods); JuiceFS enforces POSIX perms volume-wide, so files must be
        # world-writable for another node's gateway uid to update them.
        "--multi-buckets --keep-etag --umask 000 "
        "> /tmp/juicefs-gateway.log 2>&1 &)"
    )
    readiness_cmd = (
        "jfs_gw_ready=0; "
        "for i in $(seq 1 30); do "
        f"if curl -sf {GATEWAY_ENDPOINT}/minio/health/ready >/dev/null 2>&1; then jfs_gw_ready=1; break; fi; "
        "sleep 1; "
        "done; "
        '[ "$jfs_gw_ready" = "1" ] || '
        '{ echo "JuiceFS gateway failed to start" >&2; cat /tmp/juicefs-gateway.log >&2; exit 1; }'
    )
    setup_cmd = f"{auth_cmd} && {gateway_cmd} && {readiness_cmd}"
    tfl_storage_uri = f"s3://workspace-{team_id}"
    return env_vars, setup_cmd, tfl_storage_uri


async def build_juicefs_backend_credentials_setup(
    provider_type: str,
) -> tuple[list[str], dict[str, str]]:
    """Return (setup_commands, env_vars) for the JuiceFS backing object-storage credentials.

    Called unconditionally when STORAGE_PROVIDER=juicefs, regardless of
    TFL_REMOTE_STORAGE_ENABLED, because JuiceFS needs its own backend credentials
    even when the cloud-bucket provider path is not active.
    """
    setup_commands: list[str] = []
    env_vars: dict[str, str] = {}

    backend = os.getenv("TFL_JUICEFS_STORAGE_BACKEND", "")
    if backend == "aws":
        from transformerlab.shared.remote_workspace import get_default_aws_profile

        aws_profile = get_default_aws_profile()
        aws_access_key_id, aws_secret_access_key = await asyncio.to_thread(get_aws_credentials_from_file, aws_profile)
        if aws_access_key_id and aws_secret_access_key:
            aws_credentials_dir = RUNPOD_AWS_CREDENTIALS_DIR if provider_type == ProviderType.RUNPOD.value else None
            setup_commands.append(
                generate_aws_credentials_setup(
                    aws_access_key_id,
                    aws_secret_access_key,
                    aws_profile,
                    aws_credentials_dir=aws_credentials_dir,
                )
            )
            if aws_credentials_dir:
                env_vars["AWS_SHARED_CREDENTIALS_FILE"] = f"{aws_credentials_dir}/credentials"
            env_vars["AWS_PROFILE"] = aws_profile
            env_vars["ACCESS_KEY"] = aws_access_key_id
            env_vars["SECRET_KEY"] = aws_secret_access_key
    elif backend == "gcp":
        gcp_sa_json_path = os.getenv("TFL_GCP_SERVICE_ACCOUNT_JSON_PATH")
        if gcp_sa_json_path:
            setup_commands.append(generate_gcp_credentials_setup(gcp_sa_json_path))
    elif backend == "azure":
        azure_connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        azure_account = os.getenv("AZURE_STORAGE_ACCOUNT")
        azure_key = os.getenv("AZURE_STORAGE_KEY")
        azure_sas = os.getenv("AZURE_STORAGE_SAS_TOKEN")
        if azure_connection_string or azure_account:
            setup_commands.append(
                generate_azure_credentials_setup(azure_connection_string, azure_account, azure_key, azure_sas)
            )
            if azure_connection_string:
                env_vars["AZURE_STORAGE_CONNECTION_STRING"] = azure_connection_string
            if azure_account:
                env_vars["AZURE_STORAGE_ACCOUNT"] = azure_account
            if azure_key:
                env_vars["AZURE_STORAGE_KEY"] = azure_key
            if azure_sas:
                env_vars["AZURE_STORAGE_SAS_TOKEN"] = azure_sas

    return setup_commands, env_vars
