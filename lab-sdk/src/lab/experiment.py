import asyncio
import contextlib
import time
from werkzeug.utils import secure_filename

from .dirs import get_experiments_dir, get_jobs_dir
from .labresource import BaseLabResource
from .job import Job
from .job_status import JobStatus
import json
from . import storage
import logging


logger = logging.getLogger(__name__)


class Experiment(BaseLabResource):
    """
    Base object for managing all config associated with an experiment
    """

    DEFAULT_JOBS_INDEX = {"TRAIN": []}

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
                                logger.warning(
                                    "Experiment at %s missing required 'name' and 'id' fields; skipping", exp_path
                                )
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
                                except Exception:
                                    logger.warning(
                                        "Failed to write corrected index.json for experiment '%s' at %s (copied name -> id): {e}",
                                        name,
                                        index_file,
                                    )
                                    # If we couldn't persist, skip to avoid inconsistent state
                                    continue

                            experiments.append(data)
                except Exception:
                    pass
        return experiments

    async def create_job(self, type: str = "REMOTE"):
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

        # Create job and set its experiment fields directly (no rebuild needed)
        new_job = await Job.create(new_job_id)
        await new_job._update_json_data_field("experiment_id", self.id)
        await new_job.update_job_data_field("experiment_name", self.id)

        # Add to index incrementally — no filesystem scan
        await self._add_job(str(new_job.id), type)

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
                        JobStatus.RUNNING,
                        JobStatus.LAUNCHING,
                        JobStatus.INTERACTIVE,
                        JobStatus.NOT_STARTED,
                    ]:
                        del cached_jobs[job_id]
                        job = await Job.get(job_id)
                        job_json = await job.get_json_data(uncached=True)
                        cached_jobs[job_id] = job_json

                else:
                    # Job not in cache
                    job = await Job.get(job_id)
                    job_json = await job.get_json_data(uncached=True)
            except Exception:
                logger.warning("ERROR getting job %s", job_id, exc_info=True)
                continue

            # Filter for status
            if status and (job_json.get("status", "") != status):
                continue

            # Exclude DELETED jobs by default (unless explicitly requested)
            if not status and job_json.get("status", "") == JobStatus.DELETED:
                continue

            # If it passed filters then add as long as it has job_data
            if "job_data" in job_json:
                results.append(job_json)

        # Sort by job ID descending (newest first) using numeric comparison
        results.sort(key=lambda j: int(j.get("id") or 0), reverse=True)

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

    @contextlib.asynccontextmanager
    async def _jobs_json_write_lock(self, jobs_json_path: str, timeout_seconds: float = 10.0):
        """
        Acquire a cross-caller filesystem lock for jobs.json mutations.

        Uses an adjacent lock directory (`jobs.json.lock`) created with exist_ok=False.
        Directory creation is atomic on local filesystems and works as a best-effort
        lock primitive for shared storage backends.
        """
        lock_path = f"{jobs_json_path}.lock"
        deadline = time.monotonic() + timeout_seconds
        wait_seconds = 0.01
        acquired = False
        while time.monotonic() < deadline:
            try:
                await storage.makedirs(lock_path, exist_ok=False)
                acquired = True
                break
            except Exception:
                await asyncio.sleep(wait_seconds)
                wait_seconds = min(wait_seconds * 2, 0.2)

        if not acquired:
            raise TimeoutError(f"Timed out acquiring jobs.json lock: {lock_path}")

        try:
            yield
        finally:
            try:
                await storage.rm_tree(lock_path)
            except Exception:
                logger.warning("Failed to release jobs.json lock %s", lock_path, exc_info=True)

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
            except Exception:
                logger.warning("Error getting job entries when updating index", exc_info=True)
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
                    except json.JSONDecodeError:
                        logger.warning("Jobs index: Error parsing JSON for job %s", entry_path, exc_info=True)
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
                            logger.warning("Jobs index: Error loading index.json for job %s", entry_path, exc_info=True)
                            break

                if data is None:
                    continue
                if data.get("experiment_id", "") != self.id:
                    continue

                # Skip deleted jobs
                if data.get("status") == JobStatus.DELETED:
                    continue

                job_type = data.get("type", "UNKNOWN")
                results.setdefault(job_type, []).append(entry)

                # Store full job data in cache (except for RUNNING jobs which need real-time updates)
                if data.get("status") != JobStatus.RUNNING:
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
                except Exception:
                    logger.warning("Error writing jobs index", exc_info=True)
                    pass
        except Exception:
            logger.warning("Error rebuilding jobs index", exc_info=True)
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
                logger.error("Failed getting jobs", exc_info=True)
                return []

    async def _add_job(self, job_id, type):
        jobs_json_path = await self._jobs_json_file()
        for attempt in range(3):
            try:
                async with self._jobs_json_write_lock(jobs_json_path):
                    try:
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
                    async with await storage.open(jobs_json_path, "w") as f:
                        await f.write(json.dumps(jobs_data, indent=4))
                return
            except TimeoutError:
                if attempt < 2:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                logger.warning("Timeout adding job %s to jobs.json index", job_id, exc_info=True)
                return

    async def _update_cached_job(self, job_id: str, job_data: dict):
        """Update a single job's data in cached_jobs without a full filesystem scan."""
        jobs_json_path = await self._jobs_json_file()
        job_id_str = str(job_id)
        for attempt in range(5):
            try:
                async with self._jobs_json_write_lock(jobs_json_path):
                    try:
                        jobs_data = await self._read_jobs_json_file(jobs_json_path)
                    except FileNotFoundError:
                        jobs_data = {"index": {}, "cached_jobs": {}}
                    except Exception:
                        if attempt < 4:
                            await asyncio.sleep(0.05 * (attempt + 1))
                            continue
                        logger.warning("Error reading jobs.json while updating cached job %s", job_id, exc_info=True)
                        return

                    if "index" not in jobs_data:
                        jobs_data = {"index": jobs_data, "cached_jobs": {}}
                    if "cached_jobs" not in jobs_data:
                        jobs_data["cached_jobs"] = {}

                    jobs_data["cached_jobs"][job_id_str] = job_data

                    async with await storage.open(jobs_json_path, "w") as f:
                        await f.write(json.dumps(jobs_data, indent=4))

                # Verify our write is visible before returning. This protects against
                # stale-read windows on some storage backends.
                try:
                    verify_data = await self._read_jobs_json_file(jobs_json_path, max_retries=2)
                except Exception:
                    if attempt < 4:
                        await asyncio.sleep(0.02 * (attempt + 1))
                        continue
                    logger.warning("Error verifying cached job write for %s", job_id, exc_info=True)
                    return
                verify_cached_jobs = verify_data.get("cached_jobs", {})
                if job_id_str in verify_cached_jobs:
                    return
            except TimeoutError:
                if attempt < 4:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                logger.warning("Timeout updating cached_jobs for job %s", job_id, exc_info=True)
                return
            except Exception:
                logger.warning("Error updating cached_jobs for job %s", job_id, exc_info=True)
                return

            # Verification missed our key; retry mutation.
            if attempt < 4:
                await asyncio.sleep(0.02 * (attempt + 1))
                continue
            logger.warning("Write verification failed for cached job %s after retries", job_id)
            return

    async def _remove_job_from_index(self, job_id: str):
        """Remove a job from the index and cached_jobs without a full filesystem scan."""
        jobs_json_path = await self._jobs_json_file()
        for attempt in range(3):
            try:
                async with self._jobs_json_write_lock(jobs_json_path):
                    try:
                        jobs_data = await self._read_jobs_json_file(jobs_json_path)
                    except FileNotFoundError:
                        return
                    except Exception:
                        return

                    if "index" not in jobs_data:
                        jobs_data = {"index": jobs_data, "cached_jobs": {}}

                    job_id_str = str(job_id)

                    index = jobs_data.get("index", {})
                    for job_type in list(index.keys()):
                        if job_id_str in index[job_type]:
                            index[job_type].remove(job_id_str)

                    cached_jobs = jobs_data.get("cached_jobs", {})
                    cached_jobs.pop(job_id_str, None)

                    async with await storage.open(jobs_json_path, "w") as f:
                        await f.write(json.dumps(jobs_data, indent=4))
                return
            except TimeoutError:
                if attempt < 2:
                    await asyncio.sleep(0.05 * (attempt + 1))
                    continue
                logger.warning("Timeout removing job %s from jobs.json index", job_id, exc_info=True)
                return
            except Exception:
                logger.warning("Error removing job %s from jobs.json index", job_id, exc_info=True)
                return

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
