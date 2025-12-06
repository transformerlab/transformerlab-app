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
import math
import os
import re
import traceback
import uuid
from collections import namedtuple
from contextlib import asynccontextmanager
from typing import Any

import mlx.core as mx
import numpy as np
import uvicorn
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, StreamingResponse
from fastchat.serve.model_worker import logger
from fastchat.utils import get_context_length
from huggingface_hub import snapshot_download
from mlx_embedding_models.embedding import EmbeddingModel
from mlx_lm import load
from mlx_lm.generate import generate_step
from mlx_lm.sample_utils import make_logits_processors, make_sampler

worker_id = str(uuid.uuid4())[:8]

from fastchat.serve.base_model_worker import BaseModelWorker  # noqa


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
        model_architecture: str,
        limit_worker_concurrency: int,
        no_register: bool,
        conv_template: str,
        adaptor_path: str = None,
        context_len: int = 2048,
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
        logger.info(f"Model architecture: {model_architecture}")

        self.model_name = model_path
        # Recommended MLX hack for Qwen models to specify EOS token
        if "qwen" in model_architecture.lower():
            self.mlx_model, self.mlx_tokenizer = load(
                model_path,
                adapter_path=adaptor_path,
                tokenizer_config={"eos_token": "<|endoftext|>", "trust_remote_code": True},
            )
        else:
            self.mlx_model, self.mlx_tokenizer = load(model_path, adapter_path=adaptor_path)

        self.tokenizer = self.mlx_tokenizer._tokenizer
        self.manual_context_len = context_len

        config = get_hugggingface_config(model_path)

        # The following is a hack to fix errors loading Phi-3 128k -- we hardcode an expected value for factor in rope_scaling otherwise fastchat will fail
        rope_scaling = getattr(config, "rope_scaling", None)
        if rope_scaling:
            if "factor" not in rope_scaling:
                config.rope_scaling["factor"] = 1

        try:
            self.context_len = get_context_length(config, default=self.manual_context_len)
        except Exception:
            self.context_len = self.manual_context_len

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
        top_k = int(params.get("top_k", 10))
        min_p = float(params.get("min_p", 0.0))  # Add min_p parameter
        # presence_penalty = float(params.get("presence_penalty", 0.0))
        frequency_penalty = float(params.get("frequency_penalty", 0.0))
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

        tokens = []
        # skip = 0

        context_mlx = mx.array(self.tokenizer.encode(context))

        finish_reason = "length"

        # MLX makes you build a sampler to set temperature, top_p, and min_p
        sampler = make_sampler(temperature, top_p=top_p, min_p=min_p)

        logits_processors = make_logits_processors(repetition_penalty=frequency_penalty)

        iterator = await run_in_threadpool(
            generate_step,
            context_mlx,
            self.mlx_model,
            max_tokens=max_new_tokens,
            sampler=sampler,
            logits_processors=logits_processors,
        )

        cummulative_logprobs = []

        for i in range(max_new_tokens):
            try:
                (token, logprobs) = await run_in_threadpool(next, iterator)

            except RuntimeError as e:
                # If the error throws an exception (e.g. StopIteration)
                # Let's print it out and then stop streaming
                print(e)
                print(traceback.format_exc())
                finish_reason = "stop"
                break

            if token == self.tokenizer.eos_token_id:
                finish_reason = "stop"
                break

            # define an object with parameters token and lobprobs:
            response = namedtuple("response", ["token", "logprobs"])
            response.token = token
            response.logprobs = logprobs

            if include_logprobs:
                logprobs = self._process_logprobs(self.tokenizer, response, top_k)
                # print("logprobs: ", logprobs)
                cummulative_logprobs.append(logprobs)
            else:
                logprobs = None

            tokens.append(token)
            tokens_decoded = self.tokenizer.decode(tokens)
            # last_token_decoded = self.mlx_tokenizer.decode([token])
            # skip = len(tokens_decoded)

            # Check if the generated text contains any of the stop strings:
            partial_stop = False

            for s in stop:
                if s in tokens_decoded:
                    partial_stop = True
                    break

            if partial_stop:
                finish_reason = "stop"
                break

            ret = {
                "text": tokens_decoded,
                "error_code": 0,
                "usage": {
                    "prompt_tokens": len(context),
                    "completion_tokens": len(tokens),
                    "total_tokens": len(context) + len(tokens),
                },
                "logprobs": logprobs,
                "finish_reason": None,  # hard code for now
            }
            # print(ret)
            yield (json.dumps(ret) + "\0").encode()
        ret = {
            "text": self.tokenizer.decode(tokens),
            "error_code": 0,
            "usage": {},
            "logprobs": cummulative_logprobs,
            "finish_reason": finish_reason,
        }
        yield (json.dumps(obj={**ret, **{"finish_reason": None}}) + "\0").encode()
        yield (json.dumps(ret) + "\0").encode()

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


