"""
This is a copy of https://github.com/lm-sys/FastChat/blob/main/fastchat/serve/model_worker.py
Copied on Sept 6, 2024. We use the standard model worker from Fastchat but then
Add a few of our own endpoints
A model worker that executes the model.
"""

import argparse
import asyncio
import base64
import gc
import json
import os
import re
import traceback
import uuid

import numpy as np
import torch
import torch.nn.functional as F
import uvicorn
from fastapi import Request
from fastapi.responses import StreamingResponse
from fastchat.constants import SERVER_ERROR_MSG, ErrorCode
from fastchat.model.model_adapter import add_model_args, get_generate_stream_function, load_model
from fastchat.modules.awq import AWQConfig
from fastchat.modules.exllama import ExllamaConfig
from fastchat.modules.gptq import GptqConfig
from fastchat.modules.xfastertransformer import XftConfig
from fastchat.serve.model_worker import logger
from fastchat.utils import get_context_length, str_to_torch_dtype
from transformers import set_seed

worker_id = str(uuid.uuid4())[:8]

from fastchat.serve.base_model_worker import BaseModelWorker, app  # noqa


class ModelWorker(BaseModelWorker):
    def __init__(
        self,
        controller_addr: str,
        worker_addr: str,
        worker_id: str,
        model_path: str,
        model_names: list[str],
        limit_worker_concurrency: int,
        no_register: bool,
        device: str,
        num_gpus: int,
        max_gpu_memory: str,
        revision: str = None,
        dtype: torch.dtype | None = None,
        load_8bit: bool = False,
        load_4bit: bool = False,
        cpu_offloading: bool = False,
        gptq_config: GptqConfig | None = None,
        awq_config: AWQConfig | None = None,
        exllama_config: ExllamaConfig | None = None,
        xft_config: XftConfig | None = None,
        stream_interval: int = 2,
        conv_template: str | None = None,
        embed_in_truncate: bool = False,
        seed: int | None = None,
        debug: bool = False,
        **kwargs,
    ):
        super().__init__(
            controller_addr,
            worker_addr,
            worker_id,
            model_path,
            model_names,
            limit_worker_concurrency,
            conv_template=conv_template,
        )

        logger.info(f"Loading the model {self.model_names} on worker {worker_id} ...")
        self.model, self.tokenizer = load_model(
            model_path,
            revision=revision,
            device=device,
            num_gpus=num_gpus,
            max_gpu_memory=max_gpu_memory,
            dtype=dtype,
            load_8bit=load_8bit,
            load_4bit=load_4bit,
            cpu_offloading=cpu_offloading,
            gptq_config=gptq_config,
            awq_config=awq_config,
            exllama_config=exllama_config,
            xft_config=xft_config,
            debug=debug,
        )
        self.generate_stream_func = get_generate_stream_function(self.model, model_path)

        self.device = device
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.context_len = get_context_length(self.model.config)
        self.stream_interval = stream_interval
        self.embed_in_truncate = embed_in_truncate
        self.seed = seed

        if not no_register:
            self.init_heart_beat()

    def generate_stream_gate(self, params):
        # Process tools using HF chat_template approach
        params = self.process_tools_hf(params)

        if self.device == "npu":
            import torch_npu

            torch_npu.npu.set_device("npu:0")
        self.call_ct += 1

        try:
            if self.seed is not None:
                set_seed(self.seed)
            for output in self.generate_stream_func(
                self.model,
                self.tokenizer,
                params,
                self.device,
                self.context_len,
                self.stream_interval,
            ):
                ret = {
                    "text": output["text"],
                    "error_code": 0,
                }
                if "usage" in output:
                    ret["usage"] = output["usage"]
                if "finish_reason" in output:
                    ret["finish_reason"] = output["finish_reason"]
                if "logprobs" in output:
                    ret["logprobs"] = output["logprobs"]
                yield json.dumps(ret).encode() + b"\0"
        except torch.cuda.OutOfMemoryError as e:
            ret = {
                "text": f"{SERVER_ERROR_MSG}\n\n({e})",
                "error_code": ErrorCode.CUDA_OUT_OF_MEMORY,
            }
            yield json.dumps(ret).encode() + b"\0"
        except (ValueError, RuntimeError) as e:
            ret = {
                "text": f"{SERVER_ERROR_MSG}\n\n({e})",
                "error_code": ErrorCode.INTERNAL_ERROR,
            }
            yield json.dumps(ret).encode() + b"\0"

    def generate_gate(self, params):
        for x in self.generate_stream_gate(params):
            pass
        return json.loads(x[:-1].decode())

    def __process_embed_chunk(self, input_ids, attention_mask, **model_type_dict):
        if model_type_dict.get("is_bert"):
            model_output = self.model(input_ids)
            if model_type_dict.get("is_robert"):
                data = model_output.last_hidden_state
            else:
                data = model_output[0]
        elif model_type_dict.get("is_t5"):
            model_output = self.model(input_ids, decoder_input_ids=input_ids)
            data = model_output.encoder_last_hidden_state
        else:
            model_output = self.model(input_ids, output_hidden_states=True)
            if model_type_dict.get("is_chatglm"):
                data = model_output.hidden_states[-1].transpose(0, 1)
            else:
                data = model_output.hidden_states[-1]

        if hasattr(self.model, "use_cls_pooling") and self.model.use_cls_pooling:
            sum_embeddings = data[:, 0]
        else:
            mask = attention_mask.unsqueeze(-1).expand(data.size()).float()
            masked_embeddings = data * mask
            sum_embeddings = torch.sum(masked_embeddings, dim=1)
        token_num = torch.sum(attention_mask).item()

        return sum_embeddings, token_num

    def __encode_base64(self, embeddings: torch.Tensor) -> list[str]:
        embeddings = embeddings.cpu()
        return [base64.b64encode(e.numpy().tobytes()).decode("utf-8") for e in embeddings]

    @torch.inference_mode()
    def get_embeddings(self, params):
        self.call_ct += 1

        try:
            tokenizer = self.tokenizer
            ret = {"embedding": [], "token_num": 0}

            model_type_dict = {
                "is_llama": "llama" in str(type(self.model)),
                "is_t5": "t5" in str(type(self.model)),
                "is_chatglm": "chatglm" in str(type(self.model)),
                "is_bert": "bert" in str(type(self.model)),
                "is_robert": "robert" in str(type(self.model)),
            }

            if self.embed_in_truncate:
                encoding = tokenizer.batch_encode_plus(
                    params["input"],
                    padding=True,
                    truncation="longest_first",
                    return_tensors="pt",
                    max_length=self.context_len,
                )
            else:
                encoding = tokenizer.batch_encode_plus(
                    params["input"], padding=True, return_tensors="pt"
                )
            input_ids = encoding["input_ids"].to(self.device)
            attention_mask = input_ids != tokenizer.pad_token_id

            base64_encode = params.get("encoding_format", None)

            if self.embed_in_truncate:
                embedding, token_num = self.__process_embed_chunk(
                    input_ids, attention_mask, **model_type_dict
                )
                if not hasattr(self.model, "use_cls_pooling") or not self.model.use_cls_pooling:
                    embedding = embedding / token_num
                normalized_embeddings = F.normalize(embedding, p=2, dim=1)
                ret["token_num"] = token_num
            else:
                all_embeddings = []
                all_token_num = 0
                for i in range(0, input_ids.size(1), self.context_len):
                    chunk_input_ids = input_ids[:, i : i + self.context_len]
                    chunk_attention_mask = attention_mask[:, i : i + self.context_len]

                    # add cls token and mask to get cls embedding
                    if hasattr(self.model, "use_cls_pooling") and self.model.use_cls_pooling:
                        cls_tokens = (
                            torch.zeros(
                                (chunk_input_ids.size(0), 1),
                                dtype=chunk_input_ids.dtype,
                                device=chunk_input_ids.device,
                            )
                            + tokenizer.cls_token_id
                        )
                        chunk_input_ids = torch.cat([cls_tokens, chunk_input_ids], dim=-1)
                        mask = torch.ones(
                            (chunk_attention_mask.size(0), 1),
                            dtype=chunk_attention_mask.dtype,
                            device=chunk_attention_mask.device,
                        )
                        chunk_attention_mask = torch.cat([mask, chunk_attention_mask], dim=-1)

                    chunk_embeddings, token_num = self.__process_embed_chunk(
                        chunk_input_ids, chunk_attention_mask, **model_type_dict
                    )
                    if hasattr(self.model, "use_cls_pooling") and self.model.use_cls_pooling:
                        all_embeddings.append(chunk_embeddings * token_num)
                    else:
                        all_embeddings.append(chunk_embeddings)
                    all_token_num += token_num

                all_embeddings_tensor = torch.stack(all_embeddings)
                embedding = torch.sum(all_embeddings_tensor, dim=0) / all_token_num
                normalized_embeddings = F.normalize(embedding, p=2, dim=1)

                ret["token_num"] = all_token_num

            if base64_encode == "base64":
                out_embeddings = self.__encode_base64(normalized_embeddings)
            else:
                out_embeddings = normalized_embeddings.tolist()
            ret["embedding"] = out_embeddings

            gc.collect()
            torch.cuda.empty_cache()
            if self.device == "xpu":
                torch.xpu.empty_cache()
            if self.device == "npu":
                torch.npu.empty_cache()
        except torch.cuda.OutOfMemoryError as e:
            ret = {
                "text": f"{SERVER_ERROR_MSG}\n\n({e})",
                "error_code": ErrorCode.CUDA_OUT_OF_MEMORY,
            }
        except (ValueError, RuntimeError) as e:
            ret = {
                "text": f"{SERVER_ERROR_MSG}\n\n({e})",
                "error_code": ErrorCode.INTERNAL_ERROR,
            }
        return ret


