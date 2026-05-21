from lab.job import _append_status_to_history
from transformerlab.services.job_service import _backfill_status_history


def test_append_creates_list_on_first_call():
    history = _append_status_to_history(None, "QUEUED")
    assert len(history) == 1
    assert history[0]["status"] == "QUEUED"
    assert isinstance(history[0]["timestamp_ms"], int)


def test_append_adds_monotonic_entries():
    history = _append_status_to_history(None, "QUEUED")
    history = _append_status_to_history(history, "RUNNING")
    assert [h["status"] for h in history] == ["QUEUED", "RUNNING"]
    assert history[0]["timestamp_ms"] <= history[1]["timestamp_ms"]


def test_append_dedupes_adjacent_same_status():
    history = _append_status_to_history(None, "LAUNCHING")
    history = _append_status_to_history(history, "LAUNCHING")
    assert len(history) == 1, "duplicate adjacent LAUNCHING should be ignored"


def test_append_tolerates_non_list_existing_value():
    history = _append_status_to_history("not-a-list", "QUEUED")
    assert len(history) == 1
    assert history[0]["status"] == "QUEUED"


def test_backfill_synthesizes_running_and_terminal_from_end_time():
    json_data = {
        "status": "COMPLETE",
        "job_data": {
            "end_time": "2026-05-21 18:53:45",
            "status_history": [{"status": "LAUNCHING", "timestamp_ms": 1779389552000}],
            "launch_progress": {
                "steps": [
                    {"timestamp": "2026-05-21 18:52:58", "phase": "cluster_started"},
                ]
            },
        },
    }
    out = _backfill_status_history(json_data)
    h = out["job_data"]["status_history"]
    assert [e["status"] for e in h] == ["LAUNCHING", "RUNNING", "COMPLETE"]
    # RUNNING timestamp comes from the last launch step (18:52:58 UTC)
    assert h[1]["timestamp_ms"] == 1779389578000
    # COMPLETE timestamp comes from end_time (18:53:45 UTC)
    assert h[2]["timestamp_ms"] == 1779389625000


def test_backfill_skips_when_already_terminal():
    json_data = {
        "status": "COMPLETE",
        "job_data": {
            "end_time": "2026-05-21 18:53:45",
            "status_history": [
                {"status": "LAUNCHING", "timestamp_ms": 1779389552000},
                {"status": "COMPLETE", "timestamp_ms": 1779389625000},
            ],
        },
    }
    out = _backfill_status_history(json_data)
    assert out["job_data"]["status_history"] == json_data["job_data"]["status_history"]


def test_backfill_skips_non_terminal_jobs():
    json_data = {
        "status": "RUNNING",
        "job_data": {
            "end_time": "2026-05-21 18:53:45",
            "status_history": [{"status": "LAUNCHING", "timestamp_ms": 1779389552000}],
        },
    }
    out = _backfill_status_history(json_data)
    assert out["job_data"]["status_history"] == [{"status": "LAUNCHING", "timestamp_ms": 1779389552000}]


def test_backfill_no_op_without_end_time():
    json_data = {
        "status": "COMPLETE",
        "job_data": {
            "status_history": [{"status": "LAUNCHING", "timestamp_ms": 1779389552000}],
        },
    }
    out = _backfill_status_history(json_data)
    assert out["job_data"]["status_history"] == [{"status": "LAUNCHING", "timestamp_ms": 1779389552000}]
