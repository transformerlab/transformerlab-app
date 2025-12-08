# Adapted from: https://github.com/huggingface/nanotron/blob/main/examples/llama/convert_weights.py
import json
from pathlib import Path

import nanotron
import torch
from nanotron.config import LlamaConfig as NanotronLlamaConfig
from nanotron.models.llama import LlamaForTraining
from nanotron.trainer import mark_tied_parameters


def get_weight_mapping(config: NanotronLlamaConfig, nt_to_hf: bool = True) -> dict[str, str]:
    """Returns the nanotron to huggingface parameter mapping if `nt_to_hf`, otherwise the
    huggingface to nanotron mapping."""

    hf_to_nt_map = {}
    hf_to_nt_map["lm_head.weight"] = "model.lm_head.pp_block.weight"
    hf_to_nt_map["model.embed_tokens.weight"] = (
        "model.token_position_embeddings.pp_block.token_embedding.weight"
    )
    hf_to_nt_map["model.norm.weight"] = "model.final_layer_norm.pp_block.weight"
    hf_to_nt_map["model.embed_tokens.weight"] = (
        "model.token_position_embeddings.pp_block.token_embedding.weight"
    )

    for i in range(config.num_hidden_layers):
        hf_prefix = f"model.layers.{i}"
        nt_prefix = f"model.decoder.{i}.pp_block"
        hf_to_nt_map[f"{hf_prefix}.self_attn.q_proj.weight"] = f"{nt_prefix}.attn.qkv_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.self_attn.k_proj.weight"] = f"{nt_prefix}.attn.qkv_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.self_attn.v_proj.weight"] = f"{nt_prefix}.attn.qkv_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.self_attn.o_proj.weight"] = f"{nt_prefix}.attn.o_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.mlp.gate_proj.weight"] = f"{nt_prefix}.mlp.gate_up_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.mlp.gate_proj.bias"] = f"{nt_prefix}.mlp.gate_up_proj.bias"
        hf_to_nt_map[f"{hf_prefix}.mlp.up_proj.weight"] = f"{nt_prefix}.mlp.gate_up_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.mlp.up_proj.bias"] = f"{nt_prefix}.mlp.gate_up_proj.bias"
        hf_to_nt_map[f"{hf_prefix}.mlp.down_proj.weight"] = f"{nt_prefix}.mlp.down_proj.weight"
        hf_to_nt_map[f"{hf_prefix}.mlp.down_proj.bias"] = f"{nt_prefix}.mlp.down_proj.bias"
        hf_to_nt_map[f"{hf_prefix}.input_layernorm.weight"] = f"{nt_prefix}.input_layernorm.weight"
        hf_to_nt_map[f"{hf_prefix}.post_attention_layernorm.weight"] = (
            f"{nt_prefix}.post_attention_layernorm.weight"
        )

    if nt_to_hf:
        nt_to_hf_map = {}
        for hf, nt in hf_to_nt_map.items():
            # Because the qkv and gate_up projections are separated in the
            # huggingface format, when we return nanotron to huggingface
            # we will need to return a list of parameters instead (e.g.
            # the `qkv_proj` will point to a list `[q_proj, k_proj, v_proj]`).
            if nt in nt_to_hf_map and isinstance(nt_to_hf_map[nt], list):
                nt_to_hf_map[nt].append(hf)
            elif nt in nt_to_hf_map:
                nt_to_hf_map[nt] = [nt_to_hf_map[nt], hf]
            else:
                nt_to_hf_map[nt] = hf
        return nt_to_hf_map
    return hf_to_nt_map


def get_config_mapping(nt_to_hf: bool = True) -> dict[str, str]:
    """Returns either the nanotron to huggingface (if `nt_to_hf`)
    configuration mapping, or the huggingface to nanotron."""

    hf_to_nt_map = {
        "bos_token_id": "bos_token_id",
        "eos_token_id": "eos_token_id",
        "hidden_act": "hidden_act",
        "hidden_size": "hidden_size",
        "initializer_range": "initializer_range",
        "intermediate_size": "intermediate_size",
        "max_position_embeddings": "max_position_embeddings",
        "num_attention_heads": "num_attention_heads",
        "num_hidden_layers": "num_hidden_layers",
        "num_key_value_heads": "num_key_value_heads",
        "pad_token_id": "pad_token_id",
        "pretraining_tp": "pretraining_tp",
        "rms_norm_eps": "rms_norm_eps",
        "rope_scaling": "rope_scaling",
        "rope_theta": "rope_theta",
        "tie_word_embeddings": "tie_word_embeddings",
        "use_cache": "use_cache",
        "vocab_size": "vocab_size",
    }
    if nt_to_hf:
        return {nt: hf for hf, nt in hf_to_nt_map.items()}
    return hf_to_nt_map


def make_parallel_config(
    dp: int = 1,
    pp: int = 1,
    tp: int = 1,
):
    parallel_config = nanotron.config.ParallelismArgs(
        dp=dp,
        pp=pp,
        tp=tp,
        pp_engine=nanotron.config.AllForwardAllBackwardPipelineEngine(),
        tp_mode=nanotron.config.TensorParallelLinearMode.ALL_REDUCE,
        tp_linear_async_communication=False,
    )
    return parallel_config


def load_nanotron_model(
    model_config: NanotronLlamaConfig | None = None,
    device: torch.device = torch.device("cuda"),
    dtype: torch.dtype = torch.bfloat16,
    checkpoint_path: Path | None = None,
) -> LlamaForTraining:
    """
    Creates and returns a nanotron model.
    If `model_config` is None, then `checkpoint_path` must be set, in which case
    the configuration will be loaded from such path.
    If `checkpoint_path` is None, then `model_config` must be set, in which case
    the model created will have random weights.
    """

    if model_config is None:
        assert checkpoint_path is not None
        with open(checkpoint_path / "model_config.json") as f:
            model_config = NanotronLlamaConfig(**json.load(f))
    parallel_config = make_parallel_config()
    parallel_context = nanotron.parallel.ParallelContext(
        data_parallel_size=parallel_config.dp,
        pipeline_parallel_size=parallel_config.pp,
        tensor_parallel_size=parallel_config.tp,
    )
    nanotron_model = nanotron.models.build_model(
        model_builder=lambda: LlamaForTraining(
            config=model_config,
            parallel_context=parallel_context,
            parallel_config=parallel_config,
            random_states=None,
        ),
        parallel_context=parallel_context,
        dtype=dtype,
        device=device,
    )
    mark_tied_parameters(model=nanotron_model, parallel_context=parallel_context)
    # Load checkpoint directly in memory and then only keep the state dictionary
    if checkpoint_path is not None:
        nanotron.serialize.load_weights(
            model=nanotron_model, parallel_context=parallel_context, root_folder=checkpoint_path
        )
    return nanotron_model
