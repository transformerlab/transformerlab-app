# Multi-Node Tasks (SLURM and SkyPilot)

This guide explains how multi-node tasks behave when `resources.num_nodes > 1`, and how to write `task.yaml` for SLURM and SkyPilot providers.

## Quick rules

- Set `resources.num_nodes` in `task.yaml` to request more than one node.
- Keep your launch command explicit in `script`: the system does not rewrite your command.
- Prefer launcher-aware commands (`torchrun`, `srun`, `mpirun`) for distributed training.

## What Transformer Lab sets for you

When `num_nodes > 1`, provider integrations add a common distributed environment baseline so training code can use standard variables.

### SLURM provider

For multi-node jobs, SLURM scripts include:

- `#SBATCH --nodes=<num_nodes>`
- Default task layout if not already set in custom flags:
  - `#SBATCH --ntasks=<num_nodes>`
  - `#SBATCH --ntasks-per-node=1`

And these environment defaults (overridable by user-provided env vars):

- `MASTER_ADDR` (first host from `SLURM_JOB_NODELIST`)
- `MASTER_PORT` (derived from `SLURM_JOB_ID`)
- `NODE_RANK` (from `SLURM_NODEID`)
- `RANK` (from `SLURM_PROCID`)
- `LOCAL_RANK` (from `SLURM_LOCALID`)
- `WORLD_SIZE` (from `SLURM_NTASKS`, fallback to `num_nodes`)

### SkyPilot provider

For multi-node jobs, run commands are prefixed with portable distributed defaults:

- `MASTER_ADDR` (first IP from `SKYPILOT_NODE_IPS`)
- `MASTER_PORT` (default `29500`)
- `NODE_RANK` / `RANK` (from `SKYPILOT_NODE_RANK`)
- `LOCAL_RANK` (default `0`)
- `WORLD_SIZE` (default `SKYPILOT_NUM_NODES * SKYPILOT_NUM_GPUS_PER_NODE`)

SkyPilot also exposes its native variables (for example `SKYPILOT_NODE_IPS`, `SKYPILOT_NUM_NODES`, `SKYPILOT_NODE_RANK`), which you can still use directly.

## Example: multi-node on SkyPilot

```yaml
name: train-multinode-skypilot
description: "2-node distributed PyTorch run on SkyPilot"

resources:
  provider: skypilot
  accelerators: "L4:2"
  cpus: 8
  num_nodes: 2

env:
  # Optional override (otherwise defaults to 29500 on SkyPilot multi-node)
  MASTER_PORT: "8008"

script: |
  set -euo pipefail
  cd /workspace/my-train-code

  # You can rely on pre-exported vars, or use SkyPilot-native vars directly.
  torchrun \
    --nnodes="${SKYPILOT_NUM_NODES}" \
    --nproc_per_node="${SKYPILOT_NUM_GPUS_PER_NODE}" \
    --node_rank="${SKYPILOT_NODE_RANK}" \
    --master_addr="${MASTER_ADDR}" \
    --master_port="${MASTER_PORT}" \
    train.py
```

## Example: multi-node on SLURM

```yaml
name: train-multinode-slurm
description: "2-node distributed PyTorch run on SLURM"

resources:
  provider: slurm
  num_nodes: 2
  # Configure SLURM partition and custom sbatch flags in provider settings.

env:
  # Optional override (otherwise defaults from job id logic)
  MASTER_PORT: "23456"

script: |
  set -euo pipefail
  cd /workspace/my-train-code

  # Launch style is user-controlled. Choose srun/torchrun/etc explicitly.
  srun python -m torch.distributed.run \
    --nnodes="${SLURM_NNODES}" \
    --nproc_per_node=1 \
    --node_rank="${NODE_RANK}" \
    --master_addr="${MASTER_ADDR}" \
    --master_port="${MASTER_PORT}" \
    train.py
```

## Notes and troubleshooting

- If your cluster needs a custom task layout, set `custom_sbatch_flags` (or provider-level `user_sbatch_flags`).
- If your training framework computes rank/world-size itself, these env vars still help keep behavior consistent across providers.
- If your script hard-codes rendezvous values, ensure they match the requested `num_nodes`.
- Multi-node (`num_nodes > 1`) distributed training is not supported on the Runpod provider currently.
