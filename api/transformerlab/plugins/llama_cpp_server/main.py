"""
A model worker using llama-cpp-python

https://github.com/abetlen/llama-cpp-python

Code based on vllm_worker https://github.com/lm-sys/FastChat/blob/main/fastchat/serve/vllm_worker.py

You must install llama-cpp-python first:

pip install llama-cpp-python

Right now only generate_stream works -- need to do work to make generate work
"""

import argparse
import asyncio
import json
import uuid
from contextlib import asynccontextmanager

import llama_cpp
import torch
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from fastchat.serve.model_worker import logger
from fastchat.utils import is_partial_stop
from transformers.tokenization_utils_base import BatchEncoding

worker_id = str(uuid.uuid4())[:8]

from fastchat.serve.base_model_worker import BaseModelWorker  # noqa


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # This function is called when the app shuts down
    cleanup_at_exit()


app = FastAPI(lifespan=lifespan)


class LlamaCppTokenizer:
    def __init__(self, model):
        self.model = model
        self.eos_token_id = None

    def __call__(self, text):
        # convert variable "text" to bytes:
        text = text.encode("utf-8")
        tokens = self.model.tokenize(text)
        batchEncoding = BatchEncoding(data={"input_ids": [tokens], "eos_token_id": None})
        return batchEncoding

    def decode(self, tokens):
        return self.model.detokenize(tokens)

    def num_tokens(self, prompt):
        tokens = self.model.tokenize(prompt)
        return len(tokens)


class LlamaCppServer(BaseModelWorker):
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
        n_gpu_layers: int = 0,
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
            f"Loading the model {self.model_names} on worker {worker_id}, worker type: llama-cpp-python..."
        )

        self.model_name = model_path
        print("Loading model: ", self.model_name)
        # setting _n_ctx to 0 pins it to the trained context length

        self.model = llama_cpp.Llama(self.model_name, n_ctx=0, n_gpu_layers=n_gpu_layers)
        self.tokenizer = LlamaCppTokenizer(model=self.model)

        # self.context_len = get_context_length(
        #     llm_engine.engine.model_config.hf_config)
        # hard code for now -- not sure how to get in llamacpp
        self.context_len = self.model._n_ctx

        if not no_register:
            self.init_heart_beat()

    async def generate_stream(self, params):
        # Process tools using HF chat_template approach
        params = self.process_tools_hf(params)

        # We set "generate_stream" as def not, async def, so that it can
        # run on another thread. Otherwise, it will block the main thread.
        self.call_ct += 1

        context = params.pop("prompt")
        # request_id = params.pop("request_id")
        temperature = float(params.get("temperature", 1.0))
        top_p = float(params.get("top_p", 1.0))
        # top_k = params.get("top_k", -1.0)
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

        # Handle stop_str
        stop = set()
        if isinstance(stop_str, str) and stop_str != "":
            stop.add(stop_str)
        elif isinstance(stop_str, list) and stop_str != []:
            stop.update(stop_str)

        for tid in stop_token_ids:
            if tid is not None:
                print("Stop token: ", tid)
                s = self.tokenizer.decode(tid)
                if s != "":
                    stop.add(s)

        print(self.get_conv_template())

        print("Stop patterns: ", stop)

        top_p = max(top_p, 1e-5)
        if temperature <= 1e-5:
            top_p = 1.0

        tokens = []
        # skip = 0

        context_tokens = self.model.tokenize(context.encode("utf-8"))

        finish_reason = "length"
        print("max length: " + str(max_new_tokens))
        #        iterator = await run_in_threadpool(generate_step, context_mlx, self.mlx_model, temperature)

        iterator = await run_in_threadpool(self.model.generate, context_tokens)

        for i in range(max_new_tokens):
            token = await run_in_threadpool(next, iterator)
            t = self.model.detokenize([token])
            # convert bytes to string:
            t = t.decode("utf-8")
            if token == self.model.token_eos():
                finish_reason = "stop"
                break
            tokens.append(token)
            tokens_decoded = self.model.detokenize(tokens)

            # tokens_decoded returns bytes, we need a string
            tokens_decoded_str = tokens_decoded.decode("utf-8")
            partial_stop = any(is_partial_stop(tokens_decoded_str, i) for i in stop)

            if partial_stop:
                finish_reason = "stop"
                break

            ret = {
                "text": tokens_decoded_str,
                "error_code": 0,
                "usage": {
                    "prompt_tokens": len(context),
                    "completion_tokens": len(tokens),
                    "total_tokens": len(context) + len(tokens),
                },
                "cumulative_logprob": [],
                "finish_reason": None,  # hard code for now
            }
            # print(ret)
            yield (json.dumps(ret) + "\0").encode()
        ret = {
            "text": self.model.detokenize(tokens).decode("utf-8"),
            "error_code": 0,
            "usage": {},
            "cumulative_logprob": [],
            "finish_reason": finish_reason,
        }
        yield (json.dumps(obj={**ret, **{"finish_reason": None}}) + "\0").encode()
        yield (json.dumps(ret) + "\0").encode()

    async def generate(self, params):
        prompt = params.pop("prompt")
        max_tokens = params.get("max_new_tokens", 256)
        temperature = float(params.get("temperature", 1.0))
        top_p = float(params.get("top_p", 1.0))

        print("Generating with params: ", params)
        thread = asyncio.to_thread(
            self.model.create_completion,
            prompt,
            suffix=None,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            echo=False,
        )
        response = await thread
        print(response)

        ret = {
            "text": response["choices"][0]["text"],
            "error_code": 0,
            "usage": response["usage"],
            "cumulative_logprob": [],
            "finish_reason": response["choices"][0]["finish_reason"],
        }
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


worker = None


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
    parser.add_argument("--parameters", type=str, default=None)

    args, unknown = parser.parse_known_args()

    # parameters is a JSON string, so we parse it:
    parameters = json.loads(args.parameters)

    n_gpu_layers = parameters.get("n_gpu_layers", "auto")

    if n_gpu_layers == "auto":
        if torch.cuda.is_available():
            n_gpu_layers = -1
            print("GPU detected, setting n_gpu_layers to ", n_gpu_layers)
        else:
            n_gpu_layers = 0
            print("No GPUs available, setting n_gpu_layers to ", n_gpu_layers)
    else:
        n_gpu_layers = int(n_gpu_layers)
        print("Setting n_gpu_layers to user selection", n_gpu_layers)

    # model_path can be a hugging face ID, or a local file

    # TODO? Does the model need to check if it is in the local file system?
    # Not sure if it's possible to get here with a huggingface ID
    # if os.path.exists(args.model_path):
    model_path = args.model_path

    worker = LlamaCppServer(
        args.controller_address,
        args.worker_address,
        worker_id,
        model_path,
        args.model_names,
        1024,
        False,
        "llama-cpp-python",
        args.conv_template,
        n_gpu_layers,
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
