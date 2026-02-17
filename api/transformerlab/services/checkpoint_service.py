import json
import os
from fnmatch import fnmatch
from typing import Any, Dict, List, Optional, Tuple

from werkzeug.utils import secure_filename

from lab import storage
from lab.dirs import get_job_checkpoints_dir, get_workspace_dir

import transformerlab.services.job_service as job_service


DEFAULT_CHECKPOINT_FILE_FILTER = "*_adapters.safetensors"


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
    return {}


def _safe_checkpoint_name(checkpoint_name: str) -> Optional[str]:
    if not isinstance(checkpoint_name, str):
        return None
    value = checkpoint_name.strip()
    if value == "":
        return None
    if "/" in value or "\\" in value or ".." in value:
        return None
    return value


def _looks_like_checkpoint_dir(name: str) -> bool:
    return fnmatch(name, "checkpoint-*")


def _looks_like_checkpoint_file(filename: str, checkpoint_filter: str) -> bool:
    if checkpoint_filter and fnmatch(filename, checkpoint_filter):
        return True
    if fnmatch(filename, DEFAULT_CHECKPOINT_FILE_FILTER):
        return True
    return filename in {"adapter_model.safetensors", "adapter_model.bin"}


def get_model_and_adaptor_from_job_data(job_data: Any) -> Tuple[str, str]:
    parsed_job_data = _coerce_dict(job_data)
    config = _coerce_dict(parsed_job_data.get("config", {}))
    model_name = str(config.get("model_name", "") or "")
    adaptor_name = str(config.get("adaptor_name", "adaptor") or "adaptor")
    return model_name, adaptor_name


async def _build_checkpoint_entry(
    entry: Any,
    checkpoints_dir: str,
    checkpoints_file_filter: str,
) -> Optional[Dict[str, Any]]:
    if isinstance(entry, dict):
        raw_path = entry.get("name") or entry.get("path")
        if not raw_path:
            return None
        full_path = str(raw_path)
        if "/" not in full_path and "\\" not in full_path:
            full_path = storage.join(checkpoints_dir, full_path)
        filename = os.path.basename(full_path.rstrip("/"))
        entry_type = str(entry.get("type", "")).lower()
        if entry_type == "directory":
            is_dir = True
        elif entry_type == "file":
            is_dir = False
        else:
            is_dir = await storage.isdir(full_path)
        size = entry.get("size")
        date = entry.get("mtime")
    else:
        full_path = str(entry)
        if "/" not in full_path and "\\" not in full_path:
            full_path = storage.join(checkpoints_dir, full_path)
        filename = os.path.basename(full_path.rstrip("/"))
        is_dir = await storage.isdir(full_path)
        size = None
        date = None

    if is_dir and _looks_like_checkpoint_dir(filename):
        return {
            "filename": filename,
            "path": full_path,
            "kind": "directory",
            "size": size,
            "date": date,
        }
    if (not is_dir) and _looks_like_checkpoint_file(filename, checkpoints_file_filter):
        return {
            "filename": filename,
            "path": full_path,
            "kind": "file",
            "size": size,
            "date": date,
        }
    return None


def _checkpoint_sort_key(item: Dict[str, Any]) -> Tuple[int, int, str]:
    filename = str(item.get("filename", ""))
    if filename.startswith("checkpoint-"):
        suffix = filename[len("checkpoint-") :]
        if suffix.isdigit():
            return (2, int(suffix), filename)
    if filename.endswith("_adapters.safetensors"):
        digits = "".join(c for c in filename if c.isdigit())
        if digits.isdigit():
            return (1, int(digits), filename)
    return (0, 0, filename)


async def get_checkpoint_candidate_dirs(job_id: str, job_data: Optional[Dict[str, Any]] = None) -> List[str]:
    if job_data is None:
        job = await job_service.job_get(job_id)
        if not job:
            return []
        job_data = _coerce_dict(job.get("job_data", {}))
    else:
        job_data = _coerce_dict(job_data)

    config = _coerce_dict(job_data.get("config", {}))
    model_name = str(config.get("model_name", "") or "")
    adaptor_name = str(config.get("adaptor_name", "adaptor") or "adaptor")

    try:
        inferred_checkpoints_dir = await get_job_checkpoints_dir(job_id)
    except Exception:
        inferred_checkpoints_dir = None

    workspace_dir = await get_workspace_dir()
    default_adaptor_dir = storage.join(workspace_dir, "adaptors", secure_filename(model_name), adaptor_name)

    candidates = [
        job_data.get("checkpoints_dir"),
        inferred_checkpoints_dir,
        job_data.get("tensorboard_output_dir"),
        config.get("output_dir"),
        default_adaptor_dir,
    ]

    unique: List[str] = []
    seen = set()
    for path in candidates:
        if not isinstance(path, str):
            continue
        clean_path = path.strip()
        if clean_path == "" or clean_path in seen:
            continue
        seen.add(clean_path)
        unique.append(clean_path)

    return unique


async def list_checkpoints_for_job(job_id: str, job_data: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    if job_data is None:
        job = await job_service.job_get(job_id)
        if not job:
            return []
        job_data = _coerce_dict(job.get("job_data", {}))
    else:
        job_data = _coerce_dict(job_data)

    checkpoints_file_filter = str(job_data.get("checkpoints_file_filter") or DEFAULT_CHECKPOINT_FILE_FILTER)
    candidate_dirs = await get_checkpoint_candidate_dirs(job_id, job_data)

    checkpoints: List[Dict[str, Any]] = []
    seen_paths = set()

    for checkpoints_dir in candidate_dirs:
        try:
            if not await storage.exists(checkpoints_dir):
                continue
            if not await storage.isdir(checkpoints_dir):
                continue
        except Exception:
            continue

        try:
            items = await storage.ls(checkpoints_dir, detail=True)
        except Exception:
            try:
                items = await storage.ls(checkpoints_dir, detail=False)
            except Exception:
                continue

        for item in items:
            try:
                checkpoint = await _build_checkpoint_entry(item, checkpoints_dir, checkpoints_file_filter)
            except Exception:
                checkpoint = None
            if not checkpoint:
                continue
            checkpoint_path = checkpoint.get("path")
            if checkpoint_path in seen_paths:
                continue
            seen_paths.add(checkpoint_path)
            checkpoints.append(checkpoint)

    checkpoints.sort(key=_checkpoint_sort_key, reverse=True)
    return checkpoints


async def resolve_checkpoint_path(
    job_id: str,
    checkpoint_name: str,
    job_data: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    safe_name = _safe_checkpoint_name(checkpoint_name)
    if safe_name is None:
        return None

    if job_data is None:
        job = await job_service.job_get(job_id)
        if not job:
            return None
        job_data = _coerce_dict(job.get("job_data", {}))
    else:
        job_data = _coerce_dict(job_data)

    candidate_dirs = await get_checkpoint_candidate_dirs(job_id, job_data)
    for checkpoints_dir in candidate_dirs:
        candidate_path = storage.join(checkpoints_dir, safe_name)
        try:
            if await storage.exists(candidate_path):
                return candidate_path
        except Exception:
            continue

    checkpoints = await list_checkpoints_for_job(job_id, job_data)
    for checkpoint in checkpoints:
        if checkpoint.get("filename") == safe_name:
            path = checkpoint.get("path")
            if isinstance(path, str) and path != "":
                return path

    return None
