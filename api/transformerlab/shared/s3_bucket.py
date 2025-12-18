"""
Bucket creation utilities for TransformerLab.

This module provides functions to create buckets for teams when
TFL_API_STORAGE_URI is enabled. Supports both S3 and GCS.
"""

import os
import re


def create_bucket_for_team(team_id: str, profile_name: str = "transformerlab-s3") -> bool:
    """
    Create a bucket (S3 or GCS) for a team using the appropriate cloud provider.

    Args:
        team_id: The team ID to use as the bucket name
        cloud_provider: Should be one of "aws" or "gcp"
        profile_name: The AWS profile name to use for S3 (ignored for GCS)

    Returns:
        True if bucket was created successfully or already exists, False otherwise
    """

    # Check if TFL_API_STORAGE_URI is set
    tfl_storage_uri = os.getenv("TFL_API_STORAGE_URI")
    if not tfl_storage_uri:
        print("TFL_API_STORAGE_URI is not set, skipping bucket creation")
        return False

    # Determine cloud provider from storage URI
    protocol = tfl_storage_uri.split("://")[0] if "://" in tfl_storage_uri else "unknown"
    if protocol in ["gs", "gcs"]:
        cloud_provider = "gcp"
    elif protocol == "s3":
        cloud_provider = "aws"
    elif protocol == "abfs":
        cloud_provider = "azure"
    else:
        cloud_provider = "unknown"
    if cloud_provider not in ["aws", "gcp"]:
        print(f"Failed to create bucket using protocol: {protocol}")
        return False

    print(f"Creating bucket '{team_id}' on '{cloud_provider}'")

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

    if cloud_provider == "aws":
        return _create_s3_bucket(bucket_name, team_id, profile_name)
    elif cloud_provider == "gcp":
        return _create_gcs_bucket(bucket_name, team_id)
    else:
        print(f"Unsupported cloud provider: {cloud_provider}")
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
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        print("boto3 is not installed. Cannot create GCS bucket.")
        return False

    try:
        # Create a session (GCS uses environment variables for credentials)
        session = boto3.Session()
        gcs_client = session.client("s3", endpoint_url="https://storage.googleapis.com")

        # Check if bucket already exists
        try:
            gcs_client.head_bucket(Bucket=bucket_name)
            print(f"GCS bucket '{bucket_name}' already exists for team {team_id}")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "404":
                # Bucket doesn't exist, create it
                pass
            elif error_code == "403":
                print(f"Access denied when checking bucket '{bucket_name}'. Check credentials.")
                return False
            else:
                print(f"Error checking bucket '{bucket_name}': {e}")
                return False

        # Create the bucket
        try:
            gcs_client.create_bucket(Bucket=bucket_name)
            print(f"Successfully created GCS bucket '{bucket_name}' for team {team_id}")
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "BucketAlreadyExists":
                print(f"GCS bucket '{bucket_name}' already exists for team {team_id}")
                return True
            elif error_code == "BucketAlreadyOwnedByYou":
                print(f"GCS bucket '{bucket_name}' is already owned by you for team {team_id}")
                return True
            else:
                print(f"Failed to create GCS bucket '{bucket_name}' for team {team_id}: {e}")
                return False

    except Exception as e:
        print(f"Unexpected error creating GCS bucket '{bucket_name}' for team {team_id}: {e}")
        return False
