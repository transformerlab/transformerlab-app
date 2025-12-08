import asyncio
import json

import aiohttp
from aiohttp import ClientTimeout

# Create a timeout object (values in seconds)
timeout = ClientTimeout(total=420)


def get_prompt(content):
    prompt = [{"role": "user", "content": content}]
    return prompt


async def predict(
    session,
    prompt,
    sys_prompt=None,
    model=None,
    inference_url="http://localhost:8338/v1/chat/completions",
    api_key="dummy",
    max_tokens=1024,
    temperature=0.01,
    top_p=1.0,
):
    if sys_prompt is not None:
        messages = [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": prompt},
        ]
    else:
        messages = get_prompt(prompt)
    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    payload = json.dumps(
        {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
        }
    )

    async with session.post(
        inference_url, headers=headers, data=payload, timeout=timeout
    ) as response:
        try:
            response_json = await response.json()
            return (
                response_json["choices"][0]["message"]["content"],
                # response_json["usage"]["prompt_tokens"],
                # response_json["usage"]["completion_tokens"],
            )

        except Exception as e:
            print(f"Exception: {e}")
            print(await response.text())
            return ""


async def process_batch(
    session,
    batch,
    prompt_col="prompt",
    sys_prompt_col=None,
    model=None,
    inference_url="http://localhost:8338/v1/chat/completions",
    api_key="dummy",
    temperature=0.01,
    max_tokens=1024,
    top_p=1.0,
):
    prompts = batch[prompt_col].values
    if sys_prompt_col is not None:
        sys_prompts = batch[sys_prompt_col].values
        tasks = [
            predict(
                session,
                prompt,
                sys_prompt=sys_prompt,
                model=model,
                inference_url=inference_url,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )
            for prompt, sys_prompt in zip(prompts, sys_prompts)
        ]
    else:
        tasks = [
            predict(
                session,
                prompt,
                model=model,
                inference_url=inference_url,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )
            for prompt in prompts
        ]
    results = await asyncio.gather(*tasks)

    return results


async def process_dataset(
    examples,
    batch_size,
    input_col="input",
    output_col="output",
    sys_prompt_col=None,
    min_idx=0,
    max_idx=None,
    model=None,
    inference_url="http://localhost:8338/v1/chat/completions",
    api_key="dummy",
    temperature=0.01,
    max_tokens=1024,
    top_p=1.0,
):
    # min_idx = 0
    if max_idx is None:
        max_idx = len(examples)
    START_FROM_SAMPLE_INDEX = min_idx
    END_AT_SAMPLE_INDEX = max_idx
    if isinstance(batch_size, str):
        batch_size = int(batch_size)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        for start in range(min_idx, max_idx, batch_size):
            end = min(start + batch_size, max_idx)
            batch = examples.iloc[start:end]

            results = await process_batch(
                session,
                batch,
                prompt_col=input_col,
                sys_prompt_col=sys_prompt_col,
                model=model,
                inference_url=inference_url,
                api_key=api_key,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
            )

            for idx, result in enumerate(results):
                global_idx = start + idx
                if START_FROM_SAMPLE_INDEX <= global_idx <= END_AT_SAMPLE_INDEX:
                    examples.loc[global_idx, output_col] = result[0]

    return examples


# if __name__ == "__main__":
#     import pandas as pd

#     examples = pd.DataFrame(
#         {
#             "input": [
#                 "What is the capital of France?",
#                 "What is the capital of Germany?",
#                 "What is the capital of Italy?",
#             ]
#         }
#     )

#     final_examples = asyncio.run(
#         process_dataset(examples, batch_size=128, model="mlx-community/Llama-3.2-1B-Instruct-4bit", api_key="dummy")
#     )
#     print(final_examples["output"].values)
