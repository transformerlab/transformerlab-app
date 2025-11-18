import threading
import time
from werkzeug.utils import secure_filename

from .dirs import get_experiments_dir, get_jobs_dir, get_workspace_dir
from .labresource import BaseLabResource
from .job import Job
import json
from . import storage
import fsspec


class Experiment(BaseLabResource):
    """
    Base object for managing all config associated with an experiment
    """

    DEFAULT_JOBS_INDEX = {"TRAIN": []}
    
    # Class-level cache for background rebuild tracking
    _cache_rebuild_pending = set()  # set of (experiment_id, workspace_dir) tuples
    _cache_rebuild_lock = threading.Lock()
    _cache_rebuild_thread = None

    def __init__(self, experiment_id, create_new=False):
        self.id = experiment_id
        # Auto-initialize if create_new=True and experiment doesn't exist
        if create_new and (not storage.exists(self.get_dir()) or not storage.exists(self._get_json_file())):
            self._initialize()

    def get_dir(self):
        """Abstract method on BaseLabResource"""
        experiment_id_safe = secure_filename(str(self.id))
        return storage.join(get_experiments_dir(), experiment_id_safe)

    def _default_json(self):
        return {"name": self.id, "id": self.id, "config": {}}

    def _initialize(self):
        super()._initialize()

        # Create a empty jobs index and write
        jobs_json_path = self._jobs_json_file()
        empty_jobs_data = {
            "index": self.DEFAULT_JOBS_INDEX,
            "cached_jobs": {}
        }
        with storage.open(jobs_json_path, "w") as f:
            json.dump(empty_jobs_data, f, indent=4)

    def update_config_field(self, key, value):
        """Update a single key in config."""
        current_config = self._get_json_data_field("config", {})
        if isinstance(current_config, str):
            try:
                current_config = json.loads(current_config)
            except json.JSONDecodeError:
                current_config = {}
        current_config[key] = value
        self._update_json_data_field("config", current_config)
    
    @classmethod
    def create_with_config(cls, name: str, config: dict) -> 'Experiment':
        """Create an experiment with config."""
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                raise TypeError("config must be a dict or valid JSON string")
        elif not isinstance(config, dict):
            raise TypeError("config must be a dict")
        exp = cls.create(name)
        exp._update_json_data_field("config", config)
        return exp

    def update_config(self, config: dict):
        """Update entire config."""
        current_config = self._get_json_data_field("config", {})
        if isinstance(current_config, str):
            try:
                current_config = json.loads(current_config)
            except json.JSONDecodeError:
                current_config = {}
        current_config.update(config)
        self._update_json_data_field("config", current_config)

    @classmethod
    def get_all(cls):
        """Get all experiments as list of dicts."""
        experiments = []
        exp_root = get_experiments_dir()
        if storage.exists(exp_root):
            try:
                entries = storage.ls(exp_root, detail=False)
            except Exception:
                entries = []
            for exp_path in entries:
                try:
                    if storage.isdir(exp_path):
                        index_file = storage.join(exp_path, "index.json")
                        if storage.exists(index_file):
                            with storage.open(index_file, "r") as f:
                                data = json.load(f)
                            experiments.append(data)
                except Exception:
                    pass
        return experiments

    def create_job(self):
        """
        Creates a new job with a blank template and returns a Job object.
        """

        # Choose an ID for the new job
        # Scan the jobs directory for subdirectories with numberic names
        # Find the largest number and increment to get the new job ID
        largest_numeric_subdir = 0
        jobs_dir = get_jobs_dir()
        try:
            entries = storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for full_path in entries:
            entry = full_path.rstrip("/").split("/")[-1]
            if entry.isdigit() and storage.isdir(full_path):
                job_id = int(entry)
                if job_id > largest_numeric_subdir:
                    largest_numeric_subdir = job_id

        new_job_id = largest_numeric_subdir + 1

        # Create job with next available job_id and associate the new job with this experiment
        new_job = Job.create(new_job_id)
        new_job.set_experiment(self.id)

        return new_job

    def get_jobs(self, type: str = "", status: str = ""):
        """
        Get a list of jobs stored in this experiment.
        Uses cached data from jobs.json for completed jobs, only reads individual files for RUNNING jobs.
        type: If not blank, filter by jobs with this type.
        status: If not blank, filter by jobs with this status.
        """

        # First get jobs of the passed type
        job_list = []
        if type:
            job_list = self._get_jobs_of_type(type)
        else:
            job_list = self._get_all_jobs()

        # Get cached job data from jobs.json
        cached_jobs = self._get_cached_jobs_data()
        # print(f"Cached jobs: {cached_jobs}")
        # print(f"Job list: {job_list}")
        
        # Iterate through the job list to return Job objects for valid jobs.
        # Also filter for status if that parameter was passed.
        results = []
        for job_id in job_list:
            try:
                # Check if job is in cache (non-RUNNING jobs are cached)
                if job_id in cached_jobs:
                    # Use cached data for completed jobs
                    job_json = cached_jobs[job_id]
                    # Check status of job if not RUNNING, LAUNCHING or NOT_STARTED, then remove from cache
                    if job_json.get("status", "") in ["RUNNING", "LAUNCHING", "NOT_STARTED"]:
                        old_status = job_json.get("status", "")
                        del cached_jobs[job_id]
                        job = Job.get(job_id)
                        job_json = job.get_json_data()
                        # Trigger rebuild cache if old status and new status are different
                        if old_status != job_json.get("status", ""):
                            self._trigger_cache_rebuild(get_workspace_dir())
                        
                else:
                    # Job not in cache
                    job = Job.get(job_id)
                    job_json = job.get_json_data()
                    # Check if job is COMPLETE, STOPPED or FAILED, then update cache
                    if job_json.get("status", "") in ["COMPLETE", "STOPPED", "FAILED"]:
                        self._trigger_cache_rebuild(get_workspace_dir())
            except Exception:
                continue

            # Filter for status
            if status and (job_json.get("status", "") != status):
                continue

            # Exclude DELETED jobs by default (unless explicitly requested)
            if not status and job_json.get("status", "") == "DELETED":
                continue

            # If it passed filters then add as long as it has job_data
            if "job_data" in job_json:
                results.append(job_json)

        return results

    ###############################
    # jobs.json MANAGMENT FUNCTIONS
    # Index for tracking which jobs belong to this Experiment
    ###############################

    def _jobs_json_file(self, workspace_dir=None, experiment_id = None):
        """
        Path to jobs.json index file for this experiment.
        """
        if workspace_dir and experiment_id:
            return storage.join(workspace_dir, "experiments", experiment_id, "jobs.json")

        return storage.join(self.get_dir(), "jobs.json")

    def rebuild_jobs_index(self, workspace_dir=None):
        results = {}
        cached_jobs = {}
        
        # Create filesystem override if workspace_dir is an S3 URI (for background threads)
        fs_override = None
        if workspace_dir and workspace_dir.startswith(("s3://", "gs://", "abfs://", "gcs://")):
            from .storage import _AWS_PROFILE
            storage_options = {"profile": _AWS_PROFILE} if _AWS_PROFILE else None
            fs_override, _token, _paths = fsspec.get_fs_token_paths(workspace_dir, storage_options=storage_options)
        
        try:
            # Use provided jobs_dir or get current one
            if workspace_dir:
                jobs_directory = storage.join(workspace_dir, "jobs")
            else:
                jobs_directory = get_jobs_dir()
                        
            # Iterate through jobs directories and check for index.json
            # Sort entries numerically since job IDs are numeric strings (descending order)
            try:
                job_entries_full = storage.ls(jobs_directory, detail=False, fs=fs_override)
            except Exception as e:
                print(f"Error getting job entries full: {e}")
                job_entries_full = []
            # Filter out macOS metadata files (._*), the directory itself, and non-numeric entries
            job_entries = []
            for p in job_entries_full:
                entry = p.rstrip("/").split("/")[-1]
                # Skip empty entries, macOS metadata files, and the directory itself
                if not entry or entry.startswith("._") or entry == "":
                    continue
                # Only process numeric job IDs
                if not entry.isdigit():
                    continue
                job_entries.append(entry)
            
            sorted_entries = sorted(job_entries, key=lambda x: int(x), reverse=True)
            for entry in sorted_entries:
                entry_path = storage.join(jobs_directory, entry)
                if not storage.isdir(entry_path, fs=fs_override):
                    continue
                # Prefer the latest snapshot if available; fall back to index.json
                index_file = storage.join(entry_path, "index.json")
                try:
                    with storage.open(index_file, "r", encoding="utf-8", fs=fs_override) as lf:
                        content = lf.read().strip()
                        if not content:
                            # Skip empty files
                            continue
                        data = json.loads(content)
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON for job {entry_path}: {e}")
                    continue
                except Exception as e:
                    print(f"Error loading index.json for job {entry_path}: {e}")
                    continue
                if data.get("experiment_id", "") != self.id:
                    continue
                
                # Skip deleted jobs
                if data.get("status") == "DELETED":
                    continue
                    
                job_type = data.get("type", "UNKNOWN")
                results.setdefault(job_type, []).append(entry)
                
                # Store full job data in cache (except for RUNNING jobs which need real-time updates)
                if data.get("status") != "RUNNING":
                    cached_jobs[entry] = data

            # Write discovered index to jobs.json with both structure and cached data
            jobs_data = {
                "index": results,
                "cached_jobs": cached_jobs
            }
            if results:
                try:
                    with storage.open(self._jobs_json_file(workspace_dir=workspace_dir, experiment_id=self.id), "w", fs=fs_override) as out:
                        json.dump(jobs_data, out, indent=4)
                except Exception as e:
                    print(f"Error writing jobs index: {e}")
                    pass
        except Exception as e:
            print(f"Error rebuilding jobs index: {e}")
            pass

    def _get_cached_jobs_data(self):
        """
        Get cached job data from jobs.json file.
        If the file doesn't exist, create it with default structure.
        """
        jobs_json_path = self._jobs_json_file()
        try:
            with storage.open(jobs_json_path, "r") as f:
                jobs_data = json.load(f)
                # Handle both old format (just index) and new format (with cached_jobs)
                if "cached_jobs" in jobs_data:
                    return jobs_data["cached_jobs"]
                else:
                    # Old format - return empty dict
                    return {}
        except FileNotFoundError:
            # Rebuild jobs index to discover and create jobs.json
            self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                with storage.open(jobs_json_path, "r") as f:
                    jobs_data = json.load(f)
                    if "cached_jobs" in jobs_data:
                        return jobs_data["cached_jobs"]
                    else:
                        return {}
            except Exception:
                return {}
        except Exception:
            return {}

    def _get_all_jobs(self):
        """
        Amalgamates all jobs in the index file.
        If the file doesn't exist, create it with default structure.
        """
        jobs_json_path = self._jobs_json_file()
        try:
            with storage.open(jobs_json_path, "r") as f:
                jobs_data = json.load(f)
                # Handle both old format (just index) and new format (with index key)
                if "index" in jobs_data:
                    jobs = jobs_data["index"]
                else:
                    jobs = jobs_data  # Old format
                results = []
                for key, value in jobs.items():
                    if isinstance(value, list):
                        results.extend(value)
                return results
        except FileNotFoundError:
            # Rebuild jobs index to discover and create jobs.json
            self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                with storage.open(jobs_json_path, "r") as f:
                    jobs_data = json.load(f)
                    if "index" in jobs_data:
                        jobs = jobs_data["index"]
                    else:
                        jobs = jobs_data
                    results = []
                    for key, value in jobs.items():
                        if isinstance(value, list):
                            results.extend(value)
                    return results
            except Exception:
                return []
        except Exception:
            return []

    def _get_jobs_of_type(self, type="TRAIN"):
        """ "
        Returns all jobs of a specific type in this experiment's index file.
        If the file doesn't exist, create it with default structure.
        """
        jobs_json_path = self._jobs_json_file()
        try:
            with storage.open(jobs_json_path, "r") as f:
                jobs_data = json.load(f)
                # Handle both old format (just index) and new format (with index key)
                if "index" in jobs_data:
                    jobs = jobs_data["index"]
                else:
                    jobs = jobs_data  # Old format
                result = jobs.get(type, [])
                return result
        except FileNotFoundError:
            # Rebuild jobs index to discover and create jobs.json
            self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                with storage.open(jobs_json_path, "r") as f:
                    jobs_data = json.load(f)
                    if "index" in jobs_data:
                        jobs = jobs_data["index"]
                    else:
                        jobs = jobs_data
                    result = jobs.get(type, [])
                    return result
            except Exception:
                return []
        except Exception as e:
            print("Failed getting jobs:", e)
            return []

    def _add_job(self, job_id, type):
        try:
            with storage.open(self._jobs_json_file(), "r") as f:
                jobs_data = json.load(f)
        except Exception:
            jobs_data = {"index": {}, "cached_jobs": {}}
        
        # Handle both old and new format
        if "index" in jobs_data:
            jobs = jobs_data["index"]
        else:
            jobs = jobs_data
            jobs_data = {"index": jobs, "cached_jobs": {}}
        
        if type in jobs:
            jobs[type].append(job_id)
        else:
            jobs[type] = [job_id]
        
        # Update the file with new structure
        with storage.open(self._jobs_json_file(), "w") as f:
            json.dump(jobs_data, f, indent=4)
        
        # Trigger background cache rebuild
        self._trigger_cache_rebuild(get_workspace_dir())
    
    @classmethod
    def _start_background_cache_rebuild(cls):
        """Start the background cache rebuild thread if not already running."""
        with cls._cache_rebuild_lock:
            if cls._cache_rebuild_thread is None or not cls._cache_rebuild_thread.is_alive():
                cls._cache_rebuild_thread = threading.Thread(
                    target=cls._background_cache_rebuild_worker,
                    daemon=True
                )
                cls._cache_rebuild_thread.start()
    
    @classmethod
    def _background_cache_rebuild_worker(cls):
        """Background worker that rebuilds caches for pending experiments."""
        print("STARTING CACHE REBUILD WORKER")
        while True:
            try:
                # Get pending experiments with their workspace directories
                with cls._cache_rebuild_lock:
                    pending_experiments = set(cls._cache_rebuild_pending)
                    cls._cache_rebuild_pending.clear()
                
                # Rebuild caches for pending experiments
                for experiment_id, workspace_dir in pending_experiments:
                    try:
                        
                        exp = cls(experiment_id)
                        exp.rebuild_jobs_index(workspace_dir=workspace_dir)
                    except Exception as e:
                        print(f"Error rebuilding cache for experiment {experiment_id} in workspace {workspace_dir}: {e}")

                # Sleep for a short time before checking again
                time.sleep(1)
            except Exception as e:
                print(f"Error in background cache rebuild worker: {e}")
                time.sleep(5)  # Wait longer on error
    
    def _trigger_cache_rebuild(self, workspace_dir, sync=False):
        """Trigger a cache rebuild for this experiment."""
        if sync:
            # Run synchronously (useful for tests)
            self.rebuild_jobs_index(workspace_dir=workspace_dir)
        else:
            # Start background thread if not running
            self._start_background_cache_rebuild()
                    
            # Add to pending queue with jobs directory (non-blocking)
            with self._cache_rebuild_lock:
                self._cache_rebuild_pending.add((self.id, workspace_dir))
    
    # TODO: For experiments, delete the same way as jobs
    def delete(self):
        """Delete the experiment and all associated jobs."""
        # Delete all associated jobs
        self.delete_all_jobs()
        # Delete the experiment directory
        exp_dir = self.get_dir()
        if storage.exists(exp_dir):
            storage.rm_tree(exp_dir)

    def delete_all_jobs(self):
        """Delete all jobs associated with this experiment."""
        all_jobs = self._get_all_jobs()
        for job_id in all_jobs:
            try:
                job = Job.get(job_id)
                job.delete()
            except Exception:
                pass  # Job might not exist
        
        self._trigger_cache_rebuild(get_workspace_dir())