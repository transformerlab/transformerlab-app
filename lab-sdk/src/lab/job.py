import posixpath
from werkzeug.utils import secure_filename

from . import dirs
from .labresource import BaseLabResource
from .dirs import get_workspace_dir
from . import storage
import logging

logger = logging.getLogger(__name__)


class Job(BaseLabResource):
    """
    Used to update status and info of long-running jobs.
    """

    def __init__(self, job_id):
        self.id = job_id
        self.should_stop = False

    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        job_id_safe = secure_filename(str(self.id))
        jobs_dir = await dirs.get_jobs_dir()
        job_dir = storage.join(jobs_dir, job_id_safe)
        return job_dir

    async def get_log_path(self):
        """
        Returns the path where this job should write logs.
        """
        # Default location for log file
        job_dir = await self.get_dir()
        log_path = storage.join(job_dir, f"output_{self.id}.txt")

        if not await storage.exists(log_path):
            # Then check if there is a path explicitly set in the job data
            try:
                job_data = await self.get_job_data()
                if isinstance(job_data, dict):
                    override_path = job_data.get("output_file_path", "")
                    if isinstance(override_path, str) and override_path.strip() != "":
                        log_path = override_path
            except Exception:
                pass

        # Make sure whatever log_path we return actually exists
        # Put an empty file there if not
        if not await storage.exists(log_path):
            async with await storage.open(log_path, "w") as f:
                await f.write("")

        return log_path

    def _default_json(self):
        # Note: _default_json can't be async as it's called during object initialization
        # The output_file_path will be set properly when the job is actually used
        default_job_data = {
            "output_file_path": "",  # Will be set when first accessed
        }
        return {
            "id": self.id,
            "experiment_id": "",
            "job_data": default_job_data,
            "status": "NOT_STARTED",
            "type": "REMOTE",
            "progress": 0,
        }

    async def set_experiment(self, experiment_id: str, sync_rebuild: bool = False):
        await self._update_json_data_field("experiment_id", experiment_id)
        await self.update_job_data_field("experiment_name", experiment_id)

        # Trigger cache rebuild for the experiment to discover this job
        try:
            from .experiment import Experiment
            from .dirs import get_workspace_dir

            exp = Experiment(experiment_id)
            workspace = await get_workspace_dir()
            exp._trigger_cache_rebuild(workspace_dir=workspace, sync=sync_rebuild)
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass

    async def update_progress(self, progress: int):
        """
        Update the percent complete for this job.

        progress: int representing percent complete
        """
        await self._update_json_data_field("progress", progress)

    async def update_status(self, status: str):
        """
        Update the status of this job.

        status: str representing the status of the job
        """
        await self._update_json_data_field("status", status)

        # Trigger rebuild on every status update
        try:
            from .experiment import Experiment

            experiment_id = await self.get_experiment_id()
            if experiment_id:
                exp = Experiment(experiment_id)
                workspace = await get_workspace_dir()
                exp._trigger_cache_rebuild(workspace_dir=workspace)
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass

    async def get_status(self):
        """
        Get the status of this job.
        """
        return await self._get_json_data_field("status")

    async def get_progress(self):
        """
        Get the progress of this job.
        """
        return await self._get_json_data_field("progress")

    async def get_job_data(self):
        """
        Get the job_data of this job.
        """
        return await self._get_json_data_field("job_data", {})

    async def set_job_data(self, job_data):
        await self._update_json_data_field("job_data", job_data)

    async def set_tensorboard_output_dir(self, tensorboard_dir: str):
        """
        Sets the directory that tensorboard output is stored.
        """
        await self.update_job_data_field("tensorboard_output_dir", tensorboard_dir)

    async def update_job_data_field(self, key: str, value):
        """
        Updates a key-value pair in the job_data JSON object.
        """
        # Fetch current job_data (use uncached to avoid stale data)
        json_data = await self.get_json_data(uncached=True)

        # If there isn't a job_data property then make one
        if "job_data" not in json_data:
            json_data["job_data"] = {}

        # Set the key property to value and save the whole object
        json_data["job_data"][key] = value
        await self._set_json_data(json_data)

    async def log_info(self, message):
        """
        Save info message to output log file and display to terminal.

        TODO: Figure out a better way to do logging that doesn't rewrite the file!
        """
        # Always print to console
        logger.info(message)

        # Coerce message to string and ensure newline termination
        try:
            message_str = str(message)
        except Exception:
            message_str = "<non-string message>"

        if not message_str.endswith("\n"):
            message_str = message_str + "\n"

        # Read existing content, append new message, and write back to log file
        try:
            log_path = await self.get_log_path()
            await storage.makedirs(posixpath.dirname(log_path), exist_ok=True)

            # Read existing content if file exists
            existing_content = ""
            if await storage.exists(log_path):
                async with await storage.open(log_path, "r", encoding="utf-8") as f:
                    existing_content = await f.read()

            # Append new message to existing content on a new line
            if existing_content and not existing_content.endswith("\n"):
                existing_content += "\n"
            new_content = existing_content + message_str

            # Write back the complete content
            async with await storage.open(log_path, "w", encoding="utf-8") as f:
                await f.write(new_content)
                # Note: async file objects may not have flush()
        except Exception:
            # Best-effort file logging; ignore file errors to avoid crashing job
            pass

    async def set_type(self, job_type: str):
        """
        Set the type of this job.
        """
        await self._update_json_data_field("type", job_type)

    async def get_experiment_id(self):
        """
        Get the experiment_id of this job.
        """
        return await self._get_json_data_field("experiment_id")

    async def set_error_message(self, error_msg: str):
        """
        Set an error message in the job_data.
        """
        await self.update_job_data_field("error_msg", str(error_msg))

    async def update_sweep_progress(self, value):
        """
        Update the 'sweep_progress' key in the job_data JSON object.
        """
        await self.update_job_data_field("sweep_progress", value)

    @classmethod
    async def count_running_jobs(cls):
        """
        Count how many jobs are currently running.
        """
        count = 0
        jobs_dir = await dirs.get_jobs_dir()
        try:
            entries = await storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for job_path in entries:
            if await storage.isdir(job_path):
                entry = job_path.rstrip("/").split("/")[-1]
                try:
                    job = await cls.get(entry)
                    job_data = await job.get_json_data(uncached=True)
                    if job_data.get("status") == "RUNNING":
                        count += 1
                except Exception:
                    pass
        return count

    @classmethod
    async def get_next_queued_job(cls):
        """
        Get the next queued job (oldest first based on directory creation time).
        Returns Job data dict or None if no queued jobs.
        """
        queued_jobs = []
        jobs_dir = await dirs.get_jobs_dir()
        try:
            entries = await storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for job_path in entries:
            if await storage.isdir(job_path):
                entry = job_path.rstrip("/").split("/")[-1]
                try:
                    job = await cls.get(entry)
                    job_data = await job.get_json_data(uncached=True)
                    if job_data.get("status") == "QUEUED":
                        # Without ctime in object stores, sort lexicographically by job id
                        queued_jobs.append((int(entry) if entry.isdigit() else 0, job_data))
                except Exception:
                    pass

        if queued_jobs:
            queued_jobs.sort(key=lambda x: x[0])
            return queued_jobs[0][1]
        return None

    async def get_checkpoints_dir(self):
        """
        Get the checkpoints directory path for this job.
        """
        return await dirs.get_job_checkpoints_dir(self.id)

    async def get_artifacts_dir(self):
        """
        Get the artifacts directory path for this job.
        """
        return await dirs.get_job_artifacts_dir(self.id)

    async def get_checkpoint_paths(self):
        """
        Get list of checkpoint paths for this job.
        Returns list of all items (files and dirs) in the checkpoints directory.
        """
        try:
            # Scan the checkpoints directory for all items (files and dirs)
            checkpoints_dir = await self.get_checkpoints_dir()
            if await storage.exists(checkpoints_dir):
                checkpoint_files = []
                try:
                    items = await storage.ls(checkpoints_dir, detail=False)
                except Exception:
                    items = []
                for item_path in items:
                    checkpoint_files.append(item_path)
                return sorted(checkpoint_files)

            return []
        except Exception:
            return []

    async def get_artifact_paths(self):
        """
        Get list of artifact file paths for this job.
        Returns list of artifact paths from job_data or scans directory.
        """
        try:
            # Scan the artifacts directory
            artifacts_dir = await self.get_artifacts_dir()
            if await storage.exists(artifacts_dir):
                artifact_files = []
                try:
                    items = await storage.ls(artifacts_dir, detail=False)
                except Exception:
                    items = []
                for item_path in items:
                    if await storage.isfile(item_path):
                        artifact_files.append(item_path)
                return sorted(artifact_files)
        except Exception:
            return []
        return []

    async def delete(self):
        """
        Mark this job as deleted.
        """
        await self.update_status("DELETED")

        # Trigger cache rebuild since deleted jobs are removed from cache
        # This is non-blocking - just adds to pending queue
        try:
            from .experiment import Experiment

            experiment_id = await self.get_experiment_id()
            if experiment_id:
                exp = Experiment(experiment_id)
                workspace = await get_workspace_dir()
                exp._trigger_cache_rebuild(workspace_dir=workspace)
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass
