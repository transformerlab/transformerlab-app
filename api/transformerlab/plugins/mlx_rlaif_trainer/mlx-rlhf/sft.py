# Modified by Andrew Silva from https://github.com/ml-explore/mlx-examples/blob/main/lora/lora.py
#
# Copyright © 2023 Apple Inc.
import math
import time
from pathlib import Path

import matplotlib.pyplot as plt
import mlx.core as mx
import mlx.nn as nn
import mlx.optimizers as optim
import numpy as np
from data.data_utils import build_parser, load_datasets
from mlx.utils import tree_flatten
from utils import get_model_and_tokenizer

"""
Example command for supervised fine-tuning with soft-prompts on generated data with a locally saved tiny llama:
python sft.py --prompt-tuning --save-file prompt_weights.npz --data-base increasing_mult_2_ --model ../tiny_llama --train

Step 1: Creating a model that is already prepared to do digit generation and then needs to be fine-tuned for even digits
python sft.py --save-file digit_fine_tune.npz --data-base increasing_mult_1_ --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --train --iters 20000 --data ./data/ --batch-size 32 --steps-per-eval 21000
Step 2: Fine tuning to prepare for even-digit generation
python sft.py --save-file even_digit_fine_tune.npz --data-base increasing_mult_2_ --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --resume-file digit_fine_tune.npz --train --iters 50 --data ./data/ --batch-size 32
Step 3: Learning a reward model from preference data
python pytorch_sft.py --reward-model --train --data-base reward_function_increasing_mult_2_  --save-file even_reward_model --model ./digit_fine_tune/ --iters 20000 --data ../data/ --batch-size 32 --steps-per-eval 21000



Example command for training a reward model with LoRA on generated data with a HF tiny llama
python sft.py --reward-model --train --data-base reward_function_increasing_mult_2_ --batch-size 16 --save-file reward_lora.npz --model TinyLlama/TinyLlama-1.1B-Chat-v1.0
"""


def loss(mdl, inputs, targets, lengths):
    """
    SFT loss, standard language modeling cross-entropy loss
    Returns:
        Loss value, tokens-per-second
    """
    # Run model on inputs
    logits = mdl(inputs)

    # Mask padding tokens
    length_mask = mx.arange(inputs.shape[1])[None, :] < lengths[:, None]

    if -100 in targets[0]:  # If we are masking some targets
        # Cast to numpy because mlx doesn't support boolean indexing
        np_len = np.array(length_mask)
        # Mask out targets
        np_len[targets == -100] = False
        # Cast back to mlx
        length_mask = mx.array(np_len)

    # Calculate the loss
    ce = nn.losses.cross_entropy(logits, targets) * length_mask
    ntoks = length_mask.sum()
    ce = ce.sum() / ntoks
    return ce, ntoks


def reward_loss(mdl, better_inputs, worse_inputs):
    """
    Reward modeling loss, maximizing the difference between the preferred sequence and the "dispreferred" sequence
    (Assumes that the reward for seq1 >= reward for seq2)
    Returns:
        Loss value, tokens-per-second (TODO -- Tokens-per-second implementation missing here)
    """
    # TODO: Batch these, currently this is unnecessarily slow.
    _, _, rewards_j = mdl(better_inputs)
    _, _, rewards_k = mdl(worse_inputs)
    # Batch x SeqLen x OutputDim -- get last token value
    diff_val = -mx.log(mx.sigmoid(rewards_j[:, -1, :] - rewards_k[:, -1, :])).mean()
    return diff_val, mx.array(0)  # TODO: this is telling the logger "0 toks per sec"


def iterate_batches(
    dset, tok, batch_size, train_mode=False, reward_modeling=False, chat_data=False
):
    # Shuffle indices
    len_warning_message = "[WARNING] Some sequences are longer than 2048 tokens. Consider pre-splitting your data to save memory."
    while True:
        indices = np.arange(len(dset))
        if train_mode:
            indices = np.random.permutation(indices)

        # Collect batches from dataset
        for i in range(0, len(indices) - batch_size + 1, batch_size):
            # Encode batch
            if reward_modeling:
                pref_batch, bad_batch = [], []
                p_lengths, b_lengths = [], []
                for j in range(batch_size):
                    pref, bad = dset[indices[i + j]]
                    pref_batch.append(tok.encode(pref))
                    p_lengths.append(len(pref_batch[-1]))
                    bad_batch.append(tok.encode(bad))
                    b_lengths.append(len(bad_batch[-1]))
                if max(max(p_lengths), max(b_lengths)) > 2048:
                    print(len_warning_message)
                p_arr = np.zeros((batch_size, max(p_lengths)), np.int32)
                b_arr = np.zeros((batch_size, max(b_lengths)), np.int32)
                for j in range(batch_size):
                    p_arr[j, : p_lengths[j]] = pref_batch[j]
                    b_arr[j, : b_lengths[j]] = bad_batch[j]
                pref_batch = mx.array(p_arr)
                bad_batch = mx.array(b_arr)
                yield pref_batch, bad_batch
            else:
                if chat_data:
                    batch = [dset[indices[i + j]] for j in range(batch_size)]
                    input_ids = [x["input_ids"] for x in batch]
                    labels = [x["labels"] for x in batch]
                    lengths = [len(x["input_ids"]) for x in batch]
                    batch_arr = np.ones((batch_size, max(lengths)), np.int32) * tok.pad_token_id
                    label_arr = np.ones_like(batch_arr) * -100
                    for j in range(batch_size):
                        batch_arr[j, : lengths[j]] = input_ids[j]
                        label_arr[j, : lengths[j]] = labels[j]
                    batch = mx.array(batch_arr)
                    targets = mx.array(label_arr)
                else:
                    batch = [tok.encode(dset[indices[i + j]]) for j in range(batch_size)]
                    lengths = [len(x) for x in batch]

                    # Check if any sequence is longer than 2048 tokens
                    if max(lengths) > 2048:
                        print(len_warning_message)

                    # Pad to the max length
                    batch_arr = np.zeros((batch_size, max(lengths)), np.int32)

                    for j in range(batch_size):
                        batch_arr[j, : lengths[j]] = batch[j]
                    batch = mx.array(batch_arr)
                    targets = batch
                yield batch[:, :-1], targets[:, 1:], mx.array(lengths)

        if not train_mode:
            break


