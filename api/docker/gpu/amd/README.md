# Transformer Lab AMD GPU Docker Setup

This Docker setup provides a self-contained, ROCm-compatible development environment for TransformerLab on AMD GPUs.

---

## 🧱 Build the Docker Image

From this directory (`transformerlab-api/docker/gpu/amd`), run:

```bash
docker build -t transformerlab-amd .
```

---

## ▶️ Run the Container

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
  transformerlab-amd
```

> ⚠️ You must have AMD ROCm drivers installed on your host system.

---

## 🧪 Development Workflow

Once inside the container:

### Run the app manually:

```bash
/root/.transformerlab/src/run.sh
```

### Run tests:

```bash
cd /root/.transformerlab/src
pytest
```

### Source code location:

```bash
/root/.transformerlab/src
```

You can edit files directly inside the container, or bind-mount your local source if needed.

---

## 🛠 Useful Debug Tips

### Inspect the image:

```bash
docker run --rm -it --entrypoint /bin/bash transformerlab-amd
```

### Check if scripts exist:

```bash
ls /root/.transformerlab/src
```

### Check GPU access:

```bash
rocminfo
```

---

## 📁 Directory Overview

```text
transformerlab-api/
└── docker/
    └── gpu/
        └── amd/
            ├── Dockerfile
            ├── entrypoint.sh
            └── README.md  ← you are here
```
