import asyncio
import threading
import time
from werkzeug.utils import secure_filename

from .dirs import get_experiments_dir, get_jobs_dir, get_workspace_dir
from .labresource import BaseLabResource
from .job import Job
import json
from . import storage


class Experiment(BaseLabResource):
    """
    Base object for managing all config associated with an experiment
    """

    DEFAULT_JOBS_INDEX = {"TRAIN": []}

    # Class-level cache for background rebuild tracking
    _cache_rebuild_pending = set()  # set of (experiment_id, workspace_dir) tuples
    _cache_rebuild_lock = threading.Lock()
    _cache_rebuild_thread = None

    def __init__(self, experiment_id):
        # For consistency and simplicity, let's edit experiment name to match
        # the directory (which requires experiment_id)
        self.id = secure_filename(str(experiment_id))

    @classmethod
    async def create_or_get(cls, experiment_id, create_new=False):
        """
        Factory method to create or get an experiment.
        If create_new=True, will initialize a new experiment if it doesn't exist.

        Args:
            experiment_id: The experiment identifier
            create_new: If True, create the experiment if it doesn't exist

        Returns:
            Experiment instance
        """
        exp = cls(experiment_id)

        if create_new:
            exp_dir = await exp.get_dir()
            json_file = await exp._get_json_file()
            # Auto-initialize if experiment doesn't exist
            if not await storage.exists(exp_dir) or not await storage.exists(json_file):
                await exp._initialize()

        return exp

    async def get_dir(self):
        """Abstract method on BaseLabResource"""
        experiment_id_safe = secure_filename(str(self.id))
        experiments_dir = await get_experiments_dir()
        return storage.join(experiments_dir, experiment_id_safe)

    def _default_json(self):
        return {"name": self.id, "id": self.id, "config": {}}

    async def _initialize(self):
        await super()._initialize()

        # Create a empty jobs index and write
        jobs_json_path = await self._jobs_json_file()
        empty_jobs_data = {"index": self.DEFAULT_JOBS_INDEX, "cached_jobs": {}}
        async with await storage.open(jobs_json_path, "w") as f:
            await f.write(json.dumps(empty_jobs_data, indent=4))

    async def update_config_field(self, key, value):
        """Update a single key in config."""
        current_config = await self._get_json_data_field("config", {})
        if isinstance(current_config, str):
            try:
                current_config = json.loads(current_config)
            except json.JSONDecodeError:
                current_config = {}
        current_config[key] = value
        await self._update_json_data_field("config", current_config)

    @classmethod
    async def create_with_config(cls, name: str, config: dict) -> "Experiment":
        """Create an experiment with config."""
        if isinstance(config, str):
            try:
                config = json.loads(config)
            except json.JSONDecodeError:
                raise TypeError("config must be a dict or valid JSON string")
        elif not isinstance(config, dict):
            raise TypeError("config must be a dict")
        exp = await cls.create(name)
        await exp._update_json_data_field("config", config)
        return exp

    async def update_config(self, config: dict):
        """Update entire config."""
        current_config = await self._get_json_data_field("config", {})
        if isinstance(current_config, str):
            try:
                current_config = json.loads(current_config)
            except json.JSONDecodeError:
                current_config = {}
        current_config.update(config)
        await self._update_json_data_field("config", current_config)

    @classmethod
    async def get_all(cls):
        """Get all experiments as list of dicts."""
        experiments = []
        exp_root = await get_experiments_dir()
        if await storage.exists(exp_root):
            try:
                entries = await storage.ls(exp_root, detail=False)
            except Exception:
                entries = []
            for exp_path in entries:
                try:
                    if await storage.isdir(exp_path):
                        index_file = storage.join(exp_path, "index.json")
                        if await storage.exists(index_file):
                            async with await storage.open(index_file, "r", uncached=True) as f:
                                content = await f.read()
                                data = json.loads(content)

                            name = data.get("name")
                            exp_id = data.get("id")

                            # If both name and id are missing, skip this experiment
                            if not name and not exp_id:
                                print(f"Experiment at {exp_path} missing required 'name' and 'id' fields; skipping")
                                continue

                            # If name missing but id present, copy id -> name and persist
                            if not name and exp_id:
                                data["name"] = exp_id
                                try:
                                    async with await storage.open(index_file, "w") as wf:
                                        content = json.dumps(data, indent=4)
                                        await wf.write(content)
                                    name = exp_id
                                except Exception:
                                    # If we couldn't persist, skip to avoid inconsistent state
                                    continue

                            # If id missing but name present, copy name -> id and persist
                            if not exp_id and name:
                                data["id"] = name
                                try:
                                    async with await storage.open(index_file, "w") as wf:
                                        content = json.dumps(data, indent=4)
                                        await wf.write(content)
                                    exp_id = name
                                except Exception as e:
                                    print(
                                        f"Failed to write corrected index.json for experiment '{name}' at {index_file} (copied name -> id): {e}"
                                    )
                                    # If we couldn't persist, skip to avoid inconsistent state
                                    continue

                            experiments.append(data)
                except Exception:
                    pass
        return experiments

    async def create_job(self):
        """
        Creates a new job with a blank template and returns a Job object.
        """

        # Choose an ID for the new job
        # Scan the jobs directory for subdirectories with numberic names
        # Find the largest number and increment to get the new job ID
        largest_numeric_subdir = 0
        jobs_dir = await get_jobs_dir()
        try:
            entries = await storage.ls(jobs_dir, detail=False)
        except Exception:
            entries = []
        for full_path in entries:
            entry = full_path.rstrip("/").split("/")[-1]
            if entry.isdigit() and await storage.isdir(full_path):
                job_id = int(entry)
                if job_id > largest_numeric_subdir:
                    largest_numeric_subdir = job_id

        new_job_id = largest_numeric_subdir + 1

        # Create job with next available job_id and associate the new job with this experiment
        new_job = await Job.create(new_job_id)
        await new_job.set_experiment(self.id)

        return new_job

    async def get_jobs(self, type: str = "", status: str = ""):
        """
        Get a list of jobs stored in this experiment.
        Uses cached data from jobs.json for completed jobs, only reads individual files for RUNNING jobs.
        type: If not blank, filter by jobs with this type.
        status: If not blank, filter by jobs with this status.
        """

        # First get jobs of the passed type
        job_list = []
        if type:
            job_list = await self._get_jobs_of_type(type)
        else:
            job_list = await self._get_all_jobs()

        # Get cached job data from jobs.json
        cached_jobs = await self._get_cached_jobs_data()

        # Iterate through the job list to return Job objects for valid jobs.
        # Also filter for status if that parameter was passed.
        results = []
        for job_id in job_list:
            try:
                # Check if job is in cache (non-RUNNING jobs are cached)
                if job_id in cached_jobs:
                    # Use cached data for completed jobs
                    job_json = cached_jobs[job_id]
                    # Check status of job if not RUNNING, LAUNCHING, INTERACTIVE or NOT_STARTED, then remove from cache
                    if job_json.get("status", "") in [
                        "RUNNING",
                        "LAUNCHING",
                        "INTERACTIVE",
                        "NOT_STARTED",
                    ]:
                        old_status = job_json.get("status", "")
                        del cached_jobs[job_id]
                        job = await Job.get(job_id)
                        job_json = await job.get_json_data(uncached=True)
                        # Trigger rebuild cache if old status and new status are different
                        if old_status != job_json.get("status", ""):
                            workspace = await get_workspace_dir()
                            self._trigger_cache_rebuild(workspace)
                        cached_jobs[job_id] = job_json

                else:
                    # Job not in cache
                    job = await Job.get(job_id)
                    job_json = await job.get_json_data(uncached=True)
                    # Check if job is COMPLETE, STOPPED or FAILED, then update cache
                    if job_json.get("status", "") in ["COMPLETE", "STOPPED", "FAILED"]:
                        workspace = await get_workspace_dir()
                        self._trigger_cache_rebuild(workspace)
            except Exception as e:
                print("ERROR getting job", job_id, e)
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

    async def _read_jobs_json_file(self, jobs_json_path, max_retries=5):
        """
        Read jobs.json file with retry logic for Etag mismatch errors.
        This handles race conditions where the file is being rebuilt while being read.
        Uses an uncached filesystem to avoid stale Etag issues.

        Args:
            jobs_json_path: Path to the jobs.json file
            max_retries: Maximum number of retries (default: 5)

        Returns:
            dict: The parsed JSON data from jobs.json
        """
        import asyncio

        for attempt in range(max_retries):
            try:
                # Use uncached=True to avoid Etag caching issues
                async with await storage.open(jobs_json_path, "r", uncached=True) as f:
                    content = await f.read()
                    jobs_data = json.loads(content)
                    return jobs_data
            except FileNotFoundError:
                # File doesn't exist, let caller handle it
                raise
            except Exception as e:
                # Check if this is the Etag mismatch error
                # Error message: "The remote file corresponding to filename ... and Etag ... no longer exists"
                error_str = str(e)
                has_errno_16 = (
                    (hasattr(e, "errno") and e.errno == 16) or "Errno 16" in error_str or "[Errno 16]" in error_str
                )
                is_etag_error = "Etag" in error_str and "no longer exists" in error_str and has_errno_16

                if is_etag_error:
                    if attempt < max_retries - 1:
                        # Wait a short time before retrying (exponential backoff)
                        # Start with 0.5s and increase to give cache rebuild time
                        await asyncio.sleep(0.5 * (2**attempt))
                        continue
                    else:
                        # Last attempt failed, try one more time
                        try:
                            async with await storage.open(jobs_json_path, "r", uncached=True) as f:
                                content = await f.read()
                                jobs_data = json.loads(content)
                                return jobs_data
                        except Exception:
                            raise e
                else:
                    # Different exception, re-raise it
                    raise

    async def _jobs_json_file(self, workspace_dir=None, experiment_id=None):
        """
        Path to jobs.json index file for this experiment.
        """
        if workspace_dir and experiment_id:
            return storage.join(workspace_dir, "experiments", experiment_id, "jobs.json")

        exp_dir = await self.get_dir()
        return storage.join(exp_dir, "jobs.json")

    async def rebuild_jobs_index(self, workspace_dir=None):
        results = {}
        cached_jobs = {}

        # Create uncached filesystem override if workspace_dir is provided (for background threads and fresh data)
        fs_override = None
        if workspace_dir:
            # Use uncached filesystem to avoid stale directory listings and file reads
            fs_override = await storage._get_uncached_filesystem(workspace_dir)
        else:
            # For local workspace, also use uncached to ensure fresh data
            jobs_dir = await get_jobs_dir()
            fs_override = await storage._get_uncached_filesystem(jobs_dir)

        try:
            # Use provided jobs_dir or get current one
            if workspace_dir:
                jobs_directory = storage.join(workspace_dir, "jobs")
            else:
                jobs_directory = await get_jobs_dir()

            # Iterate through jobs directories and check for index.json
            # Sort entries numerically since job IDs are numeric strings (descending order)
            try:
                job_entries_full = await storage.ls(jobs_directory, detail=False, fs=fs_override)
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
                if not await storage.isdir(entry_path, fs=fs_override):
                    continue
                # Prefer the latest snapshot if available; fall back to index.json
                index_file = storage.join(entry_path, "index.json")

                # Retry logic for ETag errors (files being modified concurrently)
                max_retries = 5
                data = None
                for attempt in range(max_retries):
                    try:
                        async with await storage.open(
                            index_file, "r", encoding="utf-8", fs=fs_override, uncached=True
                        ) as lf:
                            content = await lf.read()
                            content = content.strip()
                            if not content:
                                # Skip empty files
                                break
                            data = json.loads(content)
                            break  # Success, exit retry loop
                    except json.JSONDecodeError as e:
                        print(f"Error parsing JSON for job {entry_path}: {e}")
                        break  # Don't retry JSON decode errors
                    except Exception as e:
                        # Check if this is the Etag mismatch error
                        error_str = str(e)
                        has_errno_16 = (
                            (hasattr(e, "errno") and e.errno == 16)
                            or "Errno 16" in error_str
                            or "[Errno 16]" in error_str
                        )
                        is_etag_error = "Etag" in error_str and "no longer exists" in error_str and has_errno_16

                        if is_etag_error and attempt < max_retries - 1:
                            # Wait a short time before retrying (exponential backoff)
                            await asyncio.sleep(0.5 * (2**attempt))
                            continue
                        else:
                            # Not an ETag error, or last attempt failed
                            print(f"Error loading index.json for job {entry_path}: {e}")
                            break

                if data is None:
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
            jobs_data = {"index": results, "cached_jobs": cached_jobs}
            if results:
                try:
                    jobs_json_path = await self._jobs_json_file(workspace_dir=workspace_dir, experiment_id=self.id)
                    async with await storage.open(
                        jobs_json_path,
                        "w",
                        fs=fs_override,
                    ) as out:
                        await out.write(json.dumps(jobs_data, indent=4))
                except Exception as e:
                    print(f"Error writing jobs index: {e}")
                    pass
        except Exception as e:
            print(f"Error rebuilding jobs index: {e}")
            pass

    async def _get_cached_jobs_data(self):
        """
        Get cached job data from jobs.json file.
        If the file doesn't exist, create it with default structure.
        """
        jobs_json_path = await self._jobs_json_file()
        try:
            jobs_data = await self._read_jobs_json_file(jobs_json_path)
            # Handle both old format (just index) and new format (with cached_jobs)
            if "cached_jobs" in jobs_data:
                return jobs_data["cached_jobs"]
            else:
                # Old format - return empty dict
                return {}
        except FileNotFoundError:
            # Rebuild jobs index to discover and create jobs.json
            await self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                jobs_data = await self._read_jobs_json_file(jobs_json_path)
                if "cached_jobs" in jobs_data:
                    return jobs_data["cached_jobs"]
                else:
                    return {}
            except Exception:
                return {}
        except Exception:
            return {}

    async def _get_all_jobs(self):
        """
        Amalgamates all jobs in the index file.
        If the file doesn't exist, create it with default structure.
        """
        jobs_json_path = await self._jobs_json_file()
        try:
            jobs_data = await self._read_jobs_json_file(jobs_json_path)
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
            await self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                jobs_data = await self._read_jobs_json_file(jobs_json_path)
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

    async def _get_jobs_of_type(self, type="TRAIN"):
        """ "
        Returns all jobs of a specific type in this experiment's index file.
        If the file doesn't exist, create it with default structure.
        """
        import asyncio

        jobs_json_path = await self._jobs_json_file()
        try:
            jobs_data = await self._read_jobs_json_file(jobs_json_path)
            # Handle both old format (just index) and new format (with index key)
            if "index" in jobs_data:
                jobs = jobs_data["index"]
            else:
                jobs = jobs_data  # Old format
            result = jobs.get(type, [])
            return result
        except FileNotFoundError:
            # Rebuild jobs index to discover and create jobs.json
            await self.rebuild_jobs_index()
            # Try to read the newly created file
            try:
                jobs_data = await self._read_jobs_json_file(jobs_json_path)
                if "index" in jobs_data:
                    jobs = jobs_data["index"]
                else:
                    jobs = jobs_data
                result = jobs.get(type, [])
                return result
            except Exception:
                return []
        except Exception as e:
            # Check if this is the Etag mismatch error and retry once more
            error_str = str(e)
            has_errno_16 = (
                (hasattr(e, "errno") and e.errno == 16) or "Errno 16" in error_str or "[Errno 16]" in error_str
            )
            is_etag_error = "Etag" in error_str and "no longer exists" in error_str and has_errno_16

            if is_etag_error:
                # Wait a bit longer for cache rebuild to complete, then retry
                await asyncio.sleep(0.5)
                try:
                    jobs_data = await self._read_jobs_json_file(jobs_json_path)
                    if "index" in jobs_data:
                        jobs = jobs_data["index"]
                    else:
                        jobs = jobs_data
                    result = jobs.get(type, [])
                    return result
                except Exception:
                    # If retry also fails, return empty list instead of printing error
                    return []
            else:
                print("Failed getting jobs:", e)
                return []

    async def _add_job(self, job_id, type):
        try:
            jobs_json_path = await self._jobs_json_file()
            jobs_data = await self._read_jobs_json_file(jobs_json_path)
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
        jobs_json_path = await self._jobs_json_file()
        async with await storage.open(jobs_json_path, "w") as f:
            await f.write(json.dumps(jobs_data, indent=4))

        # Trigger background cache rebuild
        workspace = await get_workspace_dir()
        self._trigger_cache_rebuild(workspace)

    @classmethod
    def _start_background_cache_rebuild(cls):
        """Start the background cache rebuild thread if not already running."""
        with cls._cache_rebuild_lock:
            if cls._cache_rebuild_thread is None or not cls._cache_rebuild_thread.is_alive():
                cls._cache_rebuild_thread = threading.Thread(target=cls._background_cache_rebuild_worker, daemon=True)
                cls._cache_rebuild_thread.start()

    @classmethod
    def _background_cache_rebuild_worker(cls):
        """Background worker that rebuilds caches for pending experiments."""
        import asyncio

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
                        # Run async method in sync context using asyncio.run
                        asyncio.run(exp.rebuild_jobs_index(workspace_dir=workspace_dir))
                    except Exception as e:
                        print(
                            f"Error rebuilding cache for experiment {experiment_id} in workspace {workspace_dir}: {e}"
                        )

                # Sleep for a short time before checking again
                time.sleep(1)
            except Exception as e:
                print(f"Error in background cache rebuild worker: {e}")
                time.sleep(5)  # Wait longer on error

    def _trigger_cache_rebuild(self, workspace_dir, sync=False):
        """Trigger a cache rebuild for this experiment."""
        import asyncio

        if sync:
            # Run synchronously (useful for tests) - run async method in sync context
            asyncio.run(self.rebuild_jobs_index(workspace_dir=workspace_dir))
        else:
            # Start background thread if not running
            self._start_background_cache_rebuild()

            # Add to pending queue with jobs directory (non-blocking)
            with self._cache_rebuild_lock:
                self._cache_rebuild_pending.add((self.id, workspace_dir))

    # TODO: For experiments, delete the same way as jobs
    async def delete(self):
        """Delete the experiment and all associated jobs."""
        # Delete all associated jobs
        await self.delete_all_jobs()
        # Delete the experiment directory
        exp_dir = await self.get_dir()
        if await storage.exists(exp_dir):
            await storage.rm_tree(exp_dir)

    async def delete_all_jobs(self):
        """Delete all jobs associated with this experiment."""
        all_jobs = await self._get_all_jobs()
        for job_id in all_jobs:
            try:
                job = await Job.get(job_id)
                await job.delete()
            except Exception:
                pass  # Job might not exist

        workspace = await get_workspace_dir()
        self._trigger_cache_rebuild(workspace)
