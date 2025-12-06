# Copyright © 2023 Apple Inc.

import glob
import json
import logging
import random
from collections.abc import Mapping
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import models.llama as llama
import models.mixtral as mixtral
import numpy as np
import transformers
from huggingface_hub import snapshot_download
from mlx.utils import tree_flatten, tree_unflatten
from mlx_lm.models.switch_layers import QuantizedSwitchLinear, SwitchLinear
from mlx_lm.tuner.dora import DoRALinear
from mlx_lm.tuner.lora import LoRALinear, LoRASwitchLinear
from mlx_lm.tuner.utils import linear_to_lora_layers as mlx_lm_linear_to_lora
from mlx_lm.utils import load as mlx_lm_load_model
from mlx_lm.utils import quantize_model
from models.prompt_tuning import PromptTuning

# Constants
MODEL_MAPPING = {
    "llama": llama,
    "mistral": llama,  # mistral is compatible with llama
    "mixtral": mixtral,
}


class RunningMoments:
    def __init__(self):
        """
        Calculates the running mean and standard deviation of a data stream. Reference:
        https://github.com/OpenLMLab/MOSS-RLHF/blob/40b91eb2f2b71b16919addede0341d2bef70825d/utils.py#L75
        """
        self.mean = 0.0
        self.std = 1.0
        self.var = 1.0
        self.count = 1e-24

    def update(self, xs: mx.array):
        """
        Updates running moments from batch's moments computed across ranks
        """
        xs_count = xs.size
        xs_var = mx.var(xs)
        xs_mean = mx.mean(xs)
        xs_mean = xs_mean.item()
        xs_var = xs_var.item()

        delta = xs_mean - self.mean
        tot_count = self.count + xs_count

        new_sum = xs_var * xs_count
        # correct old_sum deviation accounting for the new mean
        old_sum = self.var * self.count + delta**2 * self.count * xs_count / tot_count
        tot_sum = old_sum + new_sum

        self.mean += delta * xs_count / tot_count
        self.var = tot_sum / tot_count
        self.std = mx.sqrt(self.var * tot_count / (tot_count - 1)).item()
        self.count = tot_count

        return xs_mean, mx.sqrt(xs_var * xs_count / (xs_count - 1)).item()


class AdaptiveKLController:
    """
    Adaptive KL controller described in the paper:
    https://arxiv.org/pdf/1909.08593.pdf
    """

    def __init__(self, init_kl_coef, target, horizon):
        self.value = init_kl_coef
        self.target = target
        self.horizon = horizon

    def update(self, current, n_steps):
        target = self.target
        proportional_error = np.clip(current / target - 1, -0.2, 0.2)
        mult = 1 + proportional_error * n_steps / self.horizon
        self.value *= mult


class FixedKLController:
    """Fixed KL controller."""

    def __init__(self, kl_coef):
        self.value = kl_coef

    def update(self, current, n_steps):
        pass


def compute_accuracy(eval_pred):
    predictions, labels = eval_pred
    # Here, predictions is rewards_chosen and rewards_rejected.
    # We want to see how much of the time rewards_chosen > rewards_rejected.
    if np.array(predictions[:, 0] == predictions[:, 1], dtype=float).sum() > 0:
        print(
            f"There are {np.array(predictions[:, 0] == predictions[:, 1]).sum()} out of {len(predictions[:, 0])} instances where the predictions for both options are equal. As a consequence the accuracy can be misleading."
        )
    predictions = np.argmax(predictions, axis=1)

    accuracy = np.array(predictions == labels, dtype=float).mean().item()
    return {"accuracy": accuracy}


def set_seed(seed: int) -> None:
    """
    Helper function for reproducible behavior to set the seed in `random`, `numpy`, and `torch`.

    Args:
        seed (`int`): The seed to set.
    """
    random.seed(seed)
    np.random.seed(seed)
    mx.random.seed(seed)


def pad_to_size(tensor: mx.array, size: int, dim: int = 1, padding: int = 50256) -> mx.array:
    """Pad tensor to size."""
    t_size = tensor.shape[dim]
    if t_size == size:
        return tensor
    else:
        return mx.pad(tensor, (0, size - t_size), padding)


