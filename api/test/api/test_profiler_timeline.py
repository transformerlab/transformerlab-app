from __future__ import annotations

import time
from collections import deque

import pytest

from transformerlab.services import profiler_service


@pytest.fixture(autouse=True)
def reset_profiler_runs():
    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS.clear()
    yield
    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS.clear()


def test_get_profiler_run_timeline_non_nsys_uses_generic_timeline(tmp_path):
    run_id = "run_ncu_generic"
    run_directory = tmp_path / run_id
    run_directory.mkdir()
    log_path = run_directory / "run.log"
    log_path.write_text("launching profiler\ncollecting metrics\n", encoding="utf-8")

    started_at = time.time() - 2
    completed_at = time.time()

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "ncu",
            "status": "completed",
            "command": ["ncu", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(log_path),
            "output_path": str(run_directory / "profile.ncu-rep"),
            "created_at": started_at,
            "started_at": started_at,
            "completed_at": completed_at,
            "return_code": 0,
            "pid": 1234,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": None,
            "source": "manual",
            "associated_job_id": None,
        }

    response = profiler_service.get_profiler_run_timeline(run_id, max_lanes=4, max_events=200)

    assert response["run_id"] == run_id
    assert response["profiler_id"] == "ncu"
    timeline = response["timeline"]
    assert timeline["source"] == "ncu-generic"
    assert timeline["range_ms"] > 0
    assert len(timeline["lanes"]) >= 1
    assert timeline["lanes"][0]["name"] == "Run lifecycle"


def test_get_profiler_run_timeline_rocprof_parses_csv_events(tmp_path):
    run_id = "run_rocprof_csv"
    run_directory = tmp_path / run_id
    run_directory.mkdir()
    csv_path = run_directory / "profile.csv"
    csv_path.write_text(
        "start_ns,duration_ns,kernelName\n1000000,500000,kernel_a\n2000000,300000,kernel_b\n",
        encoding="utf-8",
    )
    log_path = run_directory / "run.log"
    log_path.write_text("rocprof finished\n", encoding="utf-8")

    started_at = time.time() - 1
    completed_at = time.time()

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "rocprof",
            "status": "completed",
            "command": ["rocprof", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(log_path),
            "output_path": str(csv_path),
            "created_at": started_at,
            "started_at": started_at,
            "completed_at": completed_at,
            "return_code": 0,
            "pid": 4321,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": None,
            "source": "manual",
            "associated_job_id": None,
        }

    response = profiler_service.get_profiler_run_timeline(run_id, max_lanes=6, max_events=200)
    timeline = response["timeline"]

    assert timeline["source"] == "rocprof-generic"
    all_events = [event for lane in timeline["lanes"] for event in lane.get("events", [])]
    assert any("kernel_a" in str(event.get("label", "")) for event in all_events)
    assert all(float(event.get("duration_ms", 0)) > 0 for event in all_events)


def test_get_profiler_run_timeline_nsys_falls_back_when_native_extract_fails(tmp_path):
    run_id = "run_nsys_fallback"
    run_directory = tmp_path / run_id
    run_directory.mkdir()
    log_path = run_directory / "run.log"
    log_path.write_text("nsys export unavailable\n", encoding="utf-8")

    started_at = time.time() - 3
    completed_at = time.time() - 1

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "nsys",
            "status": "completed",
            "command": ["nsys", "profile", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(log_path),
            "output_path": str(run_directory / "missing.nsys-rep"),
            "created_at": started_at,
            "started_at": started_at,
            "completed_at": completed_at,
            "return_code": 0,
            "pid": 5678,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": None,
            "source": "manual",
            "associated_job_id": None,
        }

    response = profiler_service.get_profiler_run_timeline(run_id, max_lanes=4, max_events=200)
    timeline = response["timeline"]
    assert timeline["source"] == "nsys-generic"
    assert timeline["range_ms"] > 0


def test_mark_managed_run_finished_sigterm_maps_to_stopped(tmp_path):
    run_id = "run_stopped_managed"
    run_directory = tmp_path / run_id
    run_directory.mkdir()

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "ncu",
            "status": "running",
            "command": ["ncu", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(run_directory / "run.log"),
            "output_path": str(run_directory / "profile.ncu-rep"),
            "created_at": time.time() - 5,
            "started_at": time.time() - 4,
            "completed_at": None,
            "return_code": None,
            "pid": 9999,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": None,
            "source": "managed",
            "associated_job_id": "267",
        }

    profiler_service.mark_managed_run_finished(run_id, -15)
    run = profiler_service.get_profiler_run(run_id)
    assert run["status"] == "stopped"
    assert run["return_code"] == -15


def test_get_profiler_run_maps_sigterm_to_stopped_when_polled(tmp_path):
    run_id = "run_stopped_manual"
    run_directory = tmp_path / run_id
    run_directory.mkdir()

    class _DummyProcess:
        def poll(self):
            return -15

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "ncu",
            "status": "running",
            "command": ["ncu", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(run_directory / "run.log"),
            "output_path": str(run_directory / "profile.ncu-rep"),
            "created_at": time.time() - 5,
            "started_at": time.time() - 4,
            "completed_at": None,
            "return_code": None,
            "pid": 10001,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": _DummyProcess(),
            "source": "manual",
            "associated_job_id": None,
        }

    run = profiler_service.get_profiler_run(run_id)
    assert run["status"] == "stopped"
    assert run["return_code"] == -15


def test_get_profiler_run_normalizes_existing_failed_sigterm_to_stopped(tmp_path):
    run_id = "run_failed_but_stopped"
    run_directory = tmp_path / run_id
    run_directory.mkdir()

    with profiler_service._RUNS_LOCK:
        profiler_service._RUNS[run_id] = {
            "run_id": run_id,
            "profiler_id": "ncu",
            "status": "failed",
            "command": ["ncu", "python", "main.py"],
            "run_directory": str(run_directory),
            "working_directory": str(tmp_path),
            "log_path": str(run_directory / "run.log"),
            "output_path": str(run_directory / "profile.ncu-rep"),
            "created_at": time.time() - 5,
            "started_at": time.time() - 4,
            "completed_at": time.time() - 3,
            "return_code": -15,
            "pid": 10002,
            "error": None,
            "last_lines": deque(maxlen=400),
            "stop_requested": False,
            "process": None,
            "source": "inference_worker",
            "associated_job_id": "267",
        }

    run = profiler_service.get_profiler_run(run_id)
    assert run["status"] == "stopped"
    assert run["return_code"] == -15
