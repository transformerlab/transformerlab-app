from typing import Dict, Optional

from pydantic import BaseModel


class StorageUsageResponse(BaseModel):
    team_id: str
    total_bytes: int
    total_gb: float
    breakdown: Dict[str, int]
    per_user: Dict[str, int]
    scanned_at: Optional[str] = None
    global_limit_bytes: Optional[int] = None
    org_threshold_bytes: Optional[int] = None
    user_threshold_bytes: Optional[int] = None


class StorageAlert(BaseModel):
    scope: str  # "global" | "org" | "user"
    subject: str
    used_bytes: int
    limit_bytes: int


class StorageAlertsResponse(BaseModel):
    alerts: list[StorageAlert]


class StorageThresholdsUpdate(BaseModel):
    org_threshold_bytes: Optional[int] = None
    user_threshold_bytes: Optional[int] = None
