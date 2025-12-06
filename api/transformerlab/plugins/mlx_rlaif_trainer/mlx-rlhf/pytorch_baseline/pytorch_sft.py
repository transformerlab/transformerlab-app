# Modified by Andrew Silva from https://github.com/ml-explore/mlx-examples/blob/main/lora/lora.py
#
# Copyright © 2023 Apple Inc.
import os
import time

import matplotlib.pyplot as plt
import numpy as np
import torch
import torch.optim as optim
from data.data_utils import build_parser, load_datasets
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

"""
Example command for supervised fine-tuning with LoRA on generated data with a HF tiny llama
python pytorch_sft.py --save-file sft_fine_tune --data-base increasing_mult_1_ --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --train --iters 1500 --data ../data/

Step 1: Creating a model that is already prepared to do digit generation and then needs to be fine-tuned for even digits
python pytorch_sft.py --save-file digit_fine_tune --data-base increasing_mult_1_ --model TinyLlama/TinyLlama-1.1B-Chat-v1.0 --train --iters 20000 --data ../data/ --batch-size 32
Step 2: Fine tuning to prepare for even-digit generation
python pytorch_sft.py --save-file even_digit_fine_tune --data-base increasing_mult_2_ --model ./digit_fine_tune/ --tokenizer TinyLlama/TinyLlama-1.1B-Chat-v1.0 --train --iters 50 --data ../data/ --batch-size 32
Step 3: Learning a reward model from preference data
python pytorch_sft.py --reward-model --train --data-base reward_function_increasing_mult_2_  --save-file even_reward_model --model ./digit_fine_tune/ --iters 20000 --data ../data/ --batch-size 32 --steps-per-eval 21000

Learning a fine-tuned me-chatbot
python pytorch_sft.py --data ../../message_data/ --save-file sft_fine_tune/ --data-base chat --model meta-llama/Llama-2-7b-chat-hf --train --iters 15000 --batch-size 4 --steps-per-eval 1000

"""


def reward_loss(mdl, better_inputs, worse_inputs):
    """
    Reward modeling loss, maximizing the difference between the preferred sequence and the "dispreferred" sequence
    (Assumes that the reward for seq1 >= reward for seq2)
    Returns:
        Loss value, tokens-per-second (TODO -- Tokens-per-second implementation missing here)
    """
    # TODO: Batch these, currently this is unnecessarily slow.
    output = mdl(better_inputs, output_hidden_states=True)
    rewards_j = mdl.value_head(output.hidden_states[-1][:, :, :]).squeeze(-1)

    output = mdl(worse_inputs, output_hidden_states=True)
    rewards_k = mdl.value_head(output.hidden_states[-1][:, :, :]).squeeze(-1)
    # Batch x SeqLen x OutputDim -- get last token value
    diff_val = -torch.nn.functional.logsigmoid(rewards_j[:, -1] - rewards_k[:, -1]).mean()
    return diff_val


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
                p_arr = np.ones((batch_size, max(p_lengths)), np.int32) * tok.pad_token_id
                b_arr = np.ones((batch_size, max(b_lengths)), np.int32) * tok.pad_token_id
                for j in range(batch_size):
                    p_arr[j, : p_lengths[j]] = pref_batch[j]
                    b_arr[j, : b_lengths[j]] = bad_batch[j]
                pref_batch = torch.tensor(p_arr)
                bad_batch = torch.tensor(b_arr)
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
                    input_ids = torch.tensor(batch_arr)
                    labels = torch.tensor(label_arr)
                else:
                    batch = [tok.encode(dset[indices[i + j]]) for j in range(batch_size)]
                    lengths = [len(x) for x in batch]

                    # Check if any sequence is longer than 2048 tokens
                    if max(lengths) > 2048:
                        print(len_warning_message)

                    # Pad to the max length
                    batch_arr = np.ones((batch_size, max(lengths)), np.int32) * -100
                    for j in range(batch_size):
                        batch_arr[j, : lengths[j]] = batch[j]
                    batch = torch.tensor(batch_arr)
                    input_ids = batch.clone()
                    input_ids[input_ids == -100] = tok.pad_token_id
                    labels = batch.clone()

                yield input_ids, labels

        if not train_mode:
            break


