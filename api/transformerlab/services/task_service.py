"""
Task service that uses the filesystem instead of the database.
This replaces the database-based task operations with filesystem-based ones.
"""

import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional
from lab.task_template import TaskTemplate as TaskTemplateService

# Keys that are never removed when syncing from task.yaml (system-owned).
# Any other key in stored metadata that is not in the parsed task_data is
# removed, so we don't need to maintain a list of YAML field names.
_PROTECTED_METADATA_KEYS = frozenset({"id", "experiment_id", "type", "plugin", "created_at"})


class TaskService:
    """Service for managing tasks using filesystem storage"""

    def __init__(self):
        self.task_service = TaskTemplateService

    async def task_get_all(self) -> List[Dict[str, Any]]:
        """Get all tasks from filesystem"""
        return await self.task_service.list_all()

    async def task_get_by_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific task by ID"""
        return await self.task_service.get_by_id(task_id)

    async def task_get_by_type(self, task_type: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type"""
        return await self.task_service.list_by_type(task_type)

    async def task_get_by_experiment(self, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment"""
        return await self.task_service.list_by_experiment(experiment_id)

    async def task_get_by_type_in_experiment(self, task_type: str, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type in a specific experiment"""
        return await self.task_service.list_by_type_in_experiment(task_type, experiment_id)

    async def task_get_by_subtype_in_experiment(
        self, experiment_id: str, subtype: str, task_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment filtered by subtype and optionally by type"""
        return await self.task_service.list_by_subtype_in_experiment(experiment_id, subtype, task_type)

    async def add_task(self, task_data: Dict[str, Any]) -> str:
        """Create a new task - all fields stored directly in JSON"""
        # Generate a unique ID for the task
        task_id = str(uuid.uuid4())

        try:
            task = await self.task_service.create(task_id)
            # Store all fields directly (not nested)
            await task.set_metadata(**task_data)
            return task_id
        except FileExistsError:
            # If task already exists, generate a new ID
            task_id = str(uuid.uuid4())
            task = await self.task_service.create(task_id)
            await task.set_metadata(**task_data)
            return task_id

    async def update_task(self, task_id: str, new_task_data: Dict[str, Any]) -> bool:
        """Update an existing task. Preserves existing file_mounts when the update
        would clear them (e.g. edit form or YAML save that omits file_mounts).
        """
        try:
            task = await self.task_service.get(str(task_id))
            existing = await task.get_metadata()

            # Update only the fields that are provided
            update_data = {}
            for key, value in new_task_data.items():
                if value is None:
                    continue
                # Never overwrite file_mounts when update would clear (existing is True or non-empty dict)
                if key == "file_mounts":
                    would_clear = value is None or value is False or (isinstance(value, dict) and len(value) == 0)
                    if would_clear:
                        existing_mounts = existing.get("file_mounts")
                        if existing_mounts is True or (isinstance(existing_mounts, dict) and len(existing_mounts) > 0):
                            continue  # preserve existing file_mounts
                update_data[key] = value

            if update_data:
                await task.set_metadata(**update_data)
            return True
        except FileNotFoundError:
            return False

    async def update_task_from_yaml(self, task_id: str, task_data: Dict[str, Any]) -> bool:
        """Update task metadata from parsed task.yaml so it matches the YAML exactly.
        Keeps only protected (system) keys from existing metadata, then applies
        task_data; any other key not in task_data is removed (so removing a
        field in the editor actually removes it).
        """
        try:
            task = await self.task_service.get(str(task_id))
            data = await task.get_json_data()

            # Start from existing protected keys only; then apply parsed YAML
            out = {k: data[k] for k in _PROTECTED_METADATA_KEYS if k in data}
            out.update(task_data)

            # Preserve file_mounts when YAML omits it and existing has a value
            if "file_mounts" not in task_data:
                existing_mounts = data.get("file_mounts")
                if existing_mounts is True or (isinstance(existing_mounts, dict) and len(existing_mounts) > 0):
                    out["file_mounts"] = existing_mounts

            out["updated_at"] = datetime.utcnow().isoformat()
            await task._set_json_data(out)
            return True
        except FileNotFoundError:
            return False

    async def delete_task(self, task_id: str) -> bool:
        """Delete a task"""
        try:
            task = await self.task_service.get(str(task_id))
            await task.delete()
            return True
        except FileNotFoundError:
            return False

    async def task_delete_all(self) -> None:
        """Delete all tasks"""
        await self.task_service.delete_all()


# Create a singleton instance
task_service = TaskService()
