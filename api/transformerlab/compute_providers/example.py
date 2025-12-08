"""Example usage of the provider bridge system."""

import os
import sys

# Add parent directories to path to allow imports when running as script
# This allows the script to be run directly: python example.py
# The file is at: api/transformerlab/compute_providers/example.py
# We need to add api/ to the path so transformerlab imports work
current_dir = os.path.dirname(os.path.abspath(__file__))
# Go up 3 levels: compute_providers -> transformerlab -> api
api_dir = os.path.abspath(os.path.join(current_dir, "..", "..", ".."))
if api_dir not in sys.path:
    sys.path.insert(0, api_dir)

# Now import transformerlab modules (must be after path setup)

from transformerlab.compute_providers.models import ClusterConfig, JobConfig  # noqa: E402
from transformerlab.compute_providers.router import get_provider, get_router  # noqa: E402


def example_skypilot():
    """Example: Using SkyPilot provider."""
    print("=== SkyPilot Provider Example ===\n")

    # Get the SkyPilot provider
    # Pass config path explicitly to use the source config file
    config_path = os.path.join(os.path.dirname(__file__), "providers.yaml")
    provider = get_provider("skypilot", config_path=config_path)

    # Launch a cluster
    print("1. Launching cluster...")
    cluster_config = ClusterConfig(
        # instance_type="g4dn.xlarge",
        accelerators="RTX3090:1",
        command="echo 'Hello from SkyPilot'",
    )
    result = provider.launch_cluster("my-cluster", cluster_config)
    print(f"   Result: {result}\n")

    # # Get cluster status
    # print("2. Getting cluster status...")
    # status = provider.get_cluster_status("my-cluster")
    # print(f"   Status: {status.state}, Message: {status.status_message}\n")

    # # Get cluster resources
    # print("3. Getting cluster resources...")
    # resources = provider.get_cluster_resources("my-cluster")
    # print(f"   Resources: {resources.num_nodes} nodes, GPUs: {resources.gpus}\n")

    # # Submit a job
    # print("4. Submitting job...")
    # job_config = JobConfig(
    #     command="python train.py",
    #     job_name="training-job",
    #     env_vars={"CUDA_VISIBLE_DEVICES": "0"},
    # )
    # job_result = provider.submit_job("my-cluster", job_config)
    # print(f"   Job ID: {job_result.get('job_id')}\n")

    # # List jobs
    # print("5. Listing jobs...")
    # jobs = provider.list_jobs("my-cluster")
    # for job in jobs:
    #     print(job)
    #     print(f"   Job {job.job_id}: {job.state} - {job.job_name}")

    # # # Get job logs
    # if jobs:
    #     print(f"\n6. Getting logs for job {jobs[0].job_id}...")
    #     logs = provider.get_job_logs("my-cluster", jobs[0].job_id, tail_lines=50)
    #     print(f"   Logs: {str(logs)}...\n")

    # Stop cluster
    print("7. Stopping cluster...")
    stop_result = provider.stop_cluster("my-cluster")
    print(f"   Result: {stop_result}\n")


def example_slurm():
    """Example: Using SLURM provider."""
    print("=== SLURM Provider Example ===\n")

    # Get the SLURM provider (SSH mode)
    config_path = os.path.join(os.path.dirname(__file__), "providers.yaml")
    provider = get_provider("slurm-ssh", config_path=config_path)

    # Get cluster status
    print("1. Getting cluster status...")
    status = provider.get_cluster_status("slurm-cluster")
    print(f"   Status: {status.state}\n")

    # Get cluster resources
    print("2. Getting cluster resources...")
    resources = provider.get_cluster_resources("slurm-cluster")
    gpu_str = f", GPUs: {resources.gpus}" if resources.gpus else ""
    print(f"   Resources: {resources.num_nodes} nodes, CPUs: {resources.cpus}{gpu_str}\n")

    # Submit a job
    print("3. Submitting job...")
    job_config = JobConfig(
        command="srun python -c 'print(\"Hello, World!\")'",
        job_name="slurm-training",
        num_nodes=1,
        env_vars={"CUDA_VISIBLE_DEVICES": "0"},
    )
    job_result = provider.submit_job("slurm-cluster", job_config)
    print(f"   Job ID: {job_result.get('job_id')}\n")

    # List jobs
    print("4. Listing jobs...")
    jobs = provider.list_jobs("slurm-cluster")
    for job in jobs:
        print(f"   Job {job.job_id}: {job.state} - {job.job_name}")

    # Cancel a job
    if jobs:
        print(f"\n5. Cancelling job {jobs[0].job_id}...")
        cancel_result = provider.cancel_job("slurm-cluster", jobs[0].job_id)
        print(f"   Result: {cancel_result}\n")


def example_router():
    """Example: Using the router directly."""
    print("=== Router Example ===\n")

    config_path = os.path.join(os.path.dirname(__file__), "providers.yaml")
    router = get_router(config_path=config_path)

    # List all available providers
    print("Available providers:")
    for name in router.list_providers():
        print(f"  - {name}")

    # Use different providers
    print("\nUsing multiple providers...")
    skypilot = router.get_provider("skypilot")
    slurm = router.get_provider("slurm-ssh")

    # Both providers implement the same interface
    skypilot_status = skypilot.get_cluster_status("cluster1")
    slurm_status = slurm.get_cluster_status("cluster2")

    print(f"SkyPilot cluster state: {skypilot_status.state}")
    print(f"SLURM cluster state: {slurm_status.state}")


if __name__ == "__main__":
    # Run examples (commented out to avoid actual API calls)
    print("Provider Bridge Examples\n")
    print("=" * 50)
    print("\nNote: These examples are for demonstration only.")
    print("Uncomment the function calls below to run them.\n")

    # Uncomment to run examples:
    # example_skypilot()
    example_slurm()
    # example_router()

    print("\nExample code is available in the functions above.")
