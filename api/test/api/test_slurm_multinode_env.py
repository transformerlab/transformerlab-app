from transformerlab.compute_providers.models import ClusterConfig, JobConfig
from transformerlab.compute_providers.slurm import SLURMProvider


def test_launch_cluster_multinode_injects_distributed_env_without_overriding_run():
    provider = SLURMProvider(mode="ssh", ssh_host="slurm.example.com", ssh_user="tester")
    captured = {"command": ""}

    def fake_ssh_execute(command: str) -> str:
        captured["command"] = command
        return "Submitted batch job 12345"

    provider._ssh_execute = fake_ssh_execute  # type: ignore[method-assign]
    config = ClusterConfig(
        num_nodes=2,
        run="python train.py",
        env_vars={"FOO": "bar"},
        provider_config={"partition": "gpu"},
    )

    result = provider.launch_cluster("mn-job", config)
    assert result["job_id"] == "12345"

    script = captured["command"]
    assert "#SBATCH --nodes=2" in script
    assert "#SBATCH --ntasks=2" in script
    assert "#SBATCH --ntasks-per-node=1" in script
    assert (
        'export MASTER_ADDR="${MASTER_ADDR:-$(scontrol show hostnames "${SLURM_JOB_NODELIST}" | head -n 1)}"' in script
    )
    assert 'export WORLD_SIZE="${WORLD_SIZE:-${SLURM_NTASKS:-2}}"' in script
    assert "\n# Main run command\npython train.py\n" in script


def test_submit_job_respects_custom_task_flags_without_overriding():
    provider = SLURMProvider(
        mode="ssh",
        ssh_host="slurm.example.com",
        ssh_user="tester",
        extra_config={"user_sbatch_flags": "--ntasks=8\n--ntasks-per-node=4"},
    )
    captured = {"command": ""}

    def fake_ssh_execute(command: str) -> str:
        captured["command"] = command
        return "Submitted batch job 67890"

    provider._ssh_execute = fake_ssh_execute  # type: ignore[method-assign]
    job_config = JobConfig(
        job_name="mn-job",
        num_nodes=2,
        run="srun python train.py",
        env_vars={},
        provider_config={"partition": "gpu"},
    )

    result = provider.submit_job("slurm_partition_gpu", job_config)
    assert result["job_id"] == "67890"

    script = captured["command"]
    # Custom flags should remain and default ntasks flags should not be duplicated.
    assert script.count("#SBATCH --ntasks=8") == 1
    assert script.count("#SBATCH --ntasks-per-node=4") == 1
    assert "#SBATCH --ntasks=2" not in script
    assert "#SBATCH --ntasks-per-node=1" not in script


def test_submit_job_gpus_per_node_flag_does_not_suppress_ntasks_defaults():
    provider = SLURMProvider(
        mode="ssh",
        ssh_host="slurm.example.com",
        ssh_user="tester",
        extra_config={"user_sbatch_flags": "--gpus-per-node=4"},
    )
    captured = {"command": ""}

    def fake_ssh_execute(command: str) -> str:
        captured["command"] = command
        return "Submitted batch job 24680"

    provider._ssh_execute = fake_ssh_execute  # type: ignore[method-assign]
    job_config = JobConfig(
        job_name="mn-job",
        num_nodes=2,
        run="python train.py",
        env_vars={},
        provider_config={"partition": "gpu"},
    )

    result = provider.submit_job("slurm_partition_gpu", job_config)
    assert result["job_id"] == "24680"

    script = captured["command"]
    assert "#SBATCH --gpus-per-node=4" in script
    # Regression guard: --gpus-per-node should not be mistaken for -n.
    assert "#SBATCH --ntasks=2" in script
    assert "#SBATCH --ntasks-per-node=1" in script
