"""Abstract base class for provider implementations."""

from abc import ABC, abstractmethod
from typing import Any

from .models import (
    ClusterConfig,
    ClusterStatus,
    JobConfig,
    JobInfo,
    ResourceInfo,
)


class ComputeProvider(ABC):
    """Abstract base class for all compute provider implementations."""

    @abstractmethod
    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> dict[str, Any]:
        """
        Launch/provision a new cluster.

        Args:
            cluster_name: Name of the cluster to launch
            config: Cluster configuration

        Returns:
            Dictionary with launch result (e.g., request_id, cluster_name)
        """
        raise NotImplementedError

    @abstractmethod
    def stop_cluster(self, cluster_name: str) -> dict[str, Any]:
        """
        Stop a running cluster (but don't tear it down).

        Args:
            cluster_name: Name of the cluster to stop

        Returns:
            Dictionary with stop result
        """
        raise NotImplementedError

    @abstractmethod
    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """
        Get the status of a cluster.

        Args:
            cluster_name: Name of the cluster

        Returns:
            ClusterStatus object with cluster information
        """
        raise NotImplementedError

    @abstractmethod
    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """
        Get resource information for a cluster (GPUs, CPUs, memory, etc.).

        Args:
            cluster_name: Name of the cluster

        Returns:
            ResourceInfo object with resource details
        """
        raise NotImplementedError

    @abstractmethod
    def submit_job(self, cluster_name: str, job_config: JobConfig) -> dict[str, Any]:
        """
        Submit a job to an existing cluster.

        Args:
            cluster_name: Name of the cluster
            job_config: Job configuration

        Returns:
            Dictionary with job submission result (e.g., job_id)
        """
        raise NotImplementedError

    @abstractmethod
    def get_job_logs(
        self,
        cluster_name: str,
        job_id: str | int,
        tail_lines: int | None = None,
        follow: bool = False,
    ) -> str | Any:
        """
        Get logs for a job.

        Args:
            cluster_name: Name of the cluster
            job_id: Job identifier
            tail_lines: Number of lines to retrieve from the end (None for all)
            follow: Whether to stream/follow logs (returns stream if True)

        Returns:
            Log content as string, or stream object if follow=True
        """
        raise NotImplementedError

    @abstractmethod
    def cancel_job(self, cluster_name: str, job_id: str | int) -> dict[str, Any]:
        """
        Cancel a running or queued job.

        Args:
            cluster_name: Name of the cluster
            job_id: Job identifier

        Returns:
            Dictionary with cancellation result
        """
        raise NotImplementedError

    @abstractmethod
    def list_jobs(self, cluster_name: str) -> list[JobInfo]:
        """
        List all jobs for a cluster.

        Args:
            cluster_name: Name of the cluster

        Returns:
            List of JobInfo objects
        """
        raise NotImplementedError

    @abstractmethod
    def check(self) -> bool:
        """
        Check if the compute provider is active and accessible.

        Returns:
            True if the provider is active and accessible, False otherwise
        """
        raise NotImplementedError
