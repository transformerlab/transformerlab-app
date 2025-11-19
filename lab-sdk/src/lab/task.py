from datetime import datetime
from werkzeug.utils import secure_filename

from .dirs import get_tasks_dir
from .labresource import BaseLabResource
from . import storage


class Task(BaseLabResource):
    def get_dir(self):
        """Abstract method on BaseLabResource"""
        task_id_safe = secure_filename(str(self.id))
        return storage.join(get_tasks_dir(), task_id_safe)

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

    def set_metadata(self, *, name: str | None = None, type: str | None = None, 
                     inputs: dict | None = None, config: dict | None = None,
                     plugin: str | None = None, outputs: dict | None = None,
                     experiment_id: str | None = None, remote_task: bool | None = None):
        """Set task metadata"""
        data = self.get_json_data()
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
        self._set_json_data(data)

    def get_metadata(self):
        """Get task metadata"""
        data = self.get_json_data()
        
        # Fix experiment_id if it's a digit - convert to experiment name
        if data.get("experiment_id") and str(data["experiment_id"]).isdigit():
            experiment_name = self._get_experiment_name_by_id(data["experiment_id"])
            if experiment_name:
                data["experiment_id"] = experiment_name
                # Save the corrected data back to the file
                self._set_json_data(data)
        
        return data
    
    def _get_experiment_name_by_id(self, experiment_id):
        """Get experiment name by ID, return None if not found"""
        try:
            from .experiment import Experiment
            
            # Get all experiments and search for one with matching db_experiment_id
            all_experiments = Experiment.get_all()
            for exp_data in all_experiments:
                if exp_data.get("db_experiment_id") == int(experiment_id):
                    return exp_data.get("name", experiment_id)
            
            # If no match found, return the original ID
            return experiment_id
        except Exception:
            return experiment_id

    @staticmethod
    def list_all():
        """List all tasks in the filesystem"""
        results = []
        tasks_dir = get_tasks_dir()
        if not storage.isdir(tasks_dir):
            print(f"Tasks directory does not exist: {tasks_dir}")
            return results
        try:
            
            entries = storage.ls(tasks_dir, detail=False)
        except Exception as e:
            print(f"Exception listing tasks directory: {e}")
            entries = []
        for full in entries:
            if not storage.isdir(full):
                continue
            # Attempt to read index.json (or latest snapshot)
            try:
                entry = full.rstrip("/").split("/")[-1]
                task = Task(entry)

                results.append(task.get_metadata())
            except Exception:
                print(f"Exception getting metadata for task: {entry}")
                continue
        # Sort by created_at descending to match database behavior
        results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return results

    @staticmethod
    def list_by_type(task_type: str):
        """List all tasks of a specific type"""
        all_tasks = Task.list_all()
        return [task for task in all_tasks if task.get("type") == task_type]

    @staticmethod
    def list_by_experiment(experiment_id: int):
        """List all tasks for a specific experiment"""
        all_tasks = Task.list_all()
        return [task for task in all_tasks if task.get("experiment_id") == experiment_id]

    @staticmethod
    def list_by_type_in_experiment(task_type: str, experiment_id: int):
        """List all tasks of a specific type in a specific experiment"""
        all_tasks = Task.list_all()
        return [task for task in all_tasks 
                if task.get("type") == task_type and task.get("experiment_id") == experiment_id]

    @staticmethod
    def get_by_id(task_id: str):
        """Get a specific task by ID"""
        try:
            task = Task.get(task_id)
            return task.get_metadata()
        except FileNotFoundError:
            return None

    @staticmethod
    def delete_all():
        """Delete all tasks"""
        tasks_dir = get_tasks_dir()
        if not storage.isdir(tasks_dir):
            return
        try:
            entries = storage.ls(tasks_dir, detail=False)
        except Exception:
            entries = []
        for full in entries:
            if storage.isdir(full):
                storage.rm_tree(full)
