"""
Bucket creation utilities for TransformerLab.

This module provides functions to create buckets for teams when
TFL_API_STORAGE_URI is enabled. Supports both S3 and GCS.
"""

import os
import re
from typing import List, Tuple

from lab.storage import REMOTE_WORKSPACE_HOST


def create_bucket_for_team(team_id: str, profile_name: str = "transformerlab-s3") -> bool:
    """
    Create a bucket (S3 or GCS) for a team using the appropriate cloud provider.

    Args:
        team_id: The team ID to use as the bucket name
        profile_name: The AWS profile name to use for S3 (ignored for GCS)

    Returns:
        True if bucket was created successfully or already exists, False otherwise
    """

    # Check if TFL_API_STORAGE_URI is set
    tfl_storage_uri = os.getenv("TFL_API_STORAGE_URI")
    if not tfl_storage_uri:
        print("TFL_API_STORAGE_URI is not set, skipping bucket creation")
        return False

    # Validate bucket name (common rules for S3 and GCS)
    # Bucket names must be 3-63 characters, lowercase, and can contain only letters, numbers, dots, and hyphens
    # Add workspace- prefix to bucket name
    bucket_name = f"workspace-{team_id}".lower()
    if len(bucket_name) < 3 or len(bucket_name) > 63:
        print(f"Team ID '{team_id}' is not a valid bucket name (must be 3-63 characters)")
        return False

    # Replace any invalid characters with hyphens
    bucket_name = re.sub(r"[^a-z0-9.-]", "-", bucket_name)
    # Remove consecutive dots and hyphens
    bucket_name = re.sub(r"[.-]+", "-", bucket_name)
    # Remove leading/trailing dots and hyphens
    bucket_name = bucket_name.strip(".-")

    if len(bucket_name) < 3:
        print(f"Team ID '{team_id}' cannot be converted to a valid bucket name")
        return False

    if REMOTE_WORKSPACE_HOST == "aws":
        print(f"Creating S3 bucket for team {team_id} (bucket: {bucket_name})")
        return _create_s3_bucket(bucket_name, team_id, profile_name)
    elif REMOTE_WORKSPACE_HOST == "gcp":
        print(f"Creating GCS bucket for team {team_id} (bucket: {bucket_name})")
        return _create_gcs_bucket(bucket_name, team_id)
    else:
        print(f"Unsupported remote workspace host: {REMOTE_WORKSPACE_HOST}. Supported values: 'aws' or 'gcp'")
        return False


def _create_s3_bucket(bucket_name: str, team_id: str, profile_name: str) -> bool:
    try:
        import boto3
        from botocore.exceptions import ClientError, ProfileNotFound
    except ImportError:
        print("boto3 is not installed. Cannot create S3 bucket.")
        return False

    try:
        # Create a session with the specified profile
        session = boto3.Session(profile_name=profile_name)
        s3_client = session.client("s3")

        # Check if bucket already exists
        try:
            s3_client.head_bucket(Bucket=bucket_name)
            print(f"S3 bucket '{bucket_name}' already exists for team {team_id}")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "404":
                # Bucket doesn't exist, create it
                pass
            elif error_code == "403":
                print(f"Access denied when checking bucket '{bucket_name}'. Check AWS credentials.")
                return False
            else:
                print(f"Error checking bucket '{bucket_name}': {e}")
                return False

        # Get AWS region from profile or environment, default to us-east-1
        region = session.region_name or os.getenv("AWS_DEFAULT_REGION", "us-east-1")

        # Create the bucket
        try:
            if region == "us-east-1":
                # us-east-1 doesn't require LocationConstraint
                s3_client.create_bucket(Bucket=bucket_name)
            else:
                s3_client.create_bucket(Bucket=bucket_name, CreateBucketConfiguration={"LocationConstraint": region})
            print(f"Successfully created S3 bucket '{bucket_name}' for team {team_id} in region {region}")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "BucketAlreadyExists":
                print(f"S3 bucket '{bucket_name}' already exists for team {team_id}")
                return True
            elif error_code == "BucketAlreadyOwnedByYou":
                print(f"S3 bucket '{bucket_name}' is already owned by you for team {team_id}")
                return True
            else:
                print(f"Failed to create S3 bucket '{bucket_name}' for team {team_id}: {e}")
                return False

    except ProfileNotFound:
        print(f"AWS profile '{profile_name}' not found. Cannot create S3 bucket.")
        return False
    except Exception as e:
        print(f"Unexpected error creating S3 bucket '{bucket_name}' for team {team_id}: {e}")
        return False


