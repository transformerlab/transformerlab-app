"""
SSH Key Service for managing organization-level SSH keys.

Each organization gets one SSH key pair that can be used to access
interactive SSH tasks launched via ngrok.
"""

import os
import stat
from pathlib import Path
from typing import Optional, Tuple
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

from lab import storage
from lab.dirs import get_workspace_dir


async def get_ssh_keys_dir(team_id: str) -> str:
    """Get the directory where SSH keys are stored for a team."""
    workspace_dir = await get_workspace_dir()
    ssh_keys_dir = storage.join(workspace_dir, "ssh_keys")
    await storage.makedirs(ssh_keys_dir, exist_ok=True)
    return ssh_keys_dir


async def get_org_ssh_key_paths(team_id: str) -> Tuple[str, str]:
    """Get the paths to the private and public SSH keys for an organization."""
    ssh_keys_dir = await get_ssh_keys_dir(team_id)
    private_key_path = storage.join(ssh_keys_dir, f"org_{team_id}_key")
    public_key_path = storage.join(ssh_keys_dir, f"org_{team_id}_key.pub")
    return private_key_path, public_key_path


async def generate_ssh_key_pair(team_id: str) -> Tuple[str, str]:
    """
    Generate a new SSH key pair for an organization.

    Returns:
        Tuple of (private_key_path, public_key_path)
    """
    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id)

    # Check if keys already exist
    if await storage.exists(private_key_path) and await storage.exists(public_key_path):
        return private_key_path, public_key_path

    # Generate RSA key pair
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend()
    )

    # Serialize private key in OpenSSH format
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption()
    )

    # Get public key
    public_key = private_key.public_key()
    public_ssh = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH
    )

    # Write private key
    async with await storage.open(private_key_path, "wb") as f:
        await f.write(private_pem)

    # Write public key
    async with await storage.open(public_key_path, "wb") as f:
        await f.write(public_ssh)

    # Set permissions on private key (if local filesystem)
    # Note: For cloud storage, permissions are handled differently
    if not any(private_key_path.startswith(prefix) for prefix in ("s3://", "gs://", "gcs://", "abfs://")):
        os.chmod(private_key_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

    return private_key_path, public_key_path


async def get_or_create_org_ssh_key_pair(team_id: str) -> Tuple[str, str]:
    """
    Get existing SSH key pair or create a new one if it doesn't exist.

    Returns:
        Tuple of (private_key_path, public_key_path)
    """
    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id)

    # Check if keys exist
    if await storage.exists(private_key_path) and await storage.exists(public_key_path):
        return private_key_path, public_key_path

    # Generate new keys
    return await generate_ssh_key_pair(team_id)


async def get_org_ssh_public_key(team_id: str) -> str:
    """
    Get the public SSH key content for an organization.

    Returns:
        Public key as a string (OpenSSH format)
    """
    _, public_key_path = await get_or_create_org_ssh_key_pair(team_id)

    async with await storage.open(public_key_path, "r") as f:
        public_key_content = await f.read()

    return public_key_content.strip()


async def get_org_ssh_private_key(team_id: str) -> bytes:
    """
    Get the private SSH key content for an organization.

    Returns:
        Private key as bytes (PEM format)
    """
    private_key_path, _ = await get_or_create_org_ssh_key_pair(team_id)

    async with await storage.open(private_key_path, "rb") as f:
        private_key_content = await f.read()

    return private_key_content


async def org_ssh_key_exists(team_id: str) -> bool:
    """Check if SSH keys exist for an organization."""
    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id)
    return await storage.exists(private_key_path) and await storage.exists(public_key_path)
