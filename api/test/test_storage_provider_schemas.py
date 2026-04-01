import pytest
from pydantic import ValidationError
from transformerlab.schemas.storage_provider import (
    StorageProviderCreate,
    StorageProviderType,
    StorageProviderConfigBase,
)


def test_create_schema_requires_name_type_config():
    with pytest.raises(ValidationError):
        StorageProviderCreate(type=StorageProviderType.S3, config=StorageProviderConfigBase(uri="s3://b"))


def test_create_schema_valid_s3():
    provider = StorageProviderCreate(
        name="my-s3",
        type=StorageProviderType.S3,
        config=StorageProviderConfigBase(uri="s3://my-bucket", aws_access_key_id="key", aws_secret_access_key="secret"),
    )
    assert provider.name == "my-s3"
    assert provider.config.uri == "s3://my-bucket"


def test_create_schema_valid_localfs():
    provider = StorageProviderCreate(
        name="nfs",
        type=StorageProviderType.LOCALFS,
        config=StorageProviderConfigBase(uri="/mnt/nfs/storage"),
    )
    assert provider.config.uri == "/mnt/nfs/storage"


def test_create_schema_requires_uri():
    with pytest.raises(ValidationError):
        StorageProviderCreate(
            name="bad",
            type=StorageProviderType.S3,
            config=StorageProviderConfigBase(),
        )