def _create_gcs_bucket(bucket_name: str, team_id: str) -> bool:
    try:
        from google.cloud import storage
        from google.api_core.exceptions import NotFound
    except ImportError:
        print("google-cloud-storage is not installed. Cannot create GCS bucket.")
        return False

    project_id = os.getenv("GCP_PROJECT")
    if not project_id:
        print("GCP_PROJECT is not set. Cannot create GCS bucket.")
        return False

    try:
        client = storage.Client(project=project_id)
        bucket = client.bucket(bucket_name)

        # Check if bucket exists
        try:
            bucket.reload()
            print(f"GCS bucket '{bucket_name}' already exists for team {team_id}")
            return True
        except NotFound:
            # Bucket doesn't exist, create it
            bucket.create()
            print(f"Successfully created GCS bucket '{bucket_name}' for team {team_id}")
            return True
        except Exception as e:
            print(f"Error checking GCS bucket '{bucket_name}': {e}")
            return False

    except Exception as e:
        print(f"Unexpected error creating GCS bucket '{bucket_name}' for team {team_id}: {e}")
        return False


async def create_buckets_for_all_teams(session, profile_name: str = "transformerlab-s3") -> Tuple[int, int, List[str]]:
    """
    Create buckets for all existing teams that don't have buckets yet.

    This is useful when TFL_API_STORAGE_URI is enabled after teams already exist.
    Supports both S3 (when REMOTE_WORKSPACE_HOST=aws) and GCS (when REMOTE_WORKSPACE_HOST=gcp).

    Args:
        session: Database session to query teams
        profile_name: The AWS profile name to use for S3 (ignored for GCS)

    Returns:
        Tuple of (success_count, failure_count, error_messages)
    """
    from transformerlab.shared.models.models import Team

    # Check if TFL_API_STORAGE_URI is set
    tfl_storage_uri = os.getenv("TFL_API_STORAGE_URI")
    if not tfl_storage_uri:
        print("TFL_API_STORAGE_URI is not set, skipping bucket creation for existing teams")
        return (0, 0, ["TFL_API_STORAGE_URI is not set"])

    # Log which provider will be used
    provider = "GCS" if REMOTE_WORKSPACE_HOST == "gcp" else "S3"
    print(f"Creating buckets for all teams using {provider} (REMOTE_WORKSPACE_HOST={REMOTE_WORKSPACE_HOST})")

    from sqlalchemy import select

    # Get all teams
    stmt = select(Team)
    result = await session.execute(stmt)
    teams = result.scalars().all()

    success_count = 0
    failure_count = 0
    error_messages = []

    for team in teams:
        try:
            success = create_bucket_for_team(team.id, profile_name=profile_name)
            if success:
                success_count += 1
                print(f"✅ Created/verified bucket for team '{team.name}' (id={team.id})")
            else:
                failure_count += 1
                error_msg = f"Failed to create bucket for team '{team.name}' (id={team.id})"
                error_messages.append(error_msg)
                print(f"❌ {error_msg}")
        except Exception as e:
            failure_count += 1
            error_msg = f"Error creating bucket for team '{team.name}' (id={team.id}): {e}"
            error_messages.append(error_msg)
            print(f"❌ {error_msg}")

    print(f"Bucket creation summary: {success_count} succeeded, {failure_count} failed")
    return (success_count, failure_count, error_messages)
