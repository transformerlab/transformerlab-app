"""
SSH Key Service for managing organization-level SSH keys.

Each organization has one SSH key pair at a time.
Key metadata is tracked in a status.json file in the SSH keys directory.
"""

import os
import stat
import json
import uuid
from typing import Tuple, Optional, Dict, Any
from datetime import datetime
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend

from lab import storage
from lab.dirs import get_workspace_dir


async def get_ssh_keys_dir(team_id: str) -> str:
    """Get the directory where SSH keys are stored for a team."""
    workspace_dir = await get_workspace_dir()
    ssh_keys_dir = storage.join(workspace_dir, "ssh_keys", team_id)
    await storage.makedirs(ssh_keys_dir, exist_ok=True)
    return ssh_keys_dir


async def get_status_file_path(team_id: str) -> str:
    """Get the path to the status.json file for a team."""
    ssh_keys_dir = await get_ssh_keys_dir(team_id)
    return storage.join(ssh_keys_dir, "status.json")


async def load_status(team_id: str) -> Optional[Dict[str, Any]]:
    """Load the status.json file for a team. Returns None if it doesn't exist."""
    status_path = await get_status_file_path(team_id)
    if await storage.exists(status_path):
        async with await storage.open(status_path, "r") as f:
            content = await f.read()
            return json.loads(content)
    return None


async def save_status(team_id: str, status: Dict[str, Any]) -> None:
    """Save the status.json file for a team."""
    status_path = await get_status_file_path(team_id)
    async with await storage.open(status_path, "w") as f:
        await f.write(json.dumps(status, indent=2))


async def get_org_ssh_key_paths(team_id: str, key_id: str) -> Tuple[str, str]:
    """Get the paths to the private and public SSH keys for a specific key ID."""
    ssh_keys_dir = await get_ssh_keys_dir(team_id)
    private_key_path = storage.join(ssh_keys_dir, f"{key_id}_key")
    public_key_path = storage.join(ssh_keys_dir, f"{key_id}_key.pub")
    return private_key_path, public_key_path


async def generate_ssh_key_pair(team_id: str, key_id: str) -> Tuple[str, str]:
    """
    Generate a new SSH key pair for a specific key ID.

    Returns:
        Tuple of (private_key_path, public_key_path)
    """
    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id, key_id)

    # Check if keys already exist
    if await storage.exists(private_key_path) and await storage.exists(public_key_path):
        return private_key_path, public_key_path

    # Generate RSA key pair
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048, backend=default_backend())

    # Serialize private key in OpenSSH format
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.OpenSSH,
        encryption_algorithm=serialization.NoEncryption(),
    )

    # Get public key
    public_key = private_key.public_key()
    public_ssh = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH, format=serialization.PublicFormat.OpenSSH
    )

    # Write private key
    async with await storage.open(private_key_path, "wb") as f:
        await f.write(private_pem)

    # Write public key (as text, not binary)
    async with await storage.open(public_key_path, "w") as f:
        await f.write(public_ssh.decode("utf-8"))

    # Set permissions on private key (if local filesystem)
    # Note: For cloud storage, permissions are handled differently
    if not storage.is_remote_path(private_key_path):
        os.chmod(private_key_path, stat.S_IRUSR | stat.S_IWUSR)  # 0600

    return private_key_path, public_key_path


async def get_current_key_id(team_id: str) -> Optional[str]:
    """Get the ID of the current SSH key for a team."""
    status = await load_status(team_id)
    if status:
        return status.get("key_id")
    return None


async def get_or_create_org_ssh_key_pair(team_id: str) -> Tuple[str, str]:
    """
    Get the current SSH key pair for an organization, or create a new one if none exists.

    Returns:
        Tuple of (private_key_path, public_key_path)
    """
    status = await load_status(team_id)

    # If no status or no key_id, create a new key
    if not status or not status.get("key_id"):
        key_id = str(uuid.uuid4())
        status = {
            "key_id": key_id,
            "name": None,
            "created_at": datetime.utcnow().isoformat(),
            "created_by_user_id": "system",  # Legacy key creation
        }
        await save_status(team_id, status)
    else:
        key_id = status["key_id"]

    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id, key_id)

    # Generate keys if they don't exist
    if not (await storage.exists(private_key_path) and await storage.exists(public_key_path)):
        await generate_ssh_key_pair(team_id, key_id)

    return private_key_path, public_key_path


