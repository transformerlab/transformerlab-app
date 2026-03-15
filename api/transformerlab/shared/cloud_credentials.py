"""Cloud credential setup helpers for remote provider launches.

These generate bash snippets that configure AWS/GCP/Azure credentials
on the remote machine before the user's command runs.
"""

import configparser
import os
from pathlib import Path
from typing import Optional, Tuple


# RunPod (and similar) use /workspace as a writable persistent path; ~/.aws may be wrong user or not visible over SSH
RUNPOD_AWS_CREDENTIALS_DIR = "/workspace/.aws"


def get_aws_credentials_from_file(
    profile_name: str = "transformerlab-s3",
) -> Tuple[Optional[str], Optional[str]]:
    """Read AWS credentials from ~/.aws/credentials for the given profile.

    Returns:
        (aws_access_key_id, aws_secret_access_key) or (None, None) if not found.
    """
    credentials_path = Path.home() / ".aws" / "credentials"
    if not credentials_path.exists():
        return None, None

    try:
        config = configparser.ConfigParser()
        config.read(credentials_path)
        if profile_name in config:
            access_key = config[profile_name].get("aws_access_key_id")
            secret_key = config[profile_name].get("aws_secret_access_key")
            return access_key, secret_key
    except Exception:
        pass

    return None, None


def _escape_bash(s: str) -> str:
    """Escape a value for inclusion in a bash single-quoted string."""
    return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")


def generate_aws_credentials_setup(
    aws_access_key_id: str,
    aws_secret_access_key: str,
    aws_profile: Optional[str] = None,
    aws_credentials_dir: Optional[str] = None,
) -> str:
    """Generate a bash snippet that writes AWS credentials on the remote host."""
    profile_name = aws_profile or os.getenv("AWS_PROFILE", "transformerlab-s3")
    cred_dir = aws_credentials_dir if aws_credentials_dir else "~/.aws"
    cred_file = f"{cred_dir}/credentials" if aws_credentials_dir else "~/.aws/credentials"

    escaped_access_key = _escape_bash(aws_access_key_id)
    escaped_secret_key = _escape_bash(aws_secret_access_key)
    escaped_profile = _escape_bash(profile_name).replace("[", "\\[").replace("]", "\\]")

    setup_script = (
        f"echo 'Setting up AWS credentials for profile: {profile_name}'; "
        f"mkdir -p {cred_dir}; "
        f"chmod 700 {cred_dir}; "
        f"if [ -f {cred_file} ]; then "
        f"  awk 'BEGIN{{in_profile=0}} /^\\[{escaped_profile}\\]/{{in_profile=1; next}} /^\\[/{{in_profile=0}} !in_profile{{print}}' {cred_file} > {cred_file}.new && mv {cred_file}.new {cred_file} || true; "
        f"fi; "
        f"echo '[{profile_name}]' >> {cred_file}; "
        f"echo 'aws_access_key_id={escaped_access_key}' >> {cred_file}; "
        f"echo 'aws_secret_access_key={escaped_secret_key}' >> {cred_file}; "
        f"chmod 600 {cred_file}; "
        f"echo 'AWS credentials configured successfully at {cred_file}';"
    )
    return setup_script


def generate_gcp_credentials_setup(
    service_account_json: str,
    credentials_path: Optional[str] = None,
) -> str:
    """Generate a bash snippet that writes GCP service-account JSON on the remote host."""
    target_path = credentials_path or "$HOME/.config/gcloud/tfl-service-account.json"

    def escape_single(s: str) -> str:
        return s.replace("'", "'\"'\"'")

    escaped_json = escape_single(service_account_json)

    setup_script = (
        "echo 'Setting up GCP service account credentials...'; "
        'mkdir -p "$HOME/.config/gcloud"; '
        f"echo '{escaped_json}' > {target_path}; "
        f"chmod 600 {target_path}; "
        f"export GOOGLE_APPLICATION_CREDENTIALS={target_path}; "
        "echo 'GCP credentials configured successfully'"
    )
    return setup_script


def generate_azure_credentials_setup(
    connection_string: Optional[str],
    account_name: Optional[str],
    account_key: Optional[str],
    sas_token: Optional[str],
) -> str:
    """Generate a bash snippet that exports Azure storage credentials on the remote host."""

    def escape_single(s: str) -> str:
        return s.replace("'", "'\"'\"'")

    exports: list[str] = ["echo 'Setting up Azure storage credentials...'"]
    if connection_string:
        exports.append(f"export AZURE_STORAGE_CONNECTION_STRING='{escape_single(connection_string)}'")
    if account_name:
        exports.append(f"export AZURE_STORAGE_ACCOUNT='{escape_single(account_name)}'")
    if account_key:
        exports.append(f"export AZURE_STORAGE_KEY='{escape_single(account_key)}'")
    if sas_token:
        exports.append(f"export AZURE_STORAGE_SAS_TOKEN='{escape_single(sas_token)}'")

    exports.append("echo 'Azure storage credentials configured successfully'")
    return "; ".join(exports)
