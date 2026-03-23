"""
One-time jobs directory layout migration, executed automatically at API startup.

Goal:
  Move legacy job directories from:
    {workspace}/jobs/{job_id}/
  into:
    {workspace}/experiments/{exp_id}/jobs/{job_id}/

Then delete experiment-scoped `jobs.json` indexes so the filesystem becomes the index.

This runs per org (team) with org-scoped storage roots.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Optional

from lab.dirs import get_workspace_dir, set_organization_id as lab_set_org_id
from lab import storage

from transformerlab.services import team_service

logger = logging.getLogger(__name__)

_jobs_migration_worker_task: Optional[asyncio.Task] = None


def _set_org_context(org_id: Optional[str]) -> None:
    if lab_set_org_id is not None:
        lab_set_org_id(org_id)


def _clear_org_context() -> None:
    _set_org_context(None)


def _migration_disabled() -> bool:
    """
    Disable auto-migration when `TFL_DISABLE_MIGRATE_JOBS=1` (or true-ish).

    Also supports a legacy/alternative value:
      - `TFL_DISABLE_MIGRATE=jobs`
    """

    v = (os.getenv("TFL_DISABLE_MIGRATE_JOBS") or os.getenv("TFL_DISABLE_MIGRATE") or "").strip().lower()
    if not v:
        return False
    return v in ("1", "true", "yes", "jobs", "jobs=1")


def _basename(path: str) -> str:
    return str(path).rstrip("/").split("/")[-1]


def _get_experiment_id_from_index(index_data: dict[str, Any]) -> Optional[str]:
    # We try multiple key names for backward compatibility.
    for key in (
        "experiment_id",
        "experimentId",
        "experiment_name",
        "experimentName",
        "experiment",
        "exp_id",
        "expId",
    ):
        value = index_data.get(key)
        if value is None:
            continue
        value_str = str(value).strip()
        if value_str:
            return value_str
    return None


async def _read_json(path: str) -> dict[str, Any]:
    async with await storage.open(path, "r", encoding="utf-8") as f:
        return json.loads(await f.read())


async def _iter_dir_names(parent_dir: str) -> list[str]:
    """
    List immediate child directory names under `parent_dir`.
    """
    try:
        entries = await storage.ls(parent_dir, detail=True)
    except Exception:
        return []

    dir_names: list[str] = []
    for entry in entries:
        full_path = ""
        entry_type: Optional[str] = None

        if isinstance(entry, dict):
            full_path = entry.get("name") or entry.get("path") or ""
            entry_type = entry.get("type")
        else:
            full_path = str(entry)

        if not full_path:
            continue

        try:
            is_dir = entry_type == "directory" or await storage.isdir(full_path)
        except Exception:
            is_dir = entry_type == "directory"

        if is_dir:
            dir_names.append(_basename(full_path))

    return dir_names


async def _org_needs_jobs_migration(org_id: str) -> bool:
    """
    Determine if migration is needed for this org by checking for
    `{workspace}/experiments/*/jobs.json`.
    """
    _set_org_context(org_id)
    try:
        workspace_dir = await get_workspace_dir()
        experiments_dir = storage.join(workspace_dir, "experiments")
        if not await storage.exists(experiments_dir):
            return False

        exp_ids = await _iter_dir_names(experiments_dir)
        for exp_id in exp_ids:
            jobs_json_path = storage.join(experiments_dir, exp_id, "jobs.json")
            if await storage.exists(jobs_json_path):
                return True
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Jobs migration: org {org_id} pre-check failed: {exc}")
        return False
    finally:
        _clear_org_context()

    return False


async def _migrate_org_jobs(org_id: str) -> dict[str, Any]:
    """
    Perform migration for a single org.
    """
    _set_org_context(org_id)
    moved_jobs = 0
    skipped_jobs = 0
    removed_jobs_json = 0

    try:
        workspace_dir = await get_workspace_dir()
        old_jobs_dir = storage.join(workspace_dir, "jobs")
        experiments_dir = storage.join(workspace_dir, "experiments")

        if not await storage.exists(old_jobs_dir):
            return {
                "org_id": org_id,
                "moved_jobs": 0,
                "skipped_jobs": 0,
                "removed_jobs_json": 0,
                "status": "no_old_jobs_dir",
            }

        if not await storage.exists(experiments_dir):
            await storage.makedirs(experiments_dir, exist_ok=True)

        job_ids = await _iter_dir_names(old_jobs_dir)
        logger.info(f"Jobs migration: org {org_id}: {len(job_ids)} candidate job dir(s)")

        for job_id in sorted(job_ids):
            job_dir = storage.join(old_jobs_dir, job_id)
            index_path = storage.join(job_dir, "index.json")

            if not await storage.exists(index_path):
                logger.warning(f"Jobs migration: org {org_id}: {job_id} missing index.json, skipping")
                skipped_jobs += 1
                continue

            try:
                index_data = await _read_json(index_path)
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"Jobs migration: org {org_id}: {job_id} index.json read failed: {exc}")
                skipped_jobs += 1
                continue

            experiment_id = _get_experiment_id_from_index(index_data)
            if not experiment_id:
                logger.warning(f"Jobs migration: org {org_id}: {job_id} missing experiment_id, skipping")
                skipped_jobs += 1
                continue

            dest_dir = storage.join(experiments_dir, experiment_id, "jobs", job_id)
            dest_exists = await storage.exists(dest_dir)
            src_exists = await storage.exists(job_dir)

            if dest_exists and not src_exists:
                skipped_jobs += 1
                continue
            if dest_exists and src_exists:
                logger.warning(f"Jobs migration: org {org_id}: {job_id} src+dest exist; manual resolution required")
                skipped_jobs += 1
                continue

            logger.info(f"Jobs migration: org {org_id}: move {job_id} -> {dest_dir}")
            await storage.copy_dir(job_dir, dest_dir)
            await storage.rm_tree(job_dir)
            moved_jobs += 1

        # Remove jobs.json per experiment
        exp_ids = await _iter_dir_names(experiments_dir)
        for exp_id in exp_ids:
            jobs_json_path = storage.join(experiments_dir, exp_id, "jobs.json")
            if await storage.exists(jobs_json_path):
                logger.info(f"Jobs migration: org {org_id}: delete {jobs_json_path}")
                await storage.rm_tree(jobs_json_path)
                removed_jobs_json += 1

        # Backward-compat: remove legacy top-level workspace/jobs.json if present.
        legacy_jobs_json = storage.join(workspace_dir, "jobs.json")
        if await storage.exists(legacy_jobs_json):
            await storage.rm_tree(legacy_jobs_json)

        return {
            "org_id": org_id,
            "moved_jobs": moved_jobs,
            "skipped_jobs": skipped_jobs,
            "removed_jobs_json": removed_jobs_json,
            "status": "migrated",
        }

    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Jobs migration: org {org_id} failed: {exc}")
        return {
            "org_id": org_id,
            "moved_jobs": moved_jobs,
            "skipped_jobs": skipped_jobs,
            "removed_jobs_json": removed_jobs_json,
            "status": "error",
            "error": str(exc),
        }
    finally:
        _clear_org_context()


async def _jobs_migration_worker() -> None:
    if _migration_disabled():
        logger.info("Jobs migration worker: disabled via env var")
        return

    try:
        org_ids = await team_service.get_all_team_ids()
    except Exception as exc:  # noqa: BLE001
        logger.warning(f"Jobs migration worker: failed listing org ids: {exc}")
        return

    if not org_ids:
        logger.info("Jobs migration worker: no orgs found; nothing to migrate")
        return

    for org_id in org_ids:
        if await _org_needs_jobs_migration(org_id):
            result = await _migrate_org_jobs(org_id)
            logger.info(f"Jobs migration worker: result for org {org_id}: {result}")
        else:
            logger.info(f"Jobs migration worker: org {org_id} already migrated (no jobs.json found)")


async def start_jobs_migration_worker() -> None:
    """
    Start the one-time migration worker in the background.
    """
    global _jobs_migration_worker_task
    if _jobs_migration_worker_task is not None and not _jobs_migration_worker_task.done():
        return

    _jobs_migration_worker_task = asyncio.create_task(_jobs_migration_worker())


async def stop_jobs_migration_worker() -> None:
    global _jobs_migration_worker_task
    if _jobs_migration_worker_task is None:
        return

    if _jobs_migration_worker_task.done():
        return

    _jobs_migration_worker_task.cancel()
    try:
        await _jobs_migration_worker_task
    except asyncio.CancelledError:
        pass
    finally:
        _jobs_migration_worker_task = None
