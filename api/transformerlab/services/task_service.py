"""
Task service that uses the filesystem instead of the database.
This replaces the database-based task operations with filesystem-based ones.
"""

import uuid
import os
import tempfile
import zipfile
from datetime import datetime
from typing import List, Dict, Any, Optional
from lab.task_template import TaskTemplate as TaskTemplateService
from lab import storage
from fastapi import HTTPException
from werkzeug.utils import secure_filename

# Keys that are never removed when syncing from task.yaml (system-owned).
# Any other key in stored metadata that is not in the parsed task_data is
# removed, so we don't need to maintain a list of YAML field names.
_PROTECTED_METADATA_KEYS = frozenset({"id", "experiment_id", "type", "plugin", "created_at"})
DEFAULT_TASK_YAML = 'name: my-task\nresources:\n  cpus: 2\n  memory: 4\nrun: "echo hello"'


def _normalize_legacy_command(task: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Backward compatibility helper: some legacy tasks may still store their
    entrypoint under the key "command" instead of "run". To avoid breaking
    those when launching or exporting, expose "run" on read if it is missing
    or empty but "command" is present. New code should only write "run".
    """
    if not task:
        return task

    # If run is already set and truthy, do nothing.
    if task.get("run"):
        return task

    legacy_command = task.get("command")
    if not legacy_command:
        return task

    # Return a shallow copy with run populated so callers always see run.
    normalized = dict(task)
    normalized["run"] = legacy_command
    return normalized


class TaskService:
    """Service for managing tasks using filesystem storage"""

    def __init__(self):
        self.task_service = TaskTemplateService

    async def task_get_all(self) -> List[Dict[str, Any]]:
        """Get all tasks from filesystem"""
        tasks = await self.task_service.list_all()
        return [_normalize_legacy_command(t) or t for t in tasks]

    async def task_get_by_id(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific task by ID"""
        task = await self.task_service.get_by_id(task_id)
        return _normalize_legacy_command(task)

    async def task_get_by_type(self, task_type: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type"""
        tasks = await self.task_service.list_by_type(task_type)
        return [_normalize_legacy_command(t) or t for t in tasks]

    async def task_get_by_experiment(self, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment"""
        tasks = await self.task_service.list_by_experiment(experiment_id)
        return [_normalize_legacy_command(t) or t for t in tasks]

    async def task_get_by_type_in_experiment(self, task_type: str, experiment_id: str) -> List[Dict[str, Any]]:
        """Get all tasks of a specific type in a specific experiment"""
        tasks = await self.task_service.list_by_type_in_experiment(task_type, experiment_id)
        return [_normalize_legacy_command(t) or t for t in tasks]

    async def task_get_by_subtype_in_experiment(
        self, experiment_id: str, subtype: str, task_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get all tasks for a specific experiment filtered by subtype and optionally by type"""
        tasks = await self.task_service.list_by_subtype_in_experiment(experiment_id, subtype, task_type)
        return [_normalize_legacy_command(t) or t for t in tasks]

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

    async def get_task_dir(self, task_id: str) -> str:
        task = await self.task_service.get(str(task_id))
        return await task.get_dir()

    async def write_task_yaml(self, task_id: str, content: str) -> None:
        task_dir = await self.get_task_dir(task_id)
        await storage.makedirs(task_dir, exist_ok=True)
        yaml_path = storage.join(task_dir, "task.yaml")
        async with await storage.open(yaml_path, "w", encoding="utf-8") as f:
            await f.write(content)

    async def read_task_yaml(self, task_id: str) -> str:
        task_dir = await self.get_task_dir(task_id)
        yaml_path = storage.join(task_dir, "task.yaml")
        if not await storage.exists(yaml_path):
            raise HTTPException(status_code=404, detail="task.yaml not found for this task")
        async with await storage.open(yaml_path, "r", encoding="utf-8") as f:
            return await f.read()

    async def create_task_from_blank(
        self,
        experiment_id: str,
        user_and_team: dict,
        session: Any,
        resolve_provider: Any,
    ) -> str:
        task_data = {
            "experiment_id": experiment_id,
            "type": "REMOTE",
            "plugin": "remote_orchestrator",
            "name": "my-task",
        }
        await resolve_provider(task_data, user_and_team, session)
        task_id = await self.add_task(task_data)
        await self.write_task_yaml(task_id, DEFAULT_TASK_YAML)
        return task_id

    async def create_task_from_github(
        self,
        experiment_id: str,
        github_repo_url: str,
        github_repo_dir: Optional[str],
        github_repo_branch: Optional[str],
        create_if_missing: bool,
        user_and_team: dict,
        session: Any,
        resolve_provider: Any,
        fetch_task_yaml: Any,
        parse_yaml: Any,
    ) -> str:
        try:
            task_yaml_content = await fetch_task_yaml(
                github_repo_url, directory=github_repo_dir, ref=github_repo_branch
            )
        except HTTPException as e:
            if e.status_code == 404 and create_if_missing:
                default_yaml_lines = DEFAULT_TASK_YAML.split("\n")
                default_yaml_lines.append(f'github_repo_url: "{github_repo_url}"')
                if github_repo_dir:
                    default_yaml_lines.append(f'github_repo_dir: "{github_repo_dir}"')
                if github_repo_branch:
                    default_yaml_lines.append(f'github_repo_branch: "{github_repo_branch}"')
                task_yaml_content = "\n".join(default_yaml_lines)
            else:
                raise

        task_data = parse_yaml(task_yaml_content)
        task_data["experiment_id"] = experiment_id
        task_data.setdefault("type", "REMOTE")
        task_data.setdefault("plugin", "remote_orchestrator")
        await resolve_provider(task_data, user_and_team, session)
        if "name" in task_data:
            task_data["name"] = secure_filename(task_data["name"])
        task_id = await self.add_task(task_data)
        await self.write_task_yaml(task_id, task_yaml_content)
        return task_id

    async def create_task_from_directory_zip(
        self,
        experiment_id: str,
        zip_content: bytes,
        user_and_team: dict,
        session: Any,
        resolve_provider: Any,
        parse_yaml: Any,
    ) -> str:
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, "upload.zip")
            with open(zip_path, "wb") as f:
                f.write(zip_content)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(tmpdir)

            yaml_candidates = []
            for root, _dirs, files in os.walk(tmpdir):
                for name in files:
                    if name == "task.yaml":
                        yaml_candidates.append(os.path.join(root, name))
            if not yaml_candidates:
                raise HTTPException(status_code=400, detail="ZIP must contain a task.yaml file.")

            task_yaml_path = yaml_candidates[0]
            task_root = os.path.dirname(task_yaml_path)
            with open(task_yaml_path, "r", encoding="utf-8") as f:
                task_yaml_content = f.read()

            task_data = parse_yaml(task_yaml_content)
            task_data["experiment_id"] = experiment_id
            task_data.setdefault("type", "REMOTE")
            task_data.setdefault("plugin", "remote_orchestrator")
            await resolve_provider(task_data, user_and_team, session)
            if "name" in task_data:
                task_data["name"] = secure_filename(task_data["name"])
            task_id = await self.add_task(task_data)
            task_dir = await self.get_task_dir(task_id)
            await storage.makedirs(task_dir, exist_ok=True)
            await storage.copy_dir(task_root, task_dir)
            await self.update_task(task_id, {"file_mounts": True})
            return task_id


# Create a singleton instance
task_service = TaskService()
