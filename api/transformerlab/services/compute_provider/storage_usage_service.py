"""Measure and cache per-org on-disk storage usage."""

import inspect
import json
import logging
import os
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from lab import storage
from lab.dirs import (
    get_workspace_dir,
    get_models_dir,
    get_datasets_dir,
    get_experiments_dir,
    get_local_provider_org_dir,
    get_job_dir,
    get_local_provider_job_dir,
    set_organization_id,
)
from lab import Experiment
from transformerlab.db.db import config_get, config_set
from transformerlab.services import job_service
from transformerlab.shared.models.models import OrgStorageSnapshot
from transformerlab.utils.datetime_utils import utc_now_naive

logger = logging.getLogger(__name__)

_BYTES_PER_GB = 1024**3


def _safe_json_loads(raw: Optional[str]) -> dict:
    """Parse a JSON object string, returning {} on missing/malformed data."""
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except (ValueError, TypeError):
        logger.warning("storage: failed to parse JSON blob; treating as empty")
        return {}


def gb(num_bytes: Optional[int]) -> float:
    """Bytes -> GB rounded to 2 decimals."""
    if not num_bytes:
        return 0.0
    return round(num_bytes / _BYTES_PER_GB, 2)


async def _resolve(value: Any) -> Any:
    """Await coroutine return values, pass through plain values.

    The directory helpers in ``lab.dirs`` are async, but tests patch them with
    synchronous mocks. This lets the service work in both cases.
    """
    if inspect.isawaitable(value):
        return await value
    return value


async def _compute_per_user_bytes(team_id: str) -> Dict[str, int]:
    """Best-effort per-user attribution: sum each job's dirs grouped by job owner."""
    per_user: Dict[str, int] = {}
    try:
        experiments_data = await Experiment.get_all()
    except Exception as exc:  # noqa: BLE001
        logger.warning("storage: failed listing experiments for %s: %s", team_id, exc)
        return per_user

    for exp in experiments_data:
        experiment_id = exp.get("id")
        if not experiment_id:
            continue
        try:
            jobs = await job_service.jobs_get_all(experiment_id)
        except Exception:  # noqa: BLE001
            continue
        for job in jobs or []:
            job_id = str(job.get("id"))
            job_data = job.get("job_data") or {}
            if isinstance(job_data, str):
                try:
                    job_data = json.loads(job_data)
                except Exception:  # noqa: BLE001
                    job_data = {}
            user_info = job_data.get("user_info") or {}
            owner = user_info.get("id") or user_info.get("email")
            if not owner:
                continue
            size = 0
            for path in (
                await _resolve(get_job_dir(job_id, experiment_id)),
                get_local_provider_job_dir(job_id, team_id),
            ):
                try:
                    size += await storage.du(path)
                except Exception:  # noqa: BLE001
                    continue
            if size:
                per_user[owner] = per_user.get(owner, 0) + size
    return per_user


async def compute_org_storage(team_id: str) -> Dict[str, Any]:
    """Compute total + category breakdown + per-user bytes for one org."""
    set_organization_id(team_id)

    breakdown: Dict[str, int] = {}
    breakdown["workspace_models"] = await storage.du(await _resolve(get_models_dir()))
    breakdown["workspace_datasets"] = await storage.du(await _resolve(get_datasets_dir()))
    breakdown["workspace_experiments"] = await storage.du(await _resolve(get_experiments_dir()))

    workspace_total = await storage.du(await _resolve(get_workspace_dir()))
    accounted = breakdown["workspace_models"] + breakdown["workspace_datasets"] + breakdown["workspace_experiments"]
    breakdown["workspace_other"] = max(workspace_total - accounted, 0)
    breakdown["local_provider_runs"] = await storage.du(get_local_provider_org_dir(team_id))

    total_bytes = workspace_total + breakdown["local_provider_runs"]
    per_user = await _compute_per_user_bytes(team_id)

    return {"total_bytes": total_bytes, "breakdown": breakdown, "per_user": per_user}


async def write_snapshot(session: AsyncSession, team_id: str, result: Dict[str, Any]) -> OrgStorageSnapshot:
    snapshot = OrgStorageSnapshot(
        team_id=team_id,
        total_bytes=int(result["total_bytes"]),
        breakdown_json=json.dumps(result["breakdown"]),
        per_user_json=json.dumps(result["per_user"]),
        scanned_at=utc_now_naive(),
    )
    session.add(snapshot)
    await session.commit()
    await session.refresh(snapshot)
    return snapshot


