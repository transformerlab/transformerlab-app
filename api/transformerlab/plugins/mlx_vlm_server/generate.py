# generate.py
# Copyright © 2024 Apple Inc.

import argparse
import codecs

import mlx.core as mx
from llava import LlavaModel
from transformers import AutoProcessor


def parse_arguments():
    parser = argparse.ArgumentParser(description="Generate text from an image using a model.")
    parser.add_argument(
        "--model",
        type=str,
        default="llava-hf/llava-1.5-7b-hf",
        help="The path to the local model directory or Hugging Face repo.",
    )
    parser.add_argument(
        "--image",
        type=str,
        default=None,
        help="URL or path of the image to process. Leave empty to process text only.",
    )
    parser.add_argument(
        "--prompt",
        type=str,
        default="USER: <image>\nWhat are these?\nASSISTANT:",
        help="Message to be processed by the model.",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=100,
        help="Maximum number of tokens to generate.",
    )
    parser.add_argument("--temp", type=float, default=0.3, help="Temperature for sampling.")
    parser.add_argument(
        "--eos-token",
        type=str,
        default=None,
        help="End of sequence token for tokenizer",
    )
    return parser.parse_args()


def prepare_inputs(processor, image, prompt):
    if image:
        inputs = processor(prompt, image)
        pixel_values = mx.array(inputs["pixel_values"])
    else:
        inputs = processor(prompt)
        pixel_values = None  # No image provided
    input_ids = mx.array(inputs["input_ids"])
    return input_ids, pixel_values


def load_model(model_path, tokenizer_config={}):
    processor = AutoProcessor.from_pretrained(model_path, **tokenizer_config)
    model = LlavaModel.from_pretrained(model_path)
    return processor, model


def sample(logits, temperature=0.0):
    if temperature == 0:
        return mx.argmax(logits, axis=-1)
    else:
        return mx.random.categorical(logits * (1 / temperature))


def generate_text(input_ids, pixel_values, model, processor, max_tokens, temperature):
    if pixel_values is not None:
        logits, cache = model(input_ids, pixel_values)
    else:
        logits, cache = model.language_model(input_ids)
    logits = logits[:, -1, :]
    y = sample(logits, temperature=temperature)
    token = y.item()
    tokens = [token]
    yield token
    for n in range(max_tokens - 1):
        logits, cache = model.language_model(y[None], cache=cache)
        logits = logits[:, -1, :]
        y = sample(logits, temperature)
        token = y.item()
        tokens.append(token)
        yield token


def main():
    args = parse_arguments()

    tokenizer_config = {}
    if args.eos_token is not None:
        tokenizer_config["eos_token"] = args.eos_token

    processor, model = load_model(args.model, tokenizer_config)

    prompt = codecs.decode(args.prompt, "unicode_escape")

    input_ids, pixel_values = prepare_inputs(processor, args.image, prompt)

    print(prompt)


if __name__ == "__main__":
    main()
