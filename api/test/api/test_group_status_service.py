import pytest
from unittest.mock import AsyncMock
from lab.job_status import JobStatus
from transformerlab.services.group_status_service import (
    compute_parent_group_counts,
    apply_parent_group_updates,
    refresh_group_parent,
)


def test_counts_all_complete():
    parent = {"job_data": {"group_total": 3}}
    children = [
        {"status": JobStatus.COMPLETE},
        {"status": JobStatus.COMPLETE},
        {"status": JobStatus.COMPLETE},
    ]
    counts = compute_parent_group_counts(parent, children)
    assert counts["group_completed"] == 3
    assert counts["group_failed"] == 0
    assert counts["group_running"] == 0
    assert counts["group_queued"] == 0
    assert counts["group_progress"] == 100


def test_counts_mixed():
    parent = {"job_data": {"group_total": 4}}
    children = [
        {"status": JobStatus.COMPLETE},
        {"status": JobStatus.FAILED},
        {"status": JobStatus.RUNNING},
        {"status": JobStatus.QUEUED},
    ]
    counts = compute_parent_group_counts(parent, children)
    assert counts["group_completed"] == 1
    assert counts["group_failed"] == 1
    assert counts["group_running"] == 1
    assert counts["group_queued"] == 1
    assert counts["group_progress"] == 25


def test_counts_stopping_is_running():
    parent = {"job_data": {"group_total": 2}}
    children = [{"status": "STOPPING"}, {"status": JobStatus.COMPLETE}]
    counts = compute_parent_group_counts(parent, children)
    assert counts["group_running"] == 1
    assert counts["group_completed"] == 1


def test_counts_cancelled_and_unauthorized_are_failed():
    parent = {"job_data": {"group_total": 2}}
    children = [{"status": "CANCELLED"}, {"status": "UNAUTHORIZED"}]
    counts = compute_parent_group_counts(parent, children)
    assert counts["group_failed"] == 2


def test_counts_zero_total():
    parent = {"job_data": {"group_total": 0}}
    counts = compute_parent_group_counts(parent, [])
    assert counts["group_progress"] == 0


@pytest.mark.asyncio
async def test_apply_marks_complete_when_all_done():
    from transformerlab.services import group_status_service

    update_calls = []

    async def fake_update_status(job_id, status, experiment_id=None):
        update_calls.append(("status", status))

    async def fake_update_kv(job_id, key, value, experiment_id):
        update_calls.append((key, value))

    async def fake_update_kvs(job_id, updates, experiment_id):
        update_calls.extend(updates.items())

    group_status_service.job_service.job_update_status = fake_update_status
    group_status_service.job_service.job_update_job_data_insert_key_value = fake_update_kv
    group_status_service.job_service.job_update_job_data_insert_key_values = fake_update_kvs
    group_status_service.job_service.job_update_group_progress = AsyncMock()

    parent = {
        "id": "p1",
        "status": JobStatus.RUNNING,
        "job_data": {
            "group_total": 2,
            "group_completed": 0,
            "group_failed": 0,
            "group_running": 0,
            "group_queued": 0,
            "group_progress": 0,
            "failure_policy": "continue",
            "failure_policy_applied": False,
        },
    }
    counts = {
        "group_total": 2,
        "group_completed": 2,
        "group_failed": 0,
        "group_running": 0,
        "group_queued": 0,
        "group_progress": 100,
    }
    await apply_parent_group_updates(parent, "exp-1", counts, child_jobs=[])

    status_updates = [v for k, v in update_calls if k == "status"]
    assert JobStatus.COMPLETE in status_updates


@pytest.mark.asyncio
async def test_apply_stop_all_marks_parent_failed():
    from transformerlab.services import group_status_service

    stopped_jobs = []
    status_updates = []

    async def fake_job_stop(job_id, experiment_id):
        stopped_jobs.append(job_id)

    async def fake_update_status(job_id, status, experiment_id=None):
        status_updates.append(status)

    async def fake_update_kv(job_id, key, value, experiment_id):
        pass

    async def fake_update_kvs(job_id, updates, experiment_id):
        pass

    group_status_service.job_service.job_stop = fake_job_stop
    group_status_service.job_service.job_update_status = fake_update_status
    group_status_service.job_service.job_update_job_data_insert_key_value = fake_update_kv
    group_status_service.job_service.job_update_job_data_insert_key_values = fake_update_kvs
    group_status_service.job_service.job_update_group_progress = AsyncMock()

    parent = {
        "id": "p1",
        "status": JobStatus.RUNNING,
        "job_data": {
            "group_total": 3,
            "group_completed": 0,
            "group_failed": 0,
            "group_running": 0,
            "group_queued": 0,
            "group_progress": 0,
            "failure_policy": "stop_all",
            "failure_policy_applied": False,
        },
    }
    counts = {
        "group_total": 3,
        "group_completed": 0,
        "group_failed": 1,
        "group_running": 1,
        "group_queued": 1,
        "group_progress": 0,
    }
    child_jobs = [
        {"id": "c1", "status": JobStatus.FAILED},
        {"id": "c2", "status": JobStatus.RUNNING},
        {"id": "c3", "status": JobStatus.QUEUED},
    ]
    await apply_parent_group_updates(parent, "exp-1", counts, child_jobs=child_jobs)

    assert JobStatus.FAILED in status_updates
    assert "c2" in stopped_jobs
    assert "c3" in stopped_jobs