def evaluate(mdl, dataset, tok, train_args, device="mps"):
    all_losses = []
    ntokens = 0
    mdl.to(device)
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
        input_ids = batch[0].to(device)
        targets = batch[1].to(dtype=torch.long, device=device)
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            if train_args.reward_model:
                loss = reward_loss(mdl=mdl, better_inputs=input_ids, worse_inputs=targets)
            else:
                loss = mdl(input_ids=input_ids, labels=targets).loss
        all_losses.append(loss.item())

    return np.sum(all_losses) / max(ntokens, train_args.val_batches)


def train(mdl, train_ds, val_set, optimizer, tok, train_args, device="mps"):
    # Create value and grad function for loss
    losses = []
    val_losses = []
    n_tokens = 0
    mdl.to(device)
    torch.set_float32_matmul_precision("high")
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
        input_ids = batch[0].to(device)
        targets = batch[1].to(dtype=torch.long, device=device)

        # Use reward learning if applicable, else just use HF LM loss
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
            if train_args.reward_model:
                loss = reward_loss(mdl=mdl, better_inputs=input_ids, worse_inputs=targets)
            else:
                loss = mdl(input_ids=input_ids, labels=targets).loss
        if not torch.isnan(loss):
            loss.backward()
            optimizer.step()
            optimizer.zero_grad()
        else:
            print(f"nan input ids: {input_ids}")
            print(f"nan labels: {targets}")
        # Record loss
        losses.append(loss.item())

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
        if ((it + 1) % train_args.steps_per_eval == 0) and val_set is not None:
            stop = time.perf_counter()
            val_loss = evaluate(mdl, val_set, tok, train_args, device)
            print(
                f"Iter {it + 1}: Val loss {val_loss:.3f}, Val took {(time.perf_counter() - stop):.3f}s"
            )
            val_losses.append(val_loss)

            start = time.perf_counter()

        if (it + 1) % train_args.save_every == 0:
            os.makedirs(args.save_file, exist_ok=True)
            torch.save(
                {"value_head": mdl.value_head.state_dict()}, train_args.save_file + "/value_head.pt"
            )
            mdl.save_pretrained(args.save_file)

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

    DEVICE = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")

    print("Loading pretrained model")
    tokenizer = AutoTokenizer.from_pretrained(
        args.tokenizer if args.tokenizer is not None else args.model
    )
    model = AutoModelForCausalLM.from_pretrained(args.model)

    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
        tokenizer.pad_token = tokenizer.eos_token

    config = LoraConfig(
        task_type="CAUSAL_LM",
        r=16,
        lora_alpha=16,
        target_modules=["q_proj", "v_proj"],  # ['query_key_value'],  #
        lora_dropout=0.01,
    )
    model = get_peft_model(model, config)
    model.value_head = torch.nn.Linear(model.config.hidden_size, 1)

    print("Loading datasets")
    train_set, valid_set, test_set = load_datasets(args, tokenizer)

    # Resume training the given weights.
    if args.resume_file is not None:
        print(f"Loading pretrained weights from {args.resume_file}")
        model.load_adapter(args.resume_file, "sft_fine_tune")
        model.set_adapter("sft_fine_tune")

    if args.train:
        print("Training")
        opt = optim.Adam(model.parameters(), lr=args.learning_rate)

        model = model.to(DEVICE)

        # Train model
        train(model, train_set, valid_set, opt, tokenizer, args, device=DEVICE)

        # Save model
        os.makedirs(args.save_file, exist_ok=True)
        torch.save({"value_head": model.value_head.state_dict()}, args.save_file + "/value_head.pt")
        model = model.merge_and_unload()
        model.save_pretrained(args.save_file)