@app.get("/supports_activation_visualization")
async def check_visualization_available():
    """Check if this worker supports visualization"""
    return {"available": True}


@app.post("/worker_generate_activation_visualization")
async def api_generate_with_visualization(request: Request):
    """Generate text with visualization data about activations and attention entropy"""
    params = await request.json()
    await acquire_worker_semaphore()
    request_id = uuid.uuid4()
    params["request_id"] = str(request_id)

    async def generate():
        try:
            # Extract parameters
            prompt = params.get("prompt")
            temperature = float(params.get("temperature", 0.7))
            top_p = float(params.get("top_p", 1.0))
            min_p = float(params.get("min_p", 0.0))  # Expose min_p
            max_new_tokens = int(params.get("max_tokens", 100))
            top_k = int(params.get("top_k", 10))
            frequency_penalty = float(params.get("frequency_penalty", 0.0))

            # Encode the prompt
            context_mlx = mx.array(worker.tokenizer.encode(prompt))
            input_tokens = worker.tokenizer.encode(prompt)

            # Create sampler with specified parameters
            sampler = make_sampler(temperature, top_p=top_p, min_p=min_p)

            logits_processors = make_logits_processors(repetition_penalty=frequency_penalty)

            # Initialize token generation
            iterator = await run_in_threadpool(
                generate_step,
                context_mlx,
                worker.mlx_model,
                max_tokens=max_new_tokens,
                sampler=sampler,
                logits_processors=logits_processors,
            )

            tokens = []

            # Generate tokens one by one with visualization data
            for i in range(max_new_tokens):
                try:
                    (token, logprobs) = await run_in_threadpool(next, iterator)
                except RuntimeError as e:
                    print(f"Generation stopped: {e}")
                    print(traceback.format_exc())
                    break

                if token == worker.tokenizer.eos_token_id:
                    break

                tokens.append(token)
                tokens_decoded = worker.tokenizer.decode(tokens)

                # Get top predictions
                top_indices = mx.argpartition(-logprobs, kth=top_k - 1)[:top_k]
                top_probs = mx.softmax(logprobs)[top_indices]

                # Sort the top indices by probability
                sorted_indices = mx.argsort(-top_probs)
                top_sorted_indices = top_indices[sorted_indices]
                top_sorted_probs = top_probs[sorted_indices]

                # Create top predictions data
                top_predictions = []
                for idx, prob in zip(top_sorted_indices.tolist(), top_sorted_probs.tolist()):
                    token_text = worker.tokenizer.decode([idx])
                    top_predictions.append(
                        {"token": token_text, "prob": prob, "logit": logprobs[idx].item()}
                    )

                # Generate MLP activations
                # Since MLX doesn't directly expose layer activations like PyTorch,
                # we'll compute synthetic values based on the model architecture
                num_layers = len(worker.mlx_model.model.layers)
                mlp_activations = generate_mlp_activations(
                    worker.mlx_model, input_tokens + tokens, num_layers
                )

                # Calculate attention entropy
                attention_entropy = calculate_attention_entropy(
                    worker.mlx_model, input_tokens + tokens, num_layers
                )

                # Create response with all visualization data
                response = {
                    "text": tokens_decoded,
                    "token_id": token,
                    "mlp_activations": mlp_activations,
                    "attention_entropy": attention_entropy,
                    "top_predictions": top_predictions,
                    "error_code": 0,
                }

                yield (json.dumps(response) + "\0").encode()

                # Small delay to avoid overwhelming the client
                await asyncio.sleep(0)

        except Exception as e:
            print("Error during visualization:", e)
            print(traceback.format_exc())
            error_response = {
                "text": "Error during visualization",
                "error_code": 1,
            }
            yield (json.dumps(error_response) + "\0").encode()
        finally:
            release_worker_semaphore()

    background_tasks = create_background_tasks(request_id)
    return StreamingResponse(generate(), background=background_tasks)


