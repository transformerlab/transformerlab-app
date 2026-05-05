"""Tests for job_service.job_delete and job_delete_all.

These regression tests cover the bug where:
- job_delete swallowed exceptions (silent failure, stale cache)
- The per-job cache was never invalidated after delete, so terminal-status
  jobs (COMPLETE/FAILED/STOPPED) cached for 7 days continued to appear in
  /jobs/list with their pre-delete status.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from transformerlab.services import job_service


@pytest.mark.asyncio
async def test_job_delete_invalidates_cache():
    """After job_delete the per-job cache key must be cleared."""
    fake_job = MagicMock()
    fake_job.delete = AsyncMock()

    with (
        patch.object(job_service, "_resolve_full_job_id", AsyncMock(return_value="abc123")),
        patch.object(job_service.Job, "get", AsyncMock(return_value=fake_job)),
        patch.object(job_service.cache, "invalidate", AsyncMock()) as mock_invalidate,
        patch.object(job_service.cache, "delete", AsyncMock()) as mock_delete_cache,
    ):
        await job_service.job_delete("abc123", experiment_id="exp1")

    fake_job.delete.assert_awaited_once()
    mock_invalidate.assert_awaited_once_with("job:abc123")
    mock_delete_cache.assert_awaited_once_with(job_service._job_cache_key("abc123"))


@pytest.mark.asyncio
async def test_job_delete_propagates_filenotfound():
    """job_delete must NOT swallow FileNotFoundError so the API can return 404."""
    with (
        patch.object(job_service, "_resolve_full_job_id", AsyncMock(return_value=None)),
        patch.object(
            job_service.Job,
            "get",
            AsyncMock(side_effect=FileNotFoundError("no such job")),
        ),
    ):
        with pytest.raises(FileNotFoundError):
            await job_service.job_delete("missing", experiment_id="exp1")


@pytest.mark.asyncio
async def test_job_delete_all_invalidates_cache_for_each_job():
    """job_delete_all must invalidate the per-job cache for every job."""
    fake_experiment = MagicMock()
    fake_experiment.delete_all_jobs = AsyncMock()

    with (
        patch.object(
            job_service,
            "_list_experiment_job_ids",
            AsyncMock(return_value=["jobA", "jobB", "jobC"]),
        ),
        patch.object(job_service, "Experiment", return_value=fake_experiment),
        patch.object(job_service.cache, "invalidate", AsyncMock()) as mock_invalidate,
        patch.object(job_service.cache, "delete", AsyncMock()) as mock_delete_cache,
    ):
        deleted = await job_service.job_delete_all(experiment_id="exp1")

    assert deleted == 3
    fake_experiment.delete_all_jobs.assert_awaited_once()
    assert mock_invalidate.await_count == 3
    assert mock_delete_cache.await_count == 3
    invalidated_tags = {call.args[0] for call in mock_invalidate.await_args_list}
    assert invalidated_tags == {"job:jobA", "job:jobB", "job:jobC"}


@pytest.mark.asyncio
async def test_job_delete_all_handles_empty_experiment():
    """job_delete_all on an empty experiment returns 0 and doesn't error."""
    fake_experiment = MagicMock()
    fake_experiment.delete_all_jobs = AsyncMock()

    with (
        patch.object(job_service, "_list_experiment_job_ids", AsyncMock(return_value=[])),
        patch.object(job_service, "Experiment", return_value=fake_experiment),
        patch.object(job_service.cache, "invalidate", AsyncMock()) as mock_invalidate,
    ):
        deleted = await job_service.job_delete_all(experiment_id="exp1")

    assert deleted == 0
    mock_invalidate.assert_not_awaited()


@pytest.mark.asyncio
async def test_job_delete_all_returns_zero_for_none_experiment():
    """Passing None as experiment_id should return 0 without side effects."""
    with patch.object(job_service.cache, "invalidate", AsyncMock()) as mock_invalidate:
        deleted = await job_service.job_delete_all(experiment_id=None)

    assert deleted == 0
    mock_invalidate.assert_not_awaited()