def create_model_worker():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", type=str, default="localhost")
    parser.add_argument("--port", type=int, default=21002)
    parser.add_argument("--worker-address", type=str, default="http://localhost:21002")
    parser.add_argument("--controller-address", type=str, default="http://localhost:21001")
    add_model_args(parser)
    parser.add_argument(
        "--model-names",
        type=lambda s: s.split(","),
        help="Optional display comma separated names",
    )
    parser.add_argument(
        "--conv-template", type=str, default=None, help="Conversation prompt template."
    )
    parser.add_argument("--embed-in-truncate", action="store_true")
    parser.add_argument(
        "--limit-worker-concurrency",
        type=int,
        default=5,
        help="Limit the model concurrency to prevent OOM.",
    )
    parser.add_argument("--stream-interval", type=int, default=2)
    parser.add_argument("--no-register", action="store_true")
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Overwrite the random seed for each generation.",
    )
    parser.add_argument("--debug", type=bool, default=False, help="Print debugging messages")
    parser.add_argument(
        "--ssl",
        action="store_true",
        required=False,
        default=False,
        help="Enable SSL. Requires OS Environment variables 'SSL_KEYFILE' and 'SSL_CERTFILE'.",
    )
    args = parser.parse_args()
    logger.info(f"args: {args}")

    if args.gpus:
        if len(args.gpus.split(",")) < args.num_gpus:
            raise ValueError(f"Larger --num-gpus ({args.num_gpus}) than --gpus {args.gpus}!")
        os.environ["CUDA_VISIBLE_DEVICES"] = args.gpus

    gptq_config = GptqConfig(
        ckpt=args.gptq_ckpt or args.model_path,
        wbits=args.gptq_wbits,
        groupsize=args.gptq_groupsize,
        act_order=args.gptq_act_order,
    )
    awq_config = AWQConfig(
        ckpt=args.awq_ckpt or args.model_path,
        wbits=args.awq_wbits,
        groupsize=args.awq_groupsize,
    )
    if args.enable_exllama:
        exllama_config = ExllamaConfig(
            max_seq_len=args.exllama_max_seq_len,
            gpu_split=args.exllama_gpu_split,
            cache_8bit=args.exllama_cache_8bit,
        )
    else:
        exllama_config = None
    if args.enable_xft:
        xft_config = XftConfig(
            max_seq_len=args.xft_max_seq_len,
            data_type=args.xft_dtype,
        )
        if args.device != "cpu":
            print("xFasterTransformer now is only support CPUs. Reset device to CPU")
            args.device = "cpu"
    else:
        xft_config = None

    worker = ModelWorker(
        args.controller_address,
        args.worker_address,
        worker_id,
        args.model_path,
        args.model_names,
        args.limit_worker_concurrency,
        revision=args.revision,
        no_register=args.no_register,
        device=args.device,
        num_gpus=args.num_gpus,
        max_gpu_memory=args.max_gpu_memory,
        dtype=str_to_torch_dtype(args.dtype),
        load_8bit=args.load_8bit,
        load_4bit=args.load_4bit,
        cpu_offloading=args.cpu_offloading,
        gptq_config=gptq_config,
        awq_config=awq_config,
        exllama_config=exllama_config,
        xft_config=xft_config,
        stream_interval=args.stream_interval,
        conv_template=args.conv_template,
        embed_in_truncate=args.embed_in_truncate,
        seed=args.seed,
        debug=args.debug,
    )
    return args, worker


