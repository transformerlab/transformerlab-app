import base64
import hashlib
import hmac
import json
import os
import time
import uuid
import logging
from typing import Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from transformerlab.shared.models.models import TeamStorageConfig

logger = logging.getLogger(__name__)

_JUICEFS_API_BASE = "https://juicefs.com/api/v1"
_JUICEFS_API_HOST = "juicefs.com"
_VOLUME_ID = os.getenv("JUICEFS_VOLUME_ID", "")
_API_ACCESS_KEY = os.getenv("JUICEFS_API_ACCESS_KEY", "")
_API_SECRET_KEY = os.getenv("JUICEFS_API_SECRET_KEY", "")

# Default storage quota per org in bytes (100 GB)
_DEFAULT_QUOTA_BYTES = 100 * 1024**3
_DEFAULT_QUOTA_INODES = 1_000_000


def _is_configured() -> bool:
    return bool(_VOLUME_ID and _API_ACCESS_KEY and _API_SECRET_KEY)


def _build_auth_header(method: str, path: str, body: bytes = b"") -> str:
    """Build the JuiceFS Console API Authorization header.

    Signs the request using HMAC-SHA256 per the JuiceFS Console API spec:
    signing string = timestamp \\n method \\n path \\n host header \\n query params \\n body hash
    """
    timestamp = int(time.time())
    body_hash = hashlib.sha256(body).hexdigest()
    signing_string = "\n".join([
        str(timestamp),
        method.upper(),
        path,
        f"host:{_JUICEFS_API_HOST}",
        "",  # no query params
        body_hash,
    ])
    signature = hmac.new(
        _API_SECRET_KEY.encode(),
        signing_string.encode(),
        hashlib.sha256,
    ).hexdigest()
    token = base64.b64encode(
        json.dumps({
            "access_key": _API_ACCESS_KEY,
            "timestamp": timestamp,
            "signature": signature,
            "version": 1,
        }).encode()
    ).decode()
    return token


def _headers(method: str, path: str, body: bytes = b"") -> dict[str, str]:
    return {
        "Authorization": _build_auth_header(method, path, body),
        "Content-Type": "application/json",
    }


async def create_org_storage(team_id: str, session: AsyncSession) -> TeamStorageConfig:
    """Provision a JuiceFS export and path quota for a new org.

    Creates an export (S3-compatible credentials) on the shared JuiceFS volume
    and sets a 100 GB quota scoped to /{team_id}/. Credentials and export ID
    are persisted in team_storage_config so they can be distributed to remote
    jobs and the export can be revoked later if needed.
    """
    async with httpx.AsyncClient() as client:
        export_path = f"/api/v1/volumes/{_VOLUME_ID}/exports"
        export_body = json.dumps({"desc": f"org-{team_id}"}).encode()
        export_resp = await client.post(
            f"{_JUICEFS_API_BASE}/volumes/{_VOLUME_ID}/exports",
            headers=_headers("POST", export_path, export_body),
            content=export_body,
        )
        export_resp.raise_for_status()
        export_data = export_resp.json()
        # NOTE: confirm exact field names against your JuiceFS Cloud instance
        export_id = str(export_data["id"])
        access_key = str(export_data["access_key"])
        secret_key = str(export_data["secret_key"])

        quota_path = f"/api/v1/volumes/{_VOLUME_ID}/quotas"
        quota_body = json.dumps({
            "path": f"/{team_id}",
            "size": _DEFAULT_QUOTA_BYTES,
            "inodes": _DEFAULT_QUOTA_INODES,
        }).encode()
        quota_resp = await client.post(
            f"{_JUICEFS_API_BASE}/volumes/{_VOLUME_ID}/quotas",
            headers=_headers("POST", quota_path, quota_body),
            content=quota_body,
        )
        quota_resp.raise_for_status()

    config = TeamStorageConfig(
        id=str(uuid.uuid4()),
        team_id=team_id,
        provider="juicefs",
        subpath=f"/{team_id}",
        export_id=export_id,
        access_key=access_key,
        secret_key=secret_key,
        quota_bytes=_DEFAULT_QUOTA_BYTES,
    )
    session.add(config)
    await session.commit()
    logger.info("Created JuiceFS storage for team %s (export_id=%s)", team_id, export_id)
    return config


async def get_org_storage(team_id: str, session: AsyncSession) -> Optional[TeamStorageConfig]:
    result = await session.execute(select(TeamStorageConfig).where(TeamStorageConfig.team_id == team_id))
    return result.scalar_one_or_none()
