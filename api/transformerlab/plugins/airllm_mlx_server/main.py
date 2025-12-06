"""
A model worker using Apple MLX

https://github.com/ml-explore/mlx-examples/tree/main/llms

Code based on vllm_worker https://github.com/lm-sys/FastChat/blob/main/fastchat/serve/vllm_worker.py

You must install MLX python:

pip install mlx-lm
"""

import argparse
import asyncio
import json
import os
import sys
import uuid
from collections import namedtuple
from typing import Any

import uvicorn
from airllm import AutoModel
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from fastchat.serve.model_worker import logger
from fastchat.utils import get_context_length
from huggingface_hub import snapshot_download

worker_id = str(uuid.uuid4())[:8]

from contextlib import asynccontextmanager  # noqa

import mlx.core as mx  # noqa
from fastchat.serve.base_model_worker import BaseModelWorker  # noqa
from mlx_embedding_models.embedding import EmbeddingModel  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # This function is called when the app shuts down
    cleanup_at_exit()


app = FastAPI(lifespan=lifespan)


class MLXWorker(BaseModelWorker):
    def __init__(
        self,
        controller_addr: str,
        worker_addr: str,
        worker_id: str,
        model_path: str,
        model_names: list[str],
        limit_worker_concurrency: int,
        no_register: bool,
        conv_template: str,
    ):
        super().__init__(
            controller_addr,
            worker_addr,
            worker_id,
            model_path,
            model_names,
            limit_worker_concurrency,
            conv_template,
        )

        logger.info(
            f"Loading the model {self.model_names} on worker"
            + f"{worker_id}, worker type: MLX worker..."
        )

        self.model_name = model_path

        logger.info("Using AirLLM for inference")
        self.airllm_model = AutoModel.from_pretrained(model_path)
        self.tokenizer = self.airllm_model.tokenizer

        config = get_hugggingface_config(model_path)

        # The following is a hack to fix errors loading Phi-3 128k -- we hardcode an expected value for factor in rope_scaling otherwise fastchat will fail
        rope_scaling = getattr(config, "rope_scaling", None)
        if rope_scaling:
            if "factor" not in rope_scaling:
                config.rope_scaling["factor"] = 1

        try:
            self.context_len = get_context_length(config)
        except Exception:
            self.context_len = 2048

        print("Context length: ", self.context_len)

        if not no_register:
            self.init_heart_beat()

    # copied from https://github.com/madroidmaq/mlx-omni-server/blob/main/src/mlx_omni_server/services/chat/mlx_model.py#L198
    def _process_logprobs(
        self,
        tokenizer,
        response,
        top_k: int | None,
    ) -> dict[str, Any] | None:
        """Process logprobs information from generation response to match OpenAI format"""
        current_token = response.token
        current_logprobs = response.logprobs

        # Get current token info
        token_str = tokenizer.decode([current_token])
        token_logprob = current_logprobs[current_token].item()
        token_bytes = token_str.encode("utf-8")

        # Base token info
        token_info = {
            "token": token_str,
            "logprob": token_logprob,
            "bytes": list(token_bytes),
        }

        # Process top logprobs
        top_logprobs = {}
        if top_k is not None:
            # Get indices of top_k tokens
            top_indices = mx.argpartition(-current_logprobs, kth=top_k - 1)[:top_k]
            top_probs = current_logprobs[top_indices]

            # Create detailed token information for each top token
            for idx, logprob in zip(top_indices.tolist(), top_probs.tolist()):
                token = tokenizer.decode([idx])
                token_bytes = token.encode("utf-8")
                top_logprobs[token] = logprob

        return {**token_info, "top_logprobs": [top_logprobs]}

    async def generate_stream(self, params):
        # Process tools using HF chat_template approach
        params = self.process_tools_hf(params)

        self.call_ct += 1

        context = params.pop("prompt")
        # request_id = params.pop("request_id")
        temperature = float(params.get("temperature", 1.0))
        top_p = float(params.get("top_p", 1.0))
        # top_k = int(params.get("top_k", 10))
        # presence_penalty = float(params.get("presence_penalty", 0.0))
        # frequency_penalty = float(params.get("frequency_penalty", 0.0))
        max_new_tokens = params.get("max_new_tokens", 256)
        stop_str = params.get("stop", None)
        stop_token_ids = params.get("stop_token_ids", None) or []
        if self.tokenizer.eos_token_id is not None:
            stop_token_ids.append(self.tokenizer.eos_token_id)
        # echo = params.get("echo", True)
        # use_beam_search = params.get("use_beam_search", False)
        # best_of = params.get("best_of", None)
        include_logprobs = params.get("logprobs", None)

        print("logprobs: ", include_logprobs)

        # Handle stop_str
        stop = set()
        if isinstance(stop_str, str) and stop_str != "":
            stop.add(stop_str)
        elif isinstance(stop_str, list) and stop_str != []:
            stop.update(stop_str)

        for tid in stop_token_ids:
            if tid is not None:
                s = self.tokenizer.decode(tid)
                if s != "":
                    stop.add(s)

        print("Stop patterns: ", stop)

        top_p = max(top_p, 1e-5)
        if temperature <= 1e-5:
            top_p = 1.0

        # Encode the input text
        input_tokens = self.tokenizer(
            context,
            return_tensors="np",
            return_attention_mask=False,
            truncation=True,
            max_length=self.context_len,
            padding=False,
        )

        # Setup generation parameters
        gen_params = {
            "max_new_tokens": max_new_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "use_cache": True,
            "return_dict_in_generate": True,
        }

        # Generate with AirLLM
        generation_output = await run_in_threadpool(
            self.airllm_model.generate, mx.array(input_tokens["input_ids"]), **gen_params
        )

        tokens_decoded = generation_output

        ret = {
            "text": tokens_decoded,
            "error_code": 0,
            "usage": {
                "prompt_tokens": len(context),
                "completion_tokens": len(tokens_decoded) - len(context),
                "total_tokens": len(tokens_decoded),
            },
            "logprobs": None,  # AirLLM doesn't support logprobs yet
            "finish_reason": "stop",
        }
        yield (json.dumps(ret) + "\0").encode()
        return

    async def generate(self, params):
        async for x in self.generate_stream(params):
            pass
        return json.loads(x[:-1].decode())

    def get_embeddings(self, params):
        # For now we hard code embeddings to use the BGE-small model
        ret = {"embedding": [], "token_num": 0}
        input_array = params.get("input", [])
        print("input_array: ", input_array)
        embedding_model = EmbeddingModel.from_registry("bge-small")
        output_array = embedding_model.encode(input_array)
        output_array = output_array.tolist()
        ret["embedding"] = output_array
        return ret


