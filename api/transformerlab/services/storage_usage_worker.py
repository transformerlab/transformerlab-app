"""Daily background worker that snapshots per-team storage usage.

Runs every ``STORAGE_USAGE_WORKER_INTERVAL_SECONDS`` (default 86400 = daily) on
the leader process only. Each cycle reads live usage from CloudWatch and
persists one snapshot per team (see :func:`snapshot_storage_usage`); it no-ops
cheaply on non-AWS providers. A daily cadence matches the data — CloudWatch's
``BucketSizeBytes`` only updates about once a day.
"""

import asyncio
import logging
import os
from typing import Optional

from transformerlab.db.session import async_session
from transformerlab.services.storage_usage_snapshot_service import snapshot_storage_usage

logger = logging.getLogger(__name__)

STORAGE_USAGE_WORKER_INTERVAL_SECONDS = int(os.getenv("STORAGE_USAGE_WORKER_INTERVAL_SECONDS", str(24 * 60 * 60)))

_storage_usage_worker_task: Optional[asyncio.Task] = None


async def run_storage_usage_snapshot_once() -> None:
    """Run a single snapshot cycle in its own DB session."""
    async with async_session() as session:
        result = await snapshot_storage_usage(session)

    if result.supported:
        logger.info(
            "Storage usage worker: snapshot written for %d teams (%d bytes total)",
            result.teams_written,
            result.total_bytes,
        )
    else:
        logger.info("Storage usage worker: skipped (%s)", result.message)


async def _storage_usage_worker_loop() -> None:
    logger.info("Storage usage worker: started (interval=%ss)", STORAGE_USAGE_WORKER_INTERVAL_SECONDS)
    try:
        while True:
            try:
                await run_storage_usage_snapshot_once()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                # Never let one bad cycle kill the worker.
                logger.warning("Storage usage worker: cycle failed, continuing: %s", exc)
            await asyncio.sleep(STORAGE_USAGE_WORKER_INTERVAL_SECONDS)
    except asyncio.CancelledError:
        logger.info("Storage usage worker: stopping")
        raise


async def start_storage_usage_worker() -> None:
    global _storage_usage_worker_task
    if _storage_usage_worker_task and not _storage_usage_worker_task.done():
        return
    _storage_usage_worker_task = asyncio.create_task(_storage_usage_worker_loop(), name="storage-usage-worker")


async def stop_storage_usage_worker() -> None:
    global _storage_usage_worker_task
    if _storage_usage_worker_task and not _storage_usage_worker_task.done():
        _storage_usage_worker_task.cancel()
        try:
            await _storage_usage_worker_task
        except asyncio.CancelledError:
            pass
    _storage_usage_worker_task = None
