# Copyright © 2023 Apple Inc.

import random
from collections.abc import Generator, Mapping

import numpy as np
import torch


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

    def update(self, xs: torch.tensor):
        """
        Updates running moments from batch's moments computed across ranks
        """
        xs_count = xs.size
        xs_var = torch.var(xs)
        xs_mean = torch.mean(xs)
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
        self.std = torch.sqrt(self.var * tot_count / (tot_count - 1)).item()
        self.count = tot_count

        return xs_mean, torch.sqrt(xs_var * xs_count / (xs_count - 1)).item()


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
    torch.random.manual_seed(seed)


def logprobs_from_logits(
    logits: torch.Tensor, labels: torch.Tensor, gather: bool = True
) -> torch.Tensor:
    """
    Turn raw logit values into log probs with softmax + log -- make sure axis is correct
    """
    logp = torch.nn.functional.log_softmax(logits, dim=2)

    if not gather:
        return logp
    # logpy = logp[torch.arange(logp.shape[0]), torch.arange(logp.shape[1]), labels[:, :]]

    # logpy = np.take_along_axis(np.array(logp.cpu().to(dtype=torch.float32)),
    #                            np.array(labels.cpu().unsqueeze(2)), axis=2)

    logpy = torch.gather(logp, 2, labels.unsqueeze(2)).squeeze(-1)

    # if np.any(np.isnan(logpy)):
    #     print("Uh oh. NaNs in the log probs!!")

    # return torch.from_numpy(logpy).squeeze(-1)
    return logpy


def whiten(values: torch.Tensor, shift_mean: bool = True) -> torch.Tensor:
    """Whiten values."""
    mean, var = torch.mean(values), torch.var(values)
    whitened = (values - mean) * torch.rsqrt(var + 1e-8)
    if not shift_mean:
        whitened += mean
    return whitened


def masked_mean(values: torch.Tensor, mask: torch.Tensor, axis: bool = None) -> torch.Tensor:
    """Compute mean of tensor with a masked values."""
    if axis is not None:
        return (values * mask).sum(axis=axis) / mask.sum(axis=axis)
    else:
        return (values * mask).sum() / mask.sum()


def masked_var(values: torch.Tensor, mask: torch.Tensor, unbiased: bool = True) -> torch.Tensor:
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


def masked_whiten(
    values: torch.Tensor, mask: torch.Tensor, shift_mean: bool = True
) -> torch.Tensor:
    """Whiten values with masked values."""
    mean, var = masked_mean(values, mask), masked_var(values, mask)
    whitened = (values - mean) * torch.rsqrt(var + 1e-8)
    if not shift_mean:
        whitened += mean
    return whitened


def clip_by_value(x: torch.Tensor, tensor_min, tensor_max) -> torch.Tensor:
    """
    Tensor extension to torch.clamp
    https://github.com/pytorch/pytorch/issues/2793#issuecomment-428784713
    """
    max_tens = torch.concatenate([x, tensor_max], axis=0)
    mins = torch.min(max_tens, axis=0)[None]
    min_tens = torch.concatenate([mins, tensor_min], axis=0)
    clipped = torch.max(min_tens, axis=0)[None]
    # clipped = mx.max(
    #     mx.stack(
    #         (mx.min(
    #             mx.stack((x, tensor_max), axis=0),
    #             tensor_min)), axis=0)
    # )
    return clipped


def entropy_from_logits(logits: torch.Tensor) -> torch.Tensor:
    """Calculate entropy from logits."""
    pd = torch.nn.functional.softmax(logits, axis=-1)
    entropy = torch.logsumexp(logits, axis=-1) - torch.sum(pd * logits, axis=-1)
    return entropy


def stats_to_np(stats_dict: dict) -> dict:
    """Cast all mx.arrays in dict to numpy arrays."""
    new_dict = dict()
    for k, v in stats_dict.items():
        if isinstance(v, torch.Tensor):
            new_dict[k] = v
            if new_dict[k].dtype == torch.bfloat16:
                new_dict[k] = new_dict[k].astype(torch.float32)
            new_dict[k] = np.array(new_dict[k].cpu().detach())
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
        elif isinstance(v, torch.Tensor):
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
        stats_list = [torch.flatten(d[k]) for d in stats_dicts]
        max_len = max([len(x) for x in stats_list])
        padded = []
        for x in stats_list:
            if len(x) < max_len:
                buffer = torch.ones(max_len - len(x)).to(x.dtype)
                x = torch.concatenate((x, buffer))
            padded.append(x)
        results[k] = torch.stack(padded)
    return results


