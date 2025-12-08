"""
A model worker using Apple MLX

https://github.com/ml-explore/mlx-examples/tree/main/llava

"""

import argparse
import asyncio
import base64
import cProfile
import json
import os
import uuid
from collections import namedtuple
from contextlib import asynccontextmanager
from io import BytesIO

import requests
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from fastchat.serve.model_worker import logger
from fastchat.utils import get_context_length

worker_id = str(uuid.uuid4())[:8]

from fastchat.serve.base_model_worker import BaseModelWorker  # noqa
from generate import generate_text, load_model, prepare_inputs  # noqa
from huggingface_hub import snapshot_download  # noqa
from PIL import Image  # noqa


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
        llm_engine: str,
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
            f"Loading the model {self.model_names} on worker {worker_id}, worker type: MLX worker..."
        )

        self.model_name = model_path
        # second argument is the tokenizer config
        self.tokenizer, self.mlx_model = load_model(self.model_name)
        config = get_hugggingface_config(self.model_name)

        try:
            self.context_len = get_context_length(config)
        except Exception:
            self.context_len = 2048
        print("Context length: ", self.context_len)

        if not no_register:
            self.init_heart_beat()

    async def generate_stream(
        self,
        params: dict,
    ):
        processor, model = load_model(self.model_name)
        image_link = params.get("images", None)
        # Image link is sent as an array (to support sending multiple images in the future)
        if (image_link is not None) and (image_link != []):
            image_link = image_link[0]
        image = None
        # Using PIL because thats one of the libraries that tokenizer uses. The accepted image formats are PIL.Image.Image, numpy.ndarray, torch.Tensor, tf.Tensor or jax.ndarray
        if image_link and image_link != []:
            if image_link.startswith("data:image"):
                base64_str_index = image_link.find("base64,") + 7
                image_data = base64.b64decode(image_link[base64_str_index:])
                image = Image.open(BytesIO(image_data))
            else:
                authorized_domains = ["example.com", "trusted.com"]
                if any(image_link.startswith(f"https://{domain}") for domain in authorized_domains):
                    response = requests.get(image_link)
                    image = Image.open(BytesIO(response.content))
                else:
                    raise ValueError("Unauthorized image link domain")
        # Extract messages from the prompt
        prompt = params["prompt"]

        input_ids, pixel_values = prepare_inputs(processor, image, prompt)
        # generate_text is an async generator
        iterator = generate_text(
            input_ids,
            pixel_values,
            model,
            processor,
            params["max_new_tokens"],
            params["temperature"],
        )
        # reply = generate_text(input_ids, pixel_values,model, processor, params["temperature"])
        max_tokens = params["max_new_tokens"]
        tokens = []
        finish_reason = ""
        for i in range(max_tokens):
            token = await run_in_threadpool(next, iterator)
            if token == processor.tokenizer.eos_token_id:
                finish_reason = "stop"
                break
            tokens.append(token)
            ret = {
                "text": processor.tokenizer.decode(tokens),
                "error_code": 0,
                "usage": {
                    "prompt_tokens": len(prompt),
                    "completion_tokens": len(tokens),
                    "total_tokens": len(prompt) + len(tokens),
                },
                "cumulative_logprob": [],
                "finish_reason": None,
            }
            yield (json.dumps(ret) + "\0").encode()
        ret = {
            "text": processor.tokenizer.decode(tokens),
            "error_code": 0,
            "usage": {},
            "cumulative_logprob": [],
            "finish_reason": finish_reason,
        }
        yield (json.dumps(ret) + "\0").encode()

    async def generate(self, params):
        async for chunk in self.generate_stream(params):
            pass
        return json.loads(chunk[:-1].decode())


def profile_generate_text(input_ids, pixel_values, model, processor, max_tokens, temperature):
    pr = cProfile.Profile()
    pr.enable()
    list(generate_text(input_ids, pixel_values, model, processor, max_tokens, temperature))
    pr.disable()
    pr.print_stats(sort="time")


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
    print("Starting server")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
