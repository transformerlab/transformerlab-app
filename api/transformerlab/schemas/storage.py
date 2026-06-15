"""Schemas for the admin storage-usage endpoints."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TeamStorageUsageResponse(BaseModel):
    """Latest storage usage for a single team."""

    team_id: str
    team_name: str
    total_bytes: int
    total_bytes_human: str
    has_data: bool
    # Timestamp of the underlying CloudWatch datapoint (UTC). Null if no snapshot yet.
    as_of: Optional[datetime] = None
    # When the snapshot was recorded (UTC). Null if no snapshot yet.
    captured_at: Optional[datetime] = None


class StorageUsageResponse(BaseModel):
    """Per-team storage usage across all teams, read from stored snapshots."""

    teams: List[TeamStorageUsageResponse]
    total_bytes: int
    total_bytes_human: str


class StorageUsageRefreshResponse(BaseModel):
    """Result of manually triggering a fresh snapshot from CloudWatch."""

    supported: bool
    teams_written: int
    total_bytes: int
    message: Optional[str] = None
