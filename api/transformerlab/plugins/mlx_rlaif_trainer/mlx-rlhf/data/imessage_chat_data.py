import glob
import re

import numpy as np


def parse_messages(file_path, reverse_query: bool = False):
    with open(file_path, encoding="utf-8") as f:
        lines = f.readlines()

    if len(lines) < 30:
        # Not enough lines, probably spam
        return []
    messages = []
    current_message = {"sender": "", "text": ""}
    for line in lines:
        if re.match(r"^[A-Za-z]{3} \d{2}, \d{4}", line):
            # Date line, start of a new message
            if current_message["text"]:
                messages.append(current_message)
                current_message = {"sender": "", "text": ""}
        elif (
            re.match(r"^(\+\d{11}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})", line)
            or line == "Me\n"
        ):
            # Phone number or email address or "Me" line, indicates sender
            current_message["sender"] = line.strip()
        elif line.strip():
            # Non-empty line, message content
            # Some bugs here include:
            # 1. "Responded to an earlier message" (replying in-line)
            # 2. Reactions?
            # 3. Dates inside of messages...
            # 4. Images/websites
            current_message["text"] += line.strip() + " "

    # Add the last message
    if current_message["text"]:
        messages.append(current_message)

    # Organize into query-response pairs
    pairs = []
    query = ""
    response = ""
    for message in messages:
        if (message["sender"] != "Me") != reverse_query:
            if query and response:
                pairs.append((query.strip(), response.strip()))
                query = ""
                response = ""
            query += message["text"]
        else:
            response += message["text"]

    if len(pairs) < 10:
        # Not enough data, probably pizza or political spam or something
        return []
    return pairs


def densify_chat(chat_messages, tokenizer, chunk_length: int = 512, prior_context_length: int = 32):
    """
    Given a bunch of pairs of messages <sender, me>, create <chunk_length> chunks with <prior_context_length> prior data
    <sender> messages and <prior_context> should be labeled with -100
    Don't shift labels before passing in.
    Args:
        chat_messages: <sender, me> tuples
        tokenizer: Tokenizer to turn messages into tokens for accurate length trimming
        chunk_length: int (default 512) -- How long should chunks be?
        prior_context_length: int (default 32) -- How many tokens of prior context should be included in each chunk?

    Returns:
        List of <input_ids, label> pairs
    """
    chunks = []
    current_chunk = {"input_ids": [], "labels": []}
    sys_prompt = "Andrew: "
    for sender, me in chat_messages:
        # TODO: Replace "User" with friend tokens
        sender_message = f"\nUser: {sender}\n{sys_prompt}"
        me_message = f"{me}"
        # TODO: If this is a reward function... generate the alternate responses via LLM? idk...
        sender_tokens = tokenizer(sender_message)["input_ids"]
        me_tokens = tokenizer(me_message, add_special_tokens=False)["input_ids"]

        # Add prior context tokens if a previous chunk exists and if we have nothing yet in this chunk
        if len(chunks) > 0 and len(current_chunk["input_ids"]) == 0:
            context_tokens = chunks[-1]["input_ids"][-prior_context_length:]
            context_labels = [-100 for x in context_tokens]
            current_chunk["input_ids"].extend(context_tokens)
            current_chunk["labels"].extend(context_labels)

        # Add sender tokens
        if (chunk_length - len(current_chunk["input_ids"])) < len(sender_tokens):
            # We can't fit the entire sender into our context
            chunks.append(current_chunk)  # Add whatever we had before
            current_chunk["input_ids"] = sender_tokens  # Add this message
            current_chunk["labels"] = [-100 for x in sender_tokens]  # Add all -100s
            if len(sender_tokens) >= chunk_length:
                # If the sender alone is simply too big
                current_chunk["labels"] = current_chunk["labels"]
                chunks.append(current_chunk)  # Put it into the buffer, we'll delete it later
                current_chunk = {
                    "input_ids": [],
                    "labels": [],
                }  # Reset the chunk to empty for the 'me' text
        else:
            current_chunk["input_ids"].extend(sender_tokens)
            current_chunk["labels"].extend([-100] * len(sender_tokens))

        # Add me tokens
        max_ctx = max(0, chunk_length - len(current_chunk["input_ids"]))
        current_chunk["input_ids"].extend(me_tokens[:max_ctx])
        current_chunk["labels"].extend(me_tokens[:max_ctx])

        while max_ctx < len(me_tokens):
            chunks.append(current_chunk)
            current_chunk = {
                "input_ids": current_chunk["input_ids"][-prior_context_length:],
                "labels": [-100] * prior_context_length,
            }
            me_tokens = me_tokens[max_ctx:]
            max_ctx = max(
                0, chunk_length - len(current_chunk["input_ids"])
            )  # == chunk_length-prior_context_length
            current_chunk["input_ids"].extend(me_tokens[max_ctx:])
            current_chunk["labels"].extend(me_tokens[max_ctx:])

        # If the current chunk is full, add it to the list of chunks
        if len(current_chunk["input_ids"]) >= chunk_length:
            current_chunk["labels"] = current_chunk["labels"]
            chunks.append(current_chunk)
            current_chunk = {"input_ids": [], "labels": []}

    # Add the last incomplete chunk
    if current_chunk["input_ids"]:
        current_chunk["labels"] = current_chunk["labels"]
        chunks.append(current_chunk)

    del_inds = []
    for c_ind in range(len(chunks)):
        if np.all(np.array(chunks[c_ind]["labels"]) == -100):
            del_inds.append(c_ind)
    for d in del_inds[::-1]:
        del chunks[d]
    return chunks


def get_all_txts(
    message_dir, tokenizer, chunk_length=512, prior_context_length=32, reward_function: bool = False
):
    dataset = []
    for fn in glob.glob(f"{message_dir}/*.txt"):
        if "," in fn.split("/")[-1]:
            # Not dealing with group chats
            continue
        chat_messages = parse_messages(fn)
        if len(chat_messages) > 0:
            if not reward_function:
                chat_chunks = densify_chat(
                    chat_messages, tokenizer, chunk_length, prior_context_length
                )
                dataset.extend(chat_chunks)
            else:
                chat_chunks = densify_chat(
                    chat_messages, tokenizer, chunk_length, prior_context_length
                )
                # Split chunks based on -100s...
                #
                dataset.extend(chat_chunks)

    return dataset


if __name__ == "__main__":
    from transformers import AutoTokenizer

    tokenizer_demo = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-chat-hf")
    # Wherever you run `imessage-exporter -f txt -o message_data`
    dataset = get_all_txts(
        "../../message_data/", tokenizer_demo, chunk_length=256, prior_context_length=24
    )
    for i in range(5):
        print(
            f"dataset sample {i}: {dataset[i]} \n reads as: {tokenizer_demo.decode(dataset[i]['input_ids'])}"
        )
    print(f"{len(dataset)} total samples -- estimated to have {len(dataset) * 256} tokens")
