# DPO / ORPO / SIMPO RLHF Training
(powered by Llama Factory)

### Introduction

In this plugin we implement RLHF using DPO (Direct Preference Optimization) / ORPO (Odds Ratio Preference Optimization) / SIMPO (Simple Preference Optimization). These methods allow for preference optimzation without the need for a reward model. The plugin uses Llama Factory under the covers.

### Data format

Llama Factory requires data to be structured in a very specific format. It requires a better response in chosen column and a worse response in rejected column.


```json
[
  {
    "conversations": "conversation before response (required)",
    "chosen": "preferred answer (required)",
    "rejected": "rejected answer (required)"
  }
]
```

An example dataset is here:

- <a href="https://github.com/hiyouga/LLaMA-Factory/blob/main/data/dpo_en_demo.json" target="_blank">Llama Factory</a>




### What is Preference Optimization

Direct Preference Optimization (DPO) has emerged as a promising alternative for aligning Large Language Models (LLMs) to human or AI preferences. Unlike traditional alignment methods, which are based on reinforcement learning, DPO recasts the alignment formulation as a simple loss function that can be optimised directly on a dataset of preferences.

(from huggingface <a href="https://huggingface.co/blog/pref-tuning" target="_blank">preference tuning</a>)

### Links and Original Papers:

- <a href="https://github.com/hiyouga/LLaMA-Factory" target="_blank">Llama Factory</a>
- <a href="https://huggingface.co/papers/2305.18290" target="_blank">DPO</a>
- <a href="https://github.com/princeton-nlp/SimPO" target="_blank">SIMPO</a>
- <a href="https://arxiv.org/pdf/2403.07691" target="_blank">ORPO: Monolithic Preference Optimization without Reference Model</a>
