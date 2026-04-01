from enum import Enum
from typing import Any, Dict, Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class StorageProviderType(str, Enum):
    S3 = "S3"
    GCS = "GCS"
    AZURE = "AZURE"
    LOCALFS = "LOCALFS"


_SENSITIVE_FIELDS = {"aws_secret_access_key", "azure_storage_key", "azure_storage_sas_token", "connection_string"}


class StorageProviderConfigBase(BaseModel):
    uri: str = Field(..., min_length=1, description="Storage URI, e.g. s3://my-bucket or /mnt/nfs")

    # S3
    aws_access_key_id: Optional[str] = None
    aws_secret_access_key: Optional[str] = None
    aws_profile: Optional[str] = None

    # GCS
    google_application_credentials: Optional[str] = None

    # Azure
    azure_storage_account: Optional[str] = None
    azure_storage_key: Optional[str] = None
    azure_storage_sas_token: Optional[str] = None
    connection_string: Optional[str] = None


class StorageProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: StorageProviderType
    config: StorageProviderConfigBase


class StorageProviderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    team_id: str
    name: str
    type: str
    config: Dict[str, Any]  # Sensitive fields masked before returning
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


class StorageProviderTest(BaseModel):
    type: StorageProviderType
    config: StorageProviderConfigBase


def mask_sensitive_config(config: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of config with sensitive credential fields replaced by '***'."""
    return {k: ("***" if k in _SENSITIVE_FIELDS and v is not None else v) for k, v in config.items()}
