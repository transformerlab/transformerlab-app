---
title: Install Instructions
slug: install
sidebar_position: 20
---

## Prerequisites

Before starting the installation, ensure you have the following:

- SSH access and administrative (sudo) privileges on the server hosting Transformer Lab
- [uv](https://docs.astral.sh/uv/getting-started/installation/) for installation
- You can run tasks locally, or on a remote machine using a compute provider:
  - [Install Slurm](./install-gpu-orchestrator/install-slurm.md)
  - [Install SkyPilot](./install-gpu-orchestrator/install-skypilot.md)
  - [Install Runpod](./install-gpu-orchestrator/install-runpod.md)
  - [Install dstack](./install-gpu-orchestrator/install-dstack.md)
  - [Choosing Between Slurm and SkyPilot](./install-gpu-orchestrator/skypilot-vs-slurm.md)
- You can store data locally, or use cloud storage (GCP, AWS, or Azure). You'll need an account
  with permissions to create and manage buckets/containers

## Step 1 - Install Transformer Lab Using the CLI

### 1a. Install the Transformer Lab CLI

```bash
uv tool install transformerlab-cli
```

### 1b. Install the Server

Run the interactive installer:

```bash
lab server install
```

This will walk you through configuring:

1. **Frontend URL** — where users will access the web interface.
2. **Storage Backend** — choose between AWS S3, GCP, Azure, or local filesystem. See [Cloud Storage Options](./advanced-install/cloud-storage.md) for details on each provider.
3. **Admin Account** — a default admin account (`admin@example.com` / `admin123`) is created on first startup. **Change the default password immediately after first login.**
4. **Compute Provider** — optionally configure a default compute provider (you can also add or change providers later via the web UI or with `lab provider add`).
5. **Email (SMTP)** — optionally configure SMTP for sending user invitations and signup confirmations.
6. **Authentication** — optionally configure additional auth providers (OAuth/OIDC). Email/password is enabled by default.

The values you enter are saved to `~/.transformerlab/.env` and used to configure the server on startup. If you had installed the server before and previously configured the setup, your existing values will be shown as defaults — press Enter to keep them.

If you want to run jobs on remote compute providers, you'll need a shared cloud storage. Configure credentials for your chosen cloud storage option before starting the server:

- [AWS S3 Setup](./advanced-install/cloud-storage.md#aws-s3-storage)
- [GCS Setup](./advanced-install/cloud-storage.md#google-cloud-storage-gcs)
- [Azure Setup](./advanced-install/cloud-storage.md#azure-blob-storage)

Note that storage configuration currently cannot be changed via the web UI.

## Step 2 - Run Transformer Lab and Log in

Start the server:

```bash
cd ~/.transformerlab/src && ./run.sh
```

Now visit `http://localhost:8338` (or the address of your server) and log in with the default admin account:

- **Login:** `admin@example.com`
- **Password:** `admin123`

**Change the default password immediately.**

## Step 3 - Configuring a Compute Provider

If you already configured a compute provider during the installer, you can skip this step. Otherwise, add one through the web UI or with `lab provider add`.

For provider-specific setup instructions and example configs, see:

- [SkyPilot](./configure-compute/skypilot.md)
- [Slurm](./configure-compute/slurm.md)
- [Runpod](./configure-compute/runpod.md)
- [dstack](./configure-compute/dstack.md)
- [AWS](./configure-compute/aws.md)
- [Azure](./configure-compute/azure.md)

## Congrats, you are up and running

[You can now run a Task →](/for-teams/running-a-task/task-submission)