async def get_org_ssh_public_key(team_id: str) -> str:
    """
    Get the public SSH key content for the current key.

    Returns:
        Public key as a string (OpenSSH format)
    
    Raises:
        ValueError: If the key doesn't exist and can't be created
        FileNotFoundError: If the key file doesn't exist after creation attempt
    """
    status = await load_status(team_id)
    if not status or not status.get("key_id"):
        raise ValueError("No SSH key found for this team. Please create one in Team Settings → SSH Key.")

    key_id = status["key_id"]
    _, public_key_path = await get_org_ssh_key_paths(team_id, key_id)

    # Verify the file exists
    if not await storage.exists(public_key_path):
        # Try to regenerate the key pair
        await generate_ssh_key_pair(team_id, key_id)
        if not await storage.exists(public_key_path):
            raise FileNotFoundError(f"SSH public key file not found at {public_key_path} after regeneration attempt")

    # Try reading as text first, then binary if that fails
    try:
        async with await storage.open(public_key_path, "r") as f:
            public_key_content = await f.read()
    except (UnicodeDecodeError, TypeError):
        # If text read fails, try binary and decode
        async with await storage.open(public_key_path, "rb") as f:
            public_key_bytes = await f.read()
            public_key_content = public_key_bytes.decode("utf-8")

    public_key = public_key_content.strip()
    if not public_key:
        raise ValueError(f"SSH public key file is empty at {public_key_path}")

    return public_key


async def get_org_ssh_private_key(team_id: str) -> bytes:
    """
    Get the private SSH key content for the current key.

    Returns:
        Private key as bytes (PEM format)
    """
    private_key_path, _ = await get_or_create_org_ssh_key_pair(team_id)

    async with await storage.open(private_key_path, "rb") as f:
        private_key_content = await f.read()

    return private_key_content


async def get_ssh_key_info(team_id: str) -> Optional[Dict[str, Any]]:
    """Get information about the current SSH key for a team."""
    status = await load_status(team_id)
    if status:
        return {
            "id": status.get("key_id"),
            "name": status.get("name"),
            "created_at": status.get("created_at"),
            "created_by_user_id": status.get("created_by_user_id"),
        }
    return None


async def create_ssh_key(team_id: str, name: Optional[str], created_by_user_id: str) -> Dict[str, Any]:
    """
    Create a new SSH key pair for a team.
    This will delete the old key if one exists.

    Returns:
        Dictionary with key information
    """
    # Delete old key if it exists
    old_status = await load_status(team_id)
    if old_status and old_status.get("key_id"):
        old_key_id = old_status["key_id"]
        private_key_path, public_key_path = await get_org_ssh_key_paths(team_id, old_key_id)
        if await storage.exists(private_key_path):
            await storage.rm(private_key_path)
        if await storage.exists(public_key_path):
            await storage.rm(public_key_path)

    # Create new key
    key_id = str(uuid.uuid4())
    status = {
        "key_id": key_id,
        "name": name,
        "created_at": datetime.utcnow().isoformat(),
        "created_by_user_id": created_by_user_id,
    }

    await save_status(team_id, status)

    # Generate the actual key pair
    await generate_ssh_key_pair(team_id, key_id)

    return {
        "id": key_id,
        "name": name,
        "created_at": status["created_at"],
        "created_by_user_id": created_by_user_id,
    }


async def update_ssh_key(team_id: str, name: Optional[str] = None) -> Dict[str, Any]:
    """
    Update the SSH key name.

    Returns:
        Updated key information
    """
    status = await load_status(team_id)

    if not status or not status.get("key_id"):
        raise ValueError("No SSH key found for this team")

    # Update name if provided
    if name is not None:
        status["name"] = name

    await save_status(team_id, status)

    return {
        "id": status["key_id"],
        "name": status.get("name"),
        "created_at": status.get("created_at"),
        "created_by_user_id": status.get("created_by_user_id"),
    }


async def delete_ssh_key(team_id: str) -> None:
    """
    Delete the SSH key and its files.
    """
    status = await load_status(team_id)

    if not status or not status.get("key_id"):
        raise ValueError("No SSH key found for this team")

    key_id = status["key_id"]

    # Delete key files
    private_key_path, public_key_path = await get_org_ssh_key_paths(team_id, key_id)
    if await storage.exists(private_key_path):
        await storage.rm(private_key_path)
    if await storage.exists(public_key_path):
        await storage.rm(public_key_path)

    # Delete status file
    status_path = await get_status_file_path(team_id)
    if await storage.exists(status_path):
        await storage.rm(status_path)


async def org_ssh_key_exists(team_id: str) -> bool:
    """Check if an SSH key exists for an organization."""
    status = await load_status(team_id)
    if status and status.get("key_id"):
        key_id = status["key_id"]
        private_key_path, public_key_path = await get_org_ssh_key_paths(team_id, key_id)
        return await storage.exists(private_key_path) and await storage.exists(public_key_path)
    return False
