# Modified by Andrew Silva from https://github.com/huggingface/trl/blob/main/examples/research_projects/stack_llama/scripts/rl_training.py
#
# Copyright 2023 The HuggingFace Inc. team. All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
Example call to use a pre-trained soft-prompt model from sft.py for RLHF with ground-truth reward:
python ppo_training.py --log_with=wandb --prompt_tuning --resume_file prompt_weights.npz --num_prompt_tokens 10 --model ../tiny_llama --ground_truth_reward

Example call to use a pre-trained digit fine-tune for RLHF with ground-truth reward:
python ppo_training.py --log_with=wandb --model andrewsilva/increasing_digit_fine_tune --batch_size 32 --mini_batch_size 32 --ppo_epoch 4 --ground_truth_reward --num_steps 5550 --adap_kl_ctrl True --init_kl_coef 0.2 --seed 7

Example call to try LoRA without SFT for RLHF with a learned reward model (located at `../reward_model`):
python ppo_training.py --log_with=wandb --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --reward_model ../reward_model/
"""

import os
import random
from dataclasses import dataclass, field

import mlx.core as mx
import numpy as np
import utils
from data.data_utils import get_all_txts, load_custom_hf_dataset
from data.digit_seq_rewards import RewardFunction, reward_against_ground_truth
from mlx.utils import tree_flatten
from mlx_ppo_trainer import PPOTrainer
from models.config import PPOConfig
from tqdm import tqdm
from transformers import HfArgumentParser
from utils import get_model_and_tokenizer


def collator(data):
    return dict((key, [d[key] for d in data]) for key in data[0])


def main(args_in, ppo_config_in):
    # set seed before initializing value head for deterministic eval
    utils.set_seed(ppo_config_in.seed)

    # Now let's build the model, the reference model, and the tokenizer.
    # TODO: Actually handle the use_peft parameter
    if not args_in.use_peft:
        ref_model, _, _ = utils.load(args_in.model)
        if args_in.resume_file is not None:
            ref_model.load_weights(args_in.resume_file, strict=False)
    else:
        ref_model = None

    model, tokenizer = get_model_and_tokenizer(args_in, need_generate=True)

    # We then build the PPOTrainer, passing the model, the reference model, the tokenizer
    ppo_trainer = PPOTrainer(ppo_config_in, model, ref_model, tokenizer, data_collator=collator)

    if args_in.ground_truth_reward:
        # TODO: Ground-truth reward values are hard-coded here, maybe use a config to set dynamically
        #  (especially if we need to match sft.py)
        reward_function = RewardFunction(is_increasing=True, multiple_of=2)
    else:
        reward_function, reward_tokenizer, _ = utils.load(args_in.reward_model_dir)

    # Load custom dataset if specified
    if getattr(args_in, "custom_hf_dataset", None):
        custom_dataset = load_custom_hf_dataset(args_in.custom_hf_dataset)
    else:
        custom_dataset = None

    # We then define the arguments to pass to the `generate` function. These arguments
    # are passed to the `generate` function of the PPOTrainer, which is a wrapper around
    # the `generate` function of the trained model.
    generation_kwargs = {
        # "min_length": -1,
        # "top_k": 0.0,
        # "top_p": 1.0,
        # "do_sample": False,
        "pad_token_id": tokenizer.eos_token_id,
        "max_tokens": ppo_config_in.max_completion_length,
    }

    if args_in.me_chatbot:
        # TODO: Add a command-line arg to point to the directory for message_data
        train_set = get_all_txts("../../message_data/", tokenizer=tokenizer)

    for epoch in range(args_in.num_steps):
        # TODO: Add a command-line arg for a prompt before each call?
        text_in = []
        ground_truths = []
        for _ in range(ppo_config_in.batch_size):
            if custom_dataset is not None:
                idx = random.randint(0, len(custom_dataset) - 1)
                prompt, ground_truth = custom_dataset[idx]
                text_in.append(prompt)
                ground_truths.append(ground_truth)
            elif args_in.me_chatbot:
                text_in.append(random.choice(train_set)[0])
            else:
                start_int = random.randint(0, 150) * 2
                text_in.append(f"{start_int}")

        batch = {
            "query": text_in,
        }
        input_text = tokenizer.pad(tokenizer(text_in).data)["input_ids"]
        query_tensors = mx.array(input_text)  # batch["input_ids"]

        # Get response from gpt2
        response_tensors, ref_response_tensors = ppo_trainer.generate(
            query_tensors, return_prompt=False, generate_ref_response=True, **generation_kwargs
        )

        batch["response"] = tokenizer.batch_decode(np.array(response_tensors))
        batch["ref_response"] = tokenizer.batch_decode(np.array(ref_response_tensors))

        if custom_dataset is not None:
            # Use ground truth reward function
            scores = mx.array(
                reward_against_ground_truth(batch["response"], ground_truths, match_type="exact")
            )
            ref_scores = mx.array(
                reward_against_ground_truth(
                    batch["ref_response"], ground_truths, match_type="exact"
                )
            )
        elif args_in.ground_truth_reward:
            scores = mx.array(
                reward_function(batch["response"], negated=False)
            )  # Should we omit query in the scoring?
            # scores = [x + np.random.randn() * 0.05 for x in scores]  # Noisify the ground truth reward signal
            ref_scores = mx.array(reward_function(batch["ref_response"], negated=False))
        else:
            _, _, scores = reward_function(mx.array(response_tensors))
            _, _, ref_scores = reward_function(mx.array(ref_response_tensors))
            scores = scores[:, -1]
            ref_scores = ref_scores[:, -1]

        rewards = scores

        batch["ref_rewards"] = ref_scores

        print(f"Step {epoch} - Rewards: {rewards}")

        # Run PPO step
        if len(rewards.shape) > 0 and rewards.shape[0] >= 1:
            ppo_trainer.config.batch_size = rewards.shape[0]
            stats = ppo_trainer.step(query_tensors, response_tensors, rewards)
            ppo_trainer.log_stats(
                stats,
                batch,
                rewards,
                columns_to_log=["query", "response", "ref_response", "ref_rewards"],
            )
    # Save prompt weights
    mx.savez(args_in.save_file, **dict(tree_flatten(model.trainable_parameters())))
    # Save the full model if output_dir is provided
    if getattr(args_in, "output_dir", None):
        if not os.path.exists(args_in.output_dir):
            os.makedirs(args_in.output_dir)
        # Save model weights (adapt as needed for your model class)
        model.save_pretrained(args_in.output_dir)
        # Optionally, save tokenizer if available
        if hasattr(tokenizer, "save_pretrained"):
            tokenizer.save_pretrained(args_in.output_dir)


if __name__ == "__main__":
    tqdm.pandas()

    @dataclass
    class ScriptArguments:
        # LoraConfig
        use_peft: bool = field(default=False, metadata={"help": "whether to use peft"})
        ground_truth_reward: bool = field(
            default=False, metadata={"help": "whether to use ground truth reward or not"}
        )
        lora_layers: int | None = field(default=16, metadata={"help": "the number of lora layers"})
        num_prompt_tokens: int | None = field(
            default=10, metadata={"help": "the number of prompt tokens"}
        )
        model: str | None = field(
            default=None,
            metadata={"help": "The path to the local model directory or Hugging Face repo"},
        )
        reward_model_dir: str | None = field(
            default=None,
            metadata={"help": "The path to the local model directory or Hugging Face repo"},
        )

        save_file: str = field(
            default="peft_weights.npz", metadata={"help": "Save path for the trained PEFT weights."}
        )
        resume_file: str | None = field(
            default=None, metadata={"help": "Load path for the trained PEFT weights."}
        )
        prompt_tuning: bool = field(
            default=False, metadata={"help": "whether to use prompt-tuning or LoRA"}
        )
        me_chatbot: bool = field(
            default=False, metadata={"help": "Set prompts as samples from my imessage history?"}
        )
        num_steps: int | None = (
            field(
                default=5550, metadata={"help": "How many PPO training iterations should we use?"}
            ),
        )
        quantize: bool = field(default=False, metadata={"help": "Should we quantize our model?"})
        custom_hf_dataset: str | None = (
            (
                field(
                    default=None,
                    metadata={
                        "help": "Path to custom HuggingFace-style dataset (JSONL) with 'conversations' and 'chosen' fields."
                    },
                ),
            ),
        )
        output_dir: str | None = field(
            default=None, metadata={"help": "Directory to save the trained model."}
        )

    parser = HfArgumentParser((ScriptArguments, PPOConfig))
    args, ppo_config = parser.parse_args_into_dataclasses()

    # We then define the arguments to pass to the sentiment analysis pipeline.
    # We set `return_all_scores` to True to get the sentiment score for each token.
    # sent_kwargs = {"return_all_scores": True, "function_to_apply": "none", "batch_size": 16}
    main(args, ppo_config)