@app.get("/supports_architecture_visualization")
async def check_architecture_available():
    """Check if this worker supports model architecture visualization"""
    return {"available": True}


# Recursive function to traverse the parameter structure
def collect_parameters(obj, prefix=""):
    result = []

    if isinstance(obj, dict):
        for key, value in obj.items():
            new_prefix = f"{prefix}.{key}" if prefix else key
            result.extend(collect_parameters(value, new_prefix))
    elif isinstance(obj, list):
        for i, value in enumerate(obj):
            new_prefix = f"{prefix}.{i}" if prefix else str(i)
            result.extend(collect_parameters(value, new_prefix))
    elif hasattr(obj, "__dict__") and not isinstance(obj, mx.array):
        # Handle objects with attributes
        for key, value in obj.__dict__.items():
            if not key.startswith("_"):  # Skip private attributes
                new_prefix = f"{prefix}.{key}" if prefix else key
                result.extend(collect_parameters(value, new_prefix))
    elif isinstance(obj, mx.array):
        # Found a leaf MLX array
        result.append((prefix, obj))

    return result


@app.post("/worker_generate_layers_visualization")
async def api_generate_layers_visualization(request: Request):
    """Generate model architecture visualization data"""
    try:
        params = await request.json()

        def clean_layer_name(layer_name):
            return re.sub(r"\.\d+\.", ".", layer_name)

        # Use the already loaded model
        model = worker.mlx_model.model
        cube_list = []

        # Get model parameters
        all_params = []
        for name, param in model.parameters().items():
            params_from_path = collect_parameters(param, name)
            all_params.extend(params_from_path)
        if len(all_params) == 0:
            raise ValueError("No parameters found in the model.")

        all_params = dict(all_params)

        # Calculate size range for visualization
        max_param_size = max(np.prod(p.shape) for p in all_params.values())
        min_param_size = min(np.prod(p.shape) for p in all_params.values())
        min_size = 0.5
        max_size = 2.0

        for layer, params in all_params.items():
            param_size = np.prod(params.shape)
            # Log scale for better visualization
            size = float(
                min_size
                + (
                    (np.log(param_size) - np.log(min_param_size))
                    / (np.log(max_param_size) - np.log(min_param_size))
                )
                * (max_size - min_size)
            )
            clean_name = clean_layer_name(layer)
            cube_list.append(
                {
                    "name": clean_name,
                    "original_name": layer,
                    "size": size,
                    "param_count": int(param_size),
                    "shape": str(params.shape),
                }
            )

        return {"layers": cube_list, "error_code": 0}

    except Exception as e:
        logger.error(f"Error generating architecture visualization: {e}")
        logger.error(traceback.format_exc())
        return {"error": "An internal error has occurred.", "error_code": 1}


@app.post("/worker_get_layer_details")
async def get_distribution_of_weights_for_specific_layer(request: Request):
    """
    Get the distribution of weights for a specific layer in the model.
    """
    params = await request.json()
    layer_name = params.get("layer_name", None)

    try:
        if not layer_name:
            return {"error": "Layer name is required.", "error_code": 1}

        # Use the already loaded model
        model = worker.mlx_model.model

        # Get model parameters
        all_params = []
        for name, param in model.parameters().items():
            params_from_path = collect_parameters(param, name)
            all_params.extend(params_from_path)
        if len(all_params) == 0:
            raise ValueError("No parameters found in the model.")

        all_params = dict(all_params)

        # Get the weights for the specified layer
        weights_numpy = all_params[layer_name]
        weights = np.array(weights_numpy.astype(mx.float32), copy=False)

        # Calculate distribution statistics
        mean = np.mean(weights)
        std_dev = np.std(weights)

        # for the actual distribution, create a set of bins:
        # histogram, and get the counts
        hist, bin_edges = np.histogram(weights, bins=50)

        return {
            "layer_name": layer_name,
            "mean": float(mean),
            "std_dev": float(std_dev),
            "histogram": hist.tolist(),
            "bin_edges": bin_edges.tolist(),
        }

    except Exception as e:
        logger.error(f"Error getting distribution of weights: {e}")
        logger.error(traceback.format_exc())
        return {"error": "An internal error has occurred.", "error_code": 1}


