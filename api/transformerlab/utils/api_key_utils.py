"""Utilities for API key generation, hashing, and validation."""

import secrets
from datetime import datetime
from typing import Optional
from pwdlib import PasswordHash
from pwdlib.hashers.argon2 import Argon2Hasher

# Use the same password hashing as FastAPI Users (Argon2 via pwdlib)
# Initialize exactly as FastAPI Users does (see https://fastapi-users.github.io/fastapi-users/latest/configuration/password-hash/)
_password_hash = PasswordHash((Argon2Hasher(),))


def generate_api_key() -> str:
    """
    Generate a new API key in format: tl-<nanoid-like>
    Uses secrets.token_urlsafe for secure random generation.
    """
    # Generate 32 random bytes and encode as URL-safe base64 (similar to nanoid)
    random_part = secrets.token_urlsafe(32)[:32]  # Take first 32 chars for consistent length
    return f"tl-{random_part}"


def hash_api_key(api_key: str) -> str:
    """
    Hash an API key using Argon2 (same as FastAPI Users password hashing).
    This is secure and computationally expensive, making brute force attacks impractical.
    Returns the hashed string.
    """
    return _password_hash.hash(api_key)


def verify_api_key(api_key: str, hashed_key: str) -> bool:
    """
    Verify an API key against its hash using Argon2.
    Returns True if the key matches, False otherwise.
    """
    return _password_hash.verify(api_key, hashed_key)


def get_key_prefix(api_key: str) -> str:
    """
    Extract the prefix (first 8 characters after 'tl-') for display purposes.
    Returns format like 'tl-abc123...'
    """
    if api_key.startswith("tl-"):
        prefix_part = api_key[3:11]  # Get 8 chars after 'tl-'
        return f"tl-{prefix_part}..."
    return api_key[:11] + "..."


def validate_api_key_format(api_key: str) -> bool:
    """
    Validate that an API key has the correct format: tl-<alphanumeric>
    """
    if not api_key.startswith("tl-"):
        return False
    if len(api_key) < 10:  # Minimum: tl- + at least 7 chars
        return False
    return True


def is_key_expired(expires_at: Optional[datetime]) -> bool:
    """
    Check if an API key is expired.
    """
    if expires_at is None:
        return False
    return datetime.utcnow() > expires_at
