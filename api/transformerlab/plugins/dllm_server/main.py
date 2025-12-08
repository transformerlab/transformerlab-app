"""
A model worker for diffusion language models (dLLM)

Supports LLaDA, Dream, and other diffusion-based text generation models.
Based on https://github.com/ZHZisZZ/dllm

Code based on mlx_server and other inference plugins in transformerlab-api
"""

import argparse
import asyncio
import gc
import json
import os
import traceback
import uuid
from contextlib import asynccontextmanager

# IMPORT DLLM FIRST before anything else that might cause conflicts
# This is critical to avoid circular import issues
import dllm
import torch
import uvicorn
from dllm.pipelines import dream, llada
from dllm.tools.chat import decode_trim
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse

# Import fastchat modules after dllm to avoid circular import and CUDA init conflicts
from fastchat.serve.base_model_worker import BaseModelWorker
from fastchat.serve.model_worker import logger
from fastchat.utils import get_context_length

# Set CUDA device before any CUDA operations
os.environ["CUDA_VISIBLE_DEVICES"] = "0"

worker_id = str(uuid.uuid4())[:8]


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    cleanup_at_exit()


app = FastAPI(lifespan=lifespan)


class DLLMWorker(BaseModelWorker):
    def __init__(
        self,
        controller_addr: str,
        worker_addr: str,
        worker_id: str,
        model_path: str,
        model_names: list[str],
        model_architecture: str,
        limit_worker_concurrency: int,
        no_register: bool,
        conv_template: str,
        adaptor_path: str = None,
        context_len: int = 2048,
        **kwargs,
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

        logger.info(f"Loading dLLM model {self.model_names} on worker {worker_id}")
        logger.info(f"Model architecture: {model_architecture}")

        self.model_path = model_path
        self.model_architecture = model_architecture
        self.adaptor_path = adaptor_path
        self.manual_context_len = context_len

        # Store default dllm parameters (can be overridden in generate_stream)
        self.default_steps = kwargs.get("steps", 128)
        self.default_block_length = kwargs.get("block_length", 32)
        self.default_temperature = kwargs.get("temperature", 0.0)
        self.default_remasking = kwargs.get("remasking", "low_confidence")
        self.default_cfg_scale = kwargs.get("cfg_scale", 0.0)

        # Determine device
        if torch.cuda.is_available():
            self.device = torch.device("cuda")
            # Clear CUDA cache before loading
            torch.cuda.empty_cache()
            gc.collect()
            total_mem = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            logger.info(f"Using CUDA device. Available memory: {total_mem:.2f} GB")
        else:
            self.device = torch.device("cpu")
            logger.info("Using CPU device")

        # Create a simple namespace-like object for model_args
        # Match the pattern from dllm examples - they use ScriptArguments directly
        class ModelArgs:
            def __init__(self, model_name_or_path, adaptor_path=None):
                self.model_name_or_path = model_name_or_path
                self.adaptor_path = adaptor_path
                self.dtype = "bfloat16"
                self.load_in_4bit = False
                self.attn_implementation = None

        model_args = ModelArgs(model_path, adaptor_path)

        # Load model and tokenizer using dllm utilities
        # Following the exact pattern from dllm/examples/bert/generate.py
        try:
            self.model = dllm.utils.get_model(model_args=model_args)
            self.model = self.model.eval()

            # Check if model has device_map (which means it's already distributed)
            if hasattr(self.model, "hf_device_map"):
                logger.info(f"Model uses device_map: {self.model.hf_device_map}")
            elif hasattr(self.model, "device"):
                logger.info(f"Model device: {self.model.device}")

            self.tokenizer = dllm.utils.get_tokenizer(model_args=model_args)
            logger.info("Model and tokenizer loaded successfully")
        except Exception as e:
            if "out of memory" in str(e).lower() or "bad_alloc" in str(e).lower():
                logger.error(f"Out of memory error: {e}")
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                raise RuntimeError(f"Failed to load model due to insufficient memory: {e}")
            raise

        # Determine which generator to use based on model architecture
        # BERT models also use LLaDAGenerator (as shown in dllm examples/bert)
        model_arch_lower = model_architecture.lower()
        try:
            if "llada" in model_arch_lower or "bert" in model_arch_lower:
                self.generator = llada.LLaDAGenerator(model=self.model, tokenizer=self.tokenizer)
                self.generator_type = "llada"
            elif "dream" in model_arch_lower:
                self.generator = dream.DreamGenerator(model=self.model, tokenizer=self.tokenizer)
                self.generator_type = "dream"
            else:
                # Default to LLaDA if unknown
                logger.warning(
                    f"Unknown model architecture {model_architecture}, defaulting to LLaDA"
                )
                self.generator = llada.LLaDAGenerator(model=self.model, tokenizer=self.tokenizer)
                self.generator_type = "llada"
        except Exception as e:
            logger.error(f"Error creating generator: {e}")
            raise

        # Try to get context length from model config
        try:
            config = self.model.config
            self.context_len = get_context_length(config, default=self.manual_context_len)
        except Exception as e:
            print(f"Error getting context length: {e}")
            self.context_len = self.manual_context_len

        logger.info(f"Context length: {self.context_len}")

        if not no_register:
            self.init_heart_beat()

    async def generate_stream(self, params):
        # Process tools using HF chat_template approach
        params = self.process_tools_hf(params)

        self.call_ct += 1

        context = params.pop("prompt")
        temperature = float(params.get("temperature", 0.0))
        max_new_tokens = params.get("max_new_tokens", 128)
        stop_str = params.get("stop", None)
        stop_token_ids = params.get("stop_token_ids", None) or []

        # Get dllm-specific parameters from params or use instance defaults
        steps = int(params.get("steps", self.default_steps))
        block_length = int(params.get("block_length", self.default_block_length))
        remasking = params.get("remasking", self.default_remasking)
        cfg_scale = float(params.get("cfg_scale", self.default_cfg_scale))

        # Handle stop strings
        stop = set()
        if isinstance(stop_str, str) and stop_str != "":
            stop.add(stop_str)
        elif isinstance(stop_str, list) and stop_str != []:
            stop.update(stop_str)

        for tid in stop_token_ids:
            if tid is not None:
                s = self.tokenizer.decode([tid])
                if s != "":
                    stop.add(s)

        # Create generator config
        if self.generator_type == "llada":
            gen_config = llada.LLaDAGeneratorConfig(
                steps=steps,
                max_new_tokens=max_new_tokens,
                block_length=block_length,
                temperature=temperature,
                remasking=remasking,
                cfg_scale=cfg_scale,
                return_dict_in_generate=True,
            )
        elif self.generator_type == "dream":
            gen_config = dream.DreamGeneratorConfig(
                steps=steps,
                max_new_tokens=max_new_tokens,
                block_length=block_length,
                temperature=temperature,
                remasking=remasking,
                cfg_scale=cfg_scale,
                return_dict_in_generate=True,
            )
        else:
            gen_config = llada.LLaDAGeneratorConfig(
                steps=steps,
                max_new_tokens=max_new_tokens,
                block_length=block_length,
                temperature=temperature,
                remasking=remasking,
                cfg_scale=cfg_scale,
                return_dict_in_generate=True,
            )

        # Tokenize input
        input_ids = self.tokenizer(context, return_tensors="pt", add_special_tokens=False)[
            "input_ids"
        ][0].tolist()
        inputs = [input_ids]

        # Clear CUDA cache before generation to prevent OOM
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            gc.collect()

        # Generate using dllm generator
        try:
            outputs = await run_in_threadpool(
                self.generator.generate,
                inputs,
                gen_config,
            )
        except Exception as e:
            logger.error(f"Generation error: {e}")
            logger.error(traceback.format_exc())
            ret = {
                "text": "",
                "error_code": 1,
                "error": "An internal error occurred",
                "finish_reason": "error",
            }
            yield (json.dumps(ret) + "\0").encode()
            return

        # Decode the generated sequence
        # decode_trim expects lists of sequences and inputs
        # outputs.sequences is a tensor of shape [B, T], convert to list of lists
        if isinstance(outputs.sequences, torch.Tensor):
            sequences_list = outputs.sequences.tolist()
        else:
            sequences_list = outputs.sequences
        sequences = decode_trim(self.tokenizer, sequences_list, inputs)
        generated_text = sequences[0] if sequences and len(sequences) > 0 else ""

        # Check for stop strings
        finish_reason = "length"
        for stop_str in stop:
            if stop_str in generated_text:
                # Truncate at first stop string
                idx = generated_text.find(stop_str)
                generated_text = generated_text[:idx]
                finish_reason = "stop"
                break

        # For streaming, we can yield intermediate states from histories if available
        # If histories are available, we can stream intermediate states
        if outputs.histories and len(outputs.histories) > 0:
            total_steps = len(outputs.histories) - 1  # Exclude initial state
            # Stream intermediate states from diffusion process
            # Skip the first history state (it's usually the initial state)
            for i, history_state in enumerate(outputs.histories[1:], 1):
                # Decode intermediate state - decode FULL sequence like terminal visualizer
                # history_state is a tensor of shape [B, T], convert to list format
                if isinstance(history_state, torch.Tensor):
                    # Get the first sequence if batch dimension exists
                    if history_state.dim() > 1:
                        token_ids = history_state[0].tolist()
                    else:
                        token_ids = history_state.tolist()

                    # Count masks (if mask_token_id is available)
                    masks_remaining = 0
                    if (
                        hasattr(self.tokenizer, "mask_token_id")
                        and self.tokenizer.mask_token_id is not None
                    ):
                        mask_token_id = self.tokenizer.mask_token_id
                        if history_state.dim() > 1:
                            masks_remaining = (history_state[0] == mask_token_id).sum().item()
                        else:
                            masks_remaining = (history_state == mask_token_id).sum().item()
                else:
                    # If it's already a list, use it directly
                    if isinstance(history_state, list) and len(history_state) > 0:
                        if isinstance(history_state[0], list):
                            token_ids = history_state[0]
                        else:
                            token_ids = history_state
                    else:
                        token_ids = history_state
                    masks_remaining = 0

                # Decode the FULL sequence (like terminal visualizer does) to show text evolution
                # This shows the prompt + generation at each step
                try:
                    # Decode the full sequence, similar to terminal visualizer's _detok method
                    intermediate_text = self.tokenizer.decode(
                        token_ids,
                        skip_special_tokens=False,
                        clean_up_tokenization_spaces=True,
                    )
                    # Remove control characters for display
                    intermediate_text = intermediate_text.replace("\r", "")
                except Exception as e:
                    logger.error(f"Error decoding step {i}: {e}")
                    intermediate_text = ""

                # For visualization, we show the full sequence at each step
                # Stop string checking will be done on the final result
                # But we still need to check if we should stop early
                should_stop = False
                # Only check stop strings in the generated portion (after prompt)
                # Extract just the generated part for stop string checking
                try:
                    prompt_text = self.tokenizer.decode(input_ids, skip_special_tokens=False)
                    if prompt_text in intermediate_text:
                        generated_portion = intermediate_text[len(prompt_text) :]
                        for stop_str in stop:
                            if stop_str in generated_portion:
                                should_stop = True
                                break
                except Exception:
                    # Fallback: check in full text
                    for stop_str in stop:
                        if stop_str in intermediate_text:
                            should_stop = True
                            break

                ret = {
                    "text": intermediate_text,
                    "error_code": 0,
                    "usage": {
                        "prompt_tokens": len(input_ids),
                        "completion_tokens": len(intermediate_text.split())
                        if intermediate_text
                        else 0,
                        "total_tokens": len(input_ids)
                        + (len(intermediate_text.split()) if intermediate_text else 0),
                    },
                    "finish_reason": None,
                    # Add diffusion step metadata for visualization
                    "diffusion_step": i,
                    "total_steps": total_steps,
                    "masks_remaining": masks_remaining,
                }
                yield (json.dumps(ret) + "\0").encode()

                if should_stop:
                    finish_reason = "stop"
                    break
        else:
            # No histories available, just yield the final result
            ret = {
                "text": generated_text,
                "error_code": 0,
                "usage": {
                    "prompt_tokens": len(input_ids),
                    "completion_tokens": len(generated_text.split()) if generated_text else 0,
                    "total_tokens": len(input_ids)
                    + (len(generated_text.split()) if generated_text else 0),
                },
                "finish_reason": None,
            }
            yield (json.dumps(ret) + "\0").encode()

        # Final response with finish_reason
        ret = {
            "text": generated_text,
            "error_code": 0,
            "usage": {
                "prompt_tokens": len(input_ids),
                "completion_tokens": len(generated_text.split()) if generated_text else 0,
                "total_tokens": len(input_ids)
                + (len(generated_text.split()) if generated_text else 0),
            },
            "finish_reason": finish_reason,
        }
        yield (json.dumps(ret) + "\0").encode()

    async def generate(self, params):
        async for x in self.generate_stream(params):
            pass
        return json.loads(x[:-1].decode())

    def get_embeddings(self, params):
        # dLLM models are not typically used for embeddings
        ret = {"embedding": [], "token_num": 0}
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


def cleanup_at_exit():
    global worker
    print("Cleaning up...")
    if worker is not None:
        del worker


def main():
    global app, worker

    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=21002)
    parser.add_argument("--worker-address", type=str, default="http://localhost:21002")
    parser.add_argument("--controller-address", type=str, default="http://localhost:21001")
    parser.add_argument("--model-path", type=str, default="GSAI-ML/LLaDA-8B-Instruct")
    parser.add_argument("--model-architecture", type=str, default="LLaDA")
    parser.add_argument("--adaptor-path", type=str, default=None)
    parser.add_argument(
        "--model-names",
        type=lambda s: s.split(","),
        help="Optional display comma separated names",
    )
    parser.add_argument(
        "--conv-template", type=str, default=None, help="Conversation prompt template."
    )
    parser.add_argument("--parameters", type=str, default="{}")
    parser.add_argument("--plugin_dir", type=str)

    args, unknown = parser.parse_known_args()

    try:
        parameters = json.loads(args.parameters)
        context_length = int(parameters.get("context_length", "2048"))
        # Get dllm-specific parameters
        steps = int(parameters.get("steps", 128))
        block_length = int(parameters.get("block_length", 32))
        temperature = float(parameters.get("temperature", 0.0))
        remasking = parameters.get("remasking", "low_confidence")
        cfg_scale = float(parameters.get("cfg_scale", 0.0))
    except Exception as e:
        print(f"Failed to parse parameters: {e}, using defaults")
        context_length = 2048
        steps = 128
        block_length = 32
        temperature = 0.0
        remasking = "low_confidence"
        cfg_scale = 0.0

    if args.model_path:
        args.model = args.model_path
    if args.adaptor_path is None or args.adaptor_path.strip() == "":
        args.adaptor_path = None

    worker = DLLMWorker(
        args.controller_address,
        args.worker_address,
        worker_id,
        args.model_path,
        args.model_names,
        args.model_architecture,
        1024,
        False,
        args.conv_template,
        args.adaptor_path,
        context_len=context_length,
        steps=steps,
        block_length=block_length,
        temperature=temperature,
        remasking=remasking,
        cfg_scale=cfg_scale,
    )

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
