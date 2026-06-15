"""Tests for the storage usage background worker wiring.

The snapshot logic itself is covered in test_storage_usage_snapshot_service.py;
here we only verify the worker plumbing (session handling + task lifecycle).
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from transformerlab.services import storage_usage_worker as worker
from transformerlab.services.storage_usage_snapshot_service import SnapshotResult


class _FakeSessionCtx:
    """Minimal async context manager standing in for async_session()."""

    def __init__(self, session):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *exc):
        return False


async def test_run_once_opens_session_and_calls_snapshot():
    sentinel_session = object()
    snapshot_mock = AsyncMock(return_value=SnapshotResult(supported=True, teams_written=2, total_bytes=10))

    with (
        patch.object(worker, "async_session", MagicMock(return_value=_FakeSessionCtx(sentinel_session))),
        patch.object(worker, "snapshot_storage_usage", snapshot_mock),
    ):
        await worker.run_storage_usage_snapshot_once()

    snapshot_mock.assert_awaited_once_with(sentinel_session)


async def test_start_and_stop_worker_lifecycle():
    run_mock = AsyncMock()
    with patch.object(worker, "run_storage_usage_snapshot_once", run_mock):
        await worker.start_storage_usage_worker()
        # Let the loop run its first immediate cycle before it sleeps.
        await asyncio.sleep(0)
        await asyncio.sleep(0)

        assert worker._storage_usage_worker_task is not None
        run_mock.assert_awaited()  # ran at least one cycle

        await worker.stop_storage_usage_worker()
        assert worker._storage_usage_worker_task is None
