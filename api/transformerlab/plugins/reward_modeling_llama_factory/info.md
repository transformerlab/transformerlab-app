# RLHF Reward Modeling
## powered by Llama Factory

### Introduction

In this plugin we implement RLHF using reward modeling. The plugin uses Llama Factory (https://github.com/hiyouga/LLaMA-Factory) under the covers.

### Data format

Llama Factory requires data to be structured in a very specific format. It requires a better response in chosen column and a worse response in rejected column.
<!-- 
```json
[
  {
    "instruction": "human instruction (required)",
    "input": "human input (optional)",
    "chosen": "chosen answer (required)",
    "rejected": "rejected answer (required)"
  }
] -->
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

<a href="https://github.com/hiyouga/LLaMA-Factory/blob/main/data/dpo_en_demo.json" target="_blank">dpo_en_demo.json</a>



### What is Reward Modeling

In machine learning, reinforcement learning from human feedback (RLHF) is a technique to align an intelligent agent to human preferences. In classical reinforcement learning, the goal of such an agent is to learn a function that guides its behavior called a policy. This function learns to maximize the reward it receives from a separate reward function based on its task performance.[1] However, it is difficult to define explicitly a reward function that approximates human preferences. Therefore, RLHF seeks to train a "reward model" directly from human feedback.[2] The reward model is first trained in a supervised fashion—independently from the policy being optimized—to predict if a response to a given prompt is good (high reward) or bad (low reward) based on ranking data collected from human annotators. This model is then used as a reward function to improve an agent's policy through an optimization algorithm like proximal policy optimization.

(from wikipedia https://en.wikipedia.org/wiki/Reinforcement_learning_from_human_feedback)

