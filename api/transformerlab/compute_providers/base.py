"""Abstract base class for provider implementations."""

from abc import ABC, abstractmethod
from typing import Any, Callable, Dict, List, Optional, Union

from transformerlab.shared.models.models import ProviderType

from .models import (
    ClusterConfig,
    GpuInfo,
    JobConfig,
    ClusterStatus,
    JobInfo,
    ResourceInfo,
)

# Provider types whose launch_cluster honors ClusterConfig.use_spot.
# This is the single source of truth for the "supports spot" capability.
# Keep in sync with each provider's launch_cluster implementation.
SPOT_CAPABLE_PROVIDER_TYPES: frozenset[str] = frozenset(
    {
        ProviderType.SKYPILOT.value,
        ProviderType.NEBIUS.value,
        ProviderType.AWS.value,
        ProviderType.GCP.value,
        ProviderType.AZURE.value,
        ProviderType.DSTACK.value,
        ProviderType.RUNPOD.value,
    }
)


def format_status_snapshot(
    title: str,
    fields: Dict[str, Any],
    *,
    footer: Optional[str] = None,
) -> str:
    """Render a labeled key/value status snapshot as plain text.

    Used by provider get_request_logs implementations to present orchestration
    status consistently. Empty string and None field values are omitted; 0/False
    are kept. A footer of None means no footer; any other value (including "") is
    appended after a blank-line separator.
    """
    lines = [f"=== {title} ==="]
    for key, value in fields.items():
        if value is None or value == "":
            continue
        lines.append(f"{key}: {value}")
    if footer is not None:
        lines.append("")
        lines.append(footer)
    return "\n".join(lines)


def gpu_catalog_from_map_keys(keys: Any) -> List[GpuInfo]:
    """Build a GPU catalog from launch-map keys of the form ``(gpu_type, count)``.

    Several providers key their launch tables by ``(gpu_type, count)`` (e.g. AWS
    ``_GPU_INSTANCE_MAP``). This collapses those keys into one ``GpuInfo`` per GPU
    type whose ``count`` is the maximum launchable count for that type, sorted by
    GPU name for stable output.
    """
    max_count_by_type: Dict[str, int] = {}
    for key in keys:
        gpu_type, count = key
        max_count_by_type[gpu_type] = max(max_count_by_type.get(gpu_type, 0), int(count))
    return [GpuInfo(gpu=gpu_type, count=count) for gpu_type, count in sorted(max_count_by_type.items())]


class ComputeProvider(ABC):
    """Abstract base class for all compute provider implementations."""

    @abstractmethod
    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """
        Launch/provision a new cluster.

        Args:
            cluster_name: Name of the cluster to launch
            config: Cluster configuration

        Returns:
            Dictionary with launch result (e.g., request_id, cluster_name)

        Raises:
            Exception: If the launch fails for any reason (connection error,
                authentication failure, etc.). Raise an exception rather than
                returning an error dict so callers can handle failures uniformly.
        """
        raise NotImplementedError

    @abstractmethod
    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
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

    def list_clusters(self) -> List[ClusterStatus]:
        """
        List all clusters managed by this provider.

        Returns:
            List of ClusterStatus objects for all clusters
        """
        # Default implementation returns empty list
        # Providers that support listing clusters should override this
        return []

    @abstractmethod
    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """
        Get detailed cluster information including nodes and resources.

        Returns:
            List of dictionaries with detailed cluster information
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
    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
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
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
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
    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
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
    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """
        List all jobs for a cluster.

        Args:
            cluster_name: Name of the cluster

        Returns:
            List of JobInfo objects
        """
        raise NotImplementedError

    @abstractmethod
    def check(self) -> tuple[bool, str | None]:
        """
        Check if the compute provider is active and accessible.

        Returns:
            Tuple of `(is_healthy, reason)`.
            - `is_healthy`: True when provider is active and accessible
            - `reason`: Failure reason when unhealthy, otherwise None
        """
        raise NotImplementedError

    @abstractmethod
    def show_gpus(self) -> List[GpuInfo]:
        """
        List the GPUs available on this provider.

        Returns live availability where the provider can report it, otherwise the
        provider's catalog of launchable GPU types. Each entry carries the
        accelerator name and a count (available quantity for live sources, or the
        catalog's max launchable count per node for catalog sources).

        Implementations must NOT raise: a failed live query should fall back to
        the catalog (or an empty list) so callers can render results uniformly.

        Returns:
            List of GpuInfo objects (possibly empty).
        """
        raise NotImplementedError

    def get_request_logs(
        self,
        request_id: str,
        tail_lines: Optional[int] = None,
    ) -> str:
        """
        Get logs for a provider-level request (e.g. a launch or setup operation).

        Not all providers support this. The default raises NotImplementedError.
        Providers that track operations by request ID should override this.

        Args:
            request_id: The provider request/operation ID
            tail_lines: Number of lines to retrieve from the end (None for all)

        Returns:
            Log content as a string
        """
        raise NotImplementedError(f"{type(self).__name__} does not support request logs")

    def setup(
        self,
        progress_callback: Optional[Callable[[str, int, str], None]] = None,
        force_refresh: bool = False,
    ) -> None:
        """
        Optional provider-level setup hook.

        Providers can override this to perform any expensive one-time or
        infrequent initialization (for example creating base environments or
        warming caches). The default implementation is a no-op.

        Args:
            progress_callback: Optional callback accepting (phase, percent, message)
                for reporting coarse-grained progress to callers.
            force_refresh: Whether to force setup even if provider-level setup
                artifacts already exist.
        """
        # Default implementation intentionally does nothing.
        return None
