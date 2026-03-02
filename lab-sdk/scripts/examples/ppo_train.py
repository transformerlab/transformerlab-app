# Copyright 2020-2026 The HuggingFace Team. All rights reserved.
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

# /// script
# dependencies = [
#     "trl",
#     "peft",
#     "trackio",
#     "kernels",
# ]
# ///

import os
import shutil

import torch
from accelerate import PartialState
from datasets import load_dataset
from transformers import (
    AutoModelForCausalLM,
    AutoModelForSequenceClassification,
    AutoTokenizer,
    HfArgumentParser,
)

from trl import ModelConfig, ScriptArguments, get_kbit_device_map, get_peft_config, get_quantization_config
from trl.experimental.ppo import PPOConfig, PPOTrainer

from lab import lab


# Enable logging in a Hugging Face Space
os.environ.setdefault("TRACKIO_SPACE_ID", "trl-trackio")


"""
python -i examples/scripts/ppo/ppo.py \
    --dataset_name trl-internal-testing/descriptiveness-sentiment-trl-style \
    --dataset_train_split descriptiveness \
    --output_dir pythia-1b-deduped-descriptiveness-sentiment-trl-style-ppo \
    --per_device_train_batch_size 64 \
    --gradient_accumulation_steps 1 \
    --total_episodes 10000 \
    --model_name_or_path EleutherAI/pythia-1b-deduped \
    --missing_eos_penalty 1.0

accelerate launch --config_file examples/accelerate_configs/deepspeed_zero3.yaml \
    examples/scripts/ppo/ppo.py \
    --dataset_name trl-internal-testing/descriptiveness-sentiment-trl-style \
    --dataset_train_split descriptiveness \
    --output_dir pythia-1b-deduped-descriptiveness-sentiment-trl-style-ppo \
    --num_ppo_epochs 1 \
    --num_mini_batches 1 \
    --per_device_train_batch_size 1 \
    --gradient_accumulation_steps 16 \
    --total_episodes 10000 \
    --model_name_or_path EleutherAI/pythia-1b-deduped \
    --sft_model_path EleutherAI/pythia-1b-deduped \
    --reward_model_path EleutherAI/pythia-1b-deduped \
    --local_rollout_forward_batch_size 1 \
    --missing_eos_penalty 1.0
"""


