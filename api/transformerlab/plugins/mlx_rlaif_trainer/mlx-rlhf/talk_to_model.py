"""
Created by Andrew Silva on 5/11/2024
"""

import argparse

import mlx.core as mx
from utils import get_model_and_tokenizer

if __name__ == "__main__":
    arg_parse = argparse.ArgumentParser(description="Talk to a trained model.")
    arg_parse.add_argument(
        "--model",
        default="andrewsilva/increasing_digit_fine_tune",
        help="The path to the local model directory or Hugging Face repo.",
    )
    arg_parse.add_argument(
        "--resume-file", default="digit_fine_tune.npz", help="Adapter file location"
    )
    arg_parse.add_argument("--quantize", action="store_true", help="Should the model be quantized?")
    # Generation args
    arg_parse.add_argument(
        "--max-tokens",
        "-m",
        type=int,
        default=32,
        help="The maximum number of tokens to generate",
    )
    arg_parse.add_argument(
        "--max-context",
        "-c",
        type=int,
        default=1024,
        help="The maximum number of tokens from the ongoing conversation that should be wrapped up as context",
    )
    arg_parse.add_argument("--temp", type=float, default=0.0, help="The sampling temperature")
    args = arg_parse.parse_args()
    model, tokenizer = get_model_and_tokenizer(args, need_generate=True, add_peft=False)

    print("Type your message to the chat bot below:")
    output_message = ""
    while True:
        input_str = input(">>>")
        input_message = f"{output_message}\nUser: {input_str}\nSystem:"
        # input_message = input_str
        input_message = tokenizer(input_message)
        input_message = mx.array(input_message["input_ids"][-args.max_context :])[None]
        output_message = []
        for token in model.generate(input_message, args.temp):
            output_message.append(token.item())
            if len(output_message) >= args.max_tokens:
                break
        output_message = tokenizer.decode(output_message[len(input_message) :])
        output_message = f"System: {output_message.split('User:')[0].split('</s>')[0]}"
        print(f"{output_message}")