def evaluate(mdl, dataset, loss_fn, tok, train_args):
    all_losses = []
    ntokens = 0
    for it, batch in zip(
        range(train_args.val_batches),
        iterate_batches(
            dataset,
            tok,
            train_args.batch_size,
            reward_modeling=train_args.reward_model,
            chat_data=train_args.data_base == "chat",
        ),
    ):
        losses, toks = loss_fn(mdl, *batch)
        all_losses.append((losses * toks).item())
        ntokens += toks.item()

    return np.sum(all_losses) / max(ntokens, train_args.val_batches)


def save_adapter(
    save_model: nn.Module,
    adapter_file: str | Path,
):
    flattened_tree = tree_flatten(save_model.trainable_parameters())
    mx.save_safetensors(str(adapter_file), dict(flattened_tree))


def train(mdl, train_ds, val_set, optimizer, loss_fn, tok, train_args):
    # Create value and grad function for loss
    loss_value_and_grad = nn.value_and_grad(mdl, loss_fn)

    losses = []
    val_losses = []
    n_tokens = 0

    # Main training loop
    start = time.perf_counter()
    for it, batch in zip(
        range(train_args.iters),
        iterate_batches(
            train_ds,
            tok,
            train_args.batch_size,
            train_mode=True,
            reward_modeling=train_args.reward_model,
            chat_data=train_args.data_base == "chat",
        ),
    ):
        # Forward and backward pass
        (lvalue, toks), grad = loss_value_and_grad(mdl, *batch)

        # Model update
        optimizer.update(mdl, grad)
        mx.eval(mdl.parameters(), optimizer.state, lvalue)

        # Record loss
        losses.append(lvalue.item())
        n_tokens += toks.item()

        # Report training loss if needed
        if (it + 1) % train_args.steps_per_report == 0:
            train_loss = np.mean(losses[-train_args.steps_per_report :])

            stop = time.perf_counter()
            print(
                f"Iter {it + 1}: Train loss {train_loss:.3f}, "
                f"It/sec {train_args.steps_per_report / (stop - start):.3f}, "
                f"Tokens/sec {float(n_tokens) / (stop - start):.3f}"
            )
            n_tokens = 0
            start = time.perf_counter()

        # Report validation loss if needed
        if (it == 0 or (it + 1) % train_args.steps_per_eval == 0) and val_set is not None:
            stop = time.perf_counter()
            val_loss = evaluate(mdl, val_set, loss_fn, tok, train_args)
            print(
                f"Iter {it + 1}: Val loss {val_loss:.3f}, Val took {(time.perf_counter() - stop):.3f}s"
            )
            val_losses.append(val_loss)

            start = time.perf_counter()

        # Save prompt weights if needed
        if (it + 1) % train_args.save_every == 0:
            save_adapter(model, train_args.save_file)
            checkpoint = Path(train_args.save_file).parent / f"{it:07d}_adapters.safetensors"
            save_adapter(model, checkpoint)
            print(f"Iter {it}: Saved adapter weights to {train_args.save_file} and {checkpoint}.")
    fn = ""
    if train_args.prompt_tuning:
        fn += "prompt_tuning_"
    else:
        fn += "lora_"
    plt.plot(losses)
    plt.savefig(f"{fn}train_losses.png")
    plt.plot(val_losses)
    plt.savefig(f"{fn}val_losses.png")


if __name__ == "__main__":
    parser = build_parser()
    args = parser.parse_args()

    np.random.seed(args.seed)

    model, tokenizer = get_model_and_tokenizer(args)

    print("Loading datasets")
    train_set, valid_set, test_set = load_datasets(args, tokenizer)

    if args.reward_model:
        loss_function = reward_loss
    else:
        loss_function = loss

    if args.train:
        print("Training")
        opt = optim.Adam(learning_rate=args.learning_rate)

        # Train model
        train(model, train_set, valid_set, opt, loss_function, tokenizer, args)

        # Save weights
        mx.savez(args.save_file, **dict(tree_flatten(model.trainable_parameters())))

    # Load the weights which we assume should exist by this point
    if not Path(args.save_file).is_file():
        raise ValueError(
            f"Save file {args.save_file} missing. Use --train to learn and save the prompts.npz."
        )
    model.load_weights(args.save_file, strict=False)

    if args.test and test_set is not None:
        print("Testing")
        model.eval()
        test_loss = evaluate(model, test_set, loss, tokenizer, args)
        test_ppl = math.exp(test_loss)

        print(f"Test loss {test_loss:.3f}, Test ppl {test_ppl:.3f}.")
