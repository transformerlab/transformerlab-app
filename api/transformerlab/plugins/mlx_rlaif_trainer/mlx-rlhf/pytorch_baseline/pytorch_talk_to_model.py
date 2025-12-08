"""
Created by Andrew Silva on 5/11/2024
"""

import argparse

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

if __name__ == "__main__":
    arg_parse = argparse.ArgumentParser(description="Talk to a trained model.")
    arg_parse.add_argument(
        "--model",
        default="./sft_fine_tune/",
        help="The path to the local model directory or Hugging Face repo.",
    )
    arg_parse.add_argument(
        "--tokenizer",
        default="meta-llama/Llama-2-7b-chat-hf",
        # "meta-llama/Llama-2-7b-chat-hf", "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
        help="The path to the local model directory or Hugging Face repo.",
    )
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

    DEVICE = torch.device("cuda") if torch.cuda.is_available() else torch.device("cpu")
    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer)
    model = AutoModelForCausalLM.from_pretrained(args.model).to(DEVICE)

    print("Type your message to the chat bot below:")
    output_message = ""
    while True:
        input_str = input(">>>")
        input_message = f"{output_message}\nUser: {input_str}\nSystem:"
        input_message = tokenizer(input_message)
        input_message = input_message["input_ids"][-args.max_context :]
        with torch.no_grad():
            output_message = model.generate(
                input_ids=torch.tensor(input_message, device=DEVICE).unsqueeze(0),
                max_new_tokens=args.max_tokens,
                temperature=args.temp,
                do_sample=args.temp > 0,
            )
        output_message = tokenizer.decode(output_message[0, len(input_message) :])
        output_message = f"System: {output_message.split('User:')[0].split('</s>')[0]}"
        print(f"{output_message}")
