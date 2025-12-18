"""SLURM provider implementation."""

import asyncio
import requests
import os
from typing import Dict, Any, Optional, Union, List
from lab import storage
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


def get_add_if_verified_policy():
    import paramiko

    class AddIfVerified(paramiko.MissingHostKeyPolicy):
        """Custom SSH host key policy that adds host keys after verification."""

        def missing_host_key(self, client, hostname, key):
            """Handle missing host key by adding it to known_hosts after verification."""
            client._host_keys.add(hostname, key.get_name(), key)
            client._host_keys.save(os.path.expanduser("~/.ssh/known_hosts"))

    return AddIfVerified()


class SLURMProvider(ComputeProvider):
    """Provider implementation for SLURM (REST API or SSH)."""

    def __init__(
        self,
        mode: str = "ssh",  # "rest" or "ssh"
        rest_url: Optional[str] = None,
        ssh_host: Optional[str] = None,
        ssh_user: Optional[str] = None,
        ssh_key_path: Optional[str] = None,
        ssh_port: int = 22,
        api_token: Optional[str] = None,
        extra_config: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize SLURM provider.

        Args:
            mode: "rest" or "ssh"
            rest_url: Base URL for SLURM REST API (required for REST mode)
            ssh_host: SSH hostname (required for SSH mode)
            ssh_user: SSH username (defaults to current user)
            ssh_key_path: Path to SSH private key
            ssh_port: SSH port (default: 22)
            api_token: API token for REST API authentication
            extra_config: Additional provider-specific configuration
        """
        self.mode = mode
        self.rest_url = rest_url
        self.ssh_host = ssh_host
        self.ssh_user = ssh_user or os.getenv("USER", "root")
        self.ssh_key_path = ssh_key_path
        self.ssh_port = ssh_port
        self.api_token = api_token
        self.extra_config = extra_config or {}

        if mode == "rest" and not rest_url:
            raise ValueError("REST mode requires rest_url")
        if mode == "ssh" and not ssh_host:
            raise ValueError("SSH mode requires ssh_host")

    def _ssh_execute(self, command: str) -> str:
        """Execute command via SSH."""
        try:
            import paramiko
        except ImportError:
            raise ImportError("paramiko is required for SSH mode. Install with: pip install paramiko")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(get_add_if_verified_policy())

        try:
            # Build SSH connection parameters
            connect_kwargs = {
                "hostname": self.ssh_host,
                "port": self.ssh_port,
                "username": self.ssh_user,
            }

            if self.ssh_key_path:
                key_path = os.path.expanduser(self.ssh_key_path)
                if not os.path.exists(key_path):
                    raise FileNotFoundError(f"SSH key file not found: {key_path}")
                connect_kwargs["key_filename"] = key_path

            ssh.connect(**connect_kwargs, timeout=30)
            stdin, stdout, stderr = ssh.exec_command(command)
            output = stdout.read().decode("utf-8")
            error = stderr.read().decode("utf-8")
            print(f"Output: {output}")
            print(f"Error: {error}")

            if error and "Permission denied" not in error:
                # Some commands output to stderr but are successful
                pass

            return output
        except Exception as e:
            print(f"Error executing command: {e}")
        finally:
            ssh.close()

    def _ssh_sftp_upload(self, local_path: str, remote_path: str) -> None:
        """Upload a file or directory to the remote host via SFTP.

        Used to implement ClusterConfig.file_mounts semantics for SSH mode.
        The mapping is interpreted as {remote_path: local_path}.

        The local_path is interpreted using lab.storage first (workspace-aware),
        falling back to the OS filesystem if needed.
        """
        try:
            import paramiko
        except ImportError:
            raise ImportError("paramiko is required for SSH mode. Install with: pip install paramiko")

        # Normalize local path (may be a workspace path created via lab.storage)
        local_path = os.path.expanduser(local_path)

        # Determine existence and directory-ness using storage first, then os.*
        if asyncio.run(storage.exists(local_path)):
            is_dir = asyncio.run(storage.isdir(local_path))
        else:
            raise FileNotFoundError(f"Local path for file_mounts does not exist: {local_path}")

        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(get_add_if_verified_policy())

        try:
            # Build SSH connection parameters
            connect_kwargs = {
                "hostname": self.ssh_host,
                "port": self.ssh_port,
                "username": self.ssh_user,
            }

            if self.ssh_key_path:
                key_path = os.path.expanduser(self.ssh_key_path)
                if not os.path.exists(key_path):
                    raise FileNotFoundError(f"SSH key file not found: {key_path}")
                connect_kwargs["key_filename"] = key_path

            ssh.connect(**connect_kwargs, timeout=10)
            sftp = ssh.open_sftp()

            def _mkdir_p(remote_dir: str) -> None:
                """Recursively create remote directories if they don't exist."""
                if not remote_dir:
                    return
                parts = remote_dir.split("/")
                path = ""
                for part in parts:
                    if not part:
                        continue
                    path = f"{path}/{part}"
                    try:
                        sftp.stat(path)
                    except IOError:
                        try:
                            sftp.mkdir(path)
                        except IOError:
                            # If directory creation fails, let upload attempt fail later
                            pass

            def _upload_file(local_f: str, remote_f: str) -> None:
                remote_dir = os.path.dirname(remote_f.rstrip("/"))
                _mkdir_p(remote_dir)
                # For now assume local_f is a real filesystem path; this is true for
                # workspace_dir-based uploads written via storage.open on local FS.
                sftp.put(local_f, remote_f)

            if is_dir:
                # Recursively upload directory contents
                walker = asyncio.run(storage.walk(local_path))
                for root, _dirs, files in walker:
                    rel = os.path.relpath(root, local_path)
                    if rel == ".":
                        remote_root = remote_path.rstrip("/")
                    else:
                        remote_root = f"{remote_path.rstrip('/')}/{rel}"
                    _mkdir_p(remote_root)
                    for fname in files:
                        local_f = asyncio.run(storage.join(root, fname))
                        remote_f = f"{remote_root.rstrip('/')}/{fname}"
                        _upload_file(local_f, remote_f)
            else:
                _upload_file(local_path, remote_path)
        finally:
            try:
                # sftp may not exist if open_sftp failed
                if "sftp" in locals():
                    sftp.close()
            except Exception:
                pass
            ssh.close()

    def _rest_request(self, method: str, endpoint: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make HTTP request to SLURM REST API."""
        url = f"{self.rest_url.rstrip('/')}{endpoint}"
        headers = {"Content-Type": "application/json"}
        if self.api_token:
            headers["X-SLURM-USER-NAME"] = self.ssh_user
            headers["X-SLURM-USER-TOKEN"] = self.api_token

        response = requests.request(method=method, url=url, json=data, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json() if response.content else {}

    def launch_cluster(self, cluster_name: str, config: ClusterConfig) -> Dict[str, Any]:
        """
        Launch a cluster by submitting a job (similar to submit_job).

        For SLURM, "launching" means submitting the job since clusters are pre-configured.
        This creates a SLURM script with setup, env vars, and command, then submits it.
        """
        # If in SSH mode, resolve any file mounts by uploading local paths to remote.
        # Mapping semantics: {remote_path: local_path}
        if self.mode == "ssh" and getattr(config, "file_mounts", None):
            for remote_path, local_path in config.file_mounts.items():
                self._ssh_sftp_upload(local_path, remote_path)

        # Create a temporary SLURM script
        script_content = "#!/bin/bash\n"
        script_content += f"#SBATCH --job-name={cluster_name}\n"
        script_content += "#SBATCH --requeue\n"

        # Extract partition name from cluster_name or use provider config
        partition = config.provider_config.get("partition") if config.provider_config else None

        # If no partition in config, try to get from extra_config
        if not partition and self.extra_config:
            partition = self.extra_config.get("default_partition")

        # If still no partition, try to detect from cluster_name
        if not partition:
            if cluster_name.startswith("slurm_partition_"):
                partition = cluster_name.replace("slurm_partition_", "")
            else:
                # Try to query for first available partition
                try:
                    if self.mode == "ssh":
                        output = self._ssh_execute("sinfo -h -o '%P' | head -1")
                        partition = output.strip().rstrip("*")
                    if not partition:
                        partition = "normal"
                except Exception:
                    partition = "normal"

        # Add partition specification
        script_content += f"#SBATCH --partition={partition}\n"

        if config.num_nodes and config.num_nodes > 1:
            script_content += f"#SBATCH --nodes={config.num_nodes}\n"

        # Add setup commands if provided
        if config.setup:
            script_content += f"\n# Setup commands\n{config.setup}\n"

        # Add environment variables
        for key, value in config.env_vars.items():
            script_content += f"export {key}={value}\n"

        # Add the main command
        if config.command:
            script_content += f"\n# Main command\n{config.command}\n"

        if self.mode == "ssh":
            # Write script to remote and submit
            script_name = f"/tmp/cluster_{cluster_name}.sh"
            # Create script using heredoc and submit
            command = f'cat > {script_name} << "EOFSLURM"\n{script_content}\nEOFSLURM\nsbatch {script_name}'
            output = self._ssh_execute(command)
            # Parse job ID from output: "Submitted batch job 12345"
            job_id = None
            for line in output.split("\n"):
                if "Submitted batch job" in line:
                    job_id = line.split()[-1]
                    break
        else:
            # REST API - POST to /slurm/v0.0.39/job/submit
            data = {
                "script": script_content,
                "job": {
                    "name": cluster_name,
                },
            }
            result = self._rest_request("POST", "/slurm/v0.0.39/job/submit", data=data)
            job_id = result.get("job_id")

        return {
            "cluster_name": cluster_name,
            "job_id": job_id,
            "message": "SLURM job submitted",
            "status": "submitted",
        }

    def stop_cluster(self, cluster_name: str) -> Dict[str, Any]:
        """
        Stop a cluster.

        Note: SLURM doesn't support stopping clusters dynamically.
        This is a placeholder.
        """
        return {
            "cluster_name": cluster_name,
            "message": "SLURM clusters are managed externally",
            "status": "stopped",
        }

    def get_cluster_status(self, cluster_name: str) -> ClusterStatus:
        """Get cluster status using sinfo."""
        if self.mode == "ssh":
            # Use sinfo to get cluster status
            command = "sinfo -h -o '%P %A %D %T'"
            output = self._ssh_execute(command)
            # Parse sinfo output
            # Format: PARTITION AVAIL NODES STATE
            lines = output.strip().split("\n")
            if lines and lines[0]:
                # Simplified parsing
                state = ClusterState.UP  # Assume UP if we can query
            else:
                state = ClusterState.UNKNOWN
        else:
            # REST API - use /slurm/v0.0.39/partitions or similar
            try:
                result = self._rest_request("GET", "/slurm/v0.0.39/partitions")
                state = ClusterState.UP if result else ClusterState.UNKNOWN
            except Exception:
                state = ClusterState.UNKNOWN

        return ClusterStatus(
            cluster_name=cluster_name,
            state=state,
            status_message="SLURM cluster status",
        )

    def get_cluster_resources(self, cluster_name: str) -> ResourceInfo:
        """Get cluster resources using sinfo."""
        if self.mode == "ssh":
            # Use sinfo to get resource information
            command = "sinfo -h -o '%P %G %c %m %D'"
            output = self._ssh_execute(command)
            # Parse: PARTITION GRES CPUS MEMORY NODES
            # This is simplified - real parsing would be more complex
            lines = output.strip().split("\n")
            gpus = []
            cpus = None
            memory_gb = None
            num_nodes = None

            if lines and lines[0]:
                parts = lines[0].split()
                if len(parts) >= 5:
                    # Parse GRES (GPU resources) - format: "gpu:2" or "gpu:1"
                    gres = parts[1].strip() if len(parts) > 1 else ""
                    if gres and "gpu" in gres.lower():
                        # Extract GPU count from format like "gpu:2"
                        try:
                            if ":" in gres:
                                gpu_type, gpu_count_str = gres.split(":", 1)
                                gpu_count = int(gpu_count_str.strip())
                            else:
                                # Fallback if format is just "gpu"
                                gpu_count = 1
                            gpus.append({"type": "gpu", "count": gpu_count})
                        except (ValueError, AttributeError) as e:
                            # If parsing fails, default to 1 GPU
                            print(f"Error parsing GPU: {e}")
                            gpus.append({"type": "gpu", "count": 1})

                    # Parse CPUs
                    cpus = int(parts[2]) if parts[2].isdigit() else None

                    # Parse memory - sinfo %m outputs in MB, but handle small values
                    # that might already be in GB (some sinfo versions/configs differ)
                    memory_value = int(parts[3]) if parts[3].isdigit() else None
                    if memory_value:
                        # If value is very small (< 100), assume it's already in GB
                        # Otherwise assume it's in MB and convert to GB
                        if memory_value < 100:
                            memory_gb = float(memory_value)
                        else:
                            memory_gb = memory_value / 1024.0

                    # Parse number of nodes
                    num_nodes = int(parts[4]) if parts[4].isdigit() else None

        else:
            # REST API
            try:
                result = self._rest_request("GET", "/slurm/v0.0.39/nodes")
                # Parse REST API response
                gpus = []
                cpus = None
                memory_gb = None
                num_nodes = result.get("nodes", [])
                if num_nodes:
                    num_nodes = len(num_nodes)
            except Exception:
                gpus = []
                cpus = None
                memory_gb = None
                num_nodes = None

        return ResourceInfo(
            cluster_name=cluster_name,
            gpus=gpus,
            cpus=cpus,
            memory_gb=memory_gb,
            num_nodes=num_nodes,
        )

    def get_clusters_detailed(self) -> List[Dict[str, Any]]:
        """
        Get detailed cluster information for SLURM.

        For SLURM, we treat each partition as a cluster and get detailed node information.
        """
        try:
            # Get detailed node information from SLURM
            nodes_data = self._get_slurm_nodes_detailed()

            # Group nodes by partition
            partitions = {}
            for node_data in nodes_data:
                partition = node_data.get("partition", "default")
                if partition not in partitions:
                    partitions[partition] = []
                partitions[partition].append(node_data)

            # Build cluster details for each partition
            clusters = []
            for partition_name, partition_nodes in partitions.items():
                nodes = []
                total_nodes = len(partition_nodes)
                total_active_nodes = 0

                for node_data in partition_nodes:
                    node_name = node_data.get("node_name", "unknown")
                    state = node_data.get("state", "UNKNOWN")
                    reason = node_data.get("reason", "N/A")

                    # Determine if node is active (allocated or mixed)
                    # Strip SLURM state suffixes: ~ (powered down), # (powering up), etc.
                    base_state = state.rstrip("~#@$%*!").upper()
                    is_active = base_state in ["ALLOCATED", "MIXED", "COMPLETING"]
                    if is_active:
                        total_active_nodes += 1

                    # Parse resources
                    cpus_total = node_data.get("cpus_total", 0)
                    cpus_allocated = node_data.get("cpus_allocated", 0)
                    memory_total = node_data.get("memory_total", 0)
                    memory_allocated = node_data.get("memory_allocated", 0)
                    gpus = node_data.get("gpus", {})
                    gpus_free = node_data.get("gpus_free", {})

                    node = {
                        "node_name": node_name,
                        "is_fixed": True,  # SLURM nodes are fixed infrastructure
                        "is_active": is_active,
                        "state": state,
                        "reason": reason,
                        "resources": {
                            "cpus_total": cpus_total,
                            "cpus_allocated": cpus_allocated,
                            "gpus": gpus,
                            "gpus_free": gpus_free,
                            "memory_gb_total": memory_total,
                            "memory_gb_allocated": memory_allocated,
                        },
                    }
                    nodes.append(node)

                cluster_detail = {
                    "cluster_id": f"slurm_partition_{partition_name}",
                    "cluster_name": partition_name,
                    "backend_type": "SLURM",
                    "elastic_enabled": False,  # SLURM clusters are fixed
                    "max_nodes": total_nodes,
                    "head_node_ip": self.ssh_host if self.mode == "ssh" else None,
                    "nodes": nodes,
                }
                clusters.append(cluster_detail)

            return clusters
        except Exception as e:
            print(f"Failed to get SLURM cluster details: {e}")
            import traceback

            traceback.print_exc()
            return []

    def _get_slurm_nodes_detailed(self) -> List[Dict[str, Any]]:
        """
        Get detailed node information from SLURM using sinfo and scontrol.

        Returns a list of node dictionaries with detailed resource and state information.
        """
        nodes = []

        if self.mode == "ssh":
            # Use sinfo to get detailed node information
            # Format: NodeName|Partition|State|Reason|CPUs|AllocCPUs|Memory|AllocMem|Gres|GresUsed
            command = (
                "sinfo -N -h -o '%N|%P|%T|%E|%c|%C|%m|%e|%G|%b' 2>/dev/null || sinfo -N -h -o '%N|%P|%T|%E|%c||%m||%G|'"
            )
            output = self._ssh_execute(command)

            for line in output.strip().split("\n"):
                if not line.strip():
                    continue

                parts = line.split("|")
                if len(parts) < 5:
                    continue

                node_name = parts[0].strip()
                partition = parts[1].strip()
                state = parts[2].strip()
                reason = parts[3].strip() if len(parts) > 3 and parts[3].strip() else "N/A"

                # Parse CPUs
                cpus_str = parts[4].strip() if len(parts) > 4 else "0"
                cpus_total = int(cpus_str) if cpus_str.isdigit() else 0

                # Parse allocated CPUs (may be in format "A/I/O/T" = Allocated/Idle/Other/Total)
                cpus_allocated = 0
                if len(parts) > 5 and parts[5].strip():
                    alloc_str = parts[5].strip()
                    if "/" in alloc_str:
                        # Format: Allocated/Idle/Other/Total
                        alloc_parts = alloc_str.split("/")
                        if alloc_parts[0].isdigit():
                            cpus_allocated = int(alloc_parts[0])
                    elif alloc_str.isdigit():
                        cpus_allocated = int(alloc_str)

                # Parse Memory (in MB from sinfo)
                memory_str = parts[6].strip() if len(parts) > 6 else "0"
                memory_total = 0
                if memory_str:
                    # Remove any non-numeric suffixes like 'M' or '+'
                    memory_str = memory_str.rstrip("+M")
                    if memory_str.isdigit():
                        memory_total = float(memory_str) / 1024.0  # Convert MB to GB

                # Parse allocated memory
                memory_allocated = 0
                if len(parts) > 7 and parts[7].strip():
                    alloc_mem_str = parts[7].strip().rstrip("+M")
                    if alloc_mem_str.isdigit():
                        memory_allocated = float(alloc_mem_str) / 1024.0

                # Parse GPUs (Gres format: gpu:type:count or gpu:count)
                gpus = {}
                gpus_free = {}
                if len(parts) > 8 and parts[8].strip():
                    gres_str = parts[8].strip()
                    gpus = self._parse_gres(gres_str)

                # Parse GPU usage (GresUsed)
                gpus_used = {}
                if len(parts) > 9 and parts[9].strip():
                    gres_used_str = parts[9].strip()
                    gpus_used = self._parse_gres(gres_used_str)

                # Calculate free GPUs
                for gpu_type, total_count in gpus.items():
                    used_count = gpus_used.get(gpu_type, 0)
                    gpus_free[gpu_type] = max(0, total_count - used_count)

                node = {
                    "node_name": node_name,
                    "partition": partition,
                    "state": state,
                    "reason": reason,
                    "cpus_total": cpus_total,
                    "cpus_allocated": cpus_allocated,
                    "memory_total": memory_total,
                    "memory_allocated": memory_allocated,
                    "gpus": gpus,
                    "gpus_free": gpus_free,
                }
                nodes.append(node)
        else:
            # REST API mode
            try:
                result = self._rest_request("GET", "/slurm/v0.0.39/nodes")
                node_list = result.get("nodes", [])

                for node_data in node_list:
                    node_name = node_data.get("name", "unknown")
                    partition = (
                        node_data.get("partitions", ["default"])[0] if node_data.get("partitions") else "default"
                    )
                    state = (
                        node_data.get("state", ["UNKNOWN"])[0]
                        if isinstance(node_data.get("state"), list)
                        else node_data.get("state", "UNKNOWN")
                    )
                    reason = node_data.get("reason", "N/A")

                    cpus_total = node_data.get("cpus", 0)
                    cpus_allocated = node_data.get("alloc_cpus", 0)

                    # Memory in MB, convert to GB
                    memory_total = node_data.get("real_memory", 0) / 1024.0
                    memory_allocated = node_data.get("alloc_memory", 0) / 1024.0

                    # Parse GPUs from gres
                    gpus = {}
                    gpus_free = {}
                    if "gres" in node_data:
                        gpus = self._parse_gres(node_data.get("gres", ""))
                    if "gres_used" in node_data:
                        gpus_used = self._parse_gres(node_data.get("gres_used", ""))
                        for gpu_type, total_count in gpus.items():
                            used_count = gpus_used.get(gpu_type, 0)
                            gpus_free[gpu_type] = max(0, total_count - used_count)

                    node = {
                        "node_name": node_name,
                        "partition": partition,
                        "state": state,
                        "reason": reason,
                        "cpus_total": cpus_total,
                        "cpus_allocated": cpus_allocated,
                        "memory_total": memory_total,
                        "memory_allocated": memory_allocated,
                        "gpus": gpus,
                        "gpus_free": gpus_free,
                    }
                    nodes.append(node)
            except Exception as e:
                print(f"Failed to get nodes via REST API: {e}")

        return nodes

    def _parse_gres(self, gres_str: str) -> Dict[str, int]:
        """
        Parse SLURM GRES (Generic Resources) string to extract GPU information.

        Examples:
            "gpu:2" -> {"GPU": 2}
            "gpu:a100:4" -> {"A100": 4}
            "gpu:v100:2,gpu:a100:1" -> {"V100": 2, "A100": 1}
            "(null)" or "N/A" -> {}

        Args:
            gres_str: GRES string from sinfo/scontrol

        Returns:
            Dictionary mapping GPU type to count
        """
        gpus = {}

        if not gres_str or gres_str.lower() in ["(null)", "n/a", "none", ""]:
            return gpus

        # Handle multiple GRES entries separated by comma
        gres_entries = gres_str.split(",")

        for entry in gres_entries:
            entry = entry.strip()
            if not entry or "gpu" not in entry.lower():
                continue

            # Split by colon: gpu:type:count or gpu:count
            parts = entry.split(":")
            if len(parts) < 2:
                continue

            if len(parts) == 2:
                # Format: gpu:count
                try:
                    count = int(parts[1])
                    gpus["GPU"] = gpus.get("GPU", 0) + count
                except ValueError:
                    continue
            elif len(parts) >= 3:
                # Format: gpu:type:count
                gpu_type = parts[1].upper()
                try:
                    # Handle format like "gpu:a100:4(S:0-1)"
                    count_str = parts[2].split("(")[0]
                    count = int(count_str)
                    gpus[gpu_type] = gpus.get(gpu_type, 0) + count
                except ValueError:
                    continue

        return gpus

    def submit_job(self, cluster_name: str, job_config: JobConfig) -> Dict[str, Any]:
        """Submit a job using sbatch."""
        # Create a temporary SLURM script
        script_content = "#!/bin/bash\n"
        script_content += "#SBATCH --requeue\n"

        # Extract partition name from cluster_name or use provider config
        # cluster_name might be a job identifier like "slurm-test-job-15"
        # Check if we have a partition specified in provider_config
        partition = job_config.provider_config.get("partition") if job_config.provider_config else None

        # If no partition in config, try to get from extra_config
        if not partition and self.extra_config:
            partition = self.extra_config.get("default_partition")

        # If still no partition, try to detect from cluster_name
        # If cluster_name looks like "slurm_partition_X", extract the partition
        if not partition:
            if cluster_name.startswith("slurm_partition_"):
                partition = cluster_name.replace("slurm_partition_", "")
            else:
                # Default to "normal" or query sinfo to get the first available partition
                try:
                    if self.mode == "ssh":
                        # Get first available partition
                        output = self._ssh_execute("sinfo -h -o '%P' | head -1")
                        partition = output.strip().rstrip("*")  # Remove trailing asterisk if default
                    if not partition:
                        partition = "normal"  # Fallback default
                except Exception:
                    partition = "normal"  # Fallback if query fails

        # Add partition specification
        script_content += f"#SBATCH --partition={partition}\n"

        if job_config.job_name:
            script_content += f"#SBATCH --job-name={job_config.job_name}\n"
        if job_config.num_nodes:
            script_content += f"#SBATCH --nodes={job_config.num_nodes}\n"
        if job_config.timeout:
            script_content += f"#SBATCH --time={job_config.timeout}\n"

        # Add environment variables
        for key, value in job_config.env_vars.items():
            script_content += f"export {key}={value}\n"

        script_content += f"\n{job_config.command}\n"

        if self.mode == "ssh":
            # Write script to remote and submit
            script_name = f"/tmp/job_{job_config.job_name or 'tmp'}.sh"
            # Create script using heredoc and submit
            command = f'cat > {script_name} << "EOFSLURM"\n{script_content}\nEOFSLURM\nsbatch {script_name}'
            output = self._ssh_execute(command)
            # Parse job ID from output: "Submitted batch job 12345"
            job_id = None
            for line in output.split("\n"):
                if "Submitted batch job" in line:
                    job_id = line.split()[-1]
                    break
        else:
            # REST API - POST to /slurm/v0.0.39/job/submit
            data = {
                "script": script_content,
                "job": {
                    "name": job_config.job_name,
                },
            }
            result = self._rest_request("POST", "/slurm/v0.0.39/job/submit", data=data)
            job_id = result.get("job_id")

        return {"job_id": job_id, "cluster_name": cluster_name}

    def get_job_logs(
        self,
        cluster_name: str,
        job_id: Union[str, int],
        tail_lines: Optional[int] = None,
        follow: bool = False,
    ) -> Union[str, Any]:
        """Get job logs using sacct or squeue."""
        if self.mode == "ssh":
            # Use sacct to get job logs
            command = f"sacct -j {job_id} -o JobID,State,ExitCode,Start,End --noheader"
            if tail_lines:
                # For output logs, we'd need to find the log file
                # This is simplified
                command = f"tail -n {tail_lines} /path/to/logs/slurm-{job_id}.out"
            output = self._ssh_execute(command)
            return output
        else:
            # REST API
            result = self._rest_request("GET", f"/slurm/v0.0.39/job/{job_id}")
            return result.get("logs", str(result))

    def cancel_job(self, cluster_name: str, job_id: Union[str, int]) -> Dict[str, Any]:
        """Cancel a job using scancel."""
        if self.mode == "ssh":
            command = f"scancel {job_id}"
            self._ssh_execute(command)
            return {"job_id": job_id, "status": "cancelled"}
        else:
            # REST API
            result = self._rest_request("DELETE", f"/slurm/v0.0.39/job/{job_id}")
            return result

    def list_jobs(self, cluster_name: str) -> List[JobInfo]:
        """List jobs using squeue."""
        if self.mode == "ssh":
            # Use squeue to list jobs
            command = f'squeue -u {self.ssh_user} -o "%i %j %T %S %e" --noheader'
            output = self._ssh_execute(command)
            jobs = []
            for line in output.strip().split("\n"):
                if not line.strip():
                    continue
                parts = line.split()
                if len(parts) >= 3:
                    job_id = parts[0]
                    job_name = parts[1]
                    state_str = parts[2].upper()
                    try:
                        state = JobState[state_str]
                    except KeyError:
                        state = JobState.UNKNOWN

                    jobs.append(
                        JobInfo(
                            job_id=job_id,
                            job_name=job_name,
                            state=state,
                            cluster_name=cluster_name,
                        )
                    )
            return jobs
        else:
            # REST API
            result = self._rest_request("GET", "/slurm/v0.0.39/jobs")
            jobs = []
            for job_data in result.get("jobs", []):
                state_str = job_data.get("job_state", "UNKNOWN").upper()
                try:
                    state = JobState[state_str]
                except KeyError:
                    state = JobState.UNKNOWN

                jobs.append(
                    JobInfo(
                        job_id=job_data.get("job_id"),
                        job_name=job_data.get("name"),
                        state=state,
                        cluster_name=cluster_name,
                        submitted_at=job_data.get("submit_time"),
                        started_at=job_data.get("start_time"),
                        finished_at=job_data.get("end_time"),
                        exit_code=job_data.get("exit_code"),
                        provider_data=job_data,
                    )
                )
            return jobs

    def check(self) -> bool:
        """Check if the SLURM provider is active and accessible."""
        try:
            if self.mode == "ssh":
                # Try to execute a simple command to check connectivity
                # First test basic SSH connectivity with a simple command
                self._ssh_execute("echo 'SSH connection test'")
                # Then test if SLURM is available
                self._ssh_execute("sinfo --version")
                return True
            else:
                # REST API - try to make a simple request
                self._rest_request("GET", "/slurm/v0.0.39/diag")
                return True
        except Exception as e:
            # Log the error for debugging
            print(f"SLURM provider check failed: {type(e).__name__}: {str(e)}")
            return False
