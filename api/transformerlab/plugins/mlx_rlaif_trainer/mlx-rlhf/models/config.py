# File copied from HuggingFace at https://github.com/huggingface/trl/blob/main/trl/trainer/ppo_config.py
#
# Copyright 2022 The HuggingFace Team. All rights reserved.
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
import os
import sys
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal

import numpy as np
from utils import exact_div


def flatten_dict(nested: dict, sep: str = "/") -> dict:
    """Flatten dictionary and concatenate nested keys with separator."""

    def recurse(nest: dict, prefix: str, into: dict) -> None:
        for k, v in nest.items():
            if sep in k:
                raise ValueError(f"separator '{sep}' not allowed to be in key '{k}'")
            if isinstance(v, Mapping):
                recurse(v, prefix + k + sep, into)
            else:
                into[prefix + k] = v

    flat = {}
    recurse(nested, "", flat)
    return flat


@dataclass
class PPOConfig:
    """
    Configuration class for PPOTrainer
    """

    # common parameters
    exp_name: str = os.path.basename(sys.argv[0])[: -len(".py")]
    """the name of this experiment (by default is the file name without the extension name)"""
    seed: int = 0
    """Seed value for random generations"""
    log_with: Literal["wandb", "tensorboard"] | None = None
    """Log with either 'wandb' or 'tensorboard', check  https://huggingface.co/docs/accelerate/usage_guides/tracking for more details"""
    task_name: str | None = None
    """Name of task to use - used only for tracking purposes"""
    model_name: str | None = None
    """Name of model to use - used only for tracking purposes"""
    query_dataset: str | None = None
    """Name of dataset to query - used only for tracking purposes"""
    reward_model: str | None = None
    """The reward model to use - used only for tracking purposes"""
    remove_unused_columns: bool = True
    """Remove unused columns from the dataset if `datasets.Dataset` is used"""
    tracker_project_name: str = "mlx_rlaif"
    """Name of project to use for tracking"""

    # hyperparameters
    steps: int = 20000
    """Number of training steps"""
    learning_rate: float = 5e-5
    """Adam learning rate"""
    adap_kl_ctrl: bool = True
    """Use adaptive KL control, otherwise linear"""
    init_kl_coef: float | None = 0.2
    """Initial KL penalty coefficient (used for adaptive and linear control)"""
    kl_penalty: Literal["kl", "abs", "mse", "full"] = "kl"
    """kl penalty options: 'kl': model_logp - ref_logp,  'abs': abs(kl),  'mse': mean squared error mse(kl) and 'full': the actual kl for all tokens in the distribution"""
    target: float | None = 6
    """Target KL value for adaptive KL control"""
    horizon: float | None = 10000
    """Horizon for adaptive KL control"""
    gamma: float = 1
    """Gamma parameter for advantage calculation"""
    lam: float = 0.95
    """Lambda parameter for advantage calculation"""
    cliprange: float = 0.2
    """Range for clipping in PPO policy gradient loss"""
    cliprange_value: float = 0.2
    """Range for clipping values in loss calculation"""
    clip_value_loss: bool = True
    """Clip the value prediction loss, otherwise full value loss"""
    vf_coef: float = 0.1
    """Scaling factor for value loss"""
    batch_size: int = 4
    """Number of samples per optimisation step"""
    mini_batch_size: int = 4
    """Number of samples optimized in each mini batch"""
    max_completion_length: int = 256
    """Maximum number of tokens to generate for each prompt"""
    gradient_accumulation_steps: int = 1
    """The number of gradient accumulation steps"""
    ppo_epochs: int = 4
    """Number of optimisation epochs per batch of samples"""
    max_grad_norm: float | None = None
    """Maximum gradient norm for gradient clipping"""
    early_stopping: bool = False
    """Whether to stop the PPO optimization loop early is the KL too high"""
    target_kl: float = 1
    """Stop early if we exceed this value by over 50%"""
    compare_steps: int = 1
    """Number of steps between comparison of the current reward with the best seen so far"""
    ratio_threshold: float = 10.0
    """Skip mini-batches with high PPO ratios that can cause loss spikes"""
    use_score_scaling: bool = False
    """Use score scaling"""
    use_score_norm: bool = False
    """Use score normalization. Only applicable if use_score_scaling is True"""
    score_clip: float | None = None
    """Score clipping"""
    whiten_rewards: bool = False
    """Whiten the rewards before compute advantages"""

    # computed hyperparameters at runtime; we use `tyro.conf.Suppress` to hide them from the help text
    is_encoder_decoder: bool | None = None
    """TO BE FILLED In RUNTIME: Whether the model is an encoder-decoder model"""
    is_peft_model: bool | None = None
    """TO BE FILLED In RUNTIME: Whether the model is a PEFT model"""
    backward_batch_size: int = None
    """TO BE FILLED In RUNTIME: Number of samples optimized in an `optimizer.step()` call"""

    def __post_init__(self):
        self.backward_batch_size = self.mini_batch_size * self.gradient_accumulation_steps
        exact_div(
            self.batch_size,
            self.backward_batch_size,
            "`batch_size`",
            "`mini_batch_size * gradient_accumulation_steps`",
            "`batch_size` must be a multiple of `mini_batch_size * gradient_accumulation_steps`",
        )

        self.total_ppo_epochs = int(np.ceil(self.steps / self.batch_size))
        assert self.kl_penalty in ["kl", "abs", "mse", "full"]

    def to_dict(self):
        output_dict = {}
        for key, value in self.__dict__.items():
            output_dict[key] = value
        return flatten_dict(output_dict)
