"""Local compute provider implementation.

Runs tasks locally using asyncio subprocess in a uv python environment.
Implements a simple queue with concurrency=1 (one task at a time).
"""

import asyncio
import os
import uuid
import time
from datetime import datetime
from typing import Dict, Any, Optional, Union, List
from dataclasses import dataclass, field
from enum import Enum

from .base import ComputeProvider
from .models import (
    ClusterConfig,
    JobConfig,
    ClusterStatus,
    JobInfo,
    ResourceInfo,
    ClusterState,
    JobState,
)

DEBUG = True


def _debug(msg: str):
    """Print debug message if DEBUG is enabled."""
    if DEBUG:
        timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        print(f"[LocalProvider DEBUG {timestamp}] {msg}")


class LocalJobStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class LocalJob:
    job_id: str
    job_name: Optional[str]
    command: str
    env_vars: Dict[str, str]
    status: LocalJobStatus
    submitted_at: float
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    exit_code: Optional[int] = None
    error_message: Optional[str] = None
    process: Optional[asyncio.subprocess.Process] = field(default=None, repr=False)
    log_file: Optional[str] = None
    working_dir: Optional[str] = None


class LocalProvider(ComputeProvider):
    """Provider implementation for local execution with a job queue.

    Runs tasks locally in a uv python environment with concurrency=1.
    """

    _instance: Optional["LocalProvider"] = None
    _initialized: bool = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(
        self,
        python_version: str = "3.11",
        working_dir: Optional[str] = None,
        log_dir: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ):
        if LocalProvider._initialized:
            _debug("LocalProvider already initialized, returning existing instance")
            return

        _debug(
            f"Initializing LocalProvider: python_version={python_version}, working_dir={working_dir}, log_dir={log_dir}"
        )

        self.python_version = python_version
        self.working_dir = working_dir or os.getcwd()
        self.log_dir = log_dir or os.path.join(self.working_dir, ".local_provider_logs")
        self.extra_config = extra_config or {}

        self._jobs: Dict[str, LocalJob] = {}
        self._job_queue: asyncio.Queue = asyncio.Queue()
        self._current_job: Optional[LocalJob] = None
        self._worker_task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._shutdown = False

        os.makedirs(self.log_dir, exist_ok=True)
        _debug(f"Log directory created/verified: {self.log_dir}")

        LocalProvider._initialized = True
        _debug("LocalProvider initialization complete")

    async def _ensure_worker_running(self):
        """Ensure the background worker is running."""
        if self._worker_task is None or self._worker_task.done():
            _debug("Starting background worker task")
            self._worker_task = asyncio.create_task(self._process_queue())
        else:
            _debug("Background worker already running")

    async def _process_queue(self):
        """Background worker that processes jobs from the queue one at a time."""
        _debug("Queue processor started")
        while not self._shutdown:
            try:
                _debug(f"Waiting for next job... (queue size: {self._job_queue.qsize()})")
                job = await asyncio.wait_for(self._job_queue.get(), timeout=1.0)
                _debug(f"Dequeued job {job.job_id} ({job.job_name})")
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                _debug(f"Queue processor exception: {e}")
                break

            async with self._lock:
                self._current_job = job
                job.status = LocalJobStatus.RUNNING
                job.started_at = time.time()
                _debug(f"Job {job.job_id} status -> RUNNING")

            try:
                _debug(f"Executing job {job.job_id}: {job.command[:100]}...")
                await self._run_job(job)
                _debug(f"Job {job.job_id} execution completed with exit_code={job.exit_code}")
            except asyncio.CancelledError:
                _debug(f"Job {job.job_id} was cancelled")
                job.status = LocalJobStatus.CANCELLED
                job.finished_at = time.time()
            except Exception as e:
                _debug(f"Job {job.job_id} failed with exception: {e}")
                job.status = LocalJobStatus.FAILED
                job.error_message = str(e)
                job.finished_at = time.time()
            finally:
                async with self._lock:
                    self._current_job = None
                self._job_queue.task_done()
                _debug(f"Job {job.job_id} finalized, status={job.status}")

        _debug("Queue processor shutting down")

    async def _run_job(self, job: LocalJob):
        """Run a single job using asyncio subprocess with uv."""
        log_file_path = os.path.join(self.log_dir, f"{job.job_id}.log")
        job.log_file = log_file_path
        _debug(f"Job {job.job_id} log file: {log_file_path}")

        env = os.environ.copy()
        env.update(job.env_vars)
        _debug(f"Job {job.job_id} env vars added: {list(job.env_vars.keys())}")

        working_dir = job.working_dir or self.working_dir
        _debug(f"Job {job.job_id} working directory: {working_dir}")

        uv_cmd = ["uv", "run", "--python", self.python_version, "python", "-c", job.command]

        if job.command.endswith(".py") or "/" in job.command:
            uv_cmd = ["uv", "run", "--python", self.python_version, "python", job.command]

        _debug(f"Job {job.job_id} command: {' '.join(uv_cmd)}")

        with open(log_file_path, "w") as log_file:
            log_file.write(f"=== Job {job.job_id} started at {datetime.now().isoformat()} ===\n")
            log_file.write(f"Command: {job.command}\n")
            log_file.write(f"Working directory: {working_dir}\n")
            log_file.write(f"Environment variables: {job.env_vars}\n")
            log_file.write("=" * 60 + "\n\n")
            log_file.flush()

            _debug(f"Job {job.job_id} spawning subprocess...")
            process = await asyncio.create_subprocess_exec(
                *uv_cmd,
                stdout=log_file,
                stderr=asyncio.subprocess.STDOUT,
                env=env,
                cwd=working_dir,
            )
            job.process = process
            _debug(f"Job {job.job_id} subprocess started with PID {process.pid}")

            exit_code = await process.wait()
            job.exit_code = exit_code
            job.finished_at = time.time()
            _debug(f"Job {job.job_id} subprocess exited with code {exit_code}")

            log_file.write(f"\n{'=' * 60}\n")
            log_file.write(f"=== Job {job.job_id} finished at {datetime.now().isoformat()} ===\n")
            log_file.write(f"Exit code: {exit_code}\n")

        if exit_code == 0:
            job.status = LocalJobStatus.COMPLETED
            _debug(f"Job {job.job_id} completed successfully")
        else:
            job.status = LocalJobStatus.FAILED
            job.error_message = f"Process exited with code {exit_code}"
            _debug(f"Job {job.job_id} failed: {job.error_message}")

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """Launch a 'cluster' by submitting the job (same as submit_job for local provider)."""
        _debug(f"launch_cluster called for {cluster_name}")

        command = config.command or ""
        if config.setup:
            command = f"{config.setup}\n{command}"

        if not command.strip():
            _debug(f"launch_cluster {cluster_name}: no command to run")
            return {
                "cluster_name": cluster_name,
                "status": "ready",
                "message": "No command specified, cluster ready for jobs",
            }

        job_config = JobConfig(
            command=command,
            job_name=config.cluster_name or cluster_name,
            env_vars=config.env_vars,
            num_nodes=config.num_nodes,
            provider_config=config.provider_config,
        )

        result = self.submit_job(cluster_name, job_config)
        _debug(f"launch_cluster {cluster_name}: submitted job {result.get('job_id')}")

        return {
            "cluster_name": cluster_name,
            "job_id": result.get("job_id"),
            "status": "submitted",
        }

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        """Stop cluster - for local provider, cancel all pending jobs."""
        _debug(f"Stopping cluster {cluster_name} - cancelling all jobs")
        cancelled_count = 0
        for job in self._jobs.values():
            if job.status == LocalJobStatus.QUEUED:
                _debug(f"Cancelling queued job {job.job_id}")
                job.status = LocalJobStatus.CANCELLED
                job.finished_at = time.time()
                cancelled_count += 1

        if self._current_job and self._current_job.process:
            _debug(f"Terminating running job {self._current_job.job_id}")
            self._current_job.process.terminate()
            cancelled_count += 1

        _debug(f"Cluster stop complete, cancelled {cancelled_count} jobs")
        return {
            "cluster_name": cluster_name,
            "status": "stopped",
            "cancelled_jobs": cancelled_count,
        }

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """Get cluster status - local provider is always UP."""
        return ClusterStatus(
            cluster_name=cluster_name,
            state=ClusterState.UP,
            status_message="Local provider is running",
            num_nodes=1,
            resources_str=f"Local machine (python {self.python_version})",
        )

    def list_clusters(self) -> List[ClusterStatus]:
        """List clusters - local provider has one virtual 'local' cluster."""
        return [self.get_cluster_status("local")]

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """Get local machine resources."""
        import multiprocessing

        try:
            import psutil

            memory_gb = psutil.virtual_memory().total / (1024**3)
        except ImportError:
            memory_gb = None

        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=[],
            cpus=multiprocessing.cpu_count(),
            memory_gb=memory_gb,
            num_nodes=1,
        )

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """Submit a job to the local queue."""
        job_id = str(uuid.uuid4())[:8]
        _debug(f"Submitting job {job_id} ({job_config.job_name}): {job_config.command[:80]}...")

        job = LocalJob(
            job_id=job_id,
            job_name=job_config.job_name,
            command=job_config.command,
            env_vars=job_config.env_vars,
            status=LocalJobStatus.QUEUED,
            submitted_at=time.time(),
            working_dir=job_config.provider_config.get("working_dir"),
        )

        self._jobs[job_id] = job
        _debug(f"Job {job_id} registered, total jobs: {len(self._jobs)}")

        try:
            loop = asyncio.get_running_loop()
            _debug(f"Job {job_id} using existing event loop")
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            _debug(f"Job {job_id} created new event loop")

        async def _enqueue():
            await self._ensure_worker_running()
            await self._job_queue.put(job)
            _debug(f"Job {job_id} added to queue (queue size: {self._job_queue.qsize()})")

        if loop.is_running():
            asyncio.create_task(_enqueue())
        else:
            loop.run_until_complete(_enqueue())

        _debug(f"Job {job_id} submit complete")
        return {
            "job_id": job_id,
            "cluster_name": cluster_name,
            "status": "queued",
            "queue_position": self._job_queue.qsize(),
        }

    def submit_job_sync(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """Synchronous version of submit_job for non-async contexts."""
        job_id = str(uuid.uuid4())[:8]

        job = LocalJob(
            job_id=job_id,
            job_name=job_config.job_name,
            command=job_config.command,
            env_vars=job_config.env_vars,
            status=LocalJobStatus.QUEUED,
            submitted_at=time.time(),
            working_dir=job_config.provider_config.get("working_dir"),
        )

        self._jobs[job_id] = job

        async def _enqueue_and_start():
            await self._ensure_worker_running()
            await self._job_queue.put(job)

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.create_task(_enqueue_and_start())
            else:
                loop.run_until_complete(_enqueue_and_start())
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_enqueue_and_start())

        return {
            "job_id": job_id,
            "cluster_name": cluster_name,
            "status": "queued",
        }

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """Get logs for a job."""
        job_id_str = str(job_id)
        job = self._jobs.get(job_id_str)

        if not job:
            return f"Job {job_id} not found"

        if not job.log_file or not os.path.exists(job.log_file):
            return f"Log file not available for job {job_id}"

        with open(job.log_file, "r") as f:
            if tail_lines:
                lines = f.readlines()
                return "".join(lines[-tail_lines:])
            return f.read()

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """Cancel a job."""
        job_id_str = str(job_id)
        _debug(f"Cancel request for job {job_id_str}")
        job = self._jobs.get(job_id_str)

        if not job:
            _debug(f"Job {job_id_str} not found")
            return {"job_id": job_id, "status": "not_found"}

        if job.status == LocalJobStatus.QUEUED:
            _debug(f"Cancelling queued job {job_id_str}")
            job.status = LocalJobStatus.CANCELLED
            job.finished_at = time.time()
            return {"job_id": job_id, "status": "cancelled"}

        if job.status == LocalJobStatus.RUNNING and job.process:
            _debug(f"Terminating running job {job_id_str} (PID {job.process.pid})")
            job.process.terminate()
            job.status = LocalJobStatus.CANCELLED
            job.finished_at = time.time()
            return {"job_id": job_id, "status": "cancelled"}

        _debug(f"Job {job_id_str} cannot be cancelled, status={job.status}")
        return {"job_id": job_id, "status": str(job.status)}

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """List all jobs."""
        jobs = []
        for job in self._jobs.values():
            state_mapping = {
                LocalJobStatus.QUEUED: JobState.PENDING,
                LocalJobStatus.RUNNING: JobState.RUNNING,
                LocalJobStatus.COMPLETED: JobState.COMPLETED,
                LocalJobStatus.FAILED: JobState.FAILED,
                LocalJobStatus.CANCELLED: JobState.CANCELLED,
            }

            jobs.append(
                JobInfo(
                    job_id=job.job_id,
                    job_name=job.job_name,
                    state=state_mapping.get(job.status, JobState.UNKNOWN),
                    cluster_name=cluster_name,
                    command=job.command,
                    submitted_at=datetime.fromtimestamp(job.submitted_at).isoformat() if job.submitted_at else None,
                    started_at=datetime.fromtimestamp(job.started_at).isoformat() if job.started_at else None,
                    finished_at=datetime.fromtimestamp(job.finished_at).isoformat() if job.finished_at else None,
                    exit_code=job.exit_code,
                    error_message=job.error_message,
                )
            )
        return jobs

    def get_job_status(self, job_id: str) -> Optional[JobInfo]:
        """Get status of a specific job."""
        job = self._jobs.get(job_id)
        if not job:
            return None

        state_mapping = {
            LocalJobStatus.QUEUED: JobState.PENDING,
            LocalJobStatus.RUNNING: JobState.RUNNING,
            LocalJobStatus.COMPLETED: JobState.COMPLETED,
            LocalJobStatus.FAILED: JobState.FAILED,
            LocalJobStatus.CANCELLED: JobState.CANCELLED,
        }

        return JobInfo(
            job_id=job.job_id,
            job_name=job.job_name,
            state=state_mapping.get(job.status, JobState.UNKNOWN),
            cluster_name="local",
            command=job.command,
            submitted_at=datetime.fromtimestamp(job.submitted_at).isoformat() if job.submitted_at else None,
            started_at=datetime.fromtimestamp(job.started_at).isoformat() if job.started_at else None,
            finished_at=datetime.fromtimestamp(job.finished_at).isoformat() if job.finished_at else None,
            exit_code=job.exit_code,
            error_message=job.error_message,
        )

    def check(self) -> bool:
        """Check if the local provider is active."""
        import shutil

        uv_available = shutil.which("uv") is not None
        _debug(f"Provider check: uv available = {uv_available}")
        return uv_available

    def get_queue_status(self) -> Dict[str, Any]:
        """Get current queue status."""
        queued = sum(1 for j in self._jobs.values() if j.status == LocalJobStatus.QUEUED)
        running = sum(1 for j in self._jobs.values() if j.status == LocalJobStatus.RUNNING)
        completed = sum(1 for j in self._jobs.values() if j.status == LocalJobStatus.COMPLETED)
        failed = sum(1 for j in self._jobs.values() if j.status == LocalJobStatus.FAILED)

        status = {
            "queued": queued,
            "running": running,
            "completed": completed,
            "failed": failed,
            "total": len(self._jobs),
            "current_job": self._current_job.job_id if self._current_job else None,
        }
        _debug(f"Queue status: {status}")
        return status

    async def shutdown(self):
        """Shutdown the provider and cancel pending jobs."""
        _debug("Shutdown requested")
        self._shutdown = True
        if self._worker_task:
            _debug("Cancelling worker task")
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        _debug("Shutdown complete")
