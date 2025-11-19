import posixpath
from werkzeug.utils import secure_filename

from . import dirs
from .labresource import BaseLabResource
from .dirs import get_workspace_dir
from . import storage


class Job(BaseLabResource):
    """
    Used to update status and info of long-running jobs.
    """

    def __init__(self, job_id):
        self.id = job_id
        self.should_stop = False

    def get_dir(self):
        """Abstract method on BaseLabResource"""
        job_id_safe = secure_filename(str(self.id))
        job_dir = storage.join(dirs.get_jobs_dir(), job_id_safe)
        return job_dir

    def get_log_path(self):
        """
        Returns the path where this job should write logs.
        """
        # Default location for log file
        log_path = storage.join(self.get_dir(), f"output_{self.id}.txt")

        if not storage.exists(log_path):
            # Then check if there is a path explicitly set in the job data
            try:
                job_data = self.get_job_data()
                if isinstance(job_data, dict):
                    override_path = job_data.get("output_file_path", "")
                    if isinstance(override_path, str) and override_path.strip() != "":
                        log_path = override_path
            except Exception:
                pass

        # Make sure whatever log_path we return actually exists
        # Put an empty file there if not
        if not storage.exists(log_path):
            with storage.open(log_path, "w") as f:
                f.write("")

        return log_path

    def _default_json(self):
        default_job_data = {
            "output_file_path": self.get_log_path(),
        }
        return {
            "id": self.id,
            "experiment_id": "",
            "job_data": default_job_data,
            "status": "NOT_STARTED",
            "type": "REMOTE",
            "progress": 0,
        }

    def set_experiment(self, experiment_id: str, sync_rebuild: bool = False):
        self._update_json_data_field("experiment_id", experiment_id)
        self.update_job_data_field("experiment_name", experiment_id)
        
        # Trigger cache rebuild for the experiment to discover this job
        try:
            from .experiment import Experiment
            from .dirs import get_workspace_dir
            exp = Experiment(experiment_id)
            exp._trigger_cache_rebuild(workspace_dir=get_workspace_dir(), sync=sync_rebuild)
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass

    def update_progress(self, progress: int):
        """
        Update the percent complete for this job.

        progress: int representing percent complete
        """
        self._update_json_data_field("progress", progress)

    def update_status(self, status: str):
        """
        Update the status of this job.

        status: str representing the status of the job
        """
        self._update_json_data_field("status", status)
        
        # Trigger rebuild on every status update
        try:
            from .experiment import Experiment
            experiment_id = self.get_experiment_id()
            if experiment_id:
                exp = Experiment(experiment_id)
                exp._trigger_cache_rebuild(workspace_dir=get_workspace_dir())
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass

    def get_status(self):
        """
        Get the status of this job.
        """
        return self._get_json_data_field("status")

    def get_progress(self):
        """
        Get the progress of this job.
        """
        return self._get_json_data_field("progress")

    def get_job_data(self):
        """
        Get the job_data of this job.
        """
        return self._get_json_data_field("job_data", {})

    def set_job_data(self, job_data):
        self._update_json_data_field("job_data", job_data)

    def set_tensorboard_output_dir(self, tensorboard_dir: str):
        """
        Sets the directory that tensorboard output is stored.
        """
        self.update_job_data_field("tensorboard_output_dir", tensorboard_dir)

    def update_job_data_field(self, key: str, value):
        """
        Updates a key-value pair in the job_data JSON object.
        """
        # Fetch current job_data
        json_data = self.get_json_data()

        # If there isn't a job_data property then make one
        if "job_data" not in json_data:
            json_data["job_data"] = {}

        # Set the key property to value and save the whole object
        json_data["job_data"][key] = value
        self._set_json_data(json_data)

    def log_info(self, message):
        """
        Save info message to output log file and display to terminal.

        TODO: Using logging or something proper to do this.
        """
        # Always print to console
        print(message)

        # Coerce message to string and ensure newline termination
        try:
            message_str = str(message)
        except Exception:
            message_str = "<non-string message>"

        if not message_str.endswith("\n"):
            message_str = message_str + "\n"

        # Read existing content, append new message, and write back to log file
        try:
            log_path = self.get_log_path()
            storage.makedirs(posixpath.dirname(log_path), exist_ok=True)
            
            # Read existing content if file exists
            existing_content = ""
            if storage.exists(log_path):
                with storage.open(log_path, "r", encoding="utf-8") as f:
                    existing_content = f.read()
            
            # Append new message to existing content on a new line
            if existing_content and not existing_content.endswith("\n"):
                existing_content += "\n"
            new_content = existing_content + message_str
            
            # Write back the complete content
            with storage.open(log_path, "w", encoding="utf-8") as f:
                f.write(new_content)
                f.flush()
        except Exception:
            # Best-effort file logging; ignore file errors to avoid crashing job
            pass

    def set_type(self, job_type: str):
        """
        Set the type of this job.
        """
        self._update_json_data_field("type", job_type)

    def get_experiment_id(self):
        """
        Get the experiment_id of this job.
        """
        return self._get_json_data_field("experiment_id")

    def set_error_message(self, error_msg: str):
        """
        Set an error message in the job_data.
        """
        self.update_job_data_field("error_msg", str(error_msg))

    def update_sweep_progress(self, value):
        """
        Update the 'sweep_progress' key in the job_data JSON object.
        """
        self.update_job_data_field("sweep_progress", value)

    @classmethod
    def count_running_jobs(cls):
        """
        Count how many jobs are currently running.
        """
        count = 0
        jobs_dir = dirs.get_jobs_dir()
        try:
            entries = storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for job_path in entries:
            if storage.isdir(job_path):
                entry = job_path.rstrip("/").split("/")[-1]
                try:
                    job = cls.get(entry)
                    job_data = job.get_json_data()
                    if job_data.get("status") == "RUNNING":
                        count += 1
                except Exception:
                    pass
        return count

    @classmethod
    def get_next_queued_job(cls):
        """
        Get the next queued job (oldest first based on directory creation time).
        Returns Job data dict or None if no queued jobs.
        """
        queued_jobs = []
        jobs_dir = dirs.get_jobs_dir()
        try:
            entries = storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for job_path in entries:
            if storage.isdir(job_path):
                entry = job_path.rstrip("/").split("/")[-1]
                try:
                    job = cls.get(entry)
                    job_data = job.get_json_data()
                    if job_data.get("status") == "QUEUED":
                        # Without ctime in object stores, sort lexicographically by job id
                        queued_jobs.append((int(entry) if entry.isdigit() else 0, job_data))
                except Exception:
                    pass
        
        if queued_jobs:
            queued_jobs.sort(key=lambda x: x[0])
            return queued_jobs[0][1]
        return None

    def get_checkpoints_dir(self):
        """
        Get the checkpoints directory path for this job.
        """
        return dirs.get_job_checkpoints_dir(self.id)
    
    def get_artifacts_dir(self):
        """
        Get the artifacts directory path for this job.
        """
        return dirs.get_job_artifacts_dir(self.id)
    
    def get_checkpoint_paths(self):
        """
        Get list of checkpoint paths for this job.
        Returns list of all items (files and dirs) in the checkpoints directory.
        """
        try:
            # Scan the checkpoints directory for all items (files and dirs)
            checkpoints_dir = self.get_checkpoints_dir()
            if storage.exists(checkpoints_dir):
                checkpoint_files = []
                try:
                    items = storage.ls(checkpoints_dir, detail=False)
                except Exception:
                    items = []
                for item_path in items:
                    checkpoint_files.append(item_path)
                return sorted(checkpoint_files)
            
            return []
        except Exception:
            return []
    
    
    def get_artifact_paths(self):
        """
        Get list of artifact file paths for this job.
        Returns list of artifact paths from job_data or scans directory.
        """
        try:
            # Scan the artifacts directory
            artifacts_dir = self.get_artifacts_dir()
            if storage.exists(artifacts_dir):
                artifact_files = []
                try:
                    items = storage.ls(artifacts_dir, detail=False)
                except Exception:
                    items = []
                for item_path in items:
                    if storage.isfile(item_path):
                        artifact_files.append(item_path)
                return sorted(artifact_files)
        except Exception:
            return []
        return []

    def delete(self):
        """
        Mark this job as deleted.
        """
        self.update_status("DELETED")
        
        # Trigger cache rebuild since deleted jobs are removed from cache
        # This is non-blocking - just adds to pending queue
        try:
            from .experiment import Experiment
            experiment_id = self.get_experiment_id()
            if experiment_id:
                exp = Experiment(experiment_id)
                exp._trigger_cache_rebuild(workspace_dir=get_workspace_dir())
        except Exception:
            # Don't fail if cache rebuild trigger fails
            pass