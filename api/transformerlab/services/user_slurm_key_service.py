"""
Service for managing user-specific SLURM SSH keys.

Each user can upload their own private SSH key for each SLURM provider.
The key is stored at: <workspace_dir>/slurm_keys/<team_id>/<provider_id>/<user_id>/id_rsa
"""

import os
import stat
from lab.dirs import HOME_DIR


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
    key_dir = os.path.join(HOME_DIR, "slurm_keys", team_id, provider_id, user_id)
    return os.path.join(key_dir, "id_rsa")


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
    key_dir = os.path.dirname(key_path)

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
    key_path = await get_user_slurm_key_path(team_id, provider_id, user_id)
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
    key_path = await get_user_slurm_key_path(team_id, provider_id, user_id)
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
    key_path = await get_user_slurm_key_path(team_id, provider_id, user_id)
    return os.path.exists(key_path)