@app.get("/supports_activation_visualization")
async def check_visualization_available():
    """Check if this worker supports visualization"""
    return {"available": True}


@app.post("/worker_generate_activation_visualization")
async def api_generate_with_visualization(request: Request):
    """Generate text with visualization data about activations and attention entropy"""
    params = await request.json()

    async def generate():
        try:
            prompt = params["prompt"]
            temperature = float(params.get("temperature", 0.7))
            top_p = float(params.get("top_p", 1.0))
            min_p = float(params.get("min_p", 0.0))  # Add min_p parameter
            max_tokens = int(params.get("max_tokens", 100))
            stream = params.get("stream", False)

            # Prepare for generation
            inputs = worker.tokenizer(prompt, return_tensors="pt").to(worker.device)
            input_ids = inputs["input_ids"].tolist()[0]
            generated_ids = input_ids.copy()

            if not stream:
                # Non-streaming mode not implemented yet
                error_response = {
                    "text": "Non-streaming mode is not implemented yet.",
                    "error_code": ErrorCode.INTERNAL_ERROR,
                }
                yield json.dumps(error_response).encode() + b"\0"
                return

            # Streaming mode - yield visualization data for each token
            for i in range(max_tokens):
                # if len(generated_ids) > worker.context_len:
                #     generated_ids = generated_ids[-worker.context_len:]
                with torch.no_grad():
                    # Get model outputs with hidden states and attention
                    outputs = worker.model(
                        torch.tensor([generated_ids], device=worker.device),
                        output_hidden_states=True,
                        output_attentions=True,
                    )

                    logits = outputs.logits
                    hidden_states = outputs.hidden_states
                    attentions = outputs.attentions

                    # Check if all logits are nan's then convert model to fp32
                    if torch.isnan(logits).all():
                        print("All logits are NaN, converting model to bf16")
                        worker.model = worker.model.to(torch.bfloat16)
                        try:
                            with torch.no_grad():
                                outputs = worker.model(
                                    torch.tensor([generated_ids], device=worker.device),
                                    output_hidden_states=True,
                                    output_attentions=True,
                                )
                            logits = outputs.logits
                            hidden_states = outputs.hidden_states
                            attentions = outputs.attentions

                            if torch.isnan(logits).all():
                                print(
                                    "All logits are still NaN after conversion, stopping generation here"
                                )
                                break

                        except Exception as e:
                            print("Error converting model to fp32 and predicting text:", e)
                            break

                    # Get next token probabilities
                    next_token_logits = logits[:, -1, :]
                    if temperature > 0:
                        next_token_logits = next_token_logits / temperature

                    # Apply top_p sampling
                    if top_p < 1.0:
                        sorted_logits, sorted_indices = torch.sort(
                            next_token_logits, descending=True
                        )
                        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
                        sorted_indices_to_remove = cumulative_probs > top_p
                        sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[
                            ..., :-1
                        ].clone()
                        sorted_indices_to_remove[..., 0] = 0
                        indices_to_remove = sorted_indices[sorted_indices_to_remove]
                        next_token_logits[0, indices_to_remove] = -float("Inf")

                    # Apply min_p sampling (remove tokens with prob < min_p)
                    if min_p > 0.0:
                        probs = F.softmax(next_token_logits, dim=-1)
                        low_prob_indices = (probs < min_p).nonzero(as_tuple=True)
                        next_token_logits[low_prob_indices] = -float("Inf")

                    # Sample next token
                    next_token_probs = F.softmax(next_token_logits, dim=-1)
                    next_token_id = torch.multinomial(next_token_probs, num_samples=1).item()
                    generated_ids.append(next_token_id)

                    # Process top predictions
                    top_probs, top_ids = torch.topk(next_token_probs, 5)
                    top_predictions = [
                        {
                            "token": worker.tokenizer.decode([token_id.item()]),
                            "prob": prob.item(),
                            "logit": logits[0, -1, token_id.item()].item(),
                        }
                        for token_id, prob in zip(top_ids[0], top_probs[0])
                    ]

                    # Process MLP activations only if hidden_states are available
                    if hidden_states is not None:
                        mlp_activations = process_mlp_activations(hidden_states)
                    else:
                        # Create dummy MLP activation data (zeros) when hidden_states are not available
                        # This can happen with certain model configurations or optimized implementations
                        # Default to a reasonable number of layers (e.g., 32 for most transformer models)
                        num_layers = 32
                        mlp_activations = np.zeros(num_layers)

                    # Process attention entropy only if attentions are available
                    if attentions is not None:
                        attention_entropy = compute_attention_entropy(attentions)
                    else:
                        # Create dummy attention entropy data (zeros) when attentions are not available
                        # This can happen with SDPA attention implementation or other optimized attention variants
                        num_layers = len(hidden_states) if hidden_states else 32
                        attention_entropy = np.zeros(num_layers)

                    # Get generated text so far
                    generated_text = worker.tokenizer.decode(
                        generated_ids, skip_special_tokens=True, clean_up_tokenization_spaces=True
                    )

                    # Create response data
                    response = {
                        "text": generated_text,
                        "token_id": next_token_id,
                        "mlp_activations": mlp_activations.tolist(),
                        "attention_entropy": attention_entropy.tolist(),
                        "top_predictions": top_predictions,
                        "error_code": 0,
                    }

                    # Check for stop condition (e.g., EOS token)
                    if next_token_id == worker.tokenizer.eos_token_id:
                        response["finish_reason"] = "stop"
                        print("EOS token reached, stopping generation.")
                        yield json.dumps(response).encode() + b"\0"
                        break

                    yield json.dumps(response).encode() + b"\0"
                    # Small delay to avoid overwhelming the client
                    await asyncio.sleep(0)

        except torch.cuda.OutOfMemoryError as e:
            print("CUDA out of memory error:", e)
            error_response = {
                "text": "CUDA out of memory",
                "error_code": ErrorCode.CUDA_OUT_OF_MEMORY,
            }
            yield json.dumps(error_response).encode() + b"\0"

        except Exception as e:
            print("Error during visualization:", e)
            traceback.print_exc()
            error_response = {
                "text": "Error during visualization",
                "error_code": ErrorCode.INTERNAL_ERROR,
            }
            yield json.dumps(error_response).encode() + b"\0"

    # Return a StreamingResponse that uses our generator
    return StreamingResponse(generate(), media_type="application/json-seq")