def logprobs_from_logits(logits: mx.array, labels: mx.array, gather: bool = True) -> mx.array:
    """
    Turn raw logit values into log probs with softmax + log -- make sure axis is correct
    """
    logp = nn.log_softmax(logits, axis=2)

    if not gather:
        return logp

    logpy = mx.take_along_axis(logp, labels[:, :, None], axis=2).squeeze(-1)
    return logpy


def whiten(values: mx.array, shift_mean: bool = True) -> mx.array:
    """Whiten values."""
    mean, var = mx.mean(values), mx.var(values)
    whitened = (values - mean) * mx.rsqrt(var + 1e-8)
    if not shift_mean:
        whitened += mean
    return whitened


def masked_mean(values: mx.array, mask: mx.array, axis: bool = None) -> mx.array:
    """Compute mean of tensor with a masked values."""
    if axis is not None:
        return (values * mask).sum(axis=axis) / mask.sum(axis=axis)
    else:
        return (values * mask).sum() / mask.sum()


def masked_var(values: mx.array, mask: mx.array, unbiased: bool = True) -> mx.array:
    """Compute variance of tensor with masked values."""
    mean = masked_mean(values, mask)
    centered_values = values - mean
    variance = masked_mean(centered_values**2, mask)
    if unbiased:
        mask_sum = mask.sum()
        if mask_sum == 0:
            raise ValueError(
                "The sum of the mask is zero, which can happen when `mini_batch_size=1`;"
                "try increase the `mini_batch_size` or `gradient_accumulation_steps`"
            )
        # note that if mask_sum == 1, then there is a division by zero issue
        # to avoid it you just need to use a larger minibatch_size
        bessel_correction = mask_sum / (mask_sum - 1)
        variance = variance * bessel_correction
    return variance


def masked_whiten(values: mx.array, mask: mx.array, shift_mean: bool = True) -> mx.array:
    """Whiten values with masked values."""
    mean, var = masked_mean(values, mask), masked_var(values, mask)
    whitened = (values - mean) * mx.rsqrt(var + 1e-8)
    if not shift_mean:
        whitened += mean
    return whitened


def clip_by_value(x: mx.array, tensor_min, tensor_max) -> mx.array:
    """
    Tensor extension to torch.clamp
    https://github.com/pytorch/pytorch/issues/2793#issuecomment-428784713
    """
    max_tens = mx.concatenate([x, tensor_max], axis=0)
    mins = mx.min(max_tens, axis=0)[None]
    min_tens = mx.concatenate([mins, tensor_min], axis=0)
    clipped = mx.max(min_tens, axis=0)[None]
    # clipped = mx.max(
    #     mx.stack(
    #         (mx.min(
    #             mx.stack((x, tensor_max), axis=0),
    #             tensor_min)), axis=0)
    # )
    return clipped


def entropy_from_logits(logits: mx.array) -> mx.array:
    """Calculate entropy from logits."""
    pd = mx.softmax(logits, axis=-1)
    entropy = mx.logsumexp(logits, axis=-1) - mx.sum(pd * logits, axis=-1)
    return entropy


def stats_to_np(stats_dict: dict) -> dict:
    """Cast all mx.arrays in dict to numpy arrays."""
    new_dict = dict()
    for k, v in stats_dict.items():
        if isinstance(v, mx.array):
            new_dict[k] = v
            if new_dict[k].dtype == mx.bfloat16:
                new_dict[k] = new_dict[k].astype(mx.float32)
            new_dict[k] = np.array(new_dict[k])
        else:
            new_dict[k] = v
        if np.isscalar(new_dict[k]):
            new_dict[k] = float(new_dict[k])
    return new_dict


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


def extract_grads(d_in):
    """
    Recursively extract all arrays from a nested dictionary.

    Parameters:
        d_in: Input dictionary

    Returns:
        arrays: List of all arrays found
    """
    arrays = []
    for k, v in d_in.items():
        if isinstance(v, dict):
            arrays.extend(extract_grads(v))
        elif isinstance(v, list):
            for item in v:
                if isinstance(item, dict):
                    arrays.extend(extract_grads(item))
        elif isinstance(v, mx.array):
            arrays.append(v)
    return arrays


