---
title: Running with Docker
sidebar_position: 110
draft: true
# I made this document DRAFT for now as we need to re-test under our new architecture
---

:::warning
This page is no longer maintained. See the latest setup steps on the [For Teams install page](/for-teams/install).
:::

Transformer Lab provides pre-built Docker images that make it easy to get started quickly without worrying about dependencies or environment setup. This guide covers how to run Transformer Lab using Docker containers.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your system
- For GPU support:
  - **NVIDIA GPUs**: [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
  - **AMD GPUs**: [ROCm drivers](https://rocm.docs.amd.com/en/latest/deploy/linux/quick_start.html) installed on your host system

## Docker Images

TransformerLab provides two main Docker images on Docker Hub:

- **`transformerlab/api:latest`** - For NVIDIA GPUs and CPU-only machines
- **`transformerlab/api:latest-rocm`** - For AMD GPUs with ROCm support

## Quick Start

### NVIDIA GPU / CPU-Only Machines

Pull and run the latest image:

```bash
docker run --rm -it \
  --gpus all \
  -v ~/.transformerlab:/root/.transformerlab \
  -p 8338:8338 \
  transformerlab/api:latest
```

For CPU-only (without GPU support):

```bash
docker run --rm -it \
  -v ~/.transformerlab:/root/.transformerlab \
  -p 8338:8338 \
  transformerlab/api:latest
```

### AMD GPU Machines

Pull and run the ROCm-enabled image:

```bash
docker run --rm -it \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --ipc=host \
  --cap-add=SYS_PTRACE \
  --security-opt seccomp=unconfined \
  -v ~/.transformerlab:/root/.transformerlab \
  -p 8338:8338 \
  transformerlab/api:latest-rocm
```

## Accessing TransformerLab

Once the container is running, you can access TransformerLab in your web browser at:

```text
http://localhost:8338
```

## Docker Run Options Explained

### Common Options

- `--rm` - Automatically remove the container when it exits
- `-it` - Interactive mode with pseudo-TTY
- `-v ~/.transformerlab:/root/.transformerlab` - Mount local data directory for persistence
- `-p 8338:8338` - Map port 8338 from container to host

### NVIDIA GPU Options

- `--gpus all` - Enable access to all GPUs (requires NVIDIA Container Toolkit with cuda 12.8 or higher)

### AMD GPU Options

- `--device=/dev/kfd` - AMD GPU compute device
- `--device=/dev/dri` - AMD GPU graphics device
- `--group-add video` - Add container to video group
- `--ipc=host` - Use host IPC namespace
- `--cap-add=SYS_PTRACE` - Add system tracing capability
- `--security-opt seccomp=unconfined` - Disable seccomp security profile

## Data Persistence

The `-v ~/.transformerlab:/root/.transformerlab` volume mount ensures that:

- Downloaded models persist between container restarts
- Your projects and configurations are saved
- Training data and results are preserved

## Advanced Usage

### Running in Background

To run TransformerLab as a background service:

```bash
# NVIDIA/CPU
docker run -d \
  --name transformerlab \
  --gpus all \
  -v ~/.transformerlab:/root/.transformerlab \
  -p 8338:8338 \
  --restart unless-stopped \
  transformerlab/api:latest

# AMD
docker run -d \
  --name transformerlab \
  --device=/dev/kfd \
  --device=/dev/dri \
  --group-add video \
  --ipc=host \
  --cap-add=SYS_PTRACE \
  --security-opt seccomp=unconfined \
  -v ~/.transformerlab:/root/.transformerlab \
  -p 8338:8338 \
  --restart unless-stopped \
  transformerlab/api:latest-rocm
```

## Troubleshooting

### GPU Not Detected

**AMD**: Ensure ROCm drivers are installed:

```bash
# Test ROCm access
docker run --rm \
  --device=/dev/kfd \
  --device=/dev/dri \
  rocm/rocm-terminal rocminfo
```

### Permission Issues

If you encounter permission issues with the mounted volume:

```bash
# Fix ownership of the data directory
sudo chown -R $USER:$USER ~/.transformerlab
```

### Container Won't Start

Check Docker logs:

```bash
docker logs <container_id>
```

### Port Already in Use

If port 8338 is already in use, either:

1. Stop the service using that port, or
2. Use a different port with `-p 8080:8338`

## Building Custom Images

If you need to customize the Docker image, you can find the Dockerfiles in the [TransformerLab App repository](https://github.com/transformerlab/transformerlab-app/tree/main/api/docker).

### Build NVIDIA/CPU Image

```bash
git clone https://github.com/transformerlab/transformerlab-app.git
cd transformerlab-app/api/docker/common
docker build -t my-transformerlab .
```

### Build AMD Image

```bash
git clone https://github.com/transformerlab/transformerlab-app.git
cd transformerlab-app/api/docker/gpu/amd
docker build -t my-transformerlab-amd .
```

## Next Steps

Once TransformerLab is running:

1. Visit `http://localhost:8338` in your browser

## Docker Compose (Optional)

For easier management, you can use Docker Compose. Create a `docker-compose.yml` file:

```yaml
version: '3.11'

services:
  transformerlab:
    image: transformerlab/api:latest
    ports:
      - '8338:8338'
    volumes:
      - ~/.transformerlab:/root/.transformerlab
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    restart: unless-stopped
```

Then run:

```bash
docker-compose up -d
```

For AMD GPUs, use this compose file instead:

```yaml
version: '3.11'

services:
  transformerlab-amd:
    image: transformerlab/api:latest-rocm
    ports:
      - '8338:8338'
    volumes:
      - ~/.transformerlab:/root/.transformerlab
    devices:
      - /dev/kfd
      - /dev/dri
    group_add:
      - video
    ipc: host
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
    restart: unless-stopped
```
