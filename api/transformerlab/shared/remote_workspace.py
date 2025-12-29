"""
Bucket creation utilities for TransformerLab.

This module provides functions to create buckets for teams when
TFL_API_STORAGE_URI is enabled. Supports both S3 and GCS.
"""

import os
import re
import sys

from lab.storage import REMOTE_WORKSPACE_HOST


def validate_cloud_credentials() -> None:
    """
    Validate that cloud credentials are available when cloud storage is enabled.
    This should be called at API startup to fail fast if credentials are missing.

    Raises:
        SystemExit: If cloud storage is enabled but credentials are missing
    """
    # Check if cloud storage is enabled
    tfl_storage_uri = os.getenv("TFL_API_STORAGE_URI")

    # If neither is set, no validation needed
    if not tfl_storage_uri:
        return

    # If cloud storage is enabled, check credentials based on provider
    if REMOTE_WORKSPACE_HOST == "aws":
        _validate_aws_credentials()
    elif REMOTE_WORKSPACE_HOST == "gcp":
        _validate_gcp_credentials()


def _validate_aws_credentials() -> None:
    """
    Validate that AWS credentials are available for the transformerlab-s3 profile.
    Checks both profile-based credentials and environment variables.

    Raises:
        SystemExit: If AWS profile is not found or credentials are missing
    """
    profile_name = os.getenv("AWS_PROFILE", "transformerlab-s3")

    import boto3
    from botocore.exceptions import ProfileNotFound, NoCredentialsError

    try:
        # Try to create a session with the profile
        session = boto3.Session(profile_name=profile_name)

        # Try to get credentials - this will raise ProfileNotFound if profile doesn't exist
        # or NoCredentialsError if credentials are missing
        credentials = session.get_credentials()
        if credentials is None:
            raise NoCredentialsError()

        # Try to verify credentials by getting caller identity
        sts_client = session.client("sts")
        sts_client.get_caller_identity()

        print(f"✅ AWS credentials validated for profile '{profile_name}'")
    except ProfileNotFound:
        # Profile not found - try with default credential chain (env vars, default profile, etc.)
        try:
            session = boto3.Session()  # Use default credential chain
            credentials = session.get_credentials()
            if credentials is None:
                raise NoCredentialsError()
            sts_client = session.client("sts")
            sts_client.get_caller_identity()
            print(f"✅ AWS credentials validated (using default credential chain, profile '{profile_name}' not found)")
        except NoCredentialsError:
            print(
                f"❌ ERROR: AWS profile '{profile_name}' not found and no default credentials available.\n"
                f"   Cloud storage is enabled (TFL_API_STORAGE_URI) but AWS credentials are missing.\n"
                f"   Please configure AWS credentials:\n"
                f"   1. Create ~/.aws/credentials file with the following:\n"
                f"      [{profile_name}]\n"
                f"      aws_access_key_id = YOUR_ACCESS_KEY\n"
                f"      aws_secret_access_key = YOUR_SECRET_KEY\n"
                f"   2. Or set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n"
                f"   3. Or configure credentials using 'aws configure --profile {profile_name}'",
                file=sys.stderr,
            )
            sys.exit(1)
    except NoCredentialsError:
        print(
            f"❌ ERROR: AWS credentials not found.\n"
            f"   Cloud storage is enabled (TFL_API_STORAGE_URI) but AWS credentials are missing.\n"
            f"   Please configure AWS credentials:\n"
            f"   1. Create ~/.aws/credentials file with profile '{profile_name}':\n"
            f"      [{profile_name}]\n"
            f"      aws_access_key_id = YOUR_ACCESS_KEY\n"
            f"      aws_secret_access_key = YOUR_SECRET_KEY\n"
            f"   2. Or configure credentials using 'aws configure --profile {profile_name}'",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(
            f"❌ ERROR: Failed to validate AWS credentials: {e}\n"
            f"   Cloud storage is enabled but credentials validation failed.",
            file=sys.stderr,
        )
        sys.exit(1)


def _validate_gcp_credentials() -> None:
    """
    Validate that GCP credentials are available.

    Raises:
        SystemExit: If GCP credentials are missing
    """
    project_id = os.getenv("GCP_PROJECT")
    if not project_id:
        print(
            "❌ ERROR: GCP_PROJECT is not set but cloud storage is enabled.\n"
            "   Please set GCP_PROJECT environment variable.",
            file=sys.stderr,
        )
        sys.exit(1)

    from google.cloud import storage
    from google.auth.exceptions import DefaultCredentialsError

    try:
        # Try to create a client - this will raise DefaultCredentialsError if credentials are missing
        client = storage.Client(project=project_id)
        # Try to list buckets to verify credentials work
        list(client.list_buckets(max_results=1))
        print(f"✅ GCP credentials validated for project '{project_id}'")
    except DefaultCredentialsError:
        print(
            f"❌ ERROR: GCP credentials not found.\n"
            f"   Cloud storage is enabled (TFL_API_STORAGE_URI or TL_FORCE_API_URL=true) but GCP credentials are missing.\n"
            f"   Please configure GCP credentials:\n"
            f"   1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable to path of service account key\n"
            f"   2. Or run 'gcloud auth application-default login'",
            file=sys.stderr,
        )
        sys.exit(1)
    except Exception as e:
        print(
            f"❌ ERROR: Failed to validate GCP credentials: {e}\n"
            f"   Cloud storage is enabled but credentials validation failed.",
            file=sys.stderr,
        )
        sys.exit(1)


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
        return _create_s3_bucket(bucket_name, team_id, profile_name)
    elif REMOTE_WORKSPACE_HOST == "gcp":
        return _create_gcs_bucket(bucket_name, team_id)
    else:
        print(f"Unsupported remote workspace host: {REMOTE_WORKSPACE_HOST}")
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
