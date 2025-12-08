"""
Tasks service that uses the filesystem instead of the database.
This replaces the database-based task operations with filesystem-based ones.
"""

import uuid
from typing import Any

from lab.task import Task as TaskService


class TasksService:
    """Service for managing tasks using filesystem storage"""

    def __init__(self):
        self.task_service = TaskService

    def tasks_get_all(self) -> list[dict[str, Any]]:
        """Get all tasks from filesystem"""
        return self.task_service.list_all()

    def tasks_get_by_id(self, task_id: str) -> dict[str, Any] | None:
        """Get a specific task by ID"""
        return self.task_service.get_by_id(task_id)

    def tasks_get_by_type(self, task_type: str) -> list[dict[str, Any]]:
        """Get all tasks of a specific type"""
        return self.task_service.list_by_type(task_type)

    def tasks_get_by_experiment(self, experiment_id: str) -> list[dict[str, Any]]:
        """Get all tasks for a specific experiment"""
        return self.task_service.list_by_experiment(experiment_id)

    def tasks_get_by_type_in_experiment(
        self, task_type: str, experiment_id: str
    ) -> list[dict[str, Any]]:
        """Get all tasks of a specific type in a specific experiment"""
        return self.task_service.list_by_type_in_experiment(task_type, experiment_id)

    def add_task(
        self,
        name: str,
        task_type: str,
        inputs: dict[str, Any],
        config: dict[str, Any],
        plugin: str,
        outputs: dict[str, Any],
        experiment_id: str | None,
        remote_task: bool = False,
    ) -> str:
        """Create a new task"""
        # Generate a unique ID for the task
        task_id = str(uuid.uuid4())

        try:
            task = self.task_service.create(task_id)
            task.set_metadata(
                name=name,
                type=task_type,
                inputs=inputs,
                config=config,
                plugin=plugin,
                outputs=outputs,
                experiment_id=experiment_id,
                remote_task=remote_task,
            )
            return task_id
        except FileExistsError:
            # If task already exists, generate a new ID
            task_id = str(uuid.uuid4())
            task = self.task_service.create(task_id)
            task.set_metadata(
                name=name,
                type=task_type,
                inputs=inputs,
                config=config,
                plugin=plugin,
                outputs=outputs,
                experiment_id=experiment_id,
                remote_task=remote_task,
            )
            return task_id

    def update_task(self, task_id: str, new_task_data: dict[str, Any]) -> bool:
        """Update an existing task"""
        try:
            task = self.task_service.get(str(task_id))

            # Update only the fields that are provided
            update_data = {}
            if new_task_data.get("name"):
                update_data["name"] = new_task_data["name"]
            if "inputs" in new_task_data:
                update_data["inputs"] = new_task_data["inputs"]
            if "config" in new_task_data:
                update_data["config"] = new_task_data["config"]
            if "outputs" in new_task_data:
                update_data["outputs"] = new_task_data["outputs"]

            if update_data:
                task.set_metadata(**update_data)
            return True
        except FileNotFoundError:
            return False

    def delete_task(self, task_id: str) -> bool:
        """Delete a task"""
        try:
            task = self.task_service.get(str(task_id))
            task.delete()
            return True
        except FileNotFoundError:
            return False

    def tasks_delete_all(self) -> None:
        """Delete all tasks"""
        self.task_service.delete_all()


# Create a singleton instance
tasks_service = TasksService()
