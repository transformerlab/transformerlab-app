import asyncio
from datetime import datetime
from werkzeug.utils import secure_filename

from .dirs import (
    get_experiment_task_dir,
    get_experiment_task_dir_nocreate,
    get_experiment_tasks_dir,
    get_experiments_dir,
    get_task_dir,
)
from .labresource import BaseLabResource
from . import storage
import json
import logging

logger = logging.getLogger(__name__)

# Cap parallel index.json reads in list_all / list_by_experiment.
# Local FS handles much more, but on remote backends (S3/GCS) too many
# concurrent GETs trigger throttling or connector exhaustion.
_LIST_CONCURRENCY = 15


def _task_sort_key(x):
    created_at = x.get("created_at")
    if created_at is None:
        return ""
    if isinstance(created_at, datetime):
        return created_at.timestamp()
    if isinstance(created_at, (int, float)):
        return created_at
    return str(created_at)


async def _dir_paths_from_ls(entries) -> list[str]:
    """Filter `storage.ls(detail=True)` output to directory paths only.

    Trusts fsspec's `type` field, with a defensive `storage.isdir` fallback
    if it's missing — matches the pattern in
    `migrate_tasks_to_experiment_dirs.py`. Skips files like `.DS_Store` so
    they don't reach `get_metadata()`.
    """
    paths: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        full = entry.get("name")
        if not full:
            continue
        entry_type = entry.get("type")
        try:
            is_dir = entry_type == "directory" or await storage.isdir(full)
        except Exception:
            is_dir = entry_type == "directory"
        if is_dir:
            paths.append(full)
    return paths


async def _gather_task_metadata(entries, experiment_id: str | None = None):
    sem = asyncio.Semaphore(_LIST_CONCURRENCY)

    async def _read(full):
        entry = full.rstrip("/").split("/")[-1]
        async with sem:
            try:
                return await TaskTemplate(entry, experiment_id=experiment_id).get_metadata()
            except Exception:
                logger.warning(f"Skipping task without readable metadata: {entry}")
                return None

    gathered = await asyncio.gather(*(_read(full) for full in entries))
    return [r for r in gathered if r is not None]