def generate_mlp_activations(model, tokens, num_layers):
    """
    Extract MLP activations from the MLX model by accessing internal states.
    """
    try:
        # Convert tokens to MLX array
        inputs = mx.array([tokens])
        activations = []

        # Get the initial embeddings
        if hasattr(model.model, "embed_tokens"):
            hidden_states = model.model.embed_tokens(inputs)
        elif hasattr(model.model, "wte"):
            hidden_states = model.model.wte(inputs)
        else:
            print("Couldn't find embedding layer, using zeros")
            return [0.0] * num_layers

        # First, run a full forward pass to get all layer outputs
        current_hidden = hidden_states
        layer_outputs = []

        # Collect layer outputs in the first pass
        for layer_idx in range(num_layers):
            try:
                # Store current hidden state
                layer_outputs.append(current_hidden)

                # Process through layer
                layer = model.model.layers[layer_idx]
                current_hidden = layer(current_hidden)

            except Exception as e:
                print(f"Error in forward pass for layer {layer_idx}: {e}")
                # If we can't process this layer, duplicate the previous one
                if layer_outputs:
                    layer_outputs.append(layer_outputs[-1])
                else:
                    layer_outputs.append(hidden_states)

        # Now extract MLP activations from each layer
        for layer_idx in range(num_layers):
            try:
                # Get the layer and its MLP module
                layer = model.model.layers[layer_idx]

                # Find MLP module - different models use different names
                if hasattr(layer, "mlp"):
                    mlp = layer.mlp
                elif hasattr(layer, "ffn"):
                    mlp = layer.ffn
                else:
                    print(f"Couldn't find MLP module for layer {layer_idx}")
                    activations.append([0.0])
                    continue

                # Get the hidden states for this layer
                layer_hidden = layer_outputs[layer_idx]

                # Focus on the last token's activation
                last_hidden = layer_hidden[:, -1:, :]
                activation_value = 0.0

                # Llama-style MLP with gate_proj and up_proj (SwiGLU)
                if hasattr(mlp, "gate_proj") and hasattr(mlp, "up_proj"):
                    gate_output = mlp.gate_proj(last_hidden)
                    up_output = mlp.up_proj(last_hidden)

                    # SwiGLU activation
                    intermediate = mx.multiply(gate_output, swish(up_output))
                    activation_value = float(mx.linalg.norm(intermediate).item())

                # GPT-style MLP with c_fc and c_proj
                elif hasattr(mlp, "c_fc") and hasattr(mlp, "c_proj"):
                    intermediate = mlp.c_fc(last_hidden)
                    activation_value = float(mx.linalg.norm(intermediate).item())

                # Generic MLP with fc1/fc2 or w1/w2
                else:
                    for attr_name in ["fc1", "w1", "linear1", "dense_h_to_4h"]:
                        if hasattr(mlp, attr_name):
                            intermediate = getattr(mlp, attr_name)(last_hidden)
                            activation_value = float(mx.linalg.norm(intermediate).item())
                            break

                activations.append([activation_value])

            except Exception as e:
                print(f"Error calculating MLP activation for layer {layer_idx}: {e}")
                print(traceback.format_exc())
                activations.append([0.0])

        # # Filter out any NaN values
        # activations = np.array(activations)
        # activations = np.nan_to_num(activations, nan=0.0)
        return activations

    except Exception as e:
        print(f"Error accessing model internals for MLP activations: {e}")
        print(traceback.format_exc())
        return [0.0] * num_layers


def swish(x):
    return x * mx.sigmoid(x)