def replace_nans_get_means(logs):
    for k, v in logs.items():
        try:
            v = v.tolist()
            v = np.nan_to_num(v, nan=-100).mean().tolist()
            logs[k] = v
        except AttributeError:
            logs[k] = v
    return logs


def stack_dicts(stats_dicts: list[dict]) -> dict:
    """Stack the values of a dict."""
    results = dict()
    for k in stats_dicts[0]:
        stats_list = [mx.flatten(d[k]) for d in stats_dicts]
        max_len = max([len(x) for x in stats_list])
        padded = []
        for x in stats_list:
            if len(x) < max_len:
                buffer = mx.ones(max_len - len(x)).astype(x.dtype)
                x = mx.concatenate((x, buffer))
            padded.append(x)
        results[k] = mx.array(padded)
    return results


def convert_to_scalar(stats: dict) -> dict:
    """
    Converts the stats from a flattened dict to single scalar dicts
    """
    tensorboard_stats = {}
    for k, v in stats.items():
        # for tensorboard compatibility - arrays and tensors are ignored with tensorboard
        # therefore we convert single element tensors to scalars
        if (isinstance(v, mx.array) or isinstance(v, np.ndarray)) and (
            len(v.shape) == 0 or (len(v.shape) == 1 and v.shape[0] == 1)
        ):
            v = v.item()
        tensorboard_stats[k] = v
    return tensorboard_stats


def pad_to_length(tensor: mx.array, length: int, pad_value, dim: int = -1) -> mx.array:
    if tensor.shape[dim] >= length:
        return tensor
    else:
        pad_size = list(tensor.shape)
        pad_size[dim] = length - tensor.shape[dim]
        return mx.concatenate(
            [
                tensor,
                pad_value * mx.ones(*pad_size, dtype=tensor.dtype),
            ],
            axis=dim,
        )


def disable_dropout_in_model(model: nn.Module) -> None:
    for module in model.modules():
        if isinstance(module, nn.Dropout):
            module.p = 0


def exact_div(a, b, a_str, b_str, custom_error_message=""):
    q = a // b
    if a != q * b:
        raise ValueError(
            f"{custom_error_message}, {a_str}={a}, {b_str}={b}, inexact division: {a} / {b} = {a / b}"
        )
    return q


def _get_classes(config: dict):
    """
    Retrieve the model and model args classes based on the configuration.

    Args:
        config (dict): The model configuration.

    Returns:
        A tuple containing the Model class and the ModelArgs class.
    """
    model_type = config["model_type"]
    if model_type not in MODEL_MAPPING:
        msg = f"Model type {model_type} not supported."
        logging.error(msg)
        raise ValueError(msg)

    arch = MODEL_MAPPING[model_type]
    return arch.Model, arch.ModelArgs


def fetch_from_hub(hf_path: str):
    model_path = snapshot_download(
        repo_id=hf_path,
        allow_patterns=["*.json", "*.safetensors", "tokenizer.model"],
    )
    weight_files = glob.glob(f"{model_path}/*.safetensors")
    if len(weight_files) == 0:
        raise FileNotFoundError(f"No safetensors found in {model_path}")

    weights = {}
    for wf in weight_files:
        weights.update(mx.load(wf).items())

    config = transformers.AutoConfig.from_pretrained(hf_path)
    tokenizer = transformers.AutoTokenizer.from_pretrained(
        hf_path,
    )
    return weights, config.to_dict(), tokenizer


def upload_to_hub(path: str, name: str, hf_path: str):
    import os

    from huggingface_hub import HfApi, ModelCard, logging

    repo_id = f"mlx-community/{name}"

    card = ModelCard.load(hf_path)
    card.data.tags = ["mlx"] if card.data.tags is None else card.data.tags + ["mlx"]
    card.text = f"""
# {name}
This model was converted to MLX format from [`{hf_path}`]().
Refer to the [original model card](https://huggingface.co/{hf_path}) for more details on the model.
## Use with mlx
```bash
pip install mlx
git clone https://github.com/ml-explore/mlx-examples.git
cd mlx-examples/llms/hf_llm
python generate.py --model {repo_id} --prompt "My name is"
```
"""
    card.save(os.path.join(path, "README.md"))

    logging.set_verbosity_info()

    api = HfApi()
    api.create_repo(repo_id=repo_id, exist_ok=True)
    api.upload_folder(
        folder_path=path,
        repo_id=repo_id,
        repo_type="model",
    )