def process_mlp_activations(hidden_states):
    """Process MLP (Feedforward) layer activations"""
    if hidden_states is None:
        return np.array([])

    # Stack all layer hidden states for the last token
    activations = torch.stack([layer[:, -1, :] for layer in hidden_states])
    # Add support for bfloat16
    if activations.dtype == torch.bfloat16:
        activations = activations.float()
    # Use L2 norm as the aggregation method
    return torch.linalg.vector_norm(activations, ord=2, dim=-1).cpu().numpy()


def compute_attention_entropy(attentions):
    """Compute entropy of attention distributions per layer"""
    if attentions is None:
        return np.array([])

    entropy_values = []

    for attn_layer in attentions:
        # Get attention for the last token
        attn = attn_layer[:, :, -1, :]
        # Compute entropy: -sum(p * log(p))
        entropy = -torch.sum(attn * torch.log(attn + 1e-9), dim=-1)
        # Add support for bfloat16
        if entropy.dtype == torch.bfloat16:
            entropy = entropy.float()
        # Average over attention heads
        layer_entropy = entropy.mean(dim=-1).cpu().numpy()
        entropy_values.append(layer_entropy.item())

    # Replace nans with 0.0
    final_np_array = np.array(entropy_values)
    final_np_array[np.isnan(final_np_array)] = 0.0

    return final_np_array