def calculate_attention_entropy(model, tokens, num_layers):
    """
    Calculate attention entropy from the MLX model by accessing internal states.
    """
    try:
        entropy_values = []
        inputs = mx.array([tokens])

        # Get the initial embeddings
        if hasattr(model.model, "embed_tokens"):
            hidden_states = model.model.embed_tokens(inputs)
        elif hasattr(model.model, "wte"):
            hidden_states = model.model.wte(inputs)
        else:
            print("Couldn't find embedding layer, using zeros")
            return [0.0] * num_layers

        # Process through each layer, updating hidden states as we go
        current_hidden = hidden_states  # Start with embeddings

        # First, run the full model forward pass and store all layer outputs
        layer_outputs = []

        for layer_idx in range(num_layers):
            try:
                # Process through layer
                layer = model.model.layers[layer_idx]

                # Store the current hidden state for attention calculation
                layer_outputs.append(current_hidden)

                # Update hidden states for next layer - full forward pass
                # This captures the residual connections and full layer processing
                current_hidden = layer(current_hidden)

            except Exception as e:
                print(f"Error in forward pass for layer {layer_idx}: {e}")
                # If we can't process this layer, duplicate the previous one
                if layer_outputs:
                    layer_outputs.append(layer_outputs[-1])
                else:
                    layer_outputs.append(hidden_states)

        # Now calculate entropy for each layer using the proper hidden states
        for layer_idx in range(num_layers):
            try:
                # Get the layer and its attention module
                layer = model.model.layers[layer_idx]

                if hasattr(layer, "self_attn"):
                    attn = layer.self_attn
                elif hasattr(layer, "attention"):
                    attn = layer.attention
                else:
                    print(f"Couldn't find attention module for layer {layer_idx}")
                    entropy_values.append(0.0)
                    continue

                # Get the hidden states for this layer
                layer_hidden = layer_outputs[layer_idx]

                # Calculate attention patterns using layer's Q and K projections
                if hasattr(attn, "q_proj") and hasattr(attn, "k_proj"):
                    q = attn.q_proj(layer_hidden)
                    k = attn.k_proj(layer_hidden)

                    # Get dimensions and reshape
                    B, L, D = layer_hidden.shape
                    n_heads = attn.n_heads if hasattr(attn, "n_heads") else attn.num_attention_heads
                    n_kv_heads = attn.n_kv_heads if hasattr(attn, "n_kv_heads") else n_heads
                    head_dim = D // n_heads

                    # Reshape queries and keys
                    queries = q.reshape(B, L, n_heads, -1).transpose(0, 2, 1, 3)
                    keys = k.reshape(B, L, n_kv_heads, -1).transpose(0, 2, 1, 3)

                    # Handle MQA/GQA
                    if n_heads != n_kv_heads:
                        repeats = n_heads // n_kv_heads
                        keys = mx.repeat(keys, repeats, axis=1)

                    # Get scale factor and calculate scores
                    scale = attn.scale if hasattr(attn, "scale") else head_dim**-0.5
                    scores = mx.matmul(queries[:, :, -1:, :], keys.transpose(0, 1, 3, 2))
                    scores = scores * scale

                    # Calculate entropy
                    probs = mx.softmax(scores, axis=-1)
                    safe_probs = mx.clip(probs, 1e-10, 1.0)  # Ensures probs stay in a stable range
                    head_entropies = -mx.sum(safe_probs * mx.log(safe_probs), axis=-1)
                    mean_entropy = mx.mean(head_entropies).item()
                    if math.isnan(mean_entropy):
                        mean_entropy = 0.0
                        print(f"NaN entropy for layer {layer_idx}")
                    # Append the mean entropy for this layer
                    entropy_values.append(float(mean_entropy))
                else:
                    print(f"Couldn't find projection layers for layer {layer_idx}")
                    entropy_values.append(0.0)

            except Exception as e:
                print(f"Error calculating entropy for layer {layer_idx}: {e}")
                print(traceback.format_exc())
                entropy_values.append(0.0)

        entropy_values = np.array(entropy_values)
        # Filter out NaN values
        entropy_values = np.nan_to_num(entropy_values, nan=0.0)
        # Convert back to list
        entropy_values = entropy_values.tolist()
        return entropy_values

    except Exception as e:
        print(f"Error in attention entropy calculation: {e}")
        print(traceback.format_exc())
        return [0.0] * num_layers


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
    parser.add_argument("--model-architecture", type=str, default="MLX")
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
    parser.add_argument("--parameters", type=str, default="{}")
    parser.add_argument("--plugin_dir", type=str)

    args, unknown = parser.parse_known_args()

    try:
        parameters = json.loads(args.parameters)
        context_length = int(parameters.get("context_length", "2048"))
    except Exception:
        context_length = 2048

    if args.model_path:
        args.model = args.model_path
    if args.adaptor_path is None or args.adaptor_path.strip() == "":
        args.adaptor_path = None

    worker = MLXWorker(
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
    )
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