@pytest.mark.asyncio
async def test_apply_stop_new_stops_queued_only():
    from transformerlab.services import group_status_service

    stopped_jobs = []
    status_updates = []

    async def fake_job_stop(job_id, experiment_id):
        stopped_jobs.append(job_id)

    async def fake_update_status(job_id, status, experiment_id=None):
        status_updates.append(status)

    async def fake_update_kv(job_id, key, value, experiment_id):
        pass

    async def fake_update_kvs(job_id, updates, experiment_id):
        pass

    group_status_service.job_service.job_stop = fake_job_stop
    group_status_service.job_service.job_update_status = fake_update_status
    group_status_service.job_service.job_update_job_data_insert_key_value = fake_update_kv
    group_status_service.job_service.job_update_job_data_insert_key_values = fake_update_kvs
    group_status_service.job_service.job_update_group_progress = AsyncMock()

    parent = {
        "id": "p1",
        "status": JobStatus.RUNNING,
        "job_data": {
            "group_total": 3,
            "group_completed": 0,
            "group_failed": 0,
            "group_running": 0,
            "group_queued": 0,
            "group_progress": 0,
            "failure_policy": "stop_new",
            "failure_policy_applied": False,
        },
    }
    counts = {
        "group_total": 3,
        "group_completed": 0,
        "group_failed": 1,
        "group_running": 1,
        "group_queued": 1,
        "group_progress": 0,
    }
    child_jobs = [
        {"id": "c1", "status": JobStatus.FAILED},
        {"id": "c2", "status": JobStatus.RUNNING},
        {"id": "c3", "status": JobStatus.QUEUED},
    ]
    await apply_parent_group_updates(parent, "exp-1", counts, child_jobs=child_jobs)

    assert "c3" in stopped_jobs
    assert "c2" not in stopped_jobs
    assert JobStatus.FAILED not in status_updates


@pytest.mark.asyncio
async def test_apply_failure_policy_not_reapplied_when_already_applied():
    from transformerlab.services import group_status_service

    stopped_jobs = []
    status_updates = []

    async def fake_job_stop(job_id, experiment_id):
        stopped_jobs.append(job_id)

    async def fake_update_status(job_id, status, experiment_id=None):
        status_updates.append(status)

    async def fake_update_kv(job_id, key, value, experiment_id):
        pass

    async def fake_update_kvs(job_id, updates, experiment_id):
        pass

    group_status_service.job_service.job_stop = fake_job_stop
    group_status_service.job_service.job_update_status = fake_update_status
    group_status_service.job_service.job_update_job_data_insert_key_value = fake_update_kv
    group_status_service.job_service.job_update_job_data_insert_key_values = fake_update_kvs
    group_status_service.job_service.job_update_group_progress = AsyncMock()

    # failure_policy_applied is already True — policy must NOT be applied again
    parent = {
        "id": "p1",
        "status": JobStatus.RUNNING,
        "job_data": {
            "group_total": 3,
            "group_completed": 0,
            "group_failed": 1,
            "group_running": 1,
            "group_queued": 1,
            "group_progress": 0,
            "failure_policy": "stop_all",
            "failure_policy_applied": True,
        },
    }
    counts = {
        "group_total": 3,
        "group_completed": 0,
        "group_failed": 1,
        "group_running": 1,
        "group_queued": 1,
        "group_progress": 0,
    }
    child_jobs = [
        {"id": "c1", "status": JobStatus.FAILED},
        {"id": "c2", "status": JobStatus.RUNNING},
        {"id": "c3", "status": JobStatus.QUEUED},
    ]
    await apply_parent_group_updates(parent, "exp-1", counts, child_jobs=child_jobs)

    # No job_stop calls should have been made
    assert stopped_jobs == []
    # Parent should NOT have been marked FAILED again
    assert JobStatus.FAILED not in status_updates


@pytest.mark.asyncio
async def test_refresh_skips_partial_group_job_ids():
    parent = {
        "id": "p1",
        "type": "GROUP",
        "status": JobStatus.RUNNING,
        "job_data": {
            "group_parent": True,
            "group_total": 3,
            "group_job_ids": ["c1"],
            "failure_policy": "continue",
            "failure_policy_applied": False,
        },
    }
    result = await refresh_group_parent(parent, "exp-1")
    assert result is None


@pytest.mark.asyncio
async def test_refresh_skips_non_group_job():
    parent = {"id": "p1", "type": "SWEEP", "job_data": {}}
    result = await refresh_group_parent(parent, "exp-1")
    assert result is None