def release_worker_semaphore():
    worker.semaphore.release()


def acquire_worker_semaphore():
    if worker.semaphore is None:
        worker.semaphore = asyncio.Semaphore(worker.limit_worker_concurrency)
    return worker.semaphore.acquire()


def create_background_tasks(request_id):
    async def abort_request() -> None:
        print("trying to abort but not implemented")

    background_tasks = BackgroundTasks()
    background_tasks.add_task(release_worker_semaphore)
    background_tasks.add_task(abort_request)
    return background_tasks


@app.post("/worker_generate_stream")
async def api_generate_stream(request: Request):
    params = await request.json()
    await acquire_worker_semaphore()
    request_id = uuid.uuid4()
    params["request_id"] = str(request_id)
    generator = worker.generate_stream(params)
    background_tasks = create_background_tasks(request_id)
    return StreamingResponse(generator, background=background_tasks)


@app.post("/worker_generate")
async def api_generate(request: Request):
    params = await request.json()
    await acquire_worker_semaphore()
    request_id = uuid.uuid4()
    params["request_id"] = str(request_id)
    output = await worker.generate(params)
    release_worker_semaphore()
    # await engine.abort(request_id)
    print("Trying to abort but not implemented")
    return JSONResponse(output)


@app.post("/worker_get_status")
async def api_get_status(request: Request):
    return worker.get_status()


@app.post("/count_token")
async def api_count_token(request: Request):
    params = await request.json()
    return worker.count_token(params)


@app.post("/worker_get_conv_template")
async def api_get_conv(request: Request):
    return worker.get_conv_template()


@app.post("/model_details")
async def api_model_details(request: Request):
    return {"context_length": worker.context_len}


@app.post("/worker_get_embeddings")
async def api_get_embeddings(request: Request):
    params = await request.json()
    await acquire_worker_semaphore()
    embedding = worker.get_embeddings(params)
    release_worker_semaphore()
    return JSONResponse(content=embedding)


worker = None


@app.post("/tokenize")
async def api_tokenize(request: Request):
    params = await request.json()
    text = params["text"]
    token_ids = worker.tokenizer(text).input_ids
    tokens = worker.tokenizer.convert_ids_to_tokens(token_ids)
    return {"tokens": tokens, "token_ids": token_ids}


def get_hugggingface_config(model_path):
    try:
        local_file = snapshot_download(model_path, local_files_only=True)
        config_json = os.path.join(local_file, "config.json")
        contents = "{}"
        with open(config_json) as f:
            contents = f.read()
        d = json.loads(contents)
    except Exception:
        # failed to open config.json so create an empty config
        d = {}

    # rename all keys that start with an underscore, because they break convertion to object
    d = {k[1:] if k.startswith("_") else k: v for k, v in d.items()}
    # convert the dictionary to a namedtuple because later logic expects it that way
    config = namedtuple("config", d.keys())(**d)
    return config


def cleanup_at_exit():
    global worker
    print("Cleaning up...")
    del worker


def main():
    global app, worker

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=21002)
    parser.add_argument("--worker-address", type=str, default="http://localhost:21002")
    parser.add_argument("--controller-address", type=str, default="http://localhost:21001")
    parser.add_argument("--model-path", type=str, default="microsoft/phi-2")
    parser.add_argument("--adaptor-path", type=str, default=None)
    parser.add_argument(
        "--model-names",
        type=lambda s: s.split(","),
        help="Optional display comma separated names",
    )
    parser.add_argument(
        "--conv-template", type=str, default=None, help="Conversation prompt template."
    )
    parser.add_argument(
        "--trust_remote_code",
        action="store_false",
        default=True,
        help="Trust remote code (e.g., from HuggingFace) whendownloading the model and tokenizer.",
    )

    args, unknown = parser.parse_known_args()

    if args.model_path:
        args.model = args.model_path

    if args.adaptor_path is None or args.adaptor_path.strip() == "":
        args.adaptor_path = None
    else:
        logger.info("Adaptors are not yet supported with AirLLM MLX")
        sys.exit(1)

    worker = MLXWorker(
        args.controller_address,
        args.worker_address,
        worker_id,
        args.model_path,
        args.model_names,
        1024,
        False,
        args.conv_template,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
