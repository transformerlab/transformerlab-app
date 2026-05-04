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
        data = await self.get_json_data()

        # Fix experiment_id if it's a digit - convert to experiment name
        if data.get("experiment_id") and str(data["experiment_id"]).isdigit():
            experiment_name = await self._get_experiment_name_by_id(data["experiment_id"])
            if experiment_name:
                data["experiment_id"] = experiment_name
                # Save the corrected data back to the file
                await self._set_json_data(data)

        return data

    async def _get_experiment_name_by_id(self, experiment_id):
        """Get experiment name by ID, return None if not found"""
        try:
            from .experiment import Experiment

            # Get all experiments and search for one with matching db_experiment_id
            all_experiments = await Experiment.get_all()
            for exp_data in all_experiments:
                if exp_data.get("db_experiment_id") == int(experiment_id):
                    return exp_data.get("name", experiment_id)

            # If no match found, return the original ID
            return experiment_id
        except Exception:
            return experiment_id

    @staticmethod
    async def list_all():
        """List all tasks in the filesystem"""
        results = []
        task_dir = await get_task_dir()
        if not await storage.isdir(task_dir):
            logger.debug(f"Task directory does not exist: {task_dir}")
            return results
        try:
            entries = await storage.ls(task_dir, detail=False)
        except Exception as e:
            logger.error(f"Exception listing task directory: {e}")
            entries = []
        for full in entries:
            if not await storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                task = TaskTemplate(entry)

                results.append(await task.get_metadata())
            except Exception:
                logger.error(f"Exception getting metadata for task: {entry}")
                continue

        # Sort by created_at descending to match database behavior
        def sort_key(x):
            created_at = x.get("created_at")
            if created_at is None:
                # Put items without created_at at the end (will sort last when reverse=True)
                return ""
            # Handle datetime objects
            if isinstance(created_at, datetime):
                return created_at.timestamp()
            # Handle numeric timestamps
            if isinstance(created_at, (int, float)):
                return created_at
            # Handle string dates (ISO format strings sort correctly)
            return str(created_at)

        results.sort(key=sort_key, reverse=True)
        return results

    @staticmethod
    async def list_by_type(task_type: str):
        """List all tasks of a specific type"""
        all_tasks = await TaskTemplate.list_all()
        return [task for task in all_tasks if task.get("type") == task_type]

    @staticmethod
    async def list_by_experiment(experiment_id: int):
        """List all tasks for a specific experiment"""
        results = []
        tasks_dir = await get_experiment_tasks_dir(str(experiment_id))
        if not await storage.isdir(tasks_dir):
            return results
        try:
            entries = await storage.ls(tasks_dir, detail=False)
        except Exception as e:
            logger.error(f"Exception listing experiment task directory: {e}")
            entries = []
        for full in entries:
            if not await storage.isdir(full):
                continue
            try:
                entry = full.rstrip("/").split("/")[-1]
                task = TaskTemplate(entry, experiment_id=str(experiment_id))
                results.append(await task.get_metadata())
            except Exception:
                logger.error(f"Exception getting metadata for task: {entry}")
                continue

        # Sort by created_at descending to match existing list behavior.
        def sort_key(x):
            created_at = x.get("created_at")
            if created_at is None:
                return ""
            if isinstance(created_at, datetime):
                return created_at.timestamp()
            if isinstance(created_at, (int, float)):
                return created_at
            return str(created_at)

        results.sort(key=sort_key, reverse=True)
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
