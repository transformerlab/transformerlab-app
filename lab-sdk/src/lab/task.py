from datetime import datetime
from werkzeug.utils import secure_filename

from .dirs import get_tasks_dir
from .labresource import BaseLabResource
from . import storage
import logging

logger = logging.getLogger(__name__)


class Task(BaseLabResource):
    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        task_id_safe = secure_filename(str(self.id))
        tasks_dir = await get_tasks_dir()
        return storage.join(tasks_dir, task_id_safe)

    def _default_json(self):
        # Default metadata modeled after API tasks table fields
        return {
            "id": self.id,
            "name": "",
            "type": "",
            "inputs": {},
            "config": {},
            "plugin": "",
            "outputs": {},
            "experiment_id": None,
            "remote_task": False,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }

    async def set_metadata(
        self,
        *,
        name: str | None = None,
        type: str | None = None,
        inputs: dict | None = None,
        config: dict | None = None,
        plugin: str | None = None,
        outputs: dict | None = None,
        experiment_id: str | None = None,
        remote_task: bool | None = None,
    ):
        """Set task metadata"""
        data = await self.get_json_data()
        if name is not None:
            data["name"] = name
        if type is not None:
            data["type"] = type
        if inputs is not None:
            data["inputs"] = inputs
        if config is not None:
            data["config"] = config
        if plugin is not None:
            data["plugin"] = plugin
        if outputs is not None:
            data["outputs"] = outputs
        if experiment_id is not None:
            data["experiment_id"] = experiment_id
        if remote_task is not None:
            data["remote_task"] = remote_task

        # Always update the updated_at timestamp
        data["updated_at"] = datetime.utcnow().isoformat()
        await self._set_json_data(data)

    async def get_metadata(self):
        """Get task metadata"""
        return await self.get_json_data()

    @staticmethod
    async def list_all():
        """List all tasks in the filesystem"""
        results = []
        tasks_dir = await get_tasks_dir()
        if not await storage.isdir(tasks_dir):
            logger.debug(f"Tasks directory does not exist: {tasks_dir}")
            return results
        try:
            entries = await storage.ls(tasks_dir, detail=False)
        except Exception as e:
            logger.error(f"Exception listing tasks directory: {e}")
            entries = []
        for full in entries:
            if not await storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                task = Task(entry)

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
        all_tasks = await Task.list_all()
        return [task for task in all_tasks if task.get("type") == task_type]

    @staticmethod
    async def list_by_experiment(experiment_id: int):
        """List all tasks for a specific experiment"""
        all_tasks = await Task.list_all()
        return [task for task in all_tasks if task.get("experiment_id") == experiment_id]

    @staticmethod
    async def list_by_type_in_experiment(task_type: str, experiment_id: int):
        """List all tasks of a specific type in a specific experiment"""
        all_tasks = await Task.list_all()
        return [
            task for task in all_tasks if task.get("type") == task_type and task.get("experiment_id") == experiment_id
        ]

    @staticmethod
    async def get_by_id(task_id: str):
        """Get a specific task by ID"""
        try:
            task = await Task.get(task_id)
            return await task.get_metadata()
        except FileNotFoundError:
            return None

    @staticmethod
    async def delete_all():
        """Delete all tasks"""
        tasks_dir = await get_tasks_dir()
        if not await storage.isdir(tasks_dir):
            return
        try:
            entries = await storage.ls(tasks_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if await storage.isdir(full):
                await storage.rm_tree(full)
