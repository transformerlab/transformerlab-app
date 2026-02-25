"""
Service for managing user-specific SLURM SSH keys.

Each user can upload their own private SSH key for each SLURM provider.
The key is stored at: <workspace_dir>/slurm_keys/<team_id>/<provider_id>/<user_id>/id_rsa
"""

import os
import re
import stat
from lab.dirs import HOME_DIR

# Root directory under which all SLURM SSH keys are stored.
SLURM_KEYS_ROOT = os.path.normpath(os.path.join(HOME_DIR, "slurm_keys"))


def _sanitize_path_component(name: str, value: str) -> str:
    """
    Validate a single path component used for storing SLURM SSH keys.

    Only allow simple directory names consisting of letters, digits, dashes and underscores.

    Raises:
        ValueError: If the component is empty or contains invalid characters.
    """
    if not value or not isinstance(value, str):
        raise ValueError(f"Invalid {name} for SLURM SSH key path")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError(f"Invalid {name} for SLURM SSH key path")
    return value


def _ensure_under_slurm_root(path: str) -> str:
    """
    Normalize a path and ensure it is located under SLURM_KEYS_ROOT.

    Raises:
        ValueError: If the normalized path is not within SLURM_KEYS_ROOT.
    """
    normalized = os.path.normpath(path)
    # os.path.commonpath will raise ValueError if paths are on different drives
    common = os.path.commonpath([SLURM_KEYS_ROOT, normalized])
    if common != SLURM_KEYS_ROOT:
        raise ValueError("Invalid path for SLURM SSH key")
    return normalized


async def get_user_slurm_key_path(team_id: str, provider_id: str, user_id: str) -> str:
    """
    Get the path where a user's SLURM SSH private key is stored.

    Args:
        team_id: Team ID
        provider_id: Provider ID
        user_id: User ID

    Returns:
        Path to the private key file
    """
    # Sanitize individual path components to prevent traversal or invalid names.
    safe_team_id = _sanitize_path_component("team_id", team_id)
    safe_provider_id = _sanitize_path_component("provider_id", provider_id)
    safe_user_id = _sanitize_path_component("user_id", user_id)
    # Build the key directory path and ensure it stays within SLURM_KEYS_ROOT.
    raw_key_dir = os.path.join(SLURM_KEYS_ROOT, safe_team_id, safe_provider_id, safe_user_id)
    key_dir = _ensure_under_slurm_root(raw_key_dir)
    # Build the full key file path and validate it as well.
    raw_key_path = os.path.join(key_dir, "id_rsa")
    key_path = _ensure_under_slurm_root(raw_key_path)
    return key_path


async def save_user_slurm_key(team_id: str, provider_id: str, user_id: str, private_key_content: str) -> str:
    """
    Save a user's SLURM SSH private key.

    Args:
        team_id: Team ID
        provider_id: Provider ID
        user_id: User ID
        private_key_content: Private key content (PEM or OpenSSH format)

    Returns:
        Path to the saved key file
    """
    key_path = await get_user_slurm_key_path(team_id, provider_id, user_id)
    # Derive and validate the directory to ensure it is still under SLURM_KEYS_ROOT.
    key_dir = _ensure_under_slurm_root(os.path.dirname(key_path))

    os.makedirs(key_dir, exist_ok=True)

    with open(key_path, "w") as f:
        f.write(private_key_content.strip())

    os.chmod(key_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

    return key_path


async def get_user_slurm_key(team_id: str, provider_id: str, user_id: str) -> str | None:
    """
    Get a user's SLURM SSH private key content.

    Args:
        team_id: Team ID
        provider_id: Provider ID
        user_id: User ID

    Returns:
        Private key content as string, or None if not found
    """
    # Sanitize individual path components to prevent traversal or invalid names.
    safe_team_id = _sanitize_path_component("team_id", team_id)
    safe_provider_id = _sanitize_path_component("provider_id", provider_id)
    safe_user_id = _sanitize_path_component("user_id", user_id)
    key_path = await get_user_slurm_key_path(safe_team_id, safe_provider_id, safe_user_id)
    if os.path.exists(key_path):
        with open(key_path, "r") as f:
            return f.read()
    return None


async def delete_user_slurm_key(team_id: str, provider_id: str, user_id: str) -> None:
    """
    Delete a user's SLURM SSH private key.

    Args:
        team_id: Team ID
        provider_id: Provider ID
        user_id: User ID
    """
    # Sanitize individual path components to prevent traversal or invalid names.
    safe_team_id = _sanitize_path_component("team_id", team_id)
    safe_provider_id = _sanitize_path_component("provider_id", provider_id)
    safe_user_id = _sanitize_path_component("user_id", user_id)
    key_path = await get_user_slurm_key_path(safe_team_id, safe_provider_id, safe_user_id)
    if os.path.exists(key_path):
        os.remove(key_path)


async def user_slurm_key_exists(team_id: str, provider_id: str, user_id: str) -> bool:
    """
    Check if a user has uploaded a SLURM SSH key for a provider.

    Args:
        team_id: Team ID
        provider_id: Provider ID
        user_id: User ID

    Returns:
        True if key exists, False otherwise
    """
    # Sanitize individual path components to prevent traversal or invalid names.
    safe_team_id = _sanitize_path_component("team_id", team_id)
    safe_provider_id = _sanitize_path_component("provider_id", provider_id)
    safe_user_id = _sanitize_path_component("user_id", user_id)
    key_path = await get_user_slurm_key_path(safe_team_id, safe_provider_id, safe_user_id)
    return os.path.exists(key_path)
