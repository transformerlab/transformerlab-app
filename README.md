<div align="center">
  <a href="https://lab.cloud"><picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo_Reverse.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg">
    <img alt="Transformer Lab" src="https://raw.githubusercontent.com/transformerlab/transformerlab-app/refs/heads/main/assets/Transformer-Lab_Logo.svg" width="400">
  </picture></a>

  <h3>The Operating System for AI Research Labs</h3>
  <p>Train, Fine-tune, and Evaluate LLMs & Diffusion Models across Local Machines and GPU Clusters.</p>

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

## ✨ What is Transformer Lab?

Transformer Lab is an open-source machine learning platform that unifies the fragmented AI tooling landscape into a single, elegant interface. It is available in two editions:

<table>
<tr>
<td width="50%">

### 👤 For Individuals
**Perfect for researchers and hobbyists working on a single machine.**

- **Local Privacy:** No data leaves your machine.
- **Full Toolkit:** Train, fine-tune, chat, and evaluate models.
- **Cross-Platform:** Runs natively on macOS (Apple Silicon), Linux, and Windows (WSL2).
- **No Cloud Costs:** Use your own hardware.

</td>
<td width="50%">

### 🏢 For Teams
**Built for research labs scaling across GPU clusters.**

- **Unified Orchestration:** Submit jobs to **Slurm** clusters or **SkyPilot** clouds (AWS, GCP, Azure) from one UI.
- **Collaborative:** Centralized experiment tracking, model registry, and artifact management.
- **Interactive Compute:** One-click Jupyter, VSCode, and SSH sessions on remote nodes.
- **Resilience:** Auto-recovery from checkpoints and spot instance preemption.

</td>
</tr>
</table>

---

## 🛠️ Key Capabilities

<details open>
<summary><strong>🧠 Foundation Models & LLMs</strong></summary>

- **Universal Support:** Download and run Llama 3, DeepSeek, Mistral, Qwen, Phi, and more.
- **Inference Engines:** Support for MLX, vLLM, Ollama, and HuggingFace Transformers.
- **Format Conversion:** Seamlessly convert between HuggingFace, GGUF, and MLX formats.
- **Chat Interface:** Multi-turn chat, batched querying, and function calling support.
</details>

<details open>
<summary><strong>🎓 Training & Fine-tuning</strong></summary>

- **Unified Interface:** Train on local hardware or submit tasks to remote clusters using the same UI.
- **Methods:** Full fine-tuning, LoRA/QLoRA, RLHF (DPO, ORPO, SIMPO), and Reward Modeling.
- **Hardware Agnostic:** Optimized trainers for Apple Silicon (MLX), NVIDIA (CUDA), and AMD (ROCm).
- **Hyperparameter Sweeps:** Define parameter ranges in YAML and automatically schedule grid searches.
</details>

<details open>
<summary><strong>🎨 Diffusion & Image Generation</strong></summary>

- **Generation:** Text-to-Image, Image-to-Image, and Inpainting using Stable Diffusion and Flux.
- **Advanced Control:** Full support for ControlNets and IP-Adapters.
- **Training:** Train custom LoRA adaptors on your own image datasets.
- **Dataset Management:** Auto-caption images using WD14 taggers.
</details>

<details>
<summary><strong>📊 Evaluation & Analytics</strong></summary>

- **LLM-as-a-Judge:** Use local or remote models to score outputs on bias, toxicity, and faithfulness.
- **Benchmarks:** Built-in support for EleutherAI LM Evaluation Harness (MMLU, HellaSwag, GSM8K, etc.).
- **Red Teaming:** Automated vulnerability testing for PII leakage, prompt injection, and safety.
</details>

<details>
<summary><strong>🔌 Plugins & Extensibility</strong></summary>

- **Plugin System:** Extend functionality with a robust Python plugin architecture.
- **Lab SDK:** Integrate your existing Python training scripts (`import lab`) to get automatic logging, progress bars, and artifact tracking.
- **CLI:** Power-user command line tool for submitting tasks and monitoring jobs without a browser.
</details>

<details>
<summary><strong>🗣️ Audio Generation</strong></summary>

- **Text-to-Speech:** Generate speech using Kokoro, Bark, and other state-of-the-art models.
- **Training:** Fine-tune TTS models on custom voice datasets.
</details>

---

## 📥 Quick Start

### 1. Install

```bash
curl https://lab.cloud/install.sh | bash
```

### 2. Run

```bash
cd ~/.transformerlab/src
./run.sh
```

### 3. Access

Open your browser to `http://localhost:8338`.

#### Requirements
| Platform | Requirements |
|----------|-------------|
| **macOS** | Apple Silicon (M1/M2/M3/M4) |
| **Linux** | NVIDIA or AMD GPU |
| **Windows** | NVIDIA GPU via WSL2 ([setup guide](https://lab.cloud/docs/install/windows-wsl-cuda)) |

---

## 🏢 Enterprise & Cluster Setup

Transformer Lab for Teams runs as an overlay on your existing infrastructure. It does not replace your scheduler; it acts as a modern control plane for it.

To configure Transformer Lab to talk to **Slurm** or **SkyPilot**:
1. Follow the [Teams Install Guide](https://lab.cloud/for-teams/install).
2. Configure your compute providers in the Team Settings.
3. Use the CLI (`lab`) or Web UI to queue tasks across your cluster.

---

## 👩‍💻 Development

<details>
<summary><strong>Frontend</strong></summary>

```bash
# Requires Node.js v22
npm install
npm start
```
</details>

<details>
<summary><strong>Backend (API)</strong></summary>

```bash
cd api
./install.sh   # Sets up Conda env + Python deps
./run.sh       # Start the API server
```
</details>

<details>
<summary><strong>Lab SDK</strong></summary>

```bash
pip install transformerlab
```
</details>

---

## 🤝 Contributing

We are an open-source initiative backed by builders who care about the future of AI research. We welcome contributions! Please check our [issues](https://github.com/transformerlab/transformerlab-app/issues) for open tasks.

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
  author = {Asaria, Ali and Salomone, Tony},
  title = {Transformer Lab: The Operating System for AI Research},
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
  <sub>Built with ❤️ by <a href="https://twitter.com/transformerlab">Transformer Lab</a> in Toronto 🇨🇦</sub>
</p>