async def get_latest_snapshot(session: AsyncSession, team_id: str) -> Optional[OrgStorageSnapshot]:
    stmt = (
        select(OrgStorageSnapshot)
        .where(OrgStorageSnapshot.team_id == team_id)
        .order_by(OrgStorageSnapshot.scanned_at.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


# Tracks (team_id, scope) currently in "alerted" state to avoid spamming each tick.
_armed_alerts: set[tuple] = set()


def _env_gb_to_bytes(var: str) -> Optional[int]:
    raw = os.environ.get(var)
    if raw is None or raw.strip() == "":
        return None
    try:
        return int(float(raw) * _BYTES_PER_GB)
    except ValueError:
        return None


async def get_global_per_org_limit_bytes(session: AsyncSession) -> Optional[int]:
    env_val = _env_gb_to_bytes("TFL_STORAGE_GLOBAL_PER_ORG_LIMIT_GB")
    if env_val is not None:
        return env_val
    raw = await config_get("storage_global_per_org_limit_bytes")
    return int(raw) if raw not in (None, "") else None


async def get_org_notify_threshold_bytes(session: AsyncSession, team_id: str) -> Optional[int]:
    raw = await config_get("storage_org_notify_threshold_bytes", team_id=team_id)
    return int(raw) if raw not in (None, "") else None


async def get_user_notify_threshold_bytes(session: AsyncSession, team_id: str) -> Optional[int]:
    raw = await config_get("storage_user_notify_threshold_bytes", team_id=team_id)
    return int(raw) if raw not in (None, "") else None


async def get_active_alerts(session: AsyncSession, team_id: str) -> list[dict]:
    """Return active storage alerts for a team as a list of dicts with keys
    scope, subject, used_bytes, limit_bytes. Scopes: 'global', 'org', 'user'."""
    snapshot = await get_latest_snapshot(session, team_id)
    alerts: list[dict] = []
    if snapshot is None:
        return alerts
    global_limit = await get_global_per_org_limit_bytes(session)
    if global_limit and snapshot.total_bytes >= global_limit:
        alerts.append(
            {
                "scope": "global",
                "subject": team_id,
                "used_bytes": snapshot.total_bytes,
                "limit_bytes": global_limit,
            }
        )
    org_threshold = await get_org_notify_threshold_bytes(session, team_id)
    if org_threshold and snapshot.total_bytes >= org_threshold:
        alerts.append(
            {
                "scope": "org",
                "subject": team_id,
                "used_bytes": snapshot.total_bytes,
                "limit_bytes": org_threshold,
            }
        )
    user_threshold = await get_user_notify_threshold_bytes(session, team_id)
    if user_threshold:
        per_user = _safe_json_loads(snapshot.per_user_json)
        for user_id, used in per_user.items():
            if used >= user_threshold:
                alerts.append(
                    {
                        "scope": "user",
                        "subject": user_id,
                        "used_bytes": used,
                        "limit_bytes": user_threshold,
                    }
                )
    return alerts


async def set_thresholds(
    team_id: str,
    org_threshold_bytes: Optional[int],
    user_threshold_bytes: Optional[int],
) -> None:
    """Set the org/user notify thresholds for a team. A ``None`` value clears the
    threshold (stored as an empty string, which the getters treat as unset), so the
    UI can disable a threshold by submitting an empty field."""
    await config_set(
        "storage_org_notify_threshold_bytes",
        "" if org_threshold_bytes is None else str(org_threshold_bytes),
        team_id=team_id,
    )
    await config_set(
        "storage_user_notify_threshold_bytes",
        "" if user_threshold_bytes is None else str(user_threshold_bytes),
        team_id=team_id,
    )


async def _send_storage_alert(*, team_id: str, scope: str, subject: str, used_bytes: int, limit_bytes: int) -> None:
    """Fire a webhook alert via the existing notification machinery."""
    try:
        from transformerlab.services import notification_service

        await notification_service.send_storage_alert(
            team_id=team_id,
            scope=scope,
            subject=subject,
            used_gb=gb(used_bytes),
            limit_gb=gb(limit_bytes),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("storage: failed sending alert for %s/%s: %s", team_id, scope, exc)


async def evaluate_thresholds(session: AsyncSession, snapshot: OrgStorageSnapshot) -> None:
    """Compare a snapshot to org/user thresholds; fire alerts on a new crossing, re-arm on drop."""
    team_id = snapshot.team_id

    org_threshold = await get_org_notify_threshold_bytes(session, team_id)
    org_key = (team_id, "org")
    if org_threshold and snapshot.total_bytes >= org_threshold:
        if org_key not in _armed_alerts:
            _armed_alerts.add(org_key)
            await _send_storage_alert(
                team_id=team_id,
                scope="org",
                subject=team_id,
                used_bytes=snapshot.total_bytes,
                limit_bytes=org_threshold,
            )
    else:
        _armed_alerts.discard(org_key)

    user_threshold = await get_user_notify_threshold_bytes(session, team_id)
    if user_threshold:
        try:
            per_user = json.loads(snapshot.per_user_json or "{}")
        except Exception:  # noqa: BLE001
            per_user = {}
        for user_id, used in per_user.items():
            user_key = (team_id, f"user:{user_id}")
            if used >= user_threshold:
                if user_key not in _armed_alerts:
                    _armed_alerts.add(user_key)
                    await _send_storage_alert(
                        team_id=team_id,
                        scope="user",
                        subject=user_id,
                        used_bytes=used,
                        limit_bytes=user_threshold,
                    )
            else:
                _armed_alerts.discard(user_key)


async def check_storage_within_limit(session: AsyncSession, team_id: str) -> tuple[bool, str]:
    """Return (allowed, message). Blocks only when the org's latest snapshot is at/over
    the global per-org cap. Fails open if no limit is set or no snapshot exists yet."""
    limit = await get_global_per_org_limit_bytes(session)
    if not limit:
        return True, ""
    snapshot = await get_latest_snapshot(session, team_id)
    if snapshot is None:
        logger.warning("storage: no snapshot for %s yet; allowing launch (fail-open)", team_id)
        return True, ""
    if snapshot.total_bytes >= limit:
        return (
            False,
            f"Org storage ({gb(snapshot.total_bytes)} GB) exceeds the global limit "
            f"({gb(limit)} GB). Free space before launching new jobs.",
        )
    return True, ""