def make_shards(weights: dict, max_file_size_gibibyte: int = 15):
    max_file_size_bytes = max_file_size_gibibyte << 30
    shards = []
    shard, shard_size = {}, 0
    for k, v in weights.items():
        if shard_size + v.nbytes > max_file_size_bytes:
            shards.append(shard)
            shard, shard_size = {}, 0
        shard[k] = v
        shard_size += v.nbytes
    shards.append(shard)
    return shards


def save_model(save_dir: str, weights, tokenizer, config):
    save_dir = Path(save_dir)
    save_dir.mkdir(parents=True, exist_ok=True)

    shards = make_shards(weights, max_file_size_gibibyte=5)
    shards_count = len(shards)
    shard_file_format = (
        "model-{:05d}-of-{:05d}.safetensors" if shards_count > 1 else "model.safetensors"
    )

    for i, shard in enumerate(shards):
        shard_name = shard_file_format.format(i + 1, shards_count)
        mx.save_safetensors(str(save_dir / shard_name), shard)

    tokenizer.save_pretrained(save_dir)

    with open(save_dir / "config.json", "w") as fid:
        json.dump(config, fid, indent=4)


def load(path_or_hf_repo: str):
    # If the path exists, it will try to load model form it
    # otherwise download and cache from the hf_repo and cache
    model_path = Path(path_or_hf_repo)
    if not model_path.exists():
        model_path = Path(
            snapshot_download(
                repo_id=path_or_hf_repo,
                allow_patterns=["*.json", "*.safetensors", "tokenizer.model"],
            )
        )

    with open(model_path / "config.json") as f:
        config = json.loads(f.read())
        quantization = config.get("quantization", None)

    weight_files = glob.glob(str(model_path / "*.safetensors"))
    if len(weight_files) == 0:
        raise FileNotFoundError(f"No safetensors found in {model_path}")

    weights = {}
    for wf in weight_files:
        weights.update(mx.load(wf).items())

    model_class, model_args_class = _get_classes(config=config)
    model_args = model_args_class.from_dict(config)
    model = model_class(model_args)
    if quantization is not None:

        def class_predicate(p, m):
            # Handle custom per layer quantizations
            if p in config["quantization"]:
                return config["quantization"][p]
            if not hasattr(m, "to_quantized"):
                return False
            # Handle legacy models which may not have everything quantized
            return f"{p}.scales" in weights

        nn.quantize(
            model,
            **quantization,
            class_predicate=class_predicate,
        )

    model = model.load_weights(list(weights.items()), strict=False)

    mx.eval(model.parameters())
    tokenizer = transformers.AutoTokenizer.from_pretrained(model_path)
    return model, tokenizer, config


def generate_ids(model, input_ids, eos_token_id=100_000, temperature=0.0, max_tokens=128):
    prompt = mx.array(input_ids)
    max_tokens -= prompt.shape[-1]  # consider prompt as part of total # of tokens
    tokens = []
    for token, n in zip(
        model.generate(prompt, temperature),
        range(max_tokens),
    ):
        # if token == eos_token_id:
        #     break
        if len(token.shape) < 2:
            token = token[:, None]
        tokens.append(token)
    if not tokens:
        # Return an empty array with the correct batch dimension
        return mx.zeros((prompt.shape[0], 0), dtype=prompt.dtype)
    # Ensure all tokens are 2D and have the same batch size
    tokens = [t if len(t.shape) == 2 else t[:, None] for t in tokens]
    return mx.concatenate(tokens, axis=1)


