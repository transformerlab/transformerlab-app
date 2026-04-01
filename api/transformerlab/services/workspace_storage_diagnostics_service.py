"""Workspace storage diagnostics for the current team (org) context."""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path
from typing import Any

from lab import storage
from lab.dirs import get_workspace_dir


def _effective_storage_provider() -> str:
    """Provider from env at call time (matches server config without relying on stale imports in tests)."""
    return (os.getenv("TFL_STORAGE_PROVIDER") or "aws").strip().lower()


def _credential_hints(provider: str) -> dict[str, Any]:
    """Non-secret hints about which credential-related env vars are set."""
    hints: dict[str, Any] = {}

    if provider == "aws":
        hints["aws_access_key_id_set"] = bool(os.getenv("AWS_ACCESS_KEY_ID"))
        hints["aws_secret_access_key_set"] = bool(os.getenv("AWS_SECRET_ACCESS_KEY"))
        hints["aws_session_token_set"] = bool(os.getenv("AWS_SESSION_TOKEN"))
        hints["aws_profile"] = os.getenv("AWS_PROFILE", "transformerlab-s3")
    elif provider == "gcp":
        hints["gcp_project_set"] = bool(os.getenv("GCP_PROJECT"))
        hints["google_application_credentials_set"] = bool(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
    elif provider == "azure":
        hints["azure_connection_string_set"] = bool(os.getenv("AZURE_STORAGE_CONNECTION_STRING"))
        hints["azure_account_set"] = bool(os.getenv("AZURE_STORAGE_ACCOUNT"))
        hints["azure_key_set"] = bool(os.getenv("AZURE_STORAGE_KEY"))
        hints["azure_sas_token_set"] = bool(os.getenv("AZURE_STORAGE_SAS_TOKEN"))
    elif provider == "localfs":
        hints["tfl_storage_uri_set"] = bool(os.getenv("TFL_STORAGE_URI"))
        hints["tfl_workspace_dir_set"] = bool(os.getenv("TFL_WORKSPACE_DIR"))

    return hints


def _should_validate_cloud_credentials(
    provider: str, remote_enabled: bool, storage_root: str, workspace_is_remote: bool
) -> bool:
    """
    Mirror api startup (validate_cloud_credentials): localfs skips; otherwise require cloud
    creds when remote org buckets are enabled or when resolved paths are remote.
    """
    if provider == "localfs":
        return False
    if remote_enabled:
        return True
    if workspace_is_remote:
        return True
    if storage.is_remote_path(storage_root):
        return True
    return False


def _aws_credentials_file_has_profile_section(profile: str) -> bool | None:
    """Return True/False if ~/.aws/credentials exists; None if file missing."""
    cred_path = Path.home() / ".aws" / "credentials"
    if not cred_path.is_file():
        return None
    try:
        text = cred_path.read_text(encoding="utf-8")
    except OSError:
        return None
    # Named profiles use [profile_name]; avoid matching substrings
    for line in text.splitlines():
        s = line.strip()
        if s == f"[{profile}]":
            return True
    return False


def _check_aws_credentials_diagnostic() -> dict[str, Any]:
    """
    Validate AWS credentials for the configured profile, then default chain (same order as startup).

    Does not raise; returns a structured result suitable for the workspace check API.
    """
    profile_name = os.getenv("AWS_PROFILE", "transformerlab-s3")
    result: dict[str, Any] = {
        "ok": False,
        "provider": "aws",
        "profile_requested": profile_name,
        "credentials_file_has_profile_section": _aws_credentials_file_has_profile_section(profile_name),
        "resolution": None,
        "error": None,
        "sts_account": None,
        "sts_arn": None,
    }

    import logging

    import boto3
    from botocore.exceptions import ProfileNotFound, NoCredentialsError

    boto3.set_stream_logger(name="botocore.credentials", level=logging.ERROR)

    try:
        session = boto3.Session(profile_name=profile_name)
        credentials = session.get_credentials()
        if credentials is None:
            raise NoCredentialsError()
        sts_client = session.client("sts")
        ident = sts_client.get_caller_identity()
        result["ok"] = True
        result["resolution"] = "named_profile"
        result["sts_account"] = ident.get("Account")
        result["sts_arn"] = ident.get("Arn")
        return result
    except ProfileNotFound:
        try:
            session = boto3.Session()
            credentials = session.get_credentials()
            if credentials is None:
                raise NoCredentialsError()
            sts_client = session.client("sts")
            ident = sts_client.get_caller_identity()
            result["ok"] = True
            result["resolution"] = "default_chain"
            result["sts_account"] = ident.get("Account")
            result["sts_arn"] = ident.get("Arn")
            result["note"] = (
                f"AWS profile {profile_name!r} was not found; credentials worked via the default chain instead."
            )
            return result
        except NoCredentialsError:
            result["error"] = (
                f"AWS profile {profile_name!r} was not found and no default credential chain is available "
                f"(env keys, instance role, etc.). Configure [{profile_name}] in ~/.aws/credentials or set "
                "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY."
            )
            return result
        except Exception as e:
            result["error"] = str(e)
            return result
    except NoCredentialsError:
        result["error"] = (
            f"AWS profile {profile_name!r} is selected but boto3 returned no credentials for that profile."
        )
        return result
    except Exception as e:
        result["error"] = str(e)
        return result


def _check_gcp_credentials_diagnostic() -> dict[str, Any]:
    project_id = os.getenv("GCP_PROJECT")
    result: dict[str, Any] = {
        "ok": False,
        "provider": "gcp",
        "gcp_project": project_id,
        "error": None,
    }
    if not project_id:
        result["error"] = "GCP_PROJECT is not set."
        return result

    from google.cloud import storage as gcs_storage
    from google.auth.exceptions import DefaultCredentialsError

    try:
        client = gcs_storage.Client(project=project_id)
        list(client.list_buckets(max_results=1))
        result["ok"] = True
        return result
    except DefaultCredentialsError:
        result["error"] = (
            "GCP application-default credentials are missing. Set GOOGLE_APPLICATION_CREDENTIALS or run "
            "'gcloud auth application-default login'."
        )
        return result
    except Exception as e:
        result["error"] = str(e)
        return result


def _check_azure_credentials_diagnostic() -> dict[str, Any]:
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
    account_name = os.getenv("AZURE_STORAGE_ACCOUNT")
    account_key = os.getenv("AZURE_STORAGE_KEY")
    sas_token = os.getenv("AZURE_STORAGE_SAS_TOKEN")

    result: dict[str, Any] = {
        "ok": False,
        "provider": "azure",
        "account_configured": bool(account_name or connection_string),
        "error": None,
    }

    if not connection_string and not account_name:
        result["error"] = "Neither AZURE_STORAGE_CONNECTION_STRING nor AZURE_STORAGE_ACCOUNT is set."
        return result

    try:
        from azure.storage.blob import BlobServiceClient
    except ImportError:
        result["error"] = "azure-storage-blob is not installed on the API server."
        return result

    try:
        if connection_string:
            client = BlobServiceClient.from_connection_string(connection_string)
        elif account_key:
            client = BlobServiceClient(
                account_url=f"https://{account_name}.blob.core.windows.net",
                credential=account_key,
            )
        elif sas_token:
            client = BlobServiceClient(
                account_url=f"https://{account_name}.blob.core.windows.net",
                credential=sas_token,
            )
        else:
            result["error"] = (
                "AZURE_STORAGE_ACCOUNT is set but neither AZURE_STORAGE_KEY nor AZURE_STORAGE_SAS_TOKEN is set."
            )
            return result

        _ = next(client.list_containers(results_per_page=1).by_page(), [])
        result["ok"] = True
        return result
    except Exception as e:
        result["error"] = str(e)
        return result


async def get_workspace_storage_diagnostics() -> dict[str, Any]:
    """
    Resolve workspace paths for the current org context and verify read/write access.

    For cloud storage providers (aws, gcp, azure), also validates credentials (e.g. AWS profile + STS)
    the same way startup does, but returns errors in the payload instead of exiting.
    """
    remote_enabled = os.getenv("TFL_REMOTE_STORAGE_ENABLED", "false").lower() == "true"
    provider = _effective_storage_provider()
    workspace_dir = await get_workspace_dir()
    storage_root = await storage.root_uri()
    workspace_is_remote = storage.is_remote_path(workspace_dir)

    hints = _credential_hints(provider)
    token = str(uuid.uuid4())
    probe_subdir = storage.join(workspace_dir, ".tfl-storage-probe")
    probe_path = storage.join(probe_subdir, f"probe-{token}.txt")

    probe_ok = False
    probe_error: str | None = None
    try:
        await storage.makedirs(probe_subdir, exist_ok=True)
        async with await storage.open(probe_path, "w") as wf:
            await wf.write("ok")
        async with await storage.open(probe_path, "r") as rf:
            body = await rf.read()
        if body != "ok":
            probe_error = "read back unexpected content from probe file"
        else:
            probe_ok = True
    except Exception as e:
        probe_error = str(e)
    finally:
        try:
            await storage.rm(probe_path)
        except Exception:
            pass
        try:
            if await storage.exists(probe_subdir):
                entries = await storage.ls(probe_subdir)
                if not entries:
                    await storage.rm(probe_subdir)
        except Exception:
            pass

    credential_validation: dict[str, Any] | None = None
    credential_validation_skipped_reason: str | None = None
    workspace_requires_cloud_credentials = _should_validate_cloud_credentials(
        provider, remote_enabled, storage_root, workspace_is_remote
    )

    if provider == "localfs":
        credential_validation_skipped_reason = "TFL_STORAGE_PROVIDER is localfs."
    elif provider == "aws":
        credential_validation = await asyncio.to_thread(_check_aws_credentials_diagnostic)
    elif provider == "gcp":
        credential_validation = await asyncio.to_thread(_check_gcp_credentials_diagnostic)
    elif provider == "azure":
        credential_validation = await asyncio.to_thread(_check_azure_credentials_diagnostic)

    cloud_cred_ok = True
    if credential_validation is not None:
        if workspace_requires_cloud_credentials:
            cloud_cred_ok = bool(credential_validation.get("ok"))
        # else: still return validation details, but do not fail overall_ok on bad STS/SKIP

    overall_ok = probe_ok and cloud_cred_ok

    return {
        "ok": overall_ok,
        "workspace_dir": workspace_dir,
        "storage_root": storage_root,
        "workspace_is_remote": workspace_is_remote,
        "storage_provider": provider,
        "remote_storage_enabled": remote_enabled,
        "tfl_storage_uri_configured": bool(os.getenv("TFL_STORAGE_URI")),
        "credential_hints": hints,
        "credential_validation": credential_validation,
        "credential_validation_skipped_reason": credential_validation_skipped_reason,
        "workspace_requires_cloud_credentials": workspace_requires_cloud_credentials,
        "read_write_probe": {"ok": probe_ok, "error": probe_error},
    }
