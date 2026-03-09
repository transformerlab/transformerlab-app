import json
import os
from pathlib import Path
from typing import Any, Dict, Optional

from lab.dirs import get_workspace_dir


def _get_cache_root() -> Path:
    """
    Returns the root directory for per-node job caches.

    Layout:
      ~/.transformerlab/caches/<tfl_storage_provider>/jobs/<org_id>/<job_id>.json
    """
    base_dir = Path(os.path.expanduser("~")) / ".transformerlab" / "caches"
    provider = os.environ.get("TFL_STORAGE_PROVIDER", "aws")
    return base_dir / provider / "jobs"


async def _get_org_id() -> str:
    """
    Best-effort derivation of the current org_id from the workspace dir.
    Falls back to 'default' if the org segment cannot be determined.
    """
    try:
        workspace_dir = await get_workspace_dir()
        marker = "/orgs/"
        if marker in workspace_dir:
            return workspace_dir.split(marker, 1)[1].split("/", 1)[0] or "default"
    except Exception:
        pass
    return "default"


async def _get_cache_path(job_id: str) -> Path:
    org_id = await _get_org_id()
    root = _get_cache_root() / org_id
    return root / f"{job_id}.json"


async def read_local_job_cache(job_id: str) -> Optional[Dict[str, Any]]:
    """
    Read a cached job JSON for this node, if present.
    Returns None on cache miss or parse error.
    """
    try:
        cache_path = await _get_cache_path(job_id)
        if not cache_path.exists():
            return None
        with cache_path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        # Best-effort cache: ignore any local errors and fall back to live reads.
        return None


async def write_local_job_cache(job_id: str, payload: Dict[str, Any]) -> None:
    """
    Persist a job JSON snapshot for this node.
    Errors are swallowed so cache writes never affect core behavior.
    """
    try:
        cache_path = await _get_cache_path(job_id)
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cache_path.with_suffix(".json.tmp")
        with tmp_path.open("w", encoding="utf-8") as f:
            json.dump(payload, f)
        os.replace(tmp_path, cache_path)
    except Exception:
        # Best-effort cache: ignore any local errors.
        return
