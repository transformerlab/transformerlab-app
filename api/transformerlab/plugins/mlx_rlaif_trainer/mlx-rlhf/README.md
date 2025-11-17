# mlx-rlhf
An example implementation of RLHF (or, more accurately, RLAIF) built on [MLX](https://github.com/ml-explore/mlx) and [HuggingFace](https://huggingface.co/).

This example builds on the [mlx-examples lora](https://github.com/ml-explore/mlx-examples/tree/main/lora) example by adding an RLAIF demo.
Much of the code here is adapted, inspired by, or copied directly from [HuggingFace's trl library](https://github.com/huggingface/trl/tree/main) and/or [Apples MLX Examples](https://github.com/ml-explore/mlx-examples/tree/main).

This repo supports PEFT with [soft-prompts](https://arxiv.org/pdf/2104.08691v2.pdf) and with [LoRA](https://arxiv.org/pdf/2106.09685.pdf). The example works with Llama and Mistral style models
available on Hugging Face, though I have only really tested on Llama style models.

There are two examples here, one for getting a TinyLlama to [generate digits that conform to some sequence guidelines](sequential_digits.md) (such as increasing even numbers), and one for [training a chatbot on your iMessage history](imessage_bot.md) (still a work-in-progress).

There is an accompanying PyTorch implementation of everything in this repo, inside of the `pytorch_baseline` directory.

## Running

First, install the dependencies:

```
pip install -r requirements.txt
```

The main scripts are `sft.py` and `ppo_training.py`. 
See the [sequential_digits.md](sequential_digits.md) file for a step-by-step walkthrough on supervised fine-tuning, learning
a reward model, and using RL to further tune a model.

The `sft.py` script (or it's PyTorch equivalent, `pytorch_baseline/pytorch_sft.py`) runs supervised fine-tuning on a given LLM with data of your choice.
You can use soft-prompts or LoRAs for this fine-tuning. When using MLX, the result is an adapter file that will be saved into this directory.
When using PyTorch, the result is a saved directory, as one would get from a `.save_pretrained()` call in the [transformers](https://huggingface.co/docs/transformers/en/index) library.
This script can be used to do supervised fine-tuning and/or to train a reward model.

The `ppo_training.py` (or `pytorch_baselines/pytorch_ppo_training.py`) runs RLHF with a specified LLM and reward model.
In the sequential digit example, the reward model is not an LLM, but a ground-truth scoring function (which simplifies learning, removes a variable, and lowers compute requirements).
In general, I find the process to be quite unstable and seed-dependent, so just a heads up on that front.

## Files in this repo:
### `sft.py`
A fine-tuning script. This loads in data from `data_utils.py`.
Pre-trained models are loaded in with [MLX-LM](https://github.com/ml-explore/mlx-examples/tree/main/llms), but I don't suggest trying any non-Llama models (I haven't tested them here).
LoRAs from [MLX-LM](https://github.com/ml-explore/mlx-examples/tree/main/llms) and soft-prompts (from me).

The script spits out adapter files, which can be turned into independent/loadable models with the `models/fuse.py` script.

### `mlx_ppo_trainer.py`
This is a gutting/rewriting of the [PPO_Trainer](https://huggingface.co/docs/trl/main/en/ppo_trainer) from HuggingFace's [TRL library](https://huggingface.co/docs/trl/index). 
It matches the original quite closely, and there are unused bits of code still hanging around that I hope to come back and use someday (like the `use_peft` flag). 

### `ppo_training.py`
This is the launcher script for running RLHF/RLAIF with MLX, using the `mlx_ppo_trainer` and a provided model.

### `talk_to_model.py`
This loads in a pretrained model with MLX-LM and runs it in the terminal for you to live-chat with the model. Good for testing out how well things are working.


## To-Do

There are a few areas left open for me (or you!) to patch in:

- [ ] Improve the efficiency of the reward-loss computation (it could be batched)
- [x] Add/switch to QLoRA for more memory efficiency and faster learning
- [ ] Generally improve the integration with `mlx-lm` for more base models and PEFT methods.
- [ ] Address #TODOs in the code (add command line args/config parameters for various hard-coded variables)
- [ ] Fix the way we're logging text to W&B (currently generating thousands of artifacts)
- [ ] Run an end-to-end example with a learned reward model for the sequential digit task
- [ ] Generate preference data for the iMessage example by using an LLM for negative examples
- [ ] Add different preference-tuning approaches (such as DPO) for comparison
- [ ] Run the sequential digit and iMessage examples with soft-prompts
- [ ] Run the sequential digit and iMessage examples with full-model fine-tuning
