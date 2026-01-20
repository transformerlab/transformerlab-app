"""Utility functions for handling team secrets in task configurations."""

import json
import re
from typing import Dict, Any
from lab import storage
from lab.dirs import get_workspace_dir


async def load_team_secrets() -> Dict[str, str]:
    """
    Load team secrets from workspace/team_secrets.json.

    Returns:
        Dictionary of secret names to secret values. Returns empty dict if file doesn't exist or on error.
    """
    workspace_dir = await get_workspace_dir()
    secrets_path = storage.join(workspace_dir, "team_secrets.json")

    try:
        if await storage.exists(secrets_path):
            async with await storage.open(secrets_path, "r") as f:
                return json.loads(await f.read())
    except Exception as e:
        print(f"Warning: Failed to load team secrets: {e}")

    return {}


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
