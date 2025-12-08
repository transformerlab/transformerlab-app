import asyncio
import json
import time

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

    start_time = time.monotonic()
    async with session.post(
        inference_url, headers=headers, data=payload, timeout=timeout
    ) as response:
        first_token_time = None
        content_bytes = bytearray()
        async for chunk in response.content.iter_chunked(max_tokens):
            if first_token_time is None:
                first_token_time = time.monotonic()
            content_bytes.extend(chunk)
        end_time = time.monotonic()

    try:
        response_json = json.loads(content_bytes.decode())
        output = response_json["choices"][0]["message"]["content"]
        prompt_tokens = response_json.get("usage", {}).get("prompt_tokens")
        completion_tokens = response_json.get("usage", {}).get("completion_tokens")
        total_tokens = response_json.get("usage", {}).get("total_tokens")

        metrics = {
            "time_to_first_token": first_token_time - start_time if first_token_time else None,
            "time_total": end_time - start_time,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "tokens_per_second": total_tokens / (end_time - start_time)
            if total_tokens and (end_time - start_time) > 0
            else None,
        }
        return output, metrics

    except Exception as e:
        print(f"Exception: {e}")
        print(content_bytes.decode())
        return "", {}


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
                    examples.loc[global_idx, "time_to_first_token"] = result[1].get(
                        "time_to_first_token", None
                    )
                    examples.loc[global_idx, "time_total"] = result[1].get("time_total", None)
                    examples.loc[global_idx, "prompt_tokens"] = result[1].get("prompt_tokens", None)
                    examples.loc[global_idx, "completion_tokens"] = result[1].get(
                        "completion_tokens", None
                    )
                    examples.loc[global_idx, "total_tokens"] = result[1].get("total_tokens", None)
                    examples.loc[global_idx, "tokens_per_second"] = result[1].get(
                        "tokens_per_second", None
                    )

    return examples
