"""Utility functions for handling team and user secrets in task configurations."""

import json
import re
from typing import Dict, Any, Optional
from lab import storage
from lab.dirs import get_workspace_dir


async def load_user_secrets(user_id: str) -> Dict[str, str]:
    """
    Load user-specific secrets from workspace/user_secrets_{user_id}.json.

    Args:
        user_id: The user ID to load secrets for

    Returns:
        Dictionary of secret names to secret values. Returns empty dict if file doesn't exist or on error.
    """
    workspace_dir = await get_workspace_dir()
    secrets_path = storage.join(workspace_dir, f"user_secrets_{user_id}.json")

    try:
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                return json.loads(await f.read())
    except Exception as e:
        print(f"Warning: Failed to load user secrets for user {user_id}: {e}")

    return {}


async def load_team_secrets(user_id: Optional[str] = None) -> Dict[str, str]:
    """
    Load team secrets from workspace/team_secrets.json, and optionally merge with user secrets.
    User secrets override team secrets (user-specific secrets win).

    Args:
        user_id: Optional user ID. If provided, user secrets will be loaded and merged with team secrets.

    Returns:
        Dictionary of secret names to secret values. User secrets override team secrets.
        Returns empty dict if no secrets exist or on error.
    """
    workspace_dir = await get_workspace_dir()
    secrets_path = storage.join(workspace_dir, "team_secrets.json")

    team_secrets = {}
    try:
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                team_secrets = json.loads(await f.read())
    except Exception as e:
        print(f"Warning: Failed to load team secrets: {e}")

    # If user_id is provided, load user secrets and merge (user secrets override team secrets)
    if user_id:
        user_secrets = await load_user_secrets(user_id)
        # Merge: user secrets override team secrets
        merged_secrets = {**team_secrets, **user_secrets}
        return merged_secrets

    return team_secrets


def replace_secret_placeholders(text: str, secrets: Dict[str, str]) -> str:
    """
    Replace {{secret.<secret_name>}} patterns in a string with actual secret values.

    Args:
        text: The string that may contain {{secret.<secret_name>}} patterns
        secrets: Dictionary of secret names to secret values

    Returns:
        String with all {{secret.<secret_name>}} patterns replaced with actual values.
        If a secret is not found, the pattern is left unchanged.
    """
    if not isinstance(text, str):
        return text

    # Pattern to match {{secret.<secret_name>}}
    pattern = r"\{\{secret\.([A-Za-z_][A-Za-z0-9_]*)\}\}"

    def replace_match(match: re.Match) -> str:
        secret_name = match.group(1)
        if secret_name in secrets:
            return secrets[secret_name]
        # If secret not found, leave the pattern unchanged
        return match.group(0)

    return re.sub(pattern, replace_match, text)


def replace_secrets_in_dict(data: Dict[str, Any], secrets: Dict[str, str]) -> Dict[str, Any]:
    """
    Recursively replace {{secret.<secret_name>}} patterns in a dictionary.

    This function scans through all string values in the dictionary (and nested dictionaries)
    and replaces any {{secret.<secret_name>}} patterns with actual secret values.

    Args:
        data: Dictionary that may contain {{secret.<secret_name>}} patterns in string values
        secrets: Dictionary of secret names to secret values

    Returns:
        New dictionary with all {{secret.<secret_name>}} patterns replaced.
    """
    if not isinstance(data, dict):
        return data

    result = {}
    for key, value in data.items():
        if isinstance(value, str):
            result[key] = replace_secret_placeholders(value, secrets)
        elif isinstance(value, dict):
            result[key] = replace_secrets_in_dict(value, secrets)
        elif isinstance(value, list):
            result[key] = [
                replace_secret_placeholders(item, secrets)
                if isinstance(item, str)
                else replace_secrets_in_dict(item, secrets)
                if isinstance(item, dict)
                else item
                for item in value
            ]
        else:
            result[key] = value

    return result
