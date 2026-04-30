"""Remote launch: cloud credential materialization helpers for setup scripts."""

import base64
import configparser
import os
from typing import Optional, Tuple

# lab.init() not required; copy_file_mounts uses _TFL_JOB_ID, _TFL_EXPERIMENT_ID / TFL_EXPERIMENT_ID, and job_data
COPY_FILE_MOUNTS_SETUP = 'python -c "from lab import lab; lab.copy_file_mounts()"'

# RunPod (and similar) use /workspace as a writable persistent path
RUNPOD_AWS_CREDENTIALS_DIR = "/workspace/.aws"


def get_aws_credentials_from_file(profile_name: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Read AWS credentials from ~/.aws/credentials for the specified profile."""
    from transformerlab.shared.remote_workspace import get_default_aws_profile

    profile_name = profile_name or get_default_aws_profile()
    credentials_path = os.path.join(os.path.expanduser("~"), ".aws", "credentials")

    if not os.path.exists(credentials_path):
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


def generate_aws_credentials_setup(
    aws_access_key_id: str,
    aws_secret_access_key: str,
    aws_profile: Optional[str] = None,
    aws_credentials_dir: Optional[str] = None,
) -> str:
    from transformerlab.shared.remote_workspace import get_default_aws_profile

    profile_name = aws_profile or get_default_aws_profile()
    cred_dir = aws_credentials_dir if aws_credentials_dir else "~/.aws"
    cred_file = f"{cred_dir}/credentials" if aws_credentials_dir else "~/.aws/credentials"

    def escape_bash(s: str) -> str:
        return s.replace("'", "'\"'\"'").replace("\\", "\\\\").replace("$", "\\$")

    escaped_access_key = escape_bash(aws_access_key_id)
    escaped_secret_key = escape_bash(aws_secret_access_key)
    escaped_profile = escape_bash(profile_name).replace("[", "\\[").replace("]", "\\]")

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


def generate_gcp_credentials_setup(sa_json_path: str) -> str:
    """Read service account JSON from *sa_json_path* and emit a setup script that writes
    it to the standard ADC location so GCP client libraries pick it up automatically."""
    sa_json_path = os.path.expanduser(sa_json_path)
    with open(sa_json_path, "r", encoding="utf-8") as f:
        encoded = base64.b64encode(f.read().encode()).decode()
    adc_path = "~/.config/gcloud/application_default_credentials.json"
    setup_script = (
        "echo 'Setting up GCP service account credentials...'; "
        "mkdir -p ~/.config/gcloud; "
        f"echo '{encoded}' | base64 -d > {adc_path}; "
        f"chmod 600 {adc_path}; "
        f"export GOOGLE_APPLICATION_CREDENTIALS={adc_path}; "
        "echo 'GCP credentials configured successfully'"
    )
    return setup_script


def generate_azure_credentials_setup(
    connection_string: Optional[str],
    account_name: Optional[str],
    account_key: Optional[str],
    sas_token: Optional[str],
) -> str:
    def escape_bash_single_quoted(s: str) -> str:
        return s.replace("'", "'\"'\"'")

    exports: list[str] = ["echo 'Setting up Azure storage credentials...'"]
    if connection_string:
        escaped = escape_bash_single_quoted(connection_string)
        exports.append(f"export AZURE_STORAGE_CONNECTION_STRING='{escaped}'")
    if account_name:
        escaped = escape_bash_single_quoted(account_name)
        exports.append(f"export AZURE_STORAGE_ACCOUNT='{escaped}'")
    if account_key:
        escaped = escape_bash_single_quoted(account_key)
        exports.append(f"export AZURE_STORAGE_KEY='{escaped}'")
    if sas_token:
        escaped = escape_bash_single_quoted(sas_token)
        exports.append(f"export AZURE_STORAGE_SAS_TOKEN='{escaped}'")

    exports.append("echo 'Azure storage credentials configured successfully'")
    return "; ".join(exports)


def _aws_credentials_path() -> str:
    return os.path.join(os.path.expanduser("~"), ".aws", "credentials")


def write_aws_credentials_to_profile(
    profile_name: str,
    access_key_id: str,
    secret_access_key: str,
) -> None:
    """Write AWS credentials to ~/.aws/credentials under the given profile name.

    Creates the file and directory if they don't exist. Overwrites the profile
    if it already exists, preserving all other profiles.
    """
    creds_path = _aws_credentials_path()
    creds_dir = os.path.dirname(creds_path)
    os.makedirs(creds_dir, exist_ok=True)
    os.chmod(creds_dir, 0o700)

    config = configparser.ConfigParser()
    if os.path.exists(creds_path):
        config.read(creds_path)

    config[profile_name] = {
        "aws_access_key_id": access_key_id,
        "aws_secret_access_key": secret_access_key,
    }

    with open(creds_path, "w", encoding="utf-8") as f:
        config.write(f)
    os.chmod(creds_path, 0o600)