def linear_to_lora_layers(
    model: nn.Module,
    num_lora_layers: int,
    config: dict,
    use_dora: bool = False,
):
    """
    Convert some of the models linear layers to lora layers.

    Args:
        model (nn.Module): The neural network model.
        num_lora_layers (int): The number of blocks to convert to lora layers
        starting from the last layer.
        config (dict): More configuration parameters for LoRA, including the
          rank, alpha, scale, and optional layer keys.
        use_dora (bool): If True, uses DoRA instead of LoRA.
          Default: ``False``
    """

    num_layers = len(model.model.layers)

    if num_lora_layers < 0:
        num_lora_layers = num_layers

    if num_lora_layers > num_layers:
        raise ValueError(
            f"Requested {num_lora_layers} LoRA layers but the model only has {num_layers} layers."
        )

    def to_lora(layer):
        if isinstance(layer, (nn.Linear, nn.QuantizedLinear)):
            LoRALayer = DoRALinear if use_dora else LoRALinear
        elif isinstance(layer, (SwitchLinear, QuantizedSwitchLinear)):
            if use_dora:
                raise ValueError(f"{type(layer).__name__} doesn't support DoRA yet.")
            LoRALayer = LoRASwitchLinear
        else:
            raise ValueError(f"Can't convert layer of type {type(layer).__name__} to LoRA")

        return LoRALayer.from_base(
            layer,
            r=config["rank"],
            scale=config["scale"],
            dropout=config["dropout"],
        )

    keys = config.get("keys", None)
    if keys is not None:
        keys = set(keys)
    elif model.model_type in [
        "mistral",
        "llama",
        "phi",
        "mixtral",
        "stablelm",
        "qwen2",
        "qwen2_moe",
        "gemma",
        "starcoder2",
        "cohere",
        "minicpm",
    ]:
        keys = set(["self_attn.q_proj", "self_attn.v_proj"])
        if model.model_type == "mixtral":
            keys.add("block_sparse_moe.gate")
        if model.model_type == "qwen2_moe":
            keys.add("mlp.gate")
            keys.add("mlp.shared_expert_gate")

    elif model.model_type == "gpt_bigcode":
        keys = set(["attn.c_attn"])
    elif model.model_type == "olmo":
        keys = set(["att_proj"])
    elif model.model_type == "openelm":
        keys = set(["attn.qkv_proj"])
    elif model.model_type == "phi3":
        keys = set(["self_attn.qkv_proj"])
    elif model.model_type == "phi-msft":
        keys = set(["mixer.Wqkv", "moe.gate"])
    elif model.model_type == "dbrx":
        keys = set(["norm_attn_norm.attn.Wqkv", "ffn.router.layer"])
    else:
        raise ValueError(f"Lora does not support {model.model_type}")

    for l in model.model.layers[num_layers - num_lora_layers :]:  # noqa: E741
        lora_layers = [(k, to_lora(m)) for k, m in l.named_modules() if k in keys]
        l.update_modules(tree_unflatten(lora_layers))


def get_model_and_tokenizer(args_in, need_generate: bool = False, add_peft: bool = True):
    if need_generate:
        model, tokenizer, _ = load(args_in.model)
    else:
        model, tokenizer = mlx_lm_load_model(args_in.model)
        tokenizer = tokenizer._tokenizer  # Unwrap tokenizer to get base object

    if not hasattr(model, "value_head"):
        model.value_head = nn.Linear(model.args.hidden_size, 1)

    if args_in.quantize:
        q_group_size = 64
        q_bits = 4
        weights, _ = quantize_model(model, {}, q_group_size, q_bits)

    if args_in.resume_file is not None:
        print(f"Loading pretrained weights from {args_in.resume_file}")
        model.load_weights(args_in.resume_file, strict=False)

    # Freeze all layers other than PEFT weights
    if add_peft:
        model.freeze()
        model.value_head.unfreeze()
        if args_in.prompt_tuning:
            model = PromptTuning(num_tokens=args_in.num_prompt_tokens, model=model)
        else:
            lora_parameters = {"rank": 16, "dropout": 0.1, "scale": 10.0}
            if need_generate:
                linear_to_lora_layers(model, args_in.lora_layers, lora_parameters, use_dora=False)
            else:
                mlx_lm_linear_to_lora(model, args_in.lora_layers, lora_parameters, use_dora=False)

    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.padding_side = "left"

    p = sum(v.size for _, v in tree_flatten(model.parameters())) / 10**6
    print(f"Total parameters {p:.3f}M")
    p = sum(v.size for _, v in tree_flatten(model.trainable_parameters())) / 10**6
    print(f"Trainable parameters {p:.3f}M")

    return model, tokenizer
