"""Background worker that sends webhook notifications for terminal jobs.

Follows the same pattern as remote_job_status_service.py.

Runs every NOTIFICATION_WORKER_INTERVAL_SECONDS (default 30s). For each org,
iterates experiments, finds COMPLETE/FAILED/STOPPED jobs that have
created_by_user_id in job_data but no notification_sent flag, and POSTs a
rich JSON payload to the user's configured webhook URL.

Key design note: jobs_get_all reads from a cached jobs.json and will NOT
reflect freshly-written job_data fields. We always re-read each candidate job
via job_service.job_get (uncached individual file read) before checking
notification_sent, so we never double-send.
"""

import asyncio
import os
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx
from lab import Experiment
from lab.dirs import set_organization_id as lab_set_org_id
from lab.job_status import JobStatus
from urllib.parse import urlparse


import transformerlab.db.db as db
from transformerlab.services import job_service, team_service
from transformerlab.services.background_scheduler import run_periodic_worker

NOTIFICATION_WORKER_INTERVAL_SECONDS = int(os.getenv("NOTIFICATION_WORKER_INTERVAL_SECONDS", "30"))

TERMINAL_STATUSES = (
    JobStatus.COMPLETE.value,
    JobStatus.FAILED.value,
    JobStatus.STOPPED.value,
)

_notification_worker_task: Optional[asyncio.Task] = None


# ---------------------------------------------------------------------------
# Org context helpers (same pattern as remote_job_status_service.py)
# ---------------------------------------------------------------------------


def _set_org_context(org_id: Optional[str]) -> None:
    if lab_set_org_id is not None:
        lab_set_org_id(org_id)


def _clear_org_context() -> None:
    _set_org_context(None)


async def _list_all_org_ids() -> List[str]:
    try:
        return await team_service.get_all_team_ids()
    except Exception as exc:  # noqa: BLE001
        print(f"Notification worker: failed listing orgs: {exc}")
        return []


async def _list_experiment_ids_for_current_org() -> List[str]:
    try:
        experiments_data = await Experiment.get_all()
    except Exception as exc:  # noqa: BLE001
        print(f"Notification worker: failed getting experiments: {exc}")
        return []
    return [str(exp.get("id")) for exp in experiments_data if exp.get("id")]


# ---------------------------------------------------------------------------
# Payload builder
# ---------------------------------------------------------------------------


async def _get_experiment_name(experiment_id: str) -> str:
    """Resolve experiment name. Falls back to experiment_id string."""
    try:
        exp = Experiment(experiment_id)
        exp_data = await exp.get_info()
        return exp_data.get("name") or experiment_id
    except Exception:  # noqa: BLE001
        return experiment_id


def _build_webhook_payload(job: Dict[str, Any], experiment_name: str) -> Dict[str, Any]:
    """Build the JSON payload to POST to the webhook."""
    job_data = job.get("job_data") or {}

    # Duration: all terminal transitions write end_time (no stop_time key exists)
    start_time = job_data.get("start_time")
    end_time = job_data.get("end_time")
    duration_seconds: Optional[int] = None
    if start_time and end_time:
        try:
            fmt = "%Y-%m-%d %H:%M:%S"
            start_dt = datetime.strptime(start_time, fmt)
            end_dt = datetime.strptime(end_time, fmt)
            duration_seconds = max(0, int((end_dt - start_dt).total_seconds()))
        except Exception:  # noqa: BLE001
            pass

    error_message = job_data.get("error_msg") or job_data.get("error_message")

    return {
        "job_id": str(job.get("id", "")),
        "status": job.get("status", ""),
        "job_type": job.get("type", ""),
        "experiment_name": experiment_name,
        "started_at": start_time,
        "finished_at": end_time,
        "duration_seconds": duration_seconds,
        "error_message": error_message,
    }


