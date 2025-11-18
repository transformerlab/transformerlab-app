This sub-directory houses all of the PyTorch versions of the MLX scripts in the main directory of this repo.
They include:

### `pytorch_sft.py`
A fine-tuning script. This loads in data from `data_utils.py`, exact same as the `sft.py` script with MLX.
Pre-trained models are loaded in with [transformers](https://huggingface.co/docs/transformers/index).
Fine-tuning is done with the [PEFT library](https://huggingface.co/docs/peft/en/index) and [LoRAs](https://huggingface.co/docs/peft/en/task_guides/lora_based_methods).

Trained models are saved with the `.save_pretrained()` function into this directory.

### `pytorch_ppo_trainer.py`
This is a gutting/rewriting of the [PPO_Trainer](https://huggingface.co/docs/trl/main/en/ppo_trainer) from HuggingFace's [TRL library](https://huggingface.co/docs/trl/index). 
It _should_ match the MLX version as closely as possible.

### `pytorch_ppo_training.py`
This is the launcher script for running RLHF/RLAIF with PyTorch, using the `pytorch_ppo_trainer`.

### `pytorch_talk_to_model.py`
This loads in a pretrained model with PyTorch and runs it in the terminal for you to live-chat with the model. Good for testing out how well things are working.