def convert_to_scalar(stats: dict) -> dict:
    """
    Converts the stats from a flattened dict to single scalar dicts
    """
    tensorboard_stats = {}
    for k, v in stats.items():
        # for tensorboard compatibility - arrays and tensors are ignored with tensorboard
        # therefore we convert single element tensors to scalars
        if (isinstance(v, torch.Tensor) or isinstance(v, np.ndarray)) and (
            len(v.shape) == 0 or (len(v.shape) == 1 and v.shape[0] == 1)
        ):
            v = v.item()
        tensorboard_stats[k] = v
    return tensorboard_stats


def pad_to_length(tensor: torch.Tensor, length: int, pad_value, dim: int = -1) -> torch.Tensor:
    if tensor.shape[dim] >= length:
        return tensor
    else:
        pad_size = list(tensor.shape)
        pad_size[dim] = length - tensor.shape[dim]
        return torch.concatenate(
            [
                tensor,
                pad_value * torch.ones(*pad_size, dtype=tensor.dtype),
            ],
            dim=dim,
        )


def disable_dropout_in_model(model: torch.nn.Module) -> None:
    for module in model.modules():
        if isinstance(module, torch.nn.Dropout):
            module.p = 0


def exact_div(a, b, a_str, b_str, custom_error_message=""):
    q = a // b
    if a != q * b:
        raise ValueError(
            f"{custom_error_message}, {a_str}={a}, {b_str}={b}, inexact division: {a} / {b} = {a / b}"
        )
    return q


def _generate_token(
    prompt: torch.Tensor, model: torch.nn.Module, temp: float = 0.0
) -> Generator[torch.Tensor, None, None]:
    """
    Generate text based on the given prompt and model.

    Args:
        prompt (mx.array): The input prompt.
        model (nn.Module): The model to use for generation.
        temp (float): The temperature for sampling. If temp is 0, use max sampling.

    Yields:
        mx.array: The generated text.
    """

    def sample(sampled_logits: torch.Tensor) -> torch.Tensor:
        if temp == 0:
            return torch.argmax(sampled_logits, dim=-1)
        else:
            dist = torch.distributions.Categorical(sampled_logits * (1 / temp))
            return dist.sample()

    y = prompt
    past_key_values = None
    while True:
        if len(y.shape) < 2:
            y = y.unsqueeze(1)
        output = model(y.to(model.device), past_key_values=past_key_values)
        logits = output.logits
        past_key_values = output.past_key_values
        if logits.shape[1] < 1:
            logits = logits.unsqueeze(1)
        logits = logits[:, -1, :]
        y = sample(logits)
        yield y


def generate(model, prompt, tokenizer, args):
    print(prompt, end="", flush=True)

    prompt = torch.tensor(tokenizer.encode(prompt))
    tokens = []
    skip = 0
    for token, n in zip(
        _generate_token(prompt, model, args.temp),
        range(args.max_tokens),
    ):
        # if token == tokenizer.eos_token_id:
        #     break

        tokens.append([x.item() for x in token])
        s = tokenizer.decode(tokens)
        if len(s) - skip > 1:
            print(s[skip:-1], end="", flush=True)
            skip = len(s) - 1
    print(tokenizer.decode(tokens)[skip:], flush=True)
    print("=" * 10)
    if len(tokens) == 0:
        print("No tokens generated for this prompt")
        return


def generate_ids(model, input_ids, eos_token_id=100_000, temperature=0.0, max_tokens=128):
    prompt = torch.tensor(input_ids)
    tokens = []
    for token, n in zip(
        _generate_token(prompt, model, temperature),
        range(max_tokens),
    ):
        # if token == eos_token_id:
        #     break
        if len(token.shape) < 2:
            token = token.unsqueeze(1)
        tokens.append(token)
    return torch.concatenate(tokens, dim=1)
