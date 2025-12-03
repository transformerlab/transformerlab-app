"""Utilities for API key generation, hashing, and validation."""

import secrets
import hashlib
from datetime import datetime
from typing import Optional


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
    Hash an API key using SHA-256.
    Returns the hex digest of the hash.
    """
    return hashlib.sha256(api_key.encode("utf-8")).hexdigest()


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