if __name__ == "__main__":
    parser = HfArgumentParser((ScriptArguments, PPOConfig, ModelConfig))
    script_args, training_args, model_args = parser.parse_args_into_dataclasses()

    # Initialize TransformerLab job.
    lab.init()

    # Optionally override/fill config fields from lab.get_config(), then apply
    # hardcoded defaults if neither args nor lab config provide a value.
    cfg = lab.get_config() or {}

    if not getattr(script_args, "dataset_name", None):
        script_args.dataset_name = cfg.get(
            "dataset_name",
            "trl-internal-testing/descriptiveness-sentiment-trl-style",
        )

    # Prefer explicit lab config; otherwise, override TRL's default "train" for this dataset
    if "dataset_train_split" in cfg:
        script_args.dataset_train_split = cfg["dataset_train_split"]
    elif (
        script_args.dataset_name == "trl-internal-testing/descriptiveness-sentiment-trl-style"
        and script_args.dataset_train_split == "train"
    ):
        script_args.dataset_train_split = "descriptiveness"

    if not getattr(training_args, "output_dir", None):
        training_args.output_dir = cfg.get(
            "output_dir",
            "pythia-1b-deduped-descriptiveness-sentiment-trl-style-ppo",
        )

    if not getattr(model_args, "model_name_or_path", None):
        model_args.model_name_or_path = cfg.get("model_name_or_path", "EleutherAI/pythia-1b-deduped")

    if not getattr(training_args, "sft_model_path", None):
        training_args.sft_model_path = cfg.get("sft_model_path", "EleutherAI/pythia-1b-deduped")

    if not getattr(training_args, "reward_model_path", None):
        training_args.reward_model_path = cfg.get("reward_model_path", "EleutherAI/pythia-1b-deduped")

    if getattr(training_args, "total_episodes", None) in (None, 0):
        training_args.total_episodes = cfg.get("total_episodes", 10000)

    if getattr(training_args, "per_device_train_batch_size", None) in (None, 0):
        training_args.per_device_train_batch_size = cfg.get("per_device_train_batch_size", 64)

    if getattr(training_args, "gradient_accumulation_steps", None) in (None, 0):
        training_args.gradient_accumulation_steps = cfg.get("gradient_accumulation_steps", 1)

    if getattr(training_args, "missing_eos_penalty", None) in (None, 0):
        training_args.missing_eos_penalty = cfg.get("missing_eos_penalty", 1.0)

    lab.log("Starting PPO training run")

    # remove output_dir if exists
    shutil.rmtree(training_args.output_dir, ignore_errors=True)

    ################
    # Model & Tokenizer
    ################
    dtype = model_args.dtype if model_args.dtype in ["auto", None] else getattr(torch, model_args.dtype)
    model_kwargs = dict(
        revision=model_args.model_revision,
        attn_implementation=model_args.attn_implementation,
        dtype=dtype,
    )
    quantization_config = get_quantization_config(model_args)
    if quantization_config is not None:
        # Passing None would not be treated the same as omitting the argument, so we include it only when valid.
        model_kwargs["device_map"] = get_kbit_device_map()
        model_kwargs["quantization_config"] = quantization_config

    tokenizer = AutoTokenizer.from_pretrained(
        model_args.model_name_or_path, padding_side="left", trust_remote_code=model_args.trust_remote_code
    )
    tokenizer.add_special_tokens({"pad_token": "[PAD]"})
    value_model = AutoModelForSequenceClassification.from_pretrained(
        training_args.reward_model_path,
        trust_remote_code=model_args.trust_remote_code,
        num_labels=1,
        **model_kwargs,
    )
    reward_model = AutoModelForSequenceClassification.from_pretrained(
        training_args.reward_model_path,
        trust_remote_code=model_args.trust_remote_code,
        num_labels=1,
        **model_kwargs,
    )
    policy = AutoModelForCausalLM.from_pretrained(
        training_args.sft_model_path, trust_remote_code=model_args.trust_remote_code, **model_kwargs
    )

    peft_config = get_peft_config(model_args)
    if peft_config is None:
        ref_policy = AutoModelForCausalLM.from_pretrained(
            training_args.sft_model_path, trust_remote_code=model_args.trust_remote_code, **model_kwargs
        )
    else:
        ref_policy = None

    ################
    # Dataset
    ################
    dataset = load_dataset(
        script_args.dataset_name, name=script_args.dataset_config, split=script_args.dataset_train_split
    )
    eval_samples = 100
    train_dataset = dataset.select(range(len(dataset) - eval_samples))
    eval_dataset = dataset.select(range(len(dataset) - eval_samples, len(dataset)))
    dataset_text_field = "prompt"

    def prepare_dataset(dataset, tokenizer):
        """pre-tokenize the dataset before training; only collate during training"""

        def tokenize(element):
            outputs = tokenizer(
                element[dataset_text_field],
                padding=False,
            )
            return {"input_ids": outputs["input_ids"]}

        return dataset.map(
            tokenize,
            batched=True,
            remove_columns=dataset.column_names,
            num_proc=training_args.dataset_num_proc,
        )

    # Compute that only on the main process for faster data processing.
    # see: https://github.com/huggingface/trl/pull/1255
    with PartialState().local_main_process_first():
        train_dataset = prepare_dataset(train_dataset, tokenizer)
        eval_dataset = prepare_dataset(eval_dataset, tokenizer)

    ################
    # Training
    ################
    trainer = PPOTrainer(
        args=training_args,
        processing_class=tokenizer,
        model=policy,
        ref_model=ref_policy,
        reward_model=reward_model,
        value_model=value_model,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        peft_config=peft_config,
    )

    # Hook TransformerLab HF-style callback into PPO trainer
    hf_callback = lab.get_hf_callback()
    trainer.add_callback(hf_callback)

    try:
        trainer.train()

        # Save and push to hub
        trainer.save_model(training_args.output_dir)
        if training_args.push_to_hub:
            trainer.push_to_hub(dataset_name=script_args.dataset_name)

        trainer.generate_completions()

        # Register the trained model in TransformerLab
        model_name = os.path.basename(os.path.abspath(training_args.output_dir))
        lab_model_path = lab.save_model(
            source_path=training_args.output_dir,
            name=model_name,
        )
        lab.log(f"Saved trained PPO model to TransformerLab at: {lab_model_path}")
        lab.finish("PPO training completed successfully")
    except Exception as e:
        lab.error(f"PPO training failed: {e}")
        raise
