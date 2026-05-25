"""Helpers for team/provider-scoped Nebius CLI credentials."""

from __future__ import annotations

import os
import re
import stat
import subprocess
from typing import Optional

from lab.dirs import HOME_DIR

from transformerlab.services.nebius_cli_resolve import nebius_cli_argv_prefix, nebius_cli_available

NEBIUS_CREDENTIALS_ROOT = os.path.normpath(os.path.join(HOME_DIR, "nebius_credentials"))
DEFAULT_NEBIUS_ENDPOINT = "api.nebius.cloud"


def _sanitize_path_component(name: str, value: str) -> str:
    if not value or not isinstance(value, str):
        raise ValueError(f"Invalid {name} for Nebius credentials path")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError(f"Invalid {name} for Nebius credentials path")
    return value


def _ensure_under_nebius_root(path: str) -> str:
    normalized = os.path.normpath(path)
    common = os.path.commonpath([NEBIUS_CREDENTIALS_ROOT, normalized])
    if common != NEBIUS_CREDENTIALS_ROOT:
        raise ValueError("Invalid path for Nebius credentials")
    return normalized


def get_nebius_credentials_dir(team_id: str, provider_id: str) -> str:
    safe_team_id = _sanitize_path_component("team_id", team_id)
    safe_provider_id = _sanitize_path_component("provider_id", provider_id)
    return _ensure_under_nebius_root(os.path.join(NEBIUS_CREDENTIALS_ROOT, safe_team_id, safe_provider_id))


def get_nebius_cli_config_path(team_id: str, provider_id: str) -> str:
    return _ensure_under_nebius_root(os.path.join(get_nebius_credentials_dir(team_id, provider_id), "config.yaml"))


def get_nebius_private_key_path(team_id: str, provider_id: str) -> str:
    return _ensure_under_nebius_root(os.path.join(get_nebius_credentials_dir(team_id, provider_id), "private_key.pem"))


def build_nebius_profile_name(team_id: str, provider_id: str) -> str:
    def compact(value: str) -> str:
        normalized = re.sub(r"[^A-Za-z0-9_-]", "-", str(value).lower())
        normalized = re.sub(r"-+", "-", normalized).strip("-")
        return (normalized[:8].rstrip("-") or "id") if len(normalized) > 8 else (normalized or "id")

    return f"tlab-nebius-{compact(team_id)}-{compact(provider_id)}"


def write_nebius_service_account_credentials(
    *,
    team_id: str,
    provider_id: str,
    profile_name: str,
    parent_id: Optional[str],
    service_account_id: str,
    public_key_id: str,
    private_key: str,
    endpoint: str = DEFAULT_NEBIUS_ENDPOINT,
) -> str:
    """Persist credentials and create/update a provider-scoped Nebius CLI profile.

    Returns the Nebius CLI config path. The resulting config and private key are
    stored under HOME_DIR/nebius_credentials/<team_id>/<provider_id>/ so multiple
    providers in the same org never share a profile namespace or key file.
    """

    if not service_account_id.strip():
        raise ValueError("Nebius service_account_id is required")
    if not public_key_id.strip():
        raise ValueError("Nebius public_key_id is required")
    if not private_key.strip():
        raise ValueError("Nebius private_key is required")
    if not nebius_cli_available():
        raise RuntimeError(
            "Nebius CLI is not available in this Python environment. "
            "Install the API dependencies (e.g. `nebius` is listed in api/pyproject.toml) "
            "and run the API with that same interpreter/venv."
        )

    credentials_dir = get_nebius_credentials_dir(team_id, provider_id)
    os.makedirs(credentials_dir, exist_ok=True)
    os.chmod(credentials_dir, stat.S_IRWXU)

    private_key_path = get_nebius_private_key_path(team_id, provider_id)
    key_content = private_key.strip() + "\n"
    with open(private_key_path, "w", encoding="utf-8") as f:
        f.write(key_content)
    os.chmod(private_key_path, stat.S_IRUSR | stat.S_IWUSR)

    config_path = get_nebius_cli_config_path(team_id, provider_id)
    temp_config_path = _ensure_under_nebius_root(f"{config_path}.tmp")
    if os.path.exists(temp_config_path):
        os.remove(temp_config_path)
    cmd = nebius_cli_argv_prefix() + [
        "--config",
        temp_config_path,
        "profile",
        "create",
        profile_name,
        "--endpoint",
        endpoint,
        "--service-account-id",
        service_account_id.strip(),
        "--public-key-id",
        public_key_id.strip(),
        "--private-key-file-path",
        private_key_path,
    ]
    if parent_id:
        cmd.extend(["--parent-id", parent_id.strip()])

    proc = subprocess.run(cmd, text=True, capture_output=True, timeout=60, check=False)
    if proc.returncode != 0:
        stderr = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Failed to configure Nebius CLI profile: {stderr}")

    if os.path.exists(temp_config_path):
        os.replace(temp_config_path, config_path)
    if os.path.exists(config_path):
        os.chmod(config_path, stat.S_IRUSR | stat.S_IWUSR)

    return config_path
