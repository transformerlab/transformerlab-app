# TransformerLab API - Docker Deployment Overview

This folder contains Docker deployment configurations for the TransformerLab API. There are separate sub-folders for different hardware requirements:

- **cpu/** – Contains deployment files for CPU-only environments.
- **gpu/nvidia/** – Contains deployment files for NVIDIA GPU environments.
- *(In the future, a folder such as `gpu/amd/` will be added for AMD GPU deployments.)*

Each sub-folder includes:
- A Dockerfile (either `Dockerfile.cpu` or `Dockerfile.cuda`)
- A Docker Compose template file (`docker-compose.yml.tpl`)
- Deployment scripts for Linux/Mac (`deploy.sh`) and Windows (`deploy.ps1`)
- A README.md with specific instructions for that configuration

---

## How to Proceed

1. **Choose the Appropriate Folder:**
   - If you wish to run the API in a **CPU-only** environment, navigate to the `cpu/` folder.
   - If you require **GPU support with NVIDIA GPUs**, navigate to the `gpu/nvidia/` folder.
   - For future AMD GPU support, check for the relevant folder once available.

2. **Follow the Specific README Instructions:**
   - Inside each sub-folder, you'll find a README.md file that provides detailed steps on how to deploy the container in your chosen environment.

---

## Prerequisites for All Deployments

Before deploying, ensure your system meets the following prerequisites:

### Docker & Docker Compose

#### Linux/Mac:
- **Docker:**  
  - Install Docker by following the instructions at [Docker's official website](https://docs.docker.com/get-docker/).  
  - Ensure the Docker daemon is running (e.g., `sudo systemctl start docker` on Linux).
  
- **Docker Compose:**  
  - Docker Compose is often bundled with Docker Desktop (on macOS) or may need to be installed separately on Linux.  
  - Follow the [Docker Compose installation guide](https://docs.docker.com/compose/install/) if needed.

#### Windows:
- **Docker Desktop for Windows:**  
  - Install [Docker Desktop for Windows](https://docs.docker.com/desktop/windows/install/).  
  - Docker Compose is included with Docker Desktop.
- Ensure you are running the latest version of Windows 10/11.
- Use an elevated PowerShell (run as Administrator) when running deployment scripts if required.

### NVIDIA Drivers & NVIDIA Container Toolkit (For GPU Deployments)

#### Linux:
- **NVIDIA GPU Drivers:**  
  - Install the latest NVIDIA drivers for your GPU model.  
- **NVIDIA Container Toolkit:**  
  - Follow the [NVIDIA Container Toolkit Installation Guide](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) to set up GPU support in Docker.

#### Windows:
- **NVIDIA GPU Drivers:**  
  - Ensure you have installed the latest NVIDIA drivers from [NVIDIA's official website](https://www.nvidia.com/Download/index.aspx).
- **NVIDIA Container Toolkit on Windows:**  
  - GPU support in Docker on Windows is provided via Docker Desktop, so ensure that you have enabled the WSL2 backend and GPU support (refer to [Docker Desktop's documentation](https://docs.docker.com/desktop/windows/wsl/)).

---

## Troubleshooting Common Issues

- **Docker Daemon Not Running:**  
  - Verify that Docker is installed and running. On Linux, you may need to start it with `sudo systemctl start docker`.

- **Docker Compose Issues:**  
  - Confirm that Docker Compose is installed and is a compatible version. Update it if necessary.

- **NVIDIA GPU Not Detected (GPU Deployments):**  
  - Double-check that your NVIDIA drivers are up to date and that the NVIDIA Container Toolkit is properly configured.  
  - Run `docker run --rm --gpus all nvidia/cuda:12.1.1-base nvidia-smi` to test GPU access in Docker.

- **Permission Issues:**  
  - If you face permission issues, try running the scripts with elevated privileges (e.g., `sudo` on Linux/Mac or Administrator mode on Windows).

- **Prerequisite Installation Failures:**  
  - For Linux/Mac, verify that your package manager is up-to-date.  
  - For Windows, check that your system meets the minimum requirements for Docker Desktop and that PowerShell is running with the necessary permissions.

---

## Summary

- **Navigate to the correct sub-folder** (`cpu/` for CPU-only or `gpu/nvidia/` for NVIDIA GPU) based on your deployment needs.
- **Follow the README.md** in that folder for detailed deployment steps.
- Ensure you have **Docker, Docker Compose, and (if needed) NVIDIA drivers & the NVIDIA Container Toolkit** installed and properly configured.
- For any issues, refer to the troubleshooting section above or consult the Docker and NVIDIA official documentation.

Happy deploying!
