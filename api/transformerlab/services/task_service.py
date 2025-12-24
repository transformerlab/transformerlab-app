"""
Task service that uses the filesystem instead of the database.
This replaces the database-based task operations with filesystem-based ones.
"""

import uuid
from typing import List, Dict, Any, Optional
from lab.task_template import TaskTemplate as TaskTemplateService


class TaskService:
    """Service for managing tasks using filesystem storage"""

    def __init__(self):
        self.task_service = TaskTemplateService

    def task_get_all(self) -> List[Dict[str, Any]]:
        """Get all tasks from filesystem"""
        return self.task_service.list_all()

    def task_get_by_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific task by ID"""
        return self.task_service.get_by_id(task_id)

    def task_get_by_type(self, task_type: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type"""
        return self.task_service.list_by_type(task_type)

    def task_get_by_experiment(self, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment"""
        return self.task_service.list_by_experiment(experiment_id)

    def task_get_by_type_in_experiment(self, task_type: str, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type in a specific experiment"""
        return self.task_service.list_by_type_in_experiment(task_type, experiment_id)

    def task_get_by_subtype_in_experiment(
        self, experiment_id: str, subtype: str, task_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment filtered by subtype and optionally by type"""
        return self.task_service.list_by_subtype_in_experiment(experiment_id, subtype, task_type)

    def add_task(self, task_data: Dict[str, Any]) -> str:
        """Create a new task - all fields stored directly in JSON"""
        # Generate a unique ID for the task
        task_id = str(uuid.uuid4())

        try:
            task = self.task_service.create(task_id)
            # Store all fields directly (not nested)
            task.set_metadata(**task_data)
            return task_id
        except FileExistsError:
            # If task already exists, generate a new ID
            task_id = str(uuid.uuid4())
            task = self.task_service.create(task_id)
            task.set_metadata(**task_data)
            return task_id

    def update_task(self, task_id: str, new_task_data: Dict[str, Any]) -> bool:
        """Update an existing task"""
        try:
            task = self.task_service.get(str(task_id))

            # Update only the fields that are provided
            update_data = {}
            for key, value in new_task_data.items():
                if value is not None:
                    update_data[key] = value

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

    def task_delete_all(self) -> None:
        """Delete all tasks"""
        self.task_service.delete_all()


# Create a singleton instance
task_service = TaskService()
