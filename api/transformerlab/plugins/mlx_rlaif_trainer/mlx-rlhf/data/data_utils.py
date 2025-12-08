import argparse
import json
import random
from pathlib import Path
from random import shuffle

from data.imessage_chat_data import get_all_txts

try:
    from datasets import load_dataset
except ImportError:
    load_dataset = None


class TuningDataset:
    """
    Light-weight wrapper to hold lines from a jsonl file
    Returned samples are just text to supervise over
    """

    def __init__(self, path: Path, key: str = "text"):
        if not path.exists():
            self._data = None
        else:
            with open(path) as fid:
                self._data = [json.loads(l) for l in fid]  # noqa: E741
        self._key = key

    def __getitem__(self, idx: int):
        return self._data[idx][self._key]

    def __len__(self):
        return len(self._data)


class PrefDataset:
    """
    Light-weight wrapper to hold lines from a jsonl file with reward values
    Samples that are returned are <seq 1>, <seq 2>, where the reward for seq_1 >= reward for seq2
    """

    def __init__(self, path: Path, key: str = "text", reward_key: str = "reward"):
        if not path.exists():
            self._data = None
        else:
            with open(path) as fid:
                self._data = [json.loads(l) for l in fid]  # noqa: E741
        self._key = key
        self._reward_key = reward_key

    def __getitem__(self, idx: int):
        counter_example = random.choice(self._data)
        if counter_example[self._reward_key] > self._data[idx][self._reward_key]:
            return counter_example[self._key], self._data[idx][self._key]
        return self._data[idx][self._key], counter_example[self._key]

    def __len__(self):
        return len(self._data)


class CustomHFDataset:
    """
    Dataset loader for HuggingFace-style datasets with 'conversations' and 'chosen' fields.
    Each item returns a tuple: (prompt, ground_truth)
    Supports loading from local JSONL or HuggingFace Hub.
    """

    def __init__(self, path):
        self._data = []
        path_obj = Path(path)
        if path_obj.exists():
            with open(path) as fid:
                self._data = [json.loads(line) for line in fid]

        else:
            if load_dataset is None:
                raise ImportError(
                    "Please install the 'datasets' library to load from HuggingFace Hub."
                )
            # Try loading from HuggingFace Hub
            ds = load_dataset(path, split="train")
            for item in ds:
                self._data.append(item)

    def __getitem__(self, idx: int):
        item = self._data[idx]
        prompt = item["conversations"][0]["value"]
        ground_truth = item["chosen"]["value"]
        return prompt, ground_truth

    def __len__(self):
        return len(self._data)


def load_custom_hf_dataset(path):
    """
    Loads a HuggingFace-style dataset with 'conversations' and 'chosen' fields.
    Returns a CustomHFDataset instance.
    """
    return CustomHFDataset(Path(path))


def load_datasets(train_args, tokenizer=None):
    """
    Loads datasets in for training, assuming that reward-modeling datasets have "reward" in the name
    """
    ds_base = train_args.data_base
    ds_names = (f"{ds_base}train", f"{ds_base}valid", f"{ds_base}test")
    train_data, valid, test = [], [], []
    if "chat" in ds_base:
        # To do me-chatbot, use 'chat' as data-base and '/path/to/your/message_data' as data
        # TODO: Add command line args for the chunk-length and prior-context-length
        all_data = get_all_txts(
            train_args.data,
            tokenizer,
            chunk_length=256,
            prior_context_length=32,
        )
        shuffle(all_data)
        valid_split_size = 1000
        train_data = all_data[:-valid_split_size]
        valid = train_data[-valid_split_size:]
        return train_data, valid, []

    if "reward" in ds_base:  # Load a PrefDataset if learning a reward model
        train_data, valid, _ = (PrefDataset(Path(train_args.data) / f"{n}.jsonl") for n in ds_names)
    else:  # Otherwise, load a SFT dataset
        train_data, valid, test = (
            TuningDataset(Path(train_args.data) / f"{n}.jsonl") for n in ds_names
        )
    return train_data, valid, test


def build_parser():
    arg_parse = argparse.ArgumentParser(description="Argument parser for supervised finetuning.")
    arg_parse.add_argument(
        "--model",
        default="mlx_model",
        help="The path to the local model directory or Hugging Face repo.",
    )
    arg_parse.add_argument(
        "--quantize",
        action="store_true",
        help="Should the model be quantized when using MLX?",
    )
    arg_parse.add_argument(
        "--tokenizer",
        default=None,
        help="The path to the tokenizer we want to use. If none, use args.model.",
    )
    # Generation args
    arg_parse.add_argument(
        "--max-tokens",
        "-m",
        type=int,
        default=100,
        help="The maximum number of tokens to generate",
    )
    arg_parse.add_argument("--temp", type=float, default=0.8, help="The sampling temperature")
    arg_parse.add_argument(
        "--prompt",
        "-p",
        type=str,
        help="The prompt for generation",
        default=None,
    )

    # Training args
    arg_parse.add_argument(
        "--train",
        action="store_true",
        help="Do training",
    )
    arg_parse.add_argument(
        "--reward-model", action="store_true", help="Train a reward model instead of a SFT model"
    )
    arg_parse.add_argument(
        "--prompt-tuning",
        action="store_true",
        help="Should we train with prompt tuning? If not, use LoRA",
    )
    arg_parse.add_argument(
        "--data",
        type=str,
        default="data/",
        help="Directory with {train, valid, test}.jsonl files",
    )
    arg_parse.add_argument(
        "--data-base",
        type=str,
        default="",
        help="Base name for the .jsonl files. E.g., 'increasing_mult_2_'",
    )
    arg_parse.add_argument(
        "--num-prompt-tokens",
        type=int,
        default=10,
        help="Number of prompt tokens to pre-pend",
    )
    arg_parse.add_argument(
        "--lora-layers",
        type=int,
        default=16,
        help="Number of layers to fine-tune",
    )
    arg_parse.add_argument("--batch-size", type=int, default=4, help="Minibatch size.")
    arg_parse.add_argument("--iters", type=int, default=1000, help="Iterations to train for.")
    arg_parse.add_argument(
        "--val-batches",
        type=int,
        default=25,
        help="Number of validation batches, -1 uses the entire validation set.",
    )
    arg_parse.add_argument("--learning-rate", type=float, default=1e-6, help="Adam learning rate.")
    arg_parse.add_argument(
        "--steps-per-report",
        type=int,
        default=10,
        help="Number of training steps between loss reporting.",
    )
    arg_parse.add_argument(
        "--steps-per-eval",
        type=int,
        default=200,
        help="Number of training steps between validations.",
    )
    arg_parse.add_argument(
        "--resume-file",
        type=str,
        default=None,
        help="Load path to resume training with the given PEFT weights.",
    )
    arg_parse.add_argument(
        "--save-file",
        type=str,
        default="peft_weights.npz",
        help="Save/load path for the trained PEFT weights.",
    )
    arg_parse.add_argument(
        "--save-every",
        type=int,
        default=100,
        help="Save the model every N iterations.",
    )
    arg_parse.add_argument(
        "--test",
        action="store_true",
        help="Evaluate on the test set after training",
    )
    arg_parse.add_argument(
        "--test-batches",
        type=int,
        default=500,
        help="Number of test set batches, -1 uses the entire test set.",
    )
    arg_parse.add_argument("--seed", type=int, default=0, help="The PRNG seed")
    return arg_parse