class TaskTemplate(BaseLabResource):
    def __init__(self, id, experiment_id: str | None = None):
        super().__init__(id)
        self.experiment_id = experiment_id

    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        task_id_safe = secure_filename(str(self.id))
        if self.experiment_id is not None:
            return await get_experiment_task_dir(self.experiment_id, task_id_safe)
        task_dir = await get_task_dir()
        return storage.join(task_dir, task_id_safe)

    async def get_dir_nocreate(self):
        """
        Compute the resource directory without creating any parent dirs.

        Use for read/existence checks where the caller passes a possibly
        invalid experiment_id and we don't want to leak empty directories.
        """
        task_id_safe = secure_filename(str(self.id))
        if self.experiment_id is not None:
            return await get_experiment_task_dir_nocreate(self.experiment_id, task_id_safe)
        task_dir = await get_task_dir()
        return storage.join(task_dir, task_id_safe)

    @classmethod
    async def create(cls, id, experiment_id: str | None = None):
        newobj = cls(id, experiment_id=experiment_id)
        await newobj._initialize()
        return newobj

    @classmethod
    async def get(cls, id, experiment_id: str | None = None):
        newobj = cls(id, experiment_id=experiment_id)
        # Probe with the no-create variant so a missing task with an arbitrary
        # experiment_id doesn't leak experiments/<id>/tasks/. Subsequent calls
        # to _get_json_file are safe: the dir exists, so the makedirs in
        # get_experiment_tasks_dir is a no-op.
        resource_dir = await newobj.get_dir_nocreate()
        if not await storage.isdir(resource_dir):
            raise FileNotFoundError(f"Directory for {cls.__name__} with id '{id}' not found")
        json_file = await newobj._get_json_file()
        if not await storage.exists(json_file):
            async with await storage.open(json_file, "w", encoding="utf-8") as f:
                await f.write(json.dumps(newobj._default_json()))
        return newobj

    def _default_json(self):
        # Default metadata - all fields stored directly (not nested in inputs/outputs/config)
        return {
            "id": self.id,
            "name": "",
            "type": "",
            "plugin": "",
            "experiment_id": None,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

    async def set_metadata(self, **kwargs):
        """Set task metadata - all fields stored directly in JSON"""
        data = await self.get_json_data()

        # Update any provided fields
        for key, value in kwargs.items():
            if value is not None:
                data[key] = value

        # Always update the updated_at timestamp
        data["updated_at"] = datetime.utcnow().isoformat()
        await self._set_json_data(data)

    async def get_metadata(self):
        """Get task metadata"""
        return await self.get_json_data()

    @staticmethod
    async def list_all():
        """List all tasks in the filesystem"""
        task_dir = await get_task_dir()
        if not await storage.isdir(task_dir):
            logger.debug(f"Task directory does not exist: {task_dir}")
            return []
        try:
            entries = await storage.ls(task_dir, detail=True)
        except Exception as e:
            logger.error(f"Exception listing task directory: {e}")
            return []

        results = await _gather_task_metadata(await _dir_paths_from_ls(entries))
        results.sort(key=_task_sort_key, reverse=True)
        return results

    @staticmethod
    async def list_by_type(task_type: str):
        """List all tasks of a specific type"""
        all_tasks = await TaskTemplate.list_all()
        return [task for task in all_tasks if task.get("type") == task_type]

    @staticmethod
    async def list_by_experiment(experiment_id: int):
        """List all tasks for a specific experiment"""
        tasks_dir = await get_experiment_tasks_dir(str(experiment_id))
        if not await storage.isdir(tasks_dir):
            return []
        try:
            entries = await storage.ls(tasks_dir, detail=True)
        except Exception as e:
            logger.error(f"Exception listing experiment task directory: {e}")
            return []

        results = await _gather_task_metadata(await _dir_paths_from_ls(entries), experiment_id=str(experiment_id))
        results.sort(key=_task_sort_key, reverse=True)
        return results

    @staticmethod
    async def list_by_type_in_experiment(task_type: str, experiment_id: int):
        """List all tasks of a specific type in a specific experiment"""
        all_tasks = await TaskTemplate.list_by_experiment(experiment_id)
        return [
            task for task in all_tasks if task.get("type") == task_type and task.get("experiment_id") == experiment_id
        ]

    @staticmethod
    async def list_by_subtype_in_experiment(experiment_id: int, subtype: str, task_type: str = None):
        """List all tasks for a specific experiment filtered by subtype and optionally by type"""
        all_tasks = await TaskTemplate.list_by_experiment(experiment_id)
        return [
            task
            for task in all_tasks
            if task.get("experiment_id") == experiment_id
            and task.get("subtype") == subtype
            and (task_type is None or task.get("type") == task_type)
        ]

    @staticmethod
    async def get_by_id(task_id: str, experiment_id: str | None = None):
        """Get a specific task by ID"""
        if experiment_id:
            try:
                task = await TaskTemplate.get(task_id, experiment_id=experiment_id)
                return await task.get_metadata()
            except FileNotFoundError:
                pass

        # Legacy fallback location for pre-migration tasks.
        try:
            task = await TaskTemplate.get(task_id)
            return await task.get_metadata()
        except FileNotFoundError:
            pass

        # Best-effort fallback for callers that only know task_id:
        # scan experiment-scoped task folders to locate a matching id.
        if not experiment_id:
            try:
                experiments_dir = await get_experiments_dir()
                if await storage.isdir(experiments_dir):
                    exp_entries = await storage.ls(experiments_dir, detail=False)
                    for exp_path in exp_entries:
                        if not await storage.isdir(exp_path):
                            continue
                        exp_id = exp_path.rstrip("/").split("/")[-1]
                        candidate = await get_experiment_task_dir(exp_id, task_id)
                        if await storage.isdir(candidate):
                            task = await TaskTemplate.get(task_id, experiment_id=exp_id)
                            return await task.get_metadata()
            except Exception:
                return None
        return None

    @staticmethod
    async def delete_all():
        """Delete all tasks"""
        task_dir = await get_task_dir()
        if not await storage.isdir(task_dir):
            return
        try:
            entries = await storage.ls(task_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if await storage.isdir(full):
                await storage.rm_tree(full)
