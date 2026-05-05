"""JuiceFS helpers for remote pod launch: install, auth/mount, and backing-storage credentials."""

import asyncio
import os
import shlex

from transformerlab.shared.models.models import ProviderType
from transformerlab.services.compute_provider.launch_credentials import (
    RUNPOD_AWS_CREDENTIALS_DIR,
    generate_aws_credentials_setup,
    generate_azure_credentials_setup,
    generate_gcp_credentials_setup,
    get_aws_credentials_from_file,
)


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


def build_juicefs_pod_config(
    team_id: str,
    mount_point: str,
) -> tuple[dict[str, str], str, str]:
    """Return (env_vars, mount_command, tfl_storage_uri) for a JuiceFS pod launch.

    Mounts only this org's subdir so the pod cannot access other orgs' data.
    tfl_storage_uri equals mount_point (already org-scoped).
    """
    volume_name = os.getenv("TFL_JUICEFS_VOLUME_NAME", "")
    if not volume_name:
        raise ValueError("TFL_JUICEFS_VOLUME_NAME must be set when TFL_STORAGE_PROVIDER=juicefs")

    env_vars: dict[str, str] = {
        "TFL_JUICEFS_METADATA_URL": os.getenv("TFL_JUICEFS_METADATA_URL", ""),
        "TFL_JUICEFS_VOLUME_NAME": volume_name,
        "TFL_JUICEFS_MOUNT_POINT": mount_point,
        "TFL_REMOTE_STORAGE_ENABLED": "true",
    }

    juicefs_token = os.getenv("TFL_JUICEFS_TOKEN", "")
    if juicefs_token:
        env_vars["TFL_JUICEFS_TOKEN"] = juicefs_token
    juicefs_console_url = os.getenv("TFL_JUICEFS_CONSOLE_URL", "")
    if juicefs_console_url:
        env_vars["TFL_JUICEFS_CONSOLE_URL"] = juicefs_console_url

    mount_cmd = (
        f"mkdir -p {shlex.quote(mount_point)} && "
        f"juicefs mount {shlex.quote(volume_name)} {shlex.quote(mount_point)}"
        f" --subdir {shlex.quote(f'orgs/{team_id}')} --background"
    )
    if juicefs_token:
        auth_cmd = (
            'if [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ]; then '
            f'juicefs auth {shlex.quote(volume_name)} --token "$TFL_JUICEFS_TOKEN" '
            '--access-key "$ACCESS_KEY" --secret-key "$SECRET_KEY"; '
            "else "
            f'juicefs auth {shlex.quote(volume_name)} --token "$TFL_JUICEFS_TOKEN"; '
            "fi"
        )
        if juicefs_console_url:
            auth_cmd = auth_cmd.replace(
                '--token "$TFL_JUICEFS_TOKEN"',
                '--token "$TFL_JUICEFS_TOKEN" --console-url "$TFL_JUICEFS_CONSOLE_URL"',
            )
        mount_cmd = f"{auth_cmd} && {mount_cmd}"

    return env_vars, mount_cmd, mount_point


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