@app.get("/supports_architecture_visualization")
async def check_architecture_available():
    """Check if this worker supports model architecture visualization"""
    return {"available": True}


@app.post("/worker_generate_layers_visualization")
async def api_generate_layers_visualization(request: Request):
    """Generate model architecture visualization data"""
    try:
        params = await request.json()
        # Inspired from https://github.com/attentionmech/trunk

        def clean_layer_name(layer_name):
            return re.sub(r"\.\d+\.", ".", layer_name)

        # Use the already loaded model
        model = worker.model
        state_dict = model.state_dict()
        cube_list = []
        # unique_layers = sorted(set(clean_layer_name(layer) for layer in state_dict.keys()))

        # Calculate size range for visualization
        max_param_size = max(v.numel() for v in state_dict.values())
        min_param_size = min(v.numel() for v in state_dict.values())
        min_size = 0.5
        max_size = 2.0

        for layer, params in state_dict.items():
            param_size = params.numel()
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
            # Uncomment to remove the duplicate named layers
            # if clean_name in unique_layers:
            #     unique_layers.remove(clean_name)
            # else:
            #     continue
            cube_list.append(
                {
                    "name": clean_name,
                    "original_name": layer,
                    "size": size,
                    "param_count": param_size,
                    "shape": str(tuple(params.shape)),
                }
            )

        return {"layers": cube_list, "error_code": 0}

    except Exception as e:
        import traceback

        traceback.print_exc()
        return {"error": str(e), "error_code": ErrorCode.INTERNAL_ERROR}


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
        model = worker.model

        # Get model parameters
        all_params = model.state_dict()

        weights_tensor = all_params[layer_name]
        weights = weights_tensor.detach().cpu().numpy()

        weights = weights[np.isfinite(weights)]  # Drop NaNs/Infs

        # First try computing std in-place
        std_dev = np.std(weights)
        if not np.isfinite(std_dev):
            # Fallback to float32 if std is broken
            std_dev = np.std(weights.astype(np.float32))

        mean = np.mean(weights)

        # Create a histogram with 50 bins
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


@app.post("/tokenize")
async def api_tokenize(request: Request):
    params = await request.json()
    text = params["text"]
    token_ids = worker.tokenizer(text).input_ids
    tokens = worker.tokenizer.convert_ids_to_tokens(token_ids)
    return {"tokens": tokens, "token_ids": token_ids}


if __name__ == "__main__":
    args, worker = create_model_worker()
    if args.ssl:
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
            ssl_keyfile=os.environ["SSL_KEYFILE"],
            ssl_certfile=os.environ["SSL_CERTFILE"],
        )
    else:
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
