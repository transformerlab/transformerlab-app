<div align="center">
  <a href="https://lab.cloud"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo_Reverse.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg">
    <img alt="Transformer Lab" src="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg" width="400">
  </picture></a>

  <h3>Train, Fine-tune & Chat with LLMs on Your Own Machine</h3>

  <p>
    <a href="https://github.com/transformerlab/transformerlab-app/stargazers"><img src="https://img.shields.io/github/stars/transformerlab/transformerlab-app?style=flat&color=blue" alt="GitHub Stars"></a>
    <a href="https://github.com/transformerlab/transformerlab-app/releases"><img src="https://img.shields.io/github/v/release/transformerlab/transformerlab-app?color=green" alt="Release"></a>
    <a href="https://github.com/transformerlab/transformerlab-app/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License"></a>
    <a href="https://twitter.com/transformerlab"><img src="https://img.shields.io/twitter/follow/transformerlab?style=flat&logo=x&color=black" alt="Twitter"></a>
  </p>

  <p>
    <a href="https://lab.cloud/docs/install/"><strong>⬇️ Install for Individuals</strong></a>
    &nbsp;·&nbsp;
    <a href="https://lab.cloud/for-teams/install"><strong>🏢 Install for Teams</strong></a>
    &nbsp;·&nbsp;
    <a href="https://lab.cloud/docs/"><strong>📖 Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://youtu.be/tY5TAvKviLo"><strong>🎬 Demo</strong></a>
    &nbsp;·&nbsp;
    <a href="https://discord.gg/transformerlab"><strong>💬 Discord</strong></a>
  </p>

  <br/>
  
  <a href="https://future.mozilla.org/builders/">
    <img src="https://img.shields.io/badge/Backed_by-Mozilla_Builders-black?style=flat&logo=mozilla" alt="Mozilla Builders">
  </a>
</div>

<br/>

<p align="center">
  <img src="assets/transformerlab-demo-jan2025.gif" alt="Transformer Lab Demo" width="800">
</p>

---

## ✨ Why Transformer Lab?

Transformer Lab is a **100% open-source** desktop application that gives you complete control over large language models. No cloud dependencies, no API costs, no data leaving your machine.

<table>
<tr>
<td width="50%">

### 🎯 For Researchers & Engineers
- Fine-tune models with RLHF, DPO, ORPO, SIMPO
- Evaluate models with built-in benchmarks
- Inspect attention patterns and activations
- Full REST API for automation

</td>
<td width="50%">

### 🚀 For Everyone
- One-click model downloads from HuggingFace
- Simple chat interface with history
- Drag-and-drop RAG document upload
- Cross-platform: macOS, Windows, Linux

</td>
</tr>
</table>

---

## 🛠️ Features

<details open>
<summary><strong>📦 Model Management</strong></summary>

- **One-click downloads** for DeepSeek, Qwen, Gemma, Phi4, Llama, Mistral, Mixtral, Stable Diffusion, Flux, and more
- Download any model from HuggingFace (LLMs, VLMs, Diffusion)
- Convert between Huggingface, MLX, and GGUF formats
</details>

<details open>
<summary><strong>🎓 Training & Fine-tuning</strong></summary>

- **MLX** fine-tuning on Apple Silicon
- **Huggingface Trainer** on NVIDIA/AMD GPUs
- **Diffusion LoRA** training
- **RLHF**: DPO, ORPO, SIMPO, Reward Modeling
</details>

<details open>
<summary><strong>💬 Inference & Chat</strong></summary>

- Multiple engines: MLX, vLLM, llama.cpp, SGLang, FastChat
- Batched inference & function calling
- Visualize model architecture, attention, and activations
- Templated prompts with parameter tuning
</details>

<details>
<summary><strong>📖 RAG & Datasets</strong></summary>

- Drag-and-drop document upload
- Works with MLX, FastChat, and other engines
- Pull from HuggingFace datasets or bring your own
- Calculate embeddings
</details>

<details>
<summary><strong>🖼️ Image Generation</strong></summary>

- Stable Diffusion, Flux, and more
- Train custom LoRAs
</details>

<details>
<summary><strong>🔌 Extensibility</strong></summary>

- Plugin gallery with one-click install
- Write custom plugins
- Embedded Monaco code editor
- Full REST API
</details>

<details>
<summary><strong>☁️ Flexible Deployment</strong></summary>

- Run everything locally on a single machine
- Or split: UI on laptop, engine on cloud/remote GPU
</details>

---

## 📥 Quick Start

### Install

[![Install for Individuals](https://img.shields.io/badge/Install_for_Individuals-blue?style=for-the-badge&logo=github)](https://lab.cloud/docs/install/)
[![Install for Teams](https://img.shields.io/badge/Install_for_Teams-green?style=for-the-badge&logo=github)](https://lab.cloud/for-teams/install)

### Requirements

| Platform | Requirements |
|----------|-------------|
| **macOS** | Apple Silicon (M1/M2/M3/M4) |
| **Linux** | NVIDIA or AMD GPU |
| **Windows** | NVIDIA GPU via WSL2 ([setup guide](https://lab.cloud/docs/install/#install-on-windows)) |

> CPU-only installations support inference but not GPU-accelerated training.

## 👩‍💻 Development

<details>
<summary><strong>Frontend Development</strong></summary>

```bash
# Requires Node.js v22 (not v23+)
npm install
npm start
```

Package for distribution:
```bash
npm run package
```
</details>

<details>
<summary><strong>Backend (API) Development</strong></summary>

```bash
cd api
./install.sh   # Sets up Conda env + Python deps
./run.sh       # Start the API server
```

Or from repo root:
```bash
npm run api:install
npm run api:start
```
</details>

<details>
<summary><strong>SDK Development</strong></summary>

```bash
cd lab-sdk
uv venv
uv pip install -e .
uv run pytest
```

Or install from PyPI:
```bash
pip install transformerlab
```
</details>

<details>
<summary><strong>Database Migrations</strong></summary>

```bash
cd api
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```
</details>

<details>
<summary><strong>Running Tests</strong></summary>

```bash
# Frontend
npm test

# Backend
cd api && pytest
```
</details>

---

## 🤝 Contributing

We welcome contributions! Please check our [issues](https://github.com/transformerlab/transformerlab-app/issues) for open tasks.

<a href="https://github.com/transformerlab/transformerlab-app/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=transformerlab/transformerlab-app" />
</a>

---

## 📄 License

AGPL-3.0 · See [LICENSE](LICENSE) for details.

---

## 📚 Citation

```bibtex
@software{transformerlab,
  author = {Asaria, Ali},
  title = {Transformer Lab: Experiment with Large Language Models},
  year = 2023,
  url = {https://github.com/transformerlab/transformerlab-app}
}
```

---

## 💬 Community

<p align="center">
  <a href="https://discord.gg/transformerlab"><img src="https://img.shields.io/badge/Discord-Join_Community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="https://twitter.com/transformerlab"><img src="https://img.shields.io/badge/Twitter-Follow_Updates-black?style=for-the-badge&logo=x" alt="Twitter"></a>
  <a href="https://github.com/transformerlab/transformerlab-app/issues/new"><img src="https://img.shields.io/badge/GitHub-Report_Issue-181717?style=for-the-badge&logo=github" alt="GitHub Issues"></a>
</p>

<p align="center">
  <sub>Built with ❤️ by <a href="https://twitter.com/transformerlab">Transformer Lab</a>
</p>