def build_notification_request_body(webhook_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    """Wrap the generic payload for common webhook providers (Discord, Slack, Teams, Zapier).

    - Discord requires a non-empty message (content or embeds).
    - Slack and Teams work well with a top-level `text` field.
    - Zapier can consume arbitrary JSON; we include both a human summary and the raw payload.
    """
    parsed = urlparse(webhook_url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or ""

    summary = (
        f"Job {payload.get('job_id')} {payload.get('status')} "
        f"({payload.get('job_type')}) in {payload.get('experiment_name')}"
    )

    # Discord webhooks
    if host == "discord.com" and path.startswith("/api/webhooks"):
        return {
            "content": summary,
            "embeds": [
                {
                    "title": "Job notification",
                    "fields": [
                        {"name": "Status", "value": str(payload.get("status")), "inline": True},
                        {"name": "Type", "value": str(payload.get("job_type")), "inline": True},
                        {"name": "Experiment", "value": str(payload.get("experiment_name")) or "-"},
                        {
                            "name": "Duration (s)",
                            "value": str(payload.get("duration_seconds"))
                            if payload.get("duration_seconds") is not None
                            else "-",
                            "inline": True,
                        },
                        {
                            "name": "Error",
                            "value": str(payload.get("error_message")) if payload.get("error_message") else "None",
                        },
                    ],
                },
            ],
        }

    # Slack incoming webhooks
    if host == "hooks.slack.com":
        text_lines = [
            summary,
            f"Started: {payload.get('started_at')}",
            f"Finished: {payload.get('finished_at')}",
        ]
        if payload.get("error_message"):
            text_lines.append(f"Error: {payload.get('error_message')}")
        text = "\n".join(text_lines)
        return {
            "text": text,
        }

    # Microsoft Teams incoming webhooks (and similar connectors)
    if host in {"outlook.office.com", "outlook.office365.com", "office.com"} and "/webhook" in path:
        return {
            "text": summary,
        }

    # Zapier: include both summary and raw payload so users can map fields easily.
    if host == "hooks.zapier.com":
        body: Dict[str, Any] = {"summary": summary}
        body.update(payload)
        return body

    # Default: send the payload as-is.
    return payload


# ---------------------------------------------------------------------------
# Notification processor
# ---------------------------------------------------------------------------


async def _process_notification(job: Dict[str, Any], experiment_id: str, org_id: str) -> None:
    """Send a webhook notification for a single terminal job if configured."""
    job_id = str(job.get("id", ""))
    job_data = job.get("job_data") or {}

    # 1. Check user attribution — skip silently for pre-feature jobs
    created_by_user_id = job_data.get("created_by_user_id")
    if not created_by_user_id:
        return

    # 2. Check notifications enabled
    enabled = await db.config_get("notification_enabled", user_id=created_by_user_id, team_id=org_id)
    if enabled != "true":
        return

    # 3. Get webhook URL
    webhook_url = await db.config_get("notification_webhook_url", user_id=created_by_user_id, team_id=org_id)
    if not webhook_url:
        return

    # 4. Build payload
    experiment_name = await _get_experiment_name(experiment_id)
    payload = _build_webhook_payload(job, experiment_name)

    # 5. POST to webhook (10s timeout)
    request_body = build_notification_request_body(webhook_url, payload)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(webhook_url, json=request_body)
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        print(f"Notification worker: webhook delivery failed for job {job_id}: {exc}")

    # 6. Mark as sent — always, even on delivery failure.
    #    This prevents retry spam; users can re-test via the Test button.
    await job_service.job_update_job_data_insert_key_value(job_id, "notification_sent", True, experiment_id)


# ---------------------------------------------------------------------------
# Main cycle
# ---------------------------------------------------------------------------


async def process_pending_notifications_once() -> Dict[str, int]:
    """Single cycle: find terminal jobs missing notification_sent and notify.

    Returns cycle statistics for logging.
    """
    stats: Dict[str, int] = {
        "orgs": 0,
        "jobs_seen": 0,
        "jobs_notified": 0,
        "errors": 0,
    }

    org_ids = await _list_all_org_ids()

    for org_id in org_ids:
        _set_org_context(org_id)
        try:
            # Track jobs we've already evaluated in this cycle for the current org/experiment.
            # This ensures we don't call _process_notification multiple times for the same job
            # when iterating over multiple terminal statuses. In production, jobs_get_all is
            # typically disjoint per-status, but tests may return the same job for each status.
            processed_job_ids_for_org: Dict[str, set[str]] = {}

            stats["orgs"] += 1
            experiment_ids = await _list_experiment_ids_for_current_org()

            for experiment_id in experiment_ids:
                processed_job_ids = processed_job_ids_for_org.setdefault(experiment_id, set())

                for status in TERMINAL_STATUSES:
                    try:
                        job_summaries = await job_service.jobs_get_all(experiment_id, status=status)
                    except Exception as exc:  # noqa: BLE001
                        print(
                            f"Notification worker: failed listing jobs for exp {experiment_id} status {status}: {exc}",
                        )
                        stats["errors"] += 1
                        continue

                    for job_summary in job_summaries:
                        job_id = str(job_summary.get("id", ""))
                        if not job_id:
                            continue

                        # Skip jobs we've already handled for this experiment in this cycle,
                        # regardless of status. This makes the worker idempotent across the
                        # TERMINAL_STATUSES loop and matches test expectations.
                        if job_id in processed_job_ids:
                            continue

                        # IMPORTANT: jobs_get_all reads from a cached jobs.json that
                        # does NOT reflect freshly-written job_data fields.
                        # Always re-read uncached so we see the current notification_sent.
                        job = await job_service.job_get(job_id)
                        if not job:
                            continue

                        job_data = job.get("job_data") or {}
                        if job_data.get("notification_sent"):
                            processed_job_ids.add(job_id)
                            continue  # already notified

                        stats["jobs_seen"] += 1
                        try:
                            await _process_notification(job, experiment_id, org_id)
                            processed_job_ids.add(job_id)
                            stats["jobs_notified"] += 1
                        except Exception as exc:  # noqa: BLE001
                            print(f"Notification worker: error processing job {job_id}: {exc}")
                            stats["errors"] += 1

        finally:
            _clear_org_context()

    return stats


# ---------------------------------------------------------------------------
# Worker lifecycle
# ---------------------------------------------------------------------------


async def _notification_worker_cycle() -> None:
    """Single scheduled cycle for the notification worker.

    Wrapped by the generic periodic worker loop to provide shared scheduling
    and error handling while keeping logging and stats local to this module.
    """
    stats = await process_pending_notifications_once()
    if stats["jobs_seen"] > 0 or stats["errors"] > 0:
        print(
            "Notification worker: cycle done — "
            f"orgs={stats['orgs']} "
            f"jobs_seen={stats['jobs_seen']} "
            f"jobs_notified={stats['jobs_notified']} "
            f"errors={stats['errors']}",
        )


async def _notification_worker_loop() -> None:
    try:
        await run_periodic_worker(
            name="Notification worker",
            interval_seconds=NOTIFICATION_WORKER_INTERVAL_SECONDS,
            cycle_fn=_notification_worker_cycle,
        )
    finally:
        # Ensure org context is always cleared when the worker stops
        _clear_org_context()


async def start_notification_worker() -> None:
    global _notification_worker_task
    if _notification_worker_task and not _notification_worker_task.done():
        return
    _notification_worker_task = asyncio.create_task(_notification_worker_loop(), name="notification-worker")


async def stop_notification_worker() -> None:
    global _notification_worker_task
    if _notification_worker_task and not _notification_worker_task.done():
        _notification_worker_task.cancel()
        try:
            await _notification_worker_task
        except asyncio.CancelledError:
            pass
    _notification_worker_task = None
