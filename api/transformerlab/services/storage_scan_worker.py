"""Background worker that periodically scans per-org storage usage."""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from transformerlab.db.session import async_session
from transformerlab.services.team_service import get_all_team_ids
from transformerlab.services.compute_provider import storage_usage_service

logger = logging.getLogger(__name__)

STORAGE_SCAN_INTERVAL_SECONDS = int(os.environ.get("TFL_STORAGE_SCAN_INTERVAL_SECONDS", "900"))

_worker_task: asyncio.Task | None = None


@asynccontextmanager
async def _session_scope():
    async with async_session() as session:
        yield session


async def scan_all_orgs_once() -> dict:
    stats = {"orgs": 0, "errors": 0}
    team_ids = await get_all_team_ids()
    logger.debug("storage scan: starting sweep over %d org(s)", len(team_ids))
    sweep_start = time.perf_counter()
    for team_id in team_ids:
        org_start = time.perf_counter()
        try:
            result = await storage_usage_service.compute_org_storage(team_id)
            async with _session_scope() as session:
                snapshot = await storage_usage_service.write_snapshot(session, team_id, result)
                await storage_usage_service.evaluate_thresholds(session, snapshot)
            stats["orgs"] += 1
            logger.debug(
                "storage scan: org %s done in %.2fs (total=%d bytes)",
                team_id,
                time.perf_counter() - org_start,
                result.get("total_bytes", 0),
            )
        except Exception as exc:  # noqa: BLE001
            stats["errors"] += 1
            logger.warning("storage scan: org %s failed after %.2fs: %s", team_id, time.perf_counter() - org_start, exc)
    logger.debug(
        "storage scan: sweep complete in %.2fs (orgs=%d errors=%d)",
        time.perf_counter() - sweep_start,
        stats["orgs"],
        stats["errors"],
    )
    return stats


async def _worker_loop() -> None:
    logger.info("Storage scan worker: started (interval=%ss)", STORAGE_SCAN_INTERVAL_SECONDS)
    try:
        while True:
            try:
                stats = await scan_all_orgs_once()
                logger.debug("Storage scan: orgs=%s errors=%s", stats["orgs"], stats["errors"])
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.debug("Storage scan: unhandled error, continuing: %s", exc)
            await asyncio.sleep(STORAGE_SCAN_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("Storage scan worker: stopping")
        raise


async def start_storage_scan_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        return
    _worker_task = asyncio.create_task(_worker_loop(), name="storage-scan-worker")


async def stop_storage_scan_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass
