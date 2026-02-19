from __future__ import annotations

import csv
import json
import os
import re
import shlex
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from collections import deque
from typing import Any, Optional

import torch
from lab import Job
from lab import storage
from lab.dirs import get_workspace_dir

from transformerlab.schemas.profiler import StartProfilerRunRequest

MAX_CACHED_LOG_LINES = 400
STOP_TIMEOUT_SECONDS = 5
DEFAULT_TIMELINE_MAX_LANES = 12
DEFAULT_TIMELINE_MAX_EVENTS = 2000
_STOPPED_RETURN_CODES = {-15, -9, 130, 137, 143}

_RUNS_LOCK = threading.Lock()
_RUNS: dict[str, dict[str, Any]] = {}
_INFERENCE_PROFILE_CONFIG: dict[str, Any] | None = None

_RUN_SUPPORTED_PROFILERS: dict[str, str] = {
    "nsys": "nsys",
    "ncu": "ncu",
    "nvprof": "nvprof",
    "rocprof": "rocprof",
    "rocprofv2": "rocprofv2",
}

_AUTO_PROFILER_PRIORITY: dict[str, list[str]] = {
    "nvidia": ["nsys", "ncu", "nvprof"],
    "amd": ["rocprofv2", "rocprof"],
    "gpu": ["nsys", "ncu", "rocprofv2", "rocprof", "nvprof"],
}


def _sanitize_name(value: Optional[str]) -> str:
    if not value:
        return "profile"
    safe_chars = []
    for c in value:
        if c.isalnum() or c in {"_", "-", "."}:
            safe_chars.append(c)
        else:
            safe_chars.append("_")
    cleaned = "".join(safe_chars).strip("._-")
    return cleaned or "profile"


def _detect_gpu_vendor() -> str:
    if not torch.cuda.is_available():
        # Fallback detection for environments where torch reports CPU but
        # vendor tooling is available (e.g., driver/runtime mismatch at startup).
        if shutil.which("nvidia-smi"):
            return "nvidia"
        if shutil.which("rocminfo") or shutil.which("rocm-smi"):
            return "amd"
        return "cpu"
    if getattr(torch.version, "hip", None):
        return "amd"
    if getattr(torch.version, "cuda", None):
        return "nvidia"
    return "gpu"


def get_auto_profiler_id() -> str | None:
    gpu_vendor = _detect_gpu_vendor()
    if gpu_vendor == "cpu":
        return None

    ordered_candidates = _AUTO_PROFILER_PRIORITY.get(gpu_vendor, _AUTO_PROFILER_PRIORITY["gpu"])
    for profiler_id in ordered_candidates:
        profiler_binary = _RUN_SUPPORTED_PROFILERS.get(profiler_id)
        if profiler_binary and shutil.which(profiler_binary):
            return profiler_id

    for profiler_id, profiler_binary in _RUN_SUPPORTED_PROFILERS.items():
        if shutil.which(profiler_binary):
            return profiler_id

    return None


def get_auto_profile_config() -> dict[str, Any] | None:
    profiler_id = get_auto_profiler_id()
    if not profiler_id:
        return None
    return normalize_profile_config(
        {
            "enabled": True,
            "profiler_id": profiler_id,
            "run_name": None,
            "extra_profiler_args": [],
        }
    )


def get_auto_profile_status() -> dict[str, Any]:
    gpu_vendor = _detect_gpu_vendor()
    selected_profiler = get_auto_profiler_id()
    if gpu_vendor == "cpu":
        return {
            "gpu_vendor": gpu_vendor,
            "enabled": False,
            "selected_profiler": None,
            "reason": "GPU not detected.",
        }
    if selected_profiler is None:
        return {
            "gpu_vendor": gpu_vendor,
            "enabled": False,
            "selected_profiler": None,
            "reason": "No supported GPU profiler binary is installed.",
        }
    return {
        "gpu_vendor": gpu_vendor,
        "enabled": True,
        "selected_profiler": selected_profiler,
        "reason": "",
    }


def normalize_profile_config(config: Optional[dict[str, Any]]) -> dict[str, Any]:
    if not config:
        return {"enabled": False}

    enabled = bool(config.get("enabled", True))
    profiler_id = str(config.get("profiler_id", "")).strip().lower()
    run_name = config.get("run_name")
    extra_profiler_args = config.get("extra_profiler_args", [])

    if not isinstance(extra_profiler_args, list):
        raise ValueError("extra_profiler_args must be a list of strings.")
    extra_profiler_args = [str(arg) for arg in extra_profiler_args]
    _validate_extra_args(extra_profiler_args)

    if enabled:
        if not profiler_id:
            raise ValueError("profiler_id is required when profiling is enabled.")
        if profiler_id not in _RUN_SUPPORTED_PROFILERS:
            raise ValueError(
                f"Profiler '{profiler_id}' is not supported. "
                f"Supported: {', '.join(sorted(_RUN_SUPPORTED_PROFILERS.keys()))}"
            )
        profiler_binary = _RUN_SUPPORTED_PROFILERS[profiler_id]
        if shutil.which(profiler_binary) is None:
            raise ValueError(f"Profiler executable not found: {profiler_binary}")

    return {
        "enabled": enabled,
        "profiler_id": profiler_id,
        "run_name": str(run_name).strip() if run_name is not None else None,
        "extra_profiler_args": extra_profiler_args,
    }


def _split_command(command: str) -> list[str]:
    if not command or not command.strip():
        raise ValueError("target_command is required")

    try:
        parts = shlex.split(command, posix=(os.name != "nt"))
    except ValueError as exc:
        raise ValueError(f"Invalid target command: {exc}") from exc

    if not parts:
        raise ValueError("target_command is required")

    shell_operators = {"|", "||", "&&", ";", ">", ">>", "<"}
    if any(part in shell_operators for part in parts):
        raise ValueError("Shell operators are not supported. Provide a direct executable command.")

    return parts


def _validate_extra_args(extra_args: list[str]) -> list[str]:
    shell_operators = {"|", "||", "&&", ";", ">", ">>", "<"}
    for arg in extra_args:
        if arg in shell_operators:
            raise ValueError("Shell operators are not allowed in extra profiler args.")
    return extra_args


def _output_hint(profiler_id: str, output_base: str) -> str:
    if profiler_id == "nsys":
        return output_base + ".nsys-rep"
    if profiler_id == "ncu":
        return output_base + ".ncu-rep"
    if profiler_id == "nvprof":
        return output_base + ".nvprof"
    if profiler_id == "rocprof":
        return output_base + ".csv"
    if profiler_id == "rocprofv2":
        return output_base
    return output_base


def _build_profiler_prefix(profiler_id: str, output_base: str, extra_args: list[str]) -> list[str]:
    if profiler_id == "nsys":
        return ["nsys", "profile", "--trace=cuda,nvtx", "-o", output_base, *extra_args]
    if profiler_id == "ncu":
        return ["ncu", "--target-processes", "all", "-o", output_base, *extra_args]
    if profiler_id == "nvprof":
        return ["nvprof", "--log-file", output_base + ".nvprof", *extra_args]
    if profiler_id == "rocprof":
        return ["rocprof", "--hip-trace", "--hsa-trace", "-o", output_base + ".csv", *extra_args]
    if profiler_id == "rocprofv2":
        return ["rocprofv2", "--hip-trace", "--hsa-trace", "-o", output_base, *extra_args]
    raise ValueError(f"Profiler '{profiler_id}' is not supported for in-app profiling runs.")


def _to_public_run(run: dict[str, Any]) -> dict[str, Any]:
    status = str(run["status"])
    return_code = run.get("return_code")
    if status == "failed" and isinstance(return_code, int) and return_code in _STOPPED_RETURN_CODES:
        status = "stopped"

    return {
        "run_id": run["run_id"],
        "profiler_id": run["profiler_id"],
        "status": status,
        "command": list(run["command"]),
        "run_directory": run["run_directory"],
        "working_directory": run["working_directory"],
        "log_path": run["log_path"],
        "output_path": run["output_path"],
        "created_at": run["created_at"],
        "started_at": run["started_at"],
        "completed_at": run.get("completed_at"),
        "return_code": return_code,
        "pid": run.get("pid"),
        "error": run.get("error"),
        "last_lines": list(run.get("last_lines", [])),
        "source": run.get("source", "manual"),
        "associated_job_id": run.get("associated_job_id"),
    }


def _append_log(run_id: str, line: str):
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return
        logs: deque[str] = run["last_lines"]
        logs.append(line.rstrip("\n"))


def _mark_finished(run_id: str, return_code: int):
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return

        if run.get("status") in {"completed", "failed", "stopped"}:
            return

        stop_requested = bool(run.get("stop_requested", False))
        if stop_requested:
            run["status"] = "stopped"
        elif return_code == 0:
            run["status"] = "completed"
        elif return_code in _STOPPED_RETURN_CODES:
            run["status"] = "stopped"
        else:
            run["status"] = "failed"
        run["return_code"] = return_code
        run["completed_at"] = time.time()
        run["process"] = None


def mark_managed_run_started(run_id: str, pid: Optional[int]) -> None:
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return
        run["pid"] = pid
        run["started_at"] = time.time()
        if run.get("status") == "created":
            run["status"] = "running"


def mark_managed_run_finished(run_id: str, return_code: int, error: Optional[str] = None) -> None:
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return
        if run.get("status") in {"completed", "failed", "stopped"}:
            return
        if return_code == 0:
            run["status"] = "completed"
        elif return_code in _STOPPED_RETURN_CODES:
            run["status"] = "stopped"
        else:
            run["status"] = "failed"
        run["return_code"] = return_code
        run["completed_at"] = time.time()
        if error:
            run["error"] = error


def _consume_process_output(run_id: str):
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if not run:
            return
        process: Optional[subprocess.Popen[str]] = run.get("process")
        log_path = run["log_path"]

    if process is None:
        return

    with open(log_path, "a", encoding="utf-8", errors="replace") as log_file:
        if process.stdout is not None:
            for line in iter(process.stdout.readline, ""):
                if line == "":
                    break
                log_file.write(line)
                log_file.flush()
                _append_log(run_id, line)

        return_code = process.wait()
        _mark_finished(run_id, return_code)


def _resolve_working_directory(workspace_dir: str, requested_dir: Optional[str]) -> str:
    workspace_abs = os.path.abspath(workspace_dir)
    if not requested_dir or not requested_dir.strip():
        return workspace_abs

    candidate = requested_dir.strip()
    resolved = candidate if os.path.isabs(candidate) else os.path.abspath(os.path.join(workspace_abs, candidate))
    resolved_abs = os.path.abspath(resolved)

    if os.path.commonpath([workspace_abs, resolved_abs]) != workspace_abs:
        raise ValueError("working_directory must be inside the workspace.")
    if not os.path.isdir(resolved_abs):
        raise ValueError(f"working_directory does not exist: {resolved_abs}")

    return resolved_abs


def get_profiler_run(run_id: str) -> dict[str, Any]:
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if run is None:
            raise ValueError(f"Profiler run not found: {run_id}")

        process: Optional[subprocess.Popen[str]] = run.get("process")
        if process is not None:
            poll_result = process.poll()
            if poll_result is not None:
                _mark_finished(run_id, poll_result)
                run = _RUNS.get(run_id, run)

        return _to_public_run(run)


def _resolve_string_lookup(connection: sqlite3.Connection) -> dict[int, str]:
    lookup: dict[int, str] = {}
    cursor = connection.cursor()
    try:
        tables = {
            row[0]
            for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            if row and row[0]
        }
        if "StringIds" in tables:
            for row in cursor.execute("SELECT id, value FROM StringIds").fetchall():
                if row is None or len(row) < 2:
                    continue
                key, value = row[0], row[1]
                if isinstance(key, int) and value is not None:
                    lookup[key] = str(value)
    except Exception:
        return {}
    return lookup


def _select_time_columns(columns: list[str]) -> tuple[str | None, str | None, str | None]:
    lowered = {col.lower(): col for col in columns}
    start_col = (
        lowered.get("start")
        or lowered.get("startns")
        or lowered.get("start_ns")
        or lowered.get("begin")
        or lowered.get("timestamp")
    )
    end_col = lowered.get("end") or lowered.get("endns") or lowered.get("end_ns") or lowered.get("finish")
    duration_col = (
        lowered.get("duration")
        or lowered.get("dur")
        or lowered.get("dur_ns")
        or lowered.get("durationns")
        or lowered.get("time")
    )
    return start_col, end_col, duration_col


def _choose_label_column(columns: list[str]) -> str | None:
    candidates = [
        "shortName",
        "demangledName",
        "name",
        "label",
        "text",
        "message",
        "symbolName",
        "kernelName",
        "value",
    ]
    lowered_map = {col.lower(): col for col in columns}
    for candidate in candidates:
        match = lowered_map.get(candidate.lower())
        if match:
            return match
    return None


def _normalize_timeline_value(value: Any, string_lookup: dict[int, str]) -> str:
    if value is None:
        return ""
    if isinstance(value, int) and value in string_lookup:
        return string_lookup[value]
    return str(value)


_TIMELINE_NUMBER_RE = re.compile(r"^\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)([a-zA-Z]*)\s*$")


def _parse_timeline_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        pass

    match = _TIMELINE_NUMBER_RE.match(text)
    if not match:
        return None
    amount = float(match.group(1))
    return amount


def _infer_column_multiplier_to_ms(columns: list[str], sample_magnitude: float) -> float:
    lower_columns = " ".join(column.lower() for column in columns)
    if (
        "nanosecond" in lower_columns
        or "start_ns" in lower_columns
        or "startns" in lower_columns
        or "end_ns" in lower_columns
        or "endns" in lower_columns
        or "dur_ns" in lower_columns
        or "durationns" in lower_columns
    ):
        return 1.0 / 1_000_000.0
    if (
        "microsecond" in lower_columns
        or "start_us" in lower_columns
        or "startus" in lower_columns
        or "end_us" in lower_columns
        or "endus" in lower_columns
        or "dur_us" in lower_columns
        or "durationus" in lower_columns
    ):
        return 1.0 / 1_000.0
    if "millisecond" in lower_columns or "start_ms" in lower_columns or "end_ms" in lower_columns:
        return 1.0
    if " second" in lower_columns or "(s)" in lower_columns or "_sec" in lower_columns:
        return 1000.0

    if sample_magnitude >= 1_000_000_000_000:
        return 1.0 / 1_000_000.0
    if sample_magnitude >= 1_000_000_000:
        return 1.0 / 1_000.0
    return 1.0


def _timeline_base_window_ms(run: dict[str, Any]) -> tuple[float, float]:
    started = _parse_timeline_number(run.get("started_at"))
    created = _parse_timeline_number(run.get("created_at"))
    completed = _parse_timeline_number(run.get("completed_at"))
    status = str(run.get("status", ""))
    now = time.time()

    base_seconds = started if started is not None else created
    if base_seconds is None:
        base_seconds = now

    if completed is not None:
        end_seconds = completed
    elif status in {"running", "stopping", "created"}:
        end_seconds = now
    else:
        end_seconds = base_seconds

    if end_seconds < base_seconds:
        end_seconds = base_seconds

    duration_ms = max((end_seconds - base_seconds) * 1000.0, 1.0)
    return base_seconds, duration_ms


def _collect_csv_timeline_candidates(run_directory: str, output_path: str) -> list[str]:
    candidates: list[str] = []
    seen: set[str] = set()

    def add_candidate(path: str):
        normalized = os.path.abspath(path)
        if normalized in seen:
            return
        if os.path.isfile(normalized) and normalized.lower().endswith(".csv"):
            seen.add(normalized)
            candidates.append(normalized)

    if output_path and os.path.isfile(output_path) and output_path.lower().endswith(".csv"):
        add_candidate(output_path)

    if output_path and os.path.isdir(output_path):
        for root, _, files in os.walk(output_path):
            for filename in files:
                if filename.lower().endswith(".csv"):
                    add_candidate(os.path.join(root, filename))

    if run_directory and os.path.isdir(run_directory):
        for root, _, files in os.walk(run_directory):
            for filename in files:
                if filename.lower().endswith(".csv"):
                    add_candidate(os.path.join(root, filename))

    return candidates


def _csv_lanes_from_run(
    run_directory: str,
    output_path: str,
    *,
    max_lanes: int,
    max_events: int,
) -> list[dict[str, Any]]:
    if max_lanes <= 0 or max_events <= 0:
        return []

    lanes: list[dict[str, Any]] = []
    remaining_events = max_events
    csv_paths = _collect_csv_timeline_candidates(run_directory, output_path)
    for csv_path in csv_paths:
        if len(lanes) >= max_lanes or remaining_events <= 0:
            break

        try:
            with open(csv_path, newline="", encoding="utf-8", errors="replace") as csv_file:
                reader = csv.DictReader(csv_file)
                if not reader.fieldnames:
                    continue
                fieldnames = [str(name) for name in reader.fieldnames if name is not None]
                if not fieldnames:
                    continue

                start_col, end_col, duration_col = _select_time_columns(fieldnames)
                if not start_col:
                    continue
                if not end_col and not duration_col:
                    continue

                label_col = _choose_label_column(fieldnames)
                sample_columns = [column for column in [start_col, end_col, duration_col] if column]
                raw_events: list[dict[str, Any]] = []
                min_start: float | None = None
                max_end: float | None = None
                largest_abs_value = 0.0

                for row in reader:
                    if remaining_events <= 0:
                        break
                    if row is None:
                        continue

                    start_raw = _parse_timeline_number(row.get(start_col))
                    if start_raw is None:
                        continue

                    end_raw: float | None = None
                    if end_col:
                        end_raw = _parse_timeline_number(row.get(end_col))
                    if end_raw is None and duration_col:
                        duration_raw = _parse_timeline_number(row.get(duration_col))
                        if duration_raw is not None:
                            end_raw = start_raw + duration_raw
                    if end_raw is None or end_raw <= start_raw:
                        continue

                    largest_abs_value = max(largest_abs_value, abs(start_raw), abs(end_raw))
                    if min_start is None or start_raw < min_start:
                        min_start = start_raw
                    if max_end is None or end_raw > max_end:
                        max_end = end_raw

                    raw_events.append(
                        {
                            "start_raw": start_raw,
                            "end_raw": end_raw,
                            "label": (str(row.get(label_col, "")).strip() if label_col else ""),
                        }
                    )
                    remaining_events -= 1

                if not raw_events or min_start is None or max_end is None or max_end <= min_start:
                    continue

                multiplier = _infer_column_multiplier_to_ms(sample_columns, largest_abs_value)
                timeline_events: list[dict[str, Any]] = []
                for index, event in enumerate(raw_events):
                    start_ms = (event["start_raw"] - min_start) * multiplier
                    duration_ms = (event["end_raw"] - event["start_raw"]) * multiplier
                    if duration_ms <= 0:
                        continue

                    label = event["label"] or os.path.basename(csv_path)
                    timeline_events.append(
                        {
                            "id": f"{os.path.basename(csv_path)}_{index}",
                            "label": label[:160],
                            "start_ms": round(max(start_ms, 0.0), 6),
                            "duration_ms": round(max(duration_ms, 0.001), 6),
                        }
                    )

                if timeline_events:
                    lane_name = (
                        os.path.relpath(csv_path, run_directory) if run_directory else os.path.basename(csv_path)
                    )
                    lanes.append(
                        {
                            "id": f"csv_{len(lanes)}",
                            "name": lane_name,
                            "events": timeline_events,
                        }
                    )
        except Exception:
            continue

    lanes.sort(key=lambda lane: len(lane["events"]), reverse=True)
    return lanes[:max_lanes]


def _log_lane(run: dict[str, Any], *, duration_ms: float, max_events: int) -> dict[str, Any] | None:
    if max_events <= 0:
        return None

    log_path = str(run.get("log_path", ""))
    if not log_path or not os.path.exists(log_path):
        return None

    last_lines: deque[str] = deque(maxlen=max_events)
    try:
        with open(log_path, encoding="utf-8", errors="replace") as log_file:
            for line in log_file:
                text = line.strip()
                if text:
                    last_lines.append(text)
    except Exception:
        return None

    if not last_lines:
        return None

    lines = list(last_lines)
    step_ms = max(duration_ms / max(len(lines), 1), 0.25)
    log_events: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        log_events.append(
            {
                "id": f"log_{index}",
                "label": line[:160],
                "start_ms": round(index * step_ms, 6),
                "duration_ms": round(max(step_ms * 0.9, 0.2), 6),
            }
        )

    return {
        "id": "run_log",
        "name": "Profiler log",
        "events": log_events,
    }


def _extract_generic_timeline(
    run: dict[str, Any],
    *,
    profiler_id: str,
    max_lanes: int,
    max_events: int,
) -> dict[str, Any]:
    _, duration_ms = _timeline_base_window_ms(run)
    run_status = str(run.get("status", "unknown"))
    source = str(run.get("source", "manual"))
    run_directory = str(run.get("run_directory", ""))
    output_path = str(run.get("output_path", ""))

    if max_lanes < 1:
        max_lanes = 1
    if max_events < 1:
        max_events = 1

    lanes: list[dict[str, Any]] = [
        {
            "id": "run_lifecycle",
            "name": "Run lifecycle",
            "events": [
                {
                    "id": "run_lifecycle_0",
                    "label": f"{profiler_id} ({run_status}) [{source}]",
                    "start_ms": 0.0,
                    "duration_ms": round(max(duration_ms, 0.001), 6),
                }
            ],
        }
    ]

    lanes_budget = max_lanes - len(lanes)
    events_budget = max_events - 1

    if lanes_budget > 0 and events_budget > 0:
        csv_lanes = _csv_lanes_from_run(
            run_directory,
            output_path,
            max_lanes=lanes_budget,
            max_events=events_budget,
        )
        lanes.extend(csv_lanes)
        lanes_budget = max_lanes - len(lanes)
        events_budget = max_events - sum(len(lane.get("events", [])) for lane in lanes)

    if lanes_budget > 0 and events_budget > 0:
        log_lane = _log_lane(run, duration_ms=duration_ms, max_events=events_budget)
        if log_lane:
            lanes.append(log_lane)

    max_timeline_end = 0.0
    for lane in lanes:
        for event in lane.get("events", []):
            end_ms = float(event.get("start_ms", 0.0)) + float(event.get("duration_ms", 0.0))
            max_timeline_end = max(max_timeline_end, end_ms)

    return {
        "source": f"{profiler_id}-generic",
        "unit": "ms",
        "range_ms": round(max(max_timeline_end, duration_ms, 1.0), 6),
        "lanes": lanes,
    }


def _try_export_nsys_sqlite(run_output_path: str, run_directory: str) -> str:
    nsys_binary = _RUN_SUPPORTED_PROFILERS["nsys"]
    if shutil.which(nsys_binary) is None:
        raise ValueError("Timeline export requires 'nsys' to be installed and on PATH.")

    export_base = os.path.join(run_directory, "timeline_export")
    sqlite_path = export_base + ".sqlite"

    if os.path.exists(sqlite_path) and os.path.getmtime(sqlite_path) >= os.path.getmtime(run_output_path):
        return sqlite_path

    commands = [
        [
            nsys_binary,
            "export",
            "--type",
            "sqlite",
            "--output",
            export_base,
            "--force-overwrite",
            "true",
            run_output_path,
        ],
        [
            nsys_binary,
            "export",
            "--type=sqlite",
            "--output",
            export_base,
            "--force-overwrite=true",
            run_output_path,
        ],
    ]

    last_error = ""
    for command in commands:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        if result.returncode == 0 and os.path.exists(sqlite_path):
            return sqlite_path
        last_error = f"{result.stdout}\n{result.stderr}".strip()

    raise ValueError(f"Failed to export nsys report to sqlite. {last_error}".strip())


def _extract_nsys_timeline(
    run_output_path: str,
    run_directory: str,
    *,
    max_lanes: int,
    max_events: int,
) -> dict[str, Any]:
    if not os.path.exists(run_output_path):
        raise ValueError(f"Profiler output does not exist: {run_output_path}")

    cache_path = os.path.join(run_directory, "timeline_cache.json")
    source_mtime = os.path.getmtime(run_output_path)
    if os.path.exists(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as cached_file:
                cached = json.load(cached_file)
            if (
                isinstance(cached, dict)
                and cached.get("source_path") == run_output_path
                and float(cached.get("source_mtime", -1.0)) == float(source_mtime)
            ):
                timeline_cached = cached.get("timeline")
                if isinstance(timeline_cached, dict):
                    return timeline_cached
        except Exception:
            pass

    sqlite_path = _try_export_nsys_sqlite(run_output_path, run_directory)
    connection = sqlite3.connect(sqlite_path)
    cursor = connection.cursor()

    try:
        string_lookup = _resolve_string_lookup(connection)
        table_rows = cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        table_names = [row[0] for row in table_rows if row and row[0]]
        candidate_tables = [table for table in table_names if table.startswith("CUPTI_") or table in {"NVTX_EVENTS"}]

        lanes: list[dict[str, Any]] = []
        min_start: int | None = None
        max_end: int | None = None

        for table_name in candidate_tables:
            info_rows = cursor.execute(f'PRAGMA table_info("{table_name}")').fetchall()
            columns = [str(row[1]) for row in info_rows if len(row) > 1]
            start_col, end_col, duration_col = _select_time_columns(columns)
            if not start_col or (not end_col and not duration_col):
                continue

            label_col = _choose_label_column(columns)
            end_expr = f'"{end_col}"' if end_col else f'"{start_col}" + "{duration_col}"'
            label_expr = f'"{label_col}"' if label_col else "NULL"

            query = (
                f'SELECT "{start_col}" as start_val, {end_expr} as end_val, {label_expr} as label_val '
                f'FROM "{table_name}" '
                f'WHERE "{start_col}" IS NOT NULL AND {end_expr} IS NOT NULL '
                f'ORDER BY "{start_col}" ASC LIMIT {max_events}'
            )

            events: list[dict[str, Any]] = []
            for row in cursor.execute(query).fetchall():
                if row is None or len(row) < 2:
                    continue
                start_raw = row[0]
                end_raw = row[1]
                if not isinstance(start_raw, (int, float)) or not isinstance(end_raw, (int, float)):
                    continue
                if end_raw <= start_raw:
                    continue

                start_int = int(start_raw)
                end_int = int(end_raw)
                if min_start is None or start_int < min_start:
                    min_start = start_int
                if max_end is None or end_int > max_end:
                    max_end = end_int

                events.append(
                    {
                        "start_raw": start_int,
                        "end_raw": end_int,
                        "label": _normalize_timeline_value(row[2], string_lookup) if len(row) > 2 else "",
                    }
                )

            if events:
                lanes.append({"id": table_name, "name": table_name, "events": events})

        if not lanes:
            raise ValueError("No timeline event data found in nsys export.")

        lanes = sorted(lanes, key=lambda lane: len(lane["events"]), reverse=True)[:max_lanes]
        if min_start is None or max_end is None or max_end <= min_start:
            raise ValueError("Invalid timeline range found in profiler output.")

        ns_to_ms = 1_000_000.0
        range_ms = (max_end - min_start) / ns_to_ms
        for lane in lanes:
            lane_events: list[dict[str, Any]] = lane["events"]
            normalized_events = []
            for index, event in enumerate(lane_events):
                start_ms = (event["start_raw"] - min_start) / ns_to_ms
                duration_ms = (event["end_raw"] - event["start_raw"]) / ns_to_ms
                normalized_events.append(
                    {
                        "id": f"{lane['id']}_{index}",
                        "label": event.get("label", ""),
                        "start_ms": round(start_ms, 6),
                        "duration_ms": round(duration_ms, 6),
                    }
                )
            lane["events"] = normalized_events

        timeline = {
            "source": "nsys",
            "unit": "ms",
            "range_ms": round(range_ms, 6),
            "lanes": lanes,
        }

        try:
            with open(cache_path, "w", encoding="utf-8") as cache_file:
                json.dump(
                    {
                        "source_path": run_output_path,
                        "source_mtime": source_mtime,
                        "timeline": timeline,
                    },
                    cache_file,
                )
        except Exception:
            pass

        return timeline
    finally:
        connection.close()


def get_profiler_run_timeline(
    run_id: str,
    *,
    max_lanes: int = DEFAULT_TIMELINE_MAX_LANES,
    max_events: int = DEFAULT_TIMELINE_MAX_EVENTS,
) -> dict[str, Any]:
    if max_lanes < 1 or max_lanes > 32:
        raise ValueError("max_lanes must be between 1 and 32.")
    if max_events < 100 or max_events > 10000:
        raise ValueError("max_events must be between 100 and 10000.")

    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if run is None:
            raise ValueError(f"Profiler run not found: {run_id}")
        run_copy = dict(run)

    profiler_id = str(run_copy.get("profiler_id", ""))
    output_path = str(run_copy.get("output_path", ""))
    run_directory = str(run_copy.get("run_directory", ""))

    if profiler_id == "nsys":
        try:
            timeline = _extract_nsys_timeline(
                output_path,
                run_directory,
                max_lanes=max_lanes,
                max_events=max_events,
            )
        except ValueError:
            timeline = _extract_generic_timeline(
                run_copy,
                profiler_id=profiler_id,
                max_lanes=max_lanes,
                max_events=max_events,
            )
        return {
            "run_id": run_id,
            "profiler_id": profiler_id,
            "timeline": timeline,
        }

    timeline = _extract_generic_timeline(
        run_copy,
        profiler_id=profiler_id,
        max_lanes=max_lanes,
        max_events=max_events,
    )
    return {
        "run_id": run_id,
        "profiler_id": profiler_id,
        "timeline": timeline,
    }


def list_profiler_runs(limit: int = 25) -> list[dict[str, Any]]:
    with _RUNS_LOCK:
        runs = [_to_public_run(run) for run in _RUNS.values()]
    runs.sort(key=lambda item: item.get("created_at", 0), reverse=True)
    return runs[:limit]


def stop_profiler_run(run_id: str) -> dict[str, Any]:
    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if run is None:
            raise ValueError(f"Profiler run not found: {run_id}")
        process: Optional[subprocess.Popen[str]] = run.get("process")
        if process is None or process.poll() is not None:
            return _to_public_run(run)
        run["status"] = "stopping"
        run["stop_requested"] = True

    process.terminate()
    try:
        process.wait(timeout=STOP_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=STOP_TIMEOUT_SECONDS)

    with _RUNS_LOCK:
        run = _RUNS.get(run_id)
        if run:
            run["status"] = "stopped"
            run["completed_at"] = time.time()
            run["return_code"] = process.returncode
            run["process"] = None
            return _to_public_run(run)

    raise ValueError(f"Profiler run not found: {run_id}")


async def start_profiler_run(request: StartProfilerRunRequest) -> dict[str, Any]:
    profiler_id = request.profiler_id.strip().lower()
    if profiler_id not in _RUN_SUPPORTED_PROFILERS:
        raise ValueError(
            f"Profiler '{profiler_id}' is not supported for in-app runs. "
            f"Supported: {', '.join(sorted(_RUN_SUPPORTED_PROFILERS.keys()))}"
        )

    profiler_binary = _RUN_SUPPORTED_PROFILERS[profiler_id]
    if shutil.which(profiler_binary) is None:
        raise ValueError(f"Profiler executable not found: {profiler_binary}")

    target_cmd = _split_command(request.target_command)
    extra_args = _validate_extra_args(request.extra_profiler_args)

    workspace_dir = await get_workspace_dir()
    if storage.is_remote_path(workspace_dir):
        raise ValueError("In-app profiler runs are only supported on local workspace storage.")

    workspace_dir_str = str(workspace_dir)
    run_id = uuid.uuid4().hex[:12]
    run_name = _sanitize_name(request.run_name)

    profiling_root = os.path.join(workspace_dir_str, "profiling")
    run_directory = os.path.join(profiling_root, run_id)
    os.makedirs(run_directory, exist_ok=True)

    output_base = os.path.join(run_directory, run_name)
    output_hint = _output_hint(profiler_id, output_base)
    log_path = os.path.join(run_directory, "run.log")
    working_directory = _resolve_working_directory(workspace_dir_str, request.working_directory)
    profiler_cmd = _build_profiler_prefix(profiler_id, output_base, extra_args)
    full_command = [*profiler_cmd, *target_cmd]

    process = subprocess.Popen(
        full_command,
        cwd=working_directory,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )

    with _RUNS_LOCK:
        run_record: dict[str, Any] = {
            "run_id": run_id,
            "profiler_id": profiler_id,
            "status": "running",
            "command": full_command,
            "run_directory": run_directory,
            "working_directory": working_directory,
            "log_path": log_path,
            "output_path": output_hint,
            "created_at": time.time(),
            "started_at": time.time(),
            "completed_at": None,
            "return_code": None,
            "pid": process.pid,
            "error": None,
            "last_lines": deque(maxlen=MAX_CACHED_LOG_LINES),
            "stop_requested": False,
            "process": process,
        }
        _RUNS[run_id] = run_record

    log_thread = threading.Thread(target=_consume_process_output, args=(run_id,), daemon=True)
    log_thread.start()

    return _to_public_run(run_record)


async def prepare_managed_profile_run(
    *,
    base_command: list[str],
    profiler_id: str,
    run_name: str,
    extra_profiler_args: Optional[list[str]] = None,
    source: str = "managed",
    associated_job_id: Optional[str] = None,
) -> dict[str, Any]:
    normalized_profiler = profiler_id.strip().lower()
    if normalized_profiler not in _RUN_SUPPORTED_PROFILERS:
        raise ValueError(
            f"Profiler '{normalized_profiler}' is not supported for managed runs. "
            f"Supported: {', '.join(sorted(_RUN_SUPPORTED_PROFILERS.keys()))}"
        )

    profiler_binary = _RUN_SUPPORTED_PROFILERS[normalized_profiler]
    if shutil.which(profiler_binary) is None:
        raise ValueError(f"Profiler executable not found: {profiler_binary}")

    args = _validate_extra_args(extra_profiler_args or [])

    workspace_dir = await get_workspace_dir()
    if storage.is_remote_path(workspace_dir):
        raise ValueError("Managed profiler runs are only supported on local workspace storage.")

    workspace_dir_str = str(workspace_dir)
    managed_root = os.path.join(workspace_dir_str, "profiling", "managed")
    os.makedirs(managed_root, exist_ok=True)

    run_id = uuid.uuid4().hex[:12]
    safe_name = _sanitize_name(run_name or f"profile_{run_id}")
    run_directory = os.path.join(managed_root, run_id)
    os.makedirs(run_directory, exist_ok=True)

    output_base = os.path.join(run_directory, safe_name)
    output_path = _output_hint(normalized_profiler, output_base)
    profiler_prefix = _build_profiler_prefix(normalized_profiler, output_base, args)
    full_command = [*profiler_prefix, *base_command]

    run_record: dict[str, Any] = {
        "run_id": run_id,
        "profiler_id": normalized_profiler,
        "status": "created",
        "command": full_command,
        "run_directory": run_directory,
        "working_directory": "",
        "log_path": os.path.join(run_directory, "run.log"),
        "output_path": output_path,
        "created_at": time.time(),
        "started_at": None,
        "completed_at": None,
        "return_code": None,
        "pid": None,
        "error": None,
        "last_lines": deque(maxlen=MAX_CACHED_LOG_LINES),
        "stop_requested": False,
        "process": None,
        "source": source,
        "associated_job_id": associated_job_id,
    }

    with _RUNS_LOCK:
        _RUNS[run_id] = run_record

    return {
        "run_id": run_id,
        "command": full_command,
        "run": _to_public_run(run_record),
    }


def get_inference_profile_config() -> dict[str, Any] | None:
    with _RUNS_LOCK:
        if _INFERENCE_PROFILE_CONFIG is None:
            return None
        return dict(_INFERENCE_PROFILE_CONFIG)


def set_inference_profile_config(config: Optional[dict[str, Any]]) -> dict[str, Any] | None:
    global _INFERENCE_PROFILE_CONFIG
    with _RUNS_LOCK:
        if config is None:
            _INFERENCE_PROFILE_CONFIG = None
            return None
        normalized = normalize_profile_config(config)
        if not normalized.get("enabled", False):
            _INFERENCE_PROFILE_CONFIG = None
            return None
        _INFERENCE_PROFILE_CONFIG = dict(normalized)
        return dict(_INFERENCE_PROFILE_CONFIG)


async def configure_job_profile(job_id: str, profile_config: dict[str, Any]) -> dict[str, Any] | None:
    normalized = normalize_profile_config(profile_config)

    try:
        job = await Job.get(job_id)
    except Exception as exc:
        raise ValueError(f"Job not found: {job_id}") from exc

    job_json = await job.get_json_data(uncached=True)
    status = str(job_json.get("status", "")).upper()
    if status not in {"CREATED", "QUEUED"}:
        raise ValueError(f"Job {job_id} is in status '{status}'. Configure profiling before the job starts.")

    job_data = job_json.get("job_data", {})
    if isinstance(job_data, str):
        try:
            import json

            job_data = json.loads(job_data)
        except Exception:
            job_data = {}
    if not isinstance(job_data, dict):
        job_data = {}

    config = job_data.get("config", {})
    if isinstance(config, str):
        try:
            import json

            config = json.loads(config)
        except Exception:
            config = {}
    if not isinstance(config, dict):
        config = {}

    if normalized.get("enabled", False):
        config["_profiling"] = normalized
    else:
        config.pop("_profiling", None)

    job_data["config"] = config
    await job.set_job_data(job_data)

    return config.get("_profiling")
