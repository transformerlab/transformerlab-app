from datetime import datetime
from werkzeug.utils import secure_filename
import asyncio

from .dirs import get_task_dir
from .labresource import BaseLabResource
from . import storage

## Maximum number of requests we will send to s3 at a time
S3_CONCURRENCY_LIMIT = 15


class TaskTemplate(BaseLabResource):
    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        task_id_safe = secure_filename(str(self.id))
        task_dir = await get_task_dir()
        return storage.join(task_dir, task_id_safe)

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
        """List all tasks in the filesystem (optimized for S3)"""
        task_dir = await get_task_dir()

        if not await storage.isdir(task_dir):
            print(f"Task directory does not exist: {task_dir}")
            return []

        try:
            entries = await storage.ls(task_dir, detail=False)
        except Exception as e:
            print(f"Exception listing task directory: {e}")
            return []

        # Limit concurrency to 15 to avoid S3 throttling or connection pooling issues
        sem = asyncio.Semaphore(S3_CONCURRENCY_LIMIT)

        async def process_entry(full_path):
            async with sem:
                try:
                    # S3 isdir calls can be expensive
                    # if this came back in entries we assume it exists, therefore
                    # let's stop checking isdir
                    # if not await storage.isdir(full_path):
                    #     return None

                    entry_name = full_path.rstrip("/").split("/")[-1]
                    task = TaskTemplate(entry_name)

                    # This likely triggers the actual S3 GetObject call
                    return await task.get_metadata()
                except Exception as e:
                    print(f"Exception getting metadata for {full_path}: {e}")
                    return None

        # Create coroutines for all entries
        coros = [process_entry(full) for full in entries]

        # Run concurrently and wait for all to finish
        combined_results = await asyncio.gather(*coros)

        # Filter out None values from failed attempts or non-directories
        results = [r for r in combined_results if r is not None]

        # Sort by created_at descending
        def sort_key(x):
            created_at = x.get("created_at")
            if created_at is None:
                return 0  # Use 0 for numeric comparison compatibility
            if isinstance(created_at, datetime):
                return created_at.timestamp()
            if isinstance(created_at, (int, float)):
                return created_at
            try:
                # Fallback for ISO strings
                return datetime.fromisoformat(str(created_at)).timestamp()
            except ValueError:
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
        all_tasks = await TaskTemplate.list_all()
        return [task for task in all_tasks if task.get("experiment_id") == experiment_id]

    @staticmethod
    async def list_by_type_in_experiment(task_type: str, experiment_id: int):
        """List all tasks of a specific type in a specific experiment"""
        all_tasks = await TaskTemplate.list_all()
        return [
            task for task in all_tasks if task.get("type") == task_type and task.get("experiment_id") == experiment_id
        ]

    @staticmethod
    async def list_by_subtype_in_experiment(experiment_id: int, subtype: str, task_type: str = None):
        """List all tasks for a specific experiment filtered by subtype and optionally by type"""
        all_tasks = await TaskTemplate.list_all()
        return [
            task
            for task in all_tasks
            if task.get("experiment_id") == experiment_id
            and task.get("subtype") == subtype
            and (task_type is None or task.get("type") == task_type)
        ]

    @staticmethod
    async def get_by_id(task_id: str):
        """Get a specific task by ID"""
        try:
            task = await TaskTemplate.get(task_id)
            return await task.get_metadata()
        except FileNotFoundError:
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
