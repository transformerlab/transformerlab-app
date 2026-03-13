# Task Execution

How a task goes from definition to running on a compute provider.

## Contents

1. [Task Creation & Import](./01-task-creation.md) — How tasks enter the system (upload, GitHub import, gallery)
2. [Task Data Model](./02-task-data-model.md) — On-disk storage, task.yaml spec, and the index.json format
3. [Job Dispatch & Queueing](./03-job-dispatch.md) — How a task becomes a job and gets dispatched to a provider
4. [Compute Providers](./04-compute-providers.md) — Provider abstraction, local execution, and remote providers
5. [Job Lifecycle & Status](./05-job-lifecycle.md) — Status transitions, logging, sweeps, and interactive tasks

## Quick Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        TASK CREATION                            │
│  Upload ZIP ─┐                                                  │
│  GitHub repo ─┼─► task.yaml parsed ─► index.json on disk        │
│  Gallery     ─┘                      {workspace}/task/{id}/     │
└─────────────────────────────┬───────────────────────────────────┘
                              │ User clicks "Run"
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     JOB DISPATCH                                │
│  POST /compute_provider/{provider_id}/template/launch           │
│  ─► Create job (filesystem: {workspace}/jobs/{job_id}/)         │
│  ─► Build ClusterConfig (env, setup, run command, files)        │
│  ─► Route to provider                                           │
└──────────┬──────────────┬──────────────┬───────────────────────-┘
           │              │              │
     ┌─────▼────┐  ┌──────▼─────┐  ┌────▼──────┐
     │  Local    │  │   SLURM    │  │  SkyPilot  │  ...RunPod
     │ Provider  │  │  Provider  │  │  Provider  │
     │          │  │            │  │           │
     │ asyncio  │  │ SSH/REST   │  │ Sky SDK   │
     │ queue    │  │ sbatch     │  │ cloud API │
     │ uv venv  │  │ SFTP       │  │ spot      │
     │ Popen()  │  │            │  │           │
     └─────┬────┘  └──────┬─────┘  └────┬──────┘
           │              │              │
           ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     JOB LIFECYCLE                               │
│  WAITING ─► LAUNCHING ─► RUNNING ─► COMPLETE / FAILED          │
│                                                                 │
│  Logs: stdout.log / stderr.log (local)                          │
│        provider_logs.txt via tfl-remote-trap (remote)           │
└─────────────────────────────────────────────────────────────────┘
```
