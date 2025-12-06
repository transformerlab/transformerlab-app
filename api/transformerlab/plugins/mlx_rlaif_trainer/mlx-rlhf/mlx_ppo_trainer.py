# Modified by Andrew Silva from https://github.com/huggingface/trl/blob/main/trl/trainer/ppo_trainer.py
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
import math
import time
import typing
import warnings
from collections.abc import Callable
from contextlib import nullcontext

import mlx.core
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
import wandb
from models.base import create_reference_model
from models.config import PPOConfig
from transformers import (
    DataCollatorForLanguageModeling,
)
from utils import (
    AdaptiveKLController,
    FixedKLController,
    RunningMoments,
    convert_to_scalar,
    flatten_dict,
    generate_ids,
    logprobs_from_logits,
    masked_mean,
    masked_whiten,
    set_seed,
    stack_dicts,
    stats_to_np,
)

EPS = 1e-6


# Running TO-DO list:
# 1. Log/save model with highest reward
# 2. Add some kind of entropy reward?
# 3. Gradient clipping


class PPOTrainer:
    """
    The PPOTrainer uses Proximal Policy Optimization to optimise language models.
    Note, this trainer is heavily inspired by the original OpenAI learning to summarize work here:
    https://github.com/openai/summarize-from-feedback

    Attributes:
        **config** (`PPOConfig`) -- Configuration object for PPOTrainer. Check the documentation of `PPOConfig` for more
            details.
        **model** (`PreTrainedModelWrapper`) -- Model to be optimized, Hugging Face transformer model with a value head.
            Check the documentation of `PreTrainedModelWrapper` for more details.
        **ref_model** (`PreTrainedModelWrapper`, *optional*) -- Reference model to be used for KL penalty, Hugging Face
            transformer model with a casual language modelling head. Check the documentation of `PreTrainedModelWrapper`
            for more details. If no reference model is provided, the trainer will create a reference model with the same
             architecture as the model to be optimized with shared layers.
        **tokenizer** (`PreTrainedTokenizerBase`) -- Tokenizer to be used for encoding the
            data. Check the documentation of `transformers.PreTrainedTokenizer` and
            `transformers.PreTrainedTokenizerFast` for more details.
        **dataset** (Union[`Dataset`, `datasets.Dataset`], *optional*) -- custom dataset or Hugging
            Face dataset. This is used to create a dataloader. If no dataset is provided, the dataloader must be
             created outside the trainer users needs to design their own dataloader and make sure the batch
            size that is used is the same as the one specified in the configuration object.
        **optimizer** (`mlx.optim.Optimizer`, *optional*) -- Optimizer to be used for training. If no optimizer is
            provided, the trainer will create an Adam optimizer with the learning rate specified in the configuration
            object.
        **data_collator** (DataCollatorForLanguageModeling, *optional*) -- Data collator to be used for training and
            passed along the dataloader
        **num_shared_layers** (int, *optional*) -- Number of layers to be shared between the model and the reference
            model, if no reference model is passed. If no number is provided, all the layers will be shared.
    """

    def __init__(
        self,
        config: PPOConfig = None,
        model=None,
        ref_model=None,
        tokenizer=None,
        optimizer: optim.Optimizer | None = None,
        data_collator: typing.Callable | None = None,
        num_shared_layers: int | None = None,
    ):
        """
        Initialize PPOTrainer.

        Args:
            config (`PPOConfig`):
                Configuration object for PPOTrainer. Check the documentation of `PPOConfig` for more details.
            model (`PreTrainedModelWrapper`):
                Hugging Face transformer model with a value head.
            ref_model (`PreTrainedModelWrapper`):
                Hugging Face transformer model with a casual language modelling head. Used for KL penalty
            tokenizer (`transformers.PreTrainedTokenizerBase`):
                Hugging Face tokenizer
            optimizer (Optional[`mlx.optim.Optimizer`]):
                Optimizer used for training. If `None`, the `Adam` is used as default.
            data_collator (Optional[function]):
                Data collator function.
            num_shared_layers (Optional[int]):
                Number of shared layers between the model and the reference model. If `None`, all layers are shared.
                used only if `ref_model` is `None`.
        """
        self.config = config
        # initial seed for reproducible experiments
        set_seed(config.seed)

        # Step 0: check positional arguments validity
        if not isinstance(config, PPOConfig):
            raise ValueError(f"config must be a PPOConfig, got {type(config)}")

        self.model = model
        self.model_params = filter(lambda p: p.requires_grad, self.model.parameters())
        self.is_encoder_decoder = hasattr(self.model, "is_encoder_decoder")
        self.is_peft_model = getattr(self.model, "is_peft_model", False)
        config.is_encoder_decoder = self.is_encoder_decoder
        config.is_peft_model = self.is_peft_model

        self.is_using_text_environment = getattr(config, "use_text_environment", False)

        if ref_model is not None:
            self.ref_model = ref_model
            if num_shared_layers is not None:
                warnings.warn(
                    "num_shared_layers is ignored when ref_model is provided. Two different models are used for the "
                    "model and the reference model and no layers are shared.",
                    UserWarning,
                )
        elif ref_model is None and not self.is_peft_model:
            self.ref_model = create_reference_model(self.model, num_shared_layers=num_shared_layers)
        elif self.is_peft_model:
            self.ref_model = None

        self.optional_peft_ctx = (
            self.model.pretrained_model.disable_adapter if self.is_peft_model else nullcontext
        )

        self.tokenizer = tokenizer

        self._signature_columns = None

        # Step 3: Initialize optimizer and data collator
        if data_collator is None:
            self.data_collator = DataCollatorForLanguageModeling(self.tokenizer, mlm=False)
        else:
            self.data_collator = data_collator
        if optimizer is None:
            self.optimizer = optim.Adam(
                learning_rate=self.config.learning_rate,
            )
        else:
            self.optimizer = optimizer

        if self.config.adap_kl_ctrl:
            self.kl_ctl = AdaptiveKLController(
                self.config.init_kl_coef, self.config.target, self.config.horizon
            )
        else:
            self.kl_ctl = FixedKLController(self.config.init_kl_coef)

        # init the current step
        self.current_step = 0

        # post process for PP
        if not getattr(self.model, "is_sequential_parallel", False):
            self.current_device = mlx.core.Device

        self.running = RunningMoments()
        self.logger = wandb.init(project="RLAIF", config=config, save_code=True)
        self.loss_value_and_grad = nn.value_and_grad(self.model, self.loss_fn)

    def generate(
        self,
        query_tensor: mx.array | list[mx.array],
        length_sampler: Callable = None,
        batch_size: int = 8,
        return_prompt: bool = True,
        generate_ref_response: bool = False,
        temperature: float = 0.0,
        max_tokens: int = 1024,
        **generation_kwargs,
    ):
        """
        Generate response with the model given the query tensor.
        call the `generate` method of the model.

        Args:
            query_tensor (`mx.array`):
                A tensor of shape (`seq_len`) containing query tokens or a list of tensors of shape (`seq_len`).
            length_sampler (`Callable`, *optional*):
                Callable that returns the number of newly generated tokens.
            batch_size (`int`, *optional):
                Batch size used for generation, defaults to `4`.
            return_prompt (`bool`, *optional*):
                If set to `False` the prompt is not returned but only the newly generated tokens, defaults to `True`.
            generate_ref_response (`bool`, *optional*):
                If set to `True` the reference response is also generated, defaults to `False`.
            temperature: Sampling temperature -- 0.0 for argmax
            max_new_tokens: New tokens to generate
            generation_kwargs (dict[str, Any]):
                Keyword arguments for generation.

        Returns:
            `mx.array`: A tensor of shape (`batch_size`, `gen_len`) containing response tokens.
        """
        if generate_ref_response:
            ref_model = self.model if self.is_peft_model else self.ref_model
        if isinstance(query_tensor, list):
            response = self._generate_batched(
                self.model,
                query_tensor,
                length_sampler=length_sampler,
                batch_size=batch_size,
                return_prompt=return_prompt,
                **generation_kwargs,
            )
            if generate_ref_response:
                with self.optional_peft_ctx():
                    ref_response = self._generate_batched(
                        ref_model,
                        query_tensor,
                        length_sampler=length_sampler,
                        batch_size=batch_size,
                        return_prompt=return_prompt,
                        **generation_kwargs,
                    )

        else:
            if len(query_tensor.shape) == 1:
                query_tensor = query_tensor[None, :]

            if length_sampler is not None:
                generation_kwargs["max_tokens"] = length_sampler()
            response = generate_ids(
                model=self.model,
                input_ids=query_tensor,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            if generate_ref_response:
                with self.optional_peft_ctx():
                    ref_response = generate_ids(
                        model=ref_model,
                        input_ids=query_tensor,
                        temperature=temperature,
                        max_tokens=max_tokens,
                    )

            # if not return_prompt and not self.is_encoder_decoder:
            #     response = response[:, query_tensor.shape[0]:]
            #     if generate_ref_response:
            #         ref_response = ref_response[:, query_tensor.shape[0]:]

        if generate_ref_response:
            return response, ref_response
        return response

    def _generate_batched(
        self,
        model,
        query_tensors: list[mx.array],
        length_sampler: Callable = None,
        batch_size: int = 4,
        return_prompt: bool = True,
        pad_to_multiple_of: int = None,
        remove_padding: bool = True,
        **generation_kwargs,
    ):
        outputs = []

        padding_side_default = self.tokenizer.padding_side
        if not self.is_encoder_decoder:
            self.tokenizer.padding_side = "left"

        # in case we have fewer examples than bs
        batch_size = min(len(query_tensors), batch_size)

        for i in range(0, len(query_tensors), batch_size):
            # prevent overflow if query tensors are not even multiple of bs
            end_index = min(len(query_tensors), i + batch_size)

            batch = query_tensors[i:end_index]
            batch_mask = [mx.ones_like(element) for element in batch]
            inputs = {"input_ids": batch, "attention_mask": batch_mask}

            padded_inputs = self.tokenizer.pad(
                inputs, padding=True, max_length=None, pad_to_multiple_of=pad_to_multiple_of
            )

            generations = model.generate(**padded_inputs, **generation_kwargs)

            for generation, mask in zip(generations, padded_inputs["attention_mask"]):
                if not self.is_encoder_decoder:
                    output = generation[(1 - mask).sum() :]  # remove padding
                else:
                    output = generation

                if not return_prompt and not self.is_encoder_decoder:
                    output = output[(mask).sum() :]  # remove prompt

                if remove_padding and self.tokenizer.eos_token_id in output:
                    pad_mask = output == self.tokenizer.eos_token_id
                    pad_start = np.nonzero(pad_mask)[0][0]
                    output = output[: pad_start + 1]  # keep the eos token at the end

                outputs.append(output)

        self.tokenizer.padding_side = padding_side_default
        return outputs

    def _step_safety_checker(
        self,
        batch_size: int,
        queries: list[mx.array],
        responses: list[mx.array],
        scores: list[mx.array],
        masks: list[mx.array] | None = None,
    ):
        """
        Check if the input data is valid for training.

        Args:
            batch_size (int):
                Batch size from the config file.
            queries (List[`mx.array`]):
                List of mx arrays containing the encoded queries of shape (`query_length`)
            responses (List[`mx.array`]):
                List of mx arrays containing the encoded responses of shape (`response_length`)
            scores (List[`mx.array`]):
                List of mx arrays containing the scores.
            masks (List[`mx.array`], *optional*):
                list of optional tensors containing the masks of shape (`query_length` + `response_length`)
        Returns:
            `tuple`: The input processed data.
        """
        for name, tensor_list in zip(
            ["queries", "responses", "scores"], [queries, responses, scores]
        ):
            # if not isinstance(tensor_list, list):
            #     raise ValueError(f"{name} must be a list of mx.array s - got {type(tensor_list)}")
            if not isinstance(tensor_list[0], mx.array):
                raise ValueError(
                    f"Elements in {name} must be mx.array - got {type(tensor_list[0])}"
                )
            if batch_size is not None and len(tensor_list) != batch_size:
                raise ValueError(
                    f"Batch size ({batch_size}) does not match number of examples - but got {len(tensor_list)} for: {name}"
                )

        # squeeze scores if needed
        for i, score in enumerate(scores):
            if len(score.shape) > 1:
                raise ValueError(
                    f"Scores must be 1-dimensional - got {len(score.shape)} for {score}"
                )
            elif len(score.shape) == 1:
                scores[i] = score.squeeze()

        return queries, responses, scores, masks

    def step(
        self,
        queries: list[mx.array],
        responses: list[mx.array],
        scores: list[mx.array],
        response_masks: list[mx.array] | None = None,
    ):
        """
        Run a PPO optimisation step given a list of queries, model responses, and rewards.

        Args:
            queries (List[`mx.array`]):
                List of tensors containing the encoded queries of shape (`query_length`)
            responses (List[`mx.array`]):
                List of tensors containing the encoded responses of shape (`response_length`)
            scores (List[`mx.array`]):
                List of tensors containing the scores.
            response_masks (List[`mx.array`], *optional*)):
                List of tensors containing masks of the response tokens.

        Returns:
            `dict[str, Any]`: A summary of the training statistics
        """
        self.current_step += 1
        bs = self.config.batch_size

        queries, responses, scores, response_masks = self._step_safety_checker(
            bs, queries, responses, scores, response_masks
        )
        scores = mx.array(scores)
        if self.config.use_score_scaling:
            # Score scaling
            scores_mean, scores_std = self.running.update(scores)
            tensor_to_kwargs = dict(dtype=scores.dtype)
            score_scaling_factor = self.running.std.to(**tensor_to_kwargs) + EPS
            if self.config.use_score_norm:
                scores = (scores - self.running.mean.to(**tensor_to_kwargs)) / score_scaling_factor
            else:
                scores /= score_scaling_factor

        if self.config.score_clip is not None:
            # Score clipping
            scores = mx.clip(scores, -self.config.score_clip, self.config.score_clip)

        # if we want to push best model to the hub
        # TODO: Put highest reward model saving back in here, if desired.
        if hasattr(self, "highest_reward"):
            if self.compare_step % self.config.compare_steps == 0:
                curr_mean_reward = scores.mean()
                # if the best reward ever seen
                if curr_mean_reward > self.highest_reward:
                    self.highest_reward = curr_mean_reward
                    # push model to hub
                    self.model.save_pretrained("best_reward.npz")
            self.compare_step += 1

        timing = dict()
        t0 = time.time()

        t = time.time()

        model_inputs = self.prepare_model_inputs(queries, responses)

        model_inputs_names = list(model_inputs.keys())

        full_kl_penalty = self.config.kl_penalty == "full"

        # with torch.no_grad():
        all_logprobs, logits_or_none, values, masks = self.batched_forward_pass(
            self.model,
            queries,
            responses,
            model_inputs,
            response_masks=response_masks,
            return_logits=full_kl_penalty,
        )
        with self.optional_peft_ctx():
            ref_logprobs, ref_logits_or_none, _, _ = self.batched_forward_pass(
                self.model if self.is_peft_model else self.ref_model,
                queries,
                responses,
                model_inputs,
                return_logits=full_kl_penalty,
            )

        values = mx.stop_gradient(values)
        all_logprobs = mx.stop_gradient(all_logprobs)
        logits_or_none = mx.stop_gradient(logits_or_none) if logits_or_none is not None else None
        ref_logprobs = mx.stop_gradient(ref_logprobs)
        ref_logits_or_none = (
            mx.stop_gradient(ref_logits_or_none) if ref_logits_or_none is not None else None
        )

        timing["time/ppo/forward_pass"] = time.time() - t

        # with torch.no_grad():
        t = time.time()
        if full_kl_penalty:
            active_full_logprobs = logprobs_from_logits(logits_or_none, None, gather=False)
            ref_full_logprobs = logprobs_from_logits(ref_logits_or_none, None, gather=False)

            rewards, non_score_reward, kls = self.compute_rewards(
                scores, active_full_logprobs, ref_full_logprobs, masks
            )
        else:
            rewards, non_score_reward, kls = self.compute_rewards(
                scores, all_logprobs, ref_logprobs, masks
            )
        timing["time/ppo/compute_rewards"] = time.time() - t

        rewards = mx.stop_gradient(rewards)

        t = time.time()
        values, advantages, returns = self.compute_advantages(values, rewards, masks)
        timing["time/ppo/compute_advantages"] = time.time() - t

        # upcast to float32 to avoid dataset issues
        batch_dict = {
            "queries": queries,
            "responses": responses,
            "logprobs": all_logprobs,
            "values": values,
            "masks": masks,
            "advantages": advantages,
            "returns": returns,
        }
        batch_dict.update(model_inputs)

        t = time.time()
        all_stats = []
        early_stop = False
        for _ in range(self.config.ppo_epochs):
            if early_stop:
                break
            b_inds = np.random.permutation(bs)
            for backward_batch_start in range(0, bs, self.config.backward_batch_size):
                backward_batch_end = backward_batch_start + self.config.backward_batch_size
                backward_batch_inds = b_inds[backward_batch_start:backward_batch_end]

                for mini_batch_start in range(
                    0, self.config.backward_batch_size, self.config.mini_batch_size
                ):
                    mini_batch_end = mini_batch_start + self.config.mini_batch_size
                    mini_batch_inds = mx.array(backward_batch_inds[mini_batch_start:mini_batch_end])
                    mini_batch_dict = {
                        "logprobs": batch_dict["logprobs"][mini_batch_inds],
                        "values": batch_dict["values"][mini_batch_inds],
                        "masks": batch_dict["masks"][mini_batch_inds],
                        # hacks: the queries and responses are ragged.
                        "queries": [batch_dict["queries"][i] for i in mini_batch_inds.tolist()],
                        "responses": [batch_dict["responses"][i] for i in mini_batch_inds.tolist()],
                        "advantages": batch_dict["advantages"][mini_batch_inds],
                        "returns": batch_dict["returns"][mini_batch_inds],
                    }
                    for k in model_inputs_names:
                        mini_batch_dict[k] = mx.array(batch_dict[k])[mini_batch_inds]
                    model_inputs = {k: mini_batch_dict[k] for k in model_inputs_names}

                    train_stats = self.train_minibatch(
                        old_logprobs=mini_batch_dict["logprobs"],
                        values=mini_batch_dict["values"],
                        queries=mini_batch_dict["queries"],
                        responses=mini_batch_dict["responses"],
                        model_inputs=model_inputs,
                        mask=mini_batch_dict["masks"],
                        advantages=mini_batch_dict["advantages"],
                        returns=mini_batch_dict["returns"],
                    )
                    all_stats.append(train_stats)

            # typically, early stopping is done at the epoch level
            if self.config.early_stopping:
                policykl = train_stats["policy/policykl"]
                early_stop = self._early_stop(policykl)
                if early_stop:
                    break

        timing["time/ppo/optimize_step"] = time.time() - t

        t = time.time()
        train_stats = stack_dicts(all_stats)

        # reshape advantages/ratios such that they are not averaged.
        train_stats["policy/advantages"] = mx.flatten(train_stats["policy/advantages"])
        train_stats["policy/advantages"] = mx.array(
            np.nan_to_num(train_stats["policy/advantages"], nan=-1)
        )
        train_stats["policy/advantages"] = train_stats["policy/advantages"][None, :]
        # train_stats["policy/advantages"] = torch.nan_to_num(train_stats["policy/advantages"], WANDB_PADDING)
        train_stats["policy/ratio"] = mx.flatten(train_stats["policy/ratio"])[None, :]

        stats = self.record_step_stats(
            scores=scores,
            logprobs=all_logprobs,
            ref_logprobs=ref_logprobs,
            non_score_reward=non_score_reward,
            train_stats=train_stats,
            kl_coef=self.kl_ctl.value,
            masks=masks,
            queries=queries,
            responses=responses,
            kls=kls,
        )
        # Gather/Reduce stats from all processes
        stats = stats_to_np(stats)
        timing["time/ppo/calc_stats"] = time.time() - t
        stats["ppo/learning_rate"] = np.array(self.optimizer.learning_rate)

        # Update the KL control - multiply the batch_size by the number of processes
        self.kl_ctl.update(
            stats["objective/kl"],
            self.config.batch_size,
        )

        # Log the total ppo time
        timing["time/ppo/total"] = time.time() - t0
        stats.update(timing)

        # post-process stats for tensorboard and other loggers
        if self.config.log_with != "wandb":
            stats = convert_to_scalar(stats)

        # if self.lr_scheduler is not None:
        #     self.lr_scheduler.step()

        return stats

    def _early_stop(self, policykl):
        r"""
        Handles the early stopping logic. If the policy KL is greater than the target KL, then the gradient is zeroed and
        the optimization step is skipped.
        This also handles the multi-gpu case where the policy KL is averaged across all processes.

        Args:
            policykl (mx.array):
                the policy KL

        Returns:
            `bool`: whether to early stop or not
        """
        early_stop = False
        if not self.config.early_stopping:
            return early_stop

        if policykl > 1.5 * self.config.target_kl:
            self.optimizer.zero_grad()
            early_stop = True
        return early_stop

    def prepare_model_inputs(self, queries: mx.array, responses: mx.array):
        if self.is_encoder_decoder:
            input_data = self.data_collator(
                [{"input_ids": q, "attention_mask": mx.ones_like(q)} for q in queries]
            )

            decoder_inputs = self.data_collator(
                [{"input_ids": r, "attention_mask": mx.ones_like(r)} for r in responses]
            )

            input_data["decoder_input_ids"] = decoder_inputs["input_ids"]
            input_data["decoder_attention_mask"] = decoder_inputs["attention_mask"]
        else:
            input_ids = [mx.concatenate([q, r]).astype(q.dtype) for q, r in zip(queries, responses)]
            input_data = self.data_collator(
                [{"input_ids": ids, "attention_mask": mx.ones_like(ids)} for ids in input_ids]
            )

        input_data.pop("labels", None)  # we don't want to compute LM losses
        return input_data

    def batched_forward_pass(
        self,
        model,
        queries: mx.array,
        responses: mx.array,
        model_inputs: dict,
        return_logits: bool = False,
        response_masks: mx.array | None = None,
    ):
        """
        Calculate model outputs in multiple batches.

        Args:
            queries (`mx.array`):
                List of mx arrays containing the encoded queries, shape (`batch_size`, `query_length`)
            responses (`mx.array`):
                List of mx arrays containing the encoded responses, shape (`batch_size`, `response_length`)
            return_logits (`bool`, *optional*, defaults to `False`):
                Whether to return all_logits. Set to `False` if logits are not needed to reduce memory consumption.
        Returns:
            (tuple):
                - all_logprobs (`mx.array`): Log probabilities of the responses,
                    shape (`batch_size`, `response_length`)
                - all_ref_logprobs (`mx.array`): Log probabilities of the responses,
                    shape (`batch_size`, `response_length`)
                - all_values (`mx.array`): Values of the responses, shape (`batch_size`, `response_length`)
        """
        bs = len(queries)
        fbs = self.config.mini_batch_size
        all_logprobs = []
        all_logits = []
        all_masks = []
        all_values = []

        for i in range(math.ceil(bs / fbs)):
            input_kwargs = {
                k: mx.array(v[i * fbs : (i + 1) * fbs]) for k, v in model_inputs.items()
            }
            query_batch = queries[i * fbs : (i + 1) * fbs]
            response_batch = responses[i * fbs : (i + 1) * fbs]
            if response_masks is not None:
                response_masks_batch = response_masks[i * fbs : (i + 1) * fbs]

            # logits, _, values = model(**input_kwargs)
            logits, _, values = model(
                input_kwargs["input_ids"]
            )  # Remove attention mask for shape issue.
            input_ids = mx.array(input_kwargs["input_ids"])
            attention_mask = mx.array(input_kwargs["attention_mask"])
            logprobs = logprobs_from_logits(logits[:, :-1, :], input_ids[:, 1:])
            masks = mx.zeros_like(attention_mask)
            masks[:, :-1] = attention_mask[:, 1:]

            for j in range(len(query_batch)):
                if self.is_encoder_decoder:
                    # Decoder sentence starts always in the index 1 after padding in the Enc-Dec Models
                    start = 1
                    end = attention_mask[j, :].sum() - 1
                else:
                    start = len(query_batch[j]) - 1  # logprobs starts from the second query token
                    if attention_mask[j, 0] == 0:  # offset left padding
                        start += attention_mask[j, :].nonzero()[0]
                    end = start + len(response_batch[j])
                    if response_masks is not None:
                        response_masks_batch[j] = mx.concatenate(
                            (mx.zeros_like(query_batch[j]), response_masks_batch[j])
                        )[1:]

                masks[j, :start] = 0
                masks[j, end:] = 0
                if response_masks is not None:
                    masks[j, start:end] = masks[j, start:end] * response_masks_batch[j][start:end]

            if return_logits:
                all_logits.append(logits)
            else:
                del logits
            all_values.append(values)
            all_logprobs.append(logprobs)
            all_masks.append(masks)

        return (
            mx.concatenate(all_logprobs),
            mx.concatenate(all_logits)[:, :-1] if return_logits else None,
            mx.concatenate(all_values)[:, :-1],
            mx.concatenate(all_masks)[:, :-1],
        )

    def train_minibatch(
        self,
        old_logprobs: mx.array,
        values: mx.array,
        queries: mx.array,
        responses: mx.array,
        model_inputs,
        mask: mx.array,
        advantages: mx.array,
        returns: mx.array,
    ):
        """
        Train one PPO minibatch

        Args:
            old_logprobs (`mx.array`):
                Log probabilities of the model, shape [mini_batch_size, response_length]
            values (`mx.array`):
                Values of the value head, shape [mini_batch_size, response_length]
            queries (`mx.array`):
                Encoded queries, shape [mini_batch_size, query_length]
            responses (`mx.array`):
                Encoded responses, shape [mini_batch_size, response_length]
            model_inputs (`mx.array`):
                Concatenated queries and responses, shape [mini_batch_size, query_length+response_length]
            mask:
                mask
            advantages:
                advantages
            returns:
                returns

        Returns:
            train_stats (dict[str, `mx.array`]):
                Dictionary of training statistics
        """
        (lvalue, stats), grad = self.loss_value_and_grad(
            model=self.model,
            queries=queries,
            responses=responses,
            model_inputs=model_inputs,
            old_logprobs=old_logprobs,
            old_values=values,
            mask=mask,
            advantages=advantages,
            returns=returns,
        )
        # TODO: Clip grad norm
        #         if self.config.max_grad_norm is not None:
        #             self.accelerator.clip_grad_norm_(self.model_params, self.config.max_grad_norm)
        # test_g = extract_grads(grad)
        # print(f'Grad sums: {[mx.sum(mx.abs(g)) for g in test_g]}')
        # Model update
        self.optimizer.update(self.model, grad)
        mx.eval(self.model.parameters(), self.optimizer.state, lvalue)
        return stats

    def compute_rewards(
        self,
        scores: mx.array,
        logprobs: mx.array,
        ref_logprobs: mx.array,
        masks: mx.array,
    ):
        """
        Compute per token rewards from scores and KL-penalty.

        Args:
            scores (`mx.array`):
                Scores from the reward model, shape (`batch_size`)
            logprobs (`mx.array`):
                Log probabilities of the model, shape (`batch_size`, `response_length`)
            ref_logprobs (`mx.array`):
                Log probabilities of the reference model, shape (`batch_size`, `response_length`)

        Returns:
            `mx.array`: Per token rewards, shape (`batch_size`, `response_length`)
            `mx.array`: Non score rewards, shape (`batch_size`, `response_length`)
            `mx.array`: KL penalty, shape (`batch_size`, `response_length`)
        """
        rewards, non_score_rewards, kls = [], [], []
        for score, logprob, ref_logprob, mask in zip(scores, logprobs, ref_logprobs, masks):
            # compute KL penalty (from difference in logprobs)
            kl_p = self._kl_penalty(logprob, ref_logprob)
            kls.append(kl_p)
            non_score_rew = mx.array(-self.kl_ctl.value * kl_p)
            non_score_rewards.append(non_score_rew)
            last_non_masked_index = mx.array(np.nonzero(mask)[0][-1])  # Or remove the [0]

            # reward is preference model score + KL penalty
            non_score_rew[last_non_masked_index] += score
            rewards.append(non_score_rew)

        return mx.stack(rewards), mx.stack(non_score_rewards), mx.stack(kls)

    def _kl_penalty(self, logprob: mx.array, ref_logprob: mx.array) -> mx.array:
        if self.config.kl_penalty == "kl":
            return logprob - ref_logprob

        if self.config.kl_penalty == "abs":
            return (logprob - ref_logprob).abs()

        if self.config.kl_penalty == "mse":
            return 0.5 * (logprob - ref_logprob).square()

        if self.config.kl_penalty == "full":
            return nn.losses.kl_div_loss(logprob, ref_logprob, reduction="none")  # .sum(-1)

        raise NotImplementedError

    def compute_advantages(
        self,
        values: mx.array,
        rewards: mx.array,
        mask: mx.array,
    ):
        lastgaelam = 0
        advantages_reversed = []
        gen_len = rewards.shape[-1]

        values = values * mask
        rewards = rewards * mask
        if self.config.whiten_rewards:
            rewards = masked_whiten(rewards, mask, shift_mean=False)
        for t in reversed(range(gen_len)):
            nextvalues = values[:, t + 1] if t < gen_len - 1 else 0.0
            delta = rewards[:, t] + self.config.gamma * nextvalues - values[:, t]
            lastgaelam = delta + self.config.gamma * self.config.lam * lastgaelam
            advantages_reversed.append(lastgaelam)
        advantages = mx.stack(advantages_reversed[::-1]).transpose()
        returns = advantages + values
        advantages = masked_whiten(advantages, mask)
        advantages = mx.stop_gradient(advantages)
        return values, advantages, returns

    def loss_fn(
        self,
        model,
        queries,
        responses,
        model_inputs,
        old_logprobs: mx.array,
        old_values: mx.array,
        mask: mx.array,
        advantages: mx.array,
        returns: mx.array,
    ):
        """
        Calculate policy and value losses.

        Args:
            model:
                model to use for forward passes
            queries:
                observations/queries to pass to the model
            responses:
                actions/responses from the model
            model_inputs:
                other necessary model inputs
            old_logprobs (`mx.array`):
                Log probabilities of the model, shape (`batch_size`, `response_length`)
            old_values (`mx.array`):
                Values of the value head, shape (`batch_size`, `response_length`)
            mask (`mx.array`):
                mask of positions we care about
            advantages:
                advantage array
            returns:
                rewards/returns
        """
        newlogprob, logits, newvalue, _ = self.batched_forward_pass(
            model,
            queries,
            responses,
            model_inputs,
            return_logits=True,
        )
        logratio = newlogprob - old_logprobs
        ratio = logratio.exp()

        # Policy loss
        pg_loss1 = -advantages * ratio
        pg_loss2 = -advantages * mx.clip(
            ratio, 1 - self.config.cliprange, 1 + self.config.cliprange
        )

        pg_loss = masked_mean(mx.max(mx.stack([pg_loss1, pg_loss2]), axis=0), mask)
        # Value Loss
        if self.config.clip_value_loss:
            vf_loss_unclipped = (newvalue - returns) ** 2
            vf_clipped = old_values + mx.clip(
                newvalue - old_values,
                -self.config.cliprange_value,
                self.config.cliprange_value,
            )
            vf_loss_clipped = (vf_clipped - returns) ** 2
            vf_loss_max = mx.max(mx.stack([vf_loss_unclipped, vf_loss_clipped]), axis=0)
            vf_loss = masked_mean(0.5 * vf_loss_max, mask)
        else:
            vf_loss = masked_mean(0.5 * ((newvalue - returns) ** 2), mask)
            # print(vf_loss.shape)
            # print(nn.losses.mse_loss(newvalue, returns).shape)
            # print(vf_loss)
            # print(nn.losses.mse_loss(newvalue, returns))

        loss_v = pg_loss + vf_loss * self.config.vf_coef
        avg_ratio = masked_mean(ratio, mask).item()
        if avg_ratio > self.config.ratio_threshold:
            warnings.warn(
                f"The average ratio of batch ({avg_ratio:.2f}) exceeds threshold {self.config.ratio_threshold:.2f}. Skipping batch."
            )
            pg_loss = pg_loss * 0.0
            vf_loss = vf_loss * 0.0
            loss_v = loss_v * 0.0

        return loss_v, flatten_dict(
            dict(
                loss=dict(policy=pg_loss, value=vf_loss, total=loss_v),
                policy=dict(
                    entropy=mx.array([0]),
                    approxkl=mx.array([0]),
                    policykl=mx.array([0]),
                    advantages=advantages,
                    advantages_mean=masked_mean(advantages, mask),
                    ratio=ratio,
                ),
                returns=dict(mean=mx.mean(returns), var=mx.var(returns)),
                val=dict(
                    vpred=masked_mean(newvalue, mask),
                    error=masked_mean((newvalue - returns) ** 2, mask),
                    mean=mx.array([0]),
                    var=mx.array([0]),
                ),
            )
        )

    def record_step_stats(self, kl_coef: float, **data):
        """
        Record training step statistics.


        Args:
            kl_coef (`float`):
                KL coefficient
            data (`dict`):
                Dictionary of training step data

        Returns:
            stats (`dict`):
                Dictionary of training step statistics
        """
        mask = data.pop("masks")

        kls = data.pop("kls")
        kl_list = ((kls) * mask).sum(axis=-1)
        mean_kl = kl_list.mean()
        mean_entropy = (-data["logprobs"] * mask).sum(axis=-1).mean()

        mean_non_score_reward = masked_mean(
            data["non_score_reward"], mask
        )  # non_score_reward is size `batch_size`, `response_length`
        mean_scores = data["scores"].mean()  # scores is size `batch_size`
        std_scores = data["scores"].var().sqrt()

        if mean_kl.item() < -1.0 and kl_coef > 0.0:
            # warn users
            warnings.warn(
                f"KL divergence is starting to become negative: {mean_kl.item():.2f} - this might be a precursor for failed training."
                " sometimes this happens because the generation kwargs are not correctly set. Please make sure"
                " that the generation kwargs are set correctly, or review your training hyperparameters."
            )

        stats = {
            "objective/kl": mean_kl,
            "objective/kl_dist": kl_list,
            "objective/logprobs": data["logprobs"],
            "objective/ref_logprobs": data["ref_logprobs"],
            "objective/kl_coef": kl_coef,
            "objective/entropy": mean_entropy,
            "ppo/mean_non_score_reward": mean_non_score_reward,
            "ppo/mean_scores": mean_scores,
            "ppo/std_scores": std_scores,
        }

        # Log text properties
        query_lens = mx.array([len(query) for query in data["queries"]])
        response_lens = mx.array([len(response) for response in data["responses"]])

        stats["tokens/queries_len_mean"] = mx.mean(query_lens).item()
        stats["tokens/queries_len_std"] = mx.var(query_lens).sqrt().item()
        stats["tokens/queries_dist"] = query_lens
        stats["tokens/responses_len_mean"] = mx.mean(response_lens).item()
        stats["tokens/responses_len_std"] = mx.var(response_lens).sqrt().item()
        stats["tokens/responses_dist"] = response_lens

        for k, v in data["train_stats"].items():
            stats[f"ppo/{k}"] = mx.mean(v, axis=0)
        stats["ppo/val/var_explained"] = 1 - stats["ppo/val/error"] / stats["ppo/returns/var"]
        return stats

    def log_stats(
        self,
        stats: dict,
        batch: dict,
        rewards: list[mx.array],
        columns_to_log: list[str] = ["query", "response"],
    ):
        """
        A function that logs all the training stats. Call it at the end of each epoch.

        Args:
            stats (dict[str, Any]):
                A dictionary of training stats.
            batch (dict[str, Any]):
                A dictionary of batch data, this contains the queries and responses.
            rewards (`List[mx.array]`):
                A tensor of rewards.
        """

        # all gather stats
        if not isinstance(rewards, mx.array):
            rewards = mx.array(rewards)
        rewards = rewards.flatten()

        if any([column_to_log not in batch.keys() for column_to_log in columns_to_log]):
            raise ValueError(
                f"Columns to log {columns_to_log} are not present in the batch {batch.keys()}."
            )

        batch_list = [batch[column_to_log] for column_to_log in columns_to_log]
        logs = {}

        # Log stats
        if "query" not in batch.keys() and "response" not in batch.keys():
            # warn the user that the game logs will not be logged
            warnings.warn(
                "The game logs will not be logged because the batch does not contain the keys 'query' and 'response'. "
            )
        elif self.config.log_with == "wandb":
            print(f"Query: {batch_list[0]} | Response: {batch_list[1]} | Reward: {rewards}")
            # table_rows = [list(r) for r in zip(*batch_list, [x.item() for x in rewards])]
            # wandb.log({f"game_log_{self.current_step % 25}": wandb.Table(columns=[*columns_to_log, "reward"],
            #                                                              rows=table_rows)})

        logs.update(stats)

        logs["env/reward_mean"] = mx.mean(rewards).item()
        logs["env/reward_std"] = mx.var(rewards).sqrt().item()
        logs["env/reward_dist"] = np.array(rewards)
        for k, v in logs.items():
            # print(f'{k}: {v}')
            logs[k] = np.mean(v).item()
        # logs = replace_nans_get_means(logs)
        self.logger.log(logs)

    def _save_pretrained(self, save_directory: str) -> None:
        self.model.save_pretrained(save_directory)
        self.tokenizer.save_pretrained(save_directory)

    def _show_tokens(self, tokens, masks):
        # from rich import print
        # from rich.text import Text
        #
        # text = Text()
        #
        # for i, (token, mask) in enumerate(zip(tokens, masks)):
        #     if mask == 1:
        #         text.append(self.tokenizer.decode(token.item()), style="black on deep_sky_blue1")
        #         text.append(" ")
        #     else:
        #         text.append(self.tokenizer.decode(token.item()), style="black on cyan3")
        #         text.append(" ")
        text = self.tokenizer.decode(tokens)
        print(text)
