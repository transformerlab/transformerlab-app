import math
import random
import json
import gc
import asyncio
import os

import numpy as np
import torch
import torch.nn.functional as F
import torch.utils.checkpoint
from peft import LoraConfig
from peft.utils import get_peft_model_state_dict
from torchvision import transforms

from diffusers import (
    AutoPipelineForText2Image,
    StableDiffusionPipeline,
    StableDiffusionXLPipeline,
    StableDiffusion3Pipeline,
    LatentConsistencyModelPipeline,
    DiffusionPipeline,
)

from diffusers.optimization import get_scheduler
from diffusers.training_utils import cast_training_params, compute_snr
from diffusers.utils import convert_state_dict_to_diffusers

# Try to import xformers for memory optimization
try:
    import xformers  # noqa: F401

    xformers_available = True
except ImportError:
    xformers_available = False

from transformerlab.sdk.v1.train import tlab_trainer
from lab.dirs import get_workspace_dir
from lab import storage

workspace_dir = asyncio.run(get_workspace_dir())


def cleanup_pipeline():
    """Clean up pipeline to free VRAM"""
    try:
        # Force garbage collection multiple times
        gc.collect()
        gc.collect()  # Second call often helps

        if torch.cuda.is_available():
            # Clear CUDA cache and synchronize multiple times for better cleanup
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            torch.cuda.ipc_collect()  # Clean up inter-process communication
            torch.cuda.empty_cache()  # Second empty_cache call

    except Exception as e:
        print(f"Warning: Failed to cleanup pipeline: {str(e)}")


cleanup_pipeline()


SINGLE_FILE_EXTENSIONS = (".ckpt", ".safetensors")


def _is_single_file_model(model_path: str) -> bool:
    if not model_path:
        return False
    lower = model_path.lower()
    if lower.startswith(("http://", "https://")):
        return any(lower.endswith(ext) for ext in SINGLE_FILE_EXTENSIONS)
    if not any(lower.endswith(ext) for ext in SINGLE_FILE_EXTENSIONS):
        return False
    return os.path.isfile(model_path) or "/" in model_path or "\\" in model_path


def _infer_single_file_architecture(model_path: str, fallback: str = "StableDiffusionPipeline") -> str:
    name = os.path.basename(model_path or "").lower()
    if "sdxl" in name or "stable-diffusion-xl" in name or "sd_xl" in name:
        return "StableDiffusionXLPipeline"
    if "sd3" in name or "stable-diffusion-3" in name or "stable-diffusion3" in name:
        return "StableDiffusion3Pipeline"
    if "lcm" in name or "latent-consistency" in name:
        return "LatentConsistencyModelPipeline"
    return fallback


def _find_original_config_file(model_path: str) -> str | None:
    if not model_path or model_path.startswith(("http://", "https://")):
        return None
    if not os.path.isfile(model_path):
        return None
    directory = os.path.dirname(model_path)
    if not directory or not os.path.isdir(directory):
        return None
    try:
        for entry in os.listdir(directory):
            lower = entry.lower()
            if lower.endswith((".yaml", ".yml")):
                return os.path.join(directory, entry)
    except Exception:
        return None
    return None


def _load_text2img_pipeline(pretrained_model_name_or_path: str, model_architecture: str | None, pipeline_kwargs: dict):
    """Load a text-to-image pipeline, supporting single-file checkpoints."""
    is_single_file = _is_single_file_model(pretrained_model_name_or_path)
    if not is_single_file:
        return AutoPipelineForText2Image.from_pretrained(pretrained_model_name_or_path, **pipeline_kwargs)

    architecture = model_architecture or _infer_single_file_architecture(pretrained_model_name_or_path)

    if architecture == "FluxPipeline":
        raise ValueError("FluxPipeline single-file checkpoints are not supported.")

    pipeline_class = {
        "StableDiffusionPipeline": StableDiffusionPipeline,
        "StableDiffusionXLPipeline": StableDiffusionXLPipeline,
        "StableDiffusion3Pipeline": StableDiffusion3Pipeline,
        "LatentConsistencyModelPipeline": LatentConsistencyModelPipeline,
    }.get(architecture, DiffusionPipeline)

    original_config = _find_original_config_file(pretrained_model_name_or_path)
    if original_config:
        return pipeline_class.from_single_file(
            pretrained_model_name_or_path, **pipeline_kwargs, original_config_file=original_config
        )

    return pipeline_class.from_single_file(pretrained_model_name_or_path, **pipeline_kwargs)


def compute_loss_weighting(args, timesteps, noise_scheduler):
    """
    Compute loss weighting for improved training stability.
    Supports min-SNR weighting similar to Kohya's implementation.
    """
    if args.get("min_snr_gamma") is not None and args.get("min_snr_gamma") != "":
        snr = compute_snr(noise_scheduler, timesteps)
        min_snr_gamma = float(args.get("min_snr_gamma"))
        snr_weight = torch.stack([snr, min_snr_gamma * torch.ones_like(timesteps)], dim=1).min(dim=1)[0] / snr
        return snr_weight
    elif args.get("snr_gamma") is not None and args.get("snr_gamma") != "":
        snr = compute_snr(noise_scheduler, timesteps)
        mse_loss_weights = torch.stack([snr, float(args["snr_gamma"]) * torch.ones_like(timesteps)], dim=1).min(dim=1)[
            0
        ]
        if noise_scheduler.config.prediction_type == "epsilon":
            mse_loss_weights = mse_loss_weights / snr
        elif noise_scheduler.config.prediction_type == "v_prediction":
            mse_loss_weights = mse_loss_weights / (snr + 1)
        return mse_loss_weights
    return None


def compute_loss(model_pred, target, timesteps, noise_scheduler, args):
    """
    Compute loss with support for different loss types and weighting schemes.
    """
    loss_type = args.get("loss_type", "l2")

    if loss_type == "l2":
        loss = F.mse_loss(model_pred.float(), target.float(), reduction="none")
    elif loss_type == "huber":
        loss = F.smooth_l1_loss(model_pred.float(), target.float(), reduction="none", beta=args.get("huber_c", 0.1))
    else:
        loss = F.mse_loss(model_pred.float(), target.float(), reduction="none")

    # Apply loss weighting if specified
    loss_weights = compute_loss_weighting(args, timesteps, noise_scheduler)

    if loss_weights is not None and not torch.all(loss_weights == 0):
        loss = loss.mean(dim=list(range(1, len(loss.shape)))) * loss_weights
        return loss.mean()
    else:
        return loss.mean()


def compute_time_ids(original_size, crops_coords_top_left, target_size, dtype, device, weight_dtype=None):
    """
    Compute time IDs for SDXL conditioning.
    """
    if weight_dtype is None:
        weight_dtype = dtype

    # Adapted from pipeline.StableDiffusionXLPipeline._get_add_time_ids
    add_time_ids = list(original_size + crops_coords_top_left + target_size)
    add_time_ids = torch.tensor([add_time_ids], dtype=weight_dtype, device=device)
    return add_time_ids


def encode_prompt(
    pipe,
    text_encoders,
    tokenizers,
    prompt,
    device,
    num_images_per_prompt=1,
    do_classifier_free_guidance=True,
    negative_prompt=None,
    prompt_embeds=None,
    negative_prompt_embeds=None,
    pooled_prompt_embeds=None,
    negative_pooled_prompt_embeds=None,
    lora_scale=None,
    clip_skip=None,
):
    """
    Enhanced SDXL-compatible encode_prompt function that properly handles dual text encoders
    and pooled embeddings for SDXL models.
    """
    # if prompt is not None and isinstance(prompt, str):
    #     batch_size = 1
    # elif prompt is not None and isinstance(prompt, list):
    #     batch_size = len(prompt)
    # else:
    #     batch_size = prompt_embeds.shape[0]

    # Define tokenizers and text encoders
    tokenizers = (
        tokenizers
        if tokenizers is not None
        else [pipe.tokenizer, pipe.tokenizer_2]
        if hasattr(pipe, "tokenizer_2")
        else [pipe.tokenizer]
    )
    text_encoders = (
        text_encoders
        if text_encoders is not None
        else [pipe.text_encoder, pipe.text_encoder_2]
        if hasattr(pipe, "text_encoder_2")
        else [pipe.text_encoder]
    )

    if prompt_embeds is None:
        prompt_2 = prompt if hasattr(pipe, "text_encoder_2") else None
        prompt_embeds, negative_prompt_embeds, pooled_prompt_embeds, negative_pooled_prompt_embeds = encode_prompt_sdxl(
            text_encoders,
            tokenizers,
            prompt,
            prompt_2,
            device,
            num_images_per_prompt,
            do_classifier_free_guidance,
            negative_prompt,
            clip_skip=clip_skip,
        )

    return prompt_embeds, negative_prompt_embeds, pooled_prompt_embeds, negative_pooled_prompt_embeds


def encode_prompt_sdxl(
    text_encoders,
    tokenizers,
    prompt,
    prompt_2,
    device,
    num_images_per_prompt=1,
    do_classifier_free_guidance=True,
    negative_prompt=None,
    negative_prompt_2=None,
    clip_skip=None,
):
    """
    Encodes the prompt into text encoder hidden states for SDXL.
    """
    # textual inversion: process multi-vector tokens if necessary
    prompt_embeds_list = []
    prompts = [prompt, prompt_2] if prompt_2 else [prompt]

    for prompt, tokenizer, text_encoder in zip(prompts, tokenizers, text_encoders):
        if prompt is None:
            prompt = ""

        if isinstance(prompt, str):
            batch_size = 1
        elif isinstance(prompt, list):
            batch_size = len(prompt)

        max_length = tokenizer.model_max_length

        # Get text inputs
        text_inputs = tokenizer(
            prompt,
            padding="max_length",
            max_length=max_length,
            truncation=True,
            return_tensors="pt",
        )

        text_input_ids = text_inputs.input_ids
        untruncated_ids = tokenizer(prompt, padding="longest", return_tensors="pt").input_ids

        if untruncated_ids.shape[-1] >= text_input_ids.shape[-1] and not torch.equal(text_input_ids, untruncated_ids):
            removed_text = tokenizer.batch_decode(untruncated_ids[:, max_length - 1 : -1])
            print(
                f"The following part of your input was truncated because CLIP can only handle sequences up to {max_length} tokens: {removed_text}"
            )

        prompt_embeds = text_encoder(text_input_ids.to(device), output_hidden_states=True)

        # We are only interested in the pooled output of the final text encoder
        pooled_prompt_embeds = prompt_embeds[0]

        if clip_skip is None:
            prompt_embeds = prompt_embeds.hidden_states[-2]
        else:
            # "2" because SDXL always indexes from the penultimate layer.
            prompt_embeds = prompt_embeds.hidden_states[-(clip_skip + 2)]

        prompt_embeds_list.append(prompt_embeds)

    prompt_embeds = torch.concat(prompt_embeds_list, dim=-1)

    # get unconditional embeddings for classifier free guidance
    zero_out_negative_prompt = negative_prompt is None
    if do_classifier_free_guidance and negative_prompt_2 is None:
        negative_prompt_2 = negative_prompt

    if do_classifier_free_guidance and negative_prompt is None:
        negative_prompt = ""
        negative_prompt_2 = ""

    # normalize embeddings
    bs_embed, seq_len, _ = prompt_embeds.shape
    # duplicate text embeddings for each generation per prompt, using mps friendly method
    prompt_embeds = prompt_embeds.repeat(1, num_images_per_prompt, 1)
    prompt_embeds = prompt_embeds.view(bs_embed * num_images_per_prompt, seq_len, -1)

    if do_classifier_free_guidance:
        # get unconditional embeddings for classifier free guidance
        negative_prompt_embeds_list = []
        negative_prompts = [negative_prompt, negative_prompt_2] if negative_prompt_2 else [negative_prompt]

        for negative_prompt, tokenizer, text_encoder in zip(negative_prompts, tokenizers, text_encoders):
            if negative_prompt is None:
                negative_prompt = ""

            max_length = prompt_embeds.shape[1]
            uncond_input = tokenizer(
                negative_prompt,
                padding="max_length",
                max_length=max_length,
                truncation=True,
                return_tensors="pt",
            )

            negative_prompt_embeds = text_encoder(uncond_input.input_ids.to(device), output_hidden_states=True)
            # We are only interested in the pooled output of the final text encoder
            negative_pooled_prompt_embeds = negative_prompt_embeds[0]

            if clip_skip is None:
                negative_prompt_embeds = negative_prompt_embeds.hidden_states[-2]
            else:
                negative_prompt_embeds = negative_prompt_embeds.hidden_states[-(clip_skip + 2)]

            negative_prompt_embeds_list.append(negative_prompt_embeds)

        negative_prompt_embeds = torch.concat(negative_prompt_embeds_list, dim=-1)

        if zero_out_negative_prompt:
            negative_prompt_embeds = torch.zeros_like(negative_prompt_embeds)
            negative_pooled_prompt_embeds = torch.zeros_like(pooled_prompt_embeds)

        # duplicate unconditional embeddings for each generation per prompt, using mps friendly method
        seq_len = negative_prompt_embeds.shape[1]

        negative_prompt_embeds = negative_prompt_embeds.to(dtype=text_encoders[0].dtype, device=device)
        negative_prompt_embeds = negative_prompt_embeds.repeat(1, num_images_per_prompt, 1)
        negative_prompt_embeds = negative_prompt_embeds.view(batch_size * num_images_per_prompt, seq_len, -1)
    else:
        negative_prompt_embeds = None
        negative_pooled_prompt_embeds = None

    # Ensure pooled embeddings have correct dtype and device
    pooled_prompt_embeds = pooled_prompt_embeds.to(dtype=text_encoders[-1].dtype, device=device)
    if negative_pooled_prompt_embeds is not None:
        negative_pooled_prompt_embeds = negative_pooled_prompt_embeds.to(dtype=text_encoders[-1].dtype, device=device)

    return prompt_embeds, negative_prompt_embeds, pooled_prompt_embeds, negative_pooled_prompt_embeds


@tlab_trainer.job_wrapper(wandb_project_name="TLab_Training", manual_logging=True)
def train_diffusion_lora():
    # Extract parameters from tlab_trainer
    args = tlab_trainer.params

    print("***** Running training *****")

    # Setup logging directory
    output_dir = args.get("output_dir", "sd-model-finetuned-lora")

    # Setup evaluation images directory
    job_id = tlab_trainer.params.job_id
    eval_images_dir = None
    eval_prompt = args.get("eval_prompt", "").strip()
    eval_steps = int(args.get("eval_steps", 1))

    if args.get("model_architecture", "").strip() == "FluxPipeline":
        print("Disabling evaluation for FluxPipeline as we don't support sharding based inference in the plugin yet.")
        eval_prompt = None
        args["eval_prompt"] = None
        args["eval_steps"] = 0
    elif eval_prompt and eval_steps <= 0:
        print("Warning: eval_steps is set to 0, evaluation will not be performed.")
        eval_prompt = None
        args["eval_prompt"] = None
        args["eval_steps"] = 0

    if eval_prompt:
        eval_images_dir = storage.join(workspace_dir, "temp", f"eval_images_{job_id}")
        storage.makedirs(eval_images_dir, exist_ok=True)
        print(f"Evaluation images will be saved to: {eval_images_dir}")

        # Add eval images directory to job data
        tlab_trainer.add_job_data("eval_images_dir", eval_images_dir)

    # Load dataset using tlab_trainer
    datasets_dict = tlab_trainer.load_dataset(["train"])
    dataset = datasets_dict["train"]

    # Model and tokenizer loading - use AutoPipeline for multi-architecture support
    pretrained_model_name_or_path = args.get("model_name")
    if args.get("model_path") is not None and args.get("model_path").strip() != "":
        pretrained_model_name_or_path = args.get("model_path")
    revision = args.get("revision", None)
    variant = args.get("variant", None)

    model_architecture = args.get("model_architecture")

    # Load pipeline to auto-detect architecture and get correct components
    print(f"Loading pipeline to detect model architecture: {pretrained_model_name_or_path}")
    pipeline_kwargs = {
        "torch_dtype": torch.float16,
        "safety_checker": None,
        "requires_safety_checker": False,
    }

    temp_pipeline = _load_text2img_pipeline(pretrained_model_name_or_path, model_architecture, pipeline_kwargs)

    # Extract components from the loaded pipeline
    noise_scheduler = temp_pipeline.scheduler
    tokenizer = temp_pipeline.tokenizer
    text_encoder = temp_pipeline.text_encoder
    vae = temp_pipeline.vae

    # Handle different architectures: FluxPipeline uses 'transformer', others use 'unet'
    # We use 'unet' as a unified variable name for the main model component regardless of architecture
    if hasattr(temp_pipeline, "transformer"):
        # FluxPipeline and other transformer-based models
        unet = temp_pipeline.transformer
        model_component_name = "transformer"
    else:
        # SD 1.x, SDXL, SD3 and other UNet-based models
        unet = temp_pipeline.unet
        model_component_name = "unet"

    # Handle SDXL case with dual text encoders
    text_encoder_2 = getattr(temp_pipeline, "text_encoder_2", None)
    tokenizer_2 = getattr(temp_pipeline, "tokenizer_2", None)

    # Clean up temporary pipeline
    del temp_pipeline
    torch.cuda.empty_cache() if torch.cuda.is_available() else None

    print(f"Model components loaded successfully: {pretrained_model_name_or_path}")
    print(f"Architecture detected - Model component ({model_component_name}): {type(unet).__name__}")
    if text_encoder_2 is not None:
        print("Dual text encoder setup detected (likely SDXL)")
    print(f"Text encoder type: {type(text_encoder).__name__}")
    print(f"Tokenizer type: {type(tokenizer).__name__}")

    # Freeze parameters
    unet.requires_grad_(False)
    vae.requires_grad_(False)
    text_encoder.requires_grad_(False)
    if text_encoder_2 is not None:
        text_encoder_2.requires_grad_(False)

    # Enable xFormers memory efficient attention if available
    if args.get("enable_xformers_memory_efficient_attention", False) and xformers_available:
        try:
            unet.enable_xformers_memory_efficient_attention()
            if hasattr(vae, "enable_xformers_memory_efficient_attention"):
                vae.enable_xformers_memory_efficient_attention()
            print("xFormers memory efficient attention enabled")
        except Exception as e:
            print(f"Failed to enable xFormers: {e}")

    # Enable gradient checkpointing for memory savings
    if args.get("gradient_checkpointing", False):
        unet.enable_gradient_checkpointing()
        if hasattr(text_encoder, "gradient_checkpointing_enable"):
            text_encoder.gradient_checkpointing_enable()
        if text_encoder_2 is not None and hasattr(text_encoder_2, "gradient_checkpointing_enable"):
            text_encoder_2.gradient_checkpointing_enable()
        print("Gradient checkpointing enabled")

    # Mixed precision
    weight_dtype = torch.float32
    mixed_precision = args.get("mixed_precision", None)
    if mixed_precision == "fp16":
        weight_dtype = torch.float16
    elif mixed_precision == "bf16":
        weight_dtype = torch.bfloat16

    # LoRA config - adaptive target modules for different architectures
    model_type = type(unet).__name__

    # Debug architecture detection
    print(f"Model path: {pretrained_model_name_or_path}")
    print(f"Model component type ({model_component_name}): {model_type}")
    print(f"Has text_encoder_2: {text_encoder_2 is not None}")
    print(
        f"Has addition_embed_type: {hasattr(unet.config, 'addition_embed_type') if hasattr(unet, 'config') else 'No config'}"
    )

    # Detect architecture based on multiple indicators
    is_sdxl = "StableDiffusionXLPipeline" in model_architecture

    is_sd3 = "StableDiffusion3Pipeline" in model_architecture

    is_flux = "FluxPipeline" in model_architecture

    print(f"Architecture detection - SDXL: {is_sdxl}, SD3: {is_sd3}, Flux: {is_flux}")

    # Define target modules based on detected architecture
    if is_sdxl:
        # SDXL typically uses these modules
        target_modules = ["to_k", "to_q", "to_v", "to_out.0"]
        architecture_name = "SDXL"
    elif is_sd3:
        # SD3 uses Multi-Modal DiT architecture
        target_modules = ["to_q", "to_k", "to_v", "to_out.0"]
        architecture_name = "SD3"
    elif is_flux:
        # Flux uses transformer-based architecture
        target_modules = ["to_q", "to_k", "to_v", "to_out.0"]
        architecture_name = "Flux"
    else:
        # Default SD 1.x targets
        target_modules = ["to_k", "to_q", "to_v", "to_out.0"]
        architecture_name = "SD 1.x"

    print(f"Using LoRA target modules for {architecture_name} ({model_type}): {target_modules}")

    unet_lora_config = LoraConfig(
        r=int(args.get("lora_r", 4)),
        lora_alpha=int(args.get("lora_alpha", 4)),
        init_lora_weights="gaussian",
        target_modules=target_modules,
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    unet.to(device, dtype=weight_dtype)
    vae.to(device, dtype=weight_dtype)
    text_encoder.to(device, dtype=weight_dtype)
    if text_encoder_2 is not None:
        text_encoder_2.to(device, dtype=weight_dtype)

    unet.add_adapter(unet_lora_config)
    if mixed_precision == "fp16":
        cast_training_params(unet, dtype=torch.float32)

    lora_layers = filter(lambda p: p.requires_grad, unet.parameters())

    # EMA (Exponential Moving Average) for more stable training - Memory optimized for LoRA
    ema_unet = None
    if args.get("use_ema", False):
        try:
            from diffusers.training_utils import EMAModel

            # Only apply EMA to LoRA parameters to save memory
            lora_parameters = [p for p in unet.parameters() if p.requires_grad]
            if lora_parameters:
                # Calculate memory usage before EMA
                if torch.cuda.is_available():
                    memory_before_ema = torch.cuda.memory_allocated() / (1024**3)
                    print(f"GPU memory before EMA: {memory_before_ema:.2f}GB")

                ema_unet = EMAModel(lora_parameters, decay=args.get("ema_decay", 0.9999))

                # Calculate memory usage after EMA
                if torch.cuda.is_available():
                    memory_after_ema = torch.cuda.memory_allocated() / (1024**3)
                    memory_increase = memory_after_ema - memory_before_ema
                    print(f"GPU memory after EMA: {memory_after_ema:.2f}GB (increase: {memory_increase:.2f}GB)")

                print(f"EMA enabled for LoRA parameters only ({len(lora_parameters)} parameters) - Memory optimized")
            else:
                print("Warning: No trainable LoRA parameters found for EMA")
        except ImportError:
            print("Warning: EMA requested but diffusers.training_utils.EMAModel not available")
        except Exception as e:
            print(f"Warning: EMA initialization failed: {e}")
            print("Continuing training without EMA to avoid memory issues")
            ema_unet = None

    # Create evaluation pipeline function
    def generate_eval_image(epoch):
        if not eval_prompt or not eval_images_dir:
            return

        print(f"Generating evaluation image for epoch {epoch}...")

        # Set model component to evaluation mode
        unet.eval()

        # Create pipeline with current model state using AutoPipelineForText2Image
        pipeline = AutoPipelineForText2Image.from_pretrained(
            pretrained_model_name_or_path,
            revision=revision,
            variant=variant,
            torch_dtype=weight_dtype,
            safety_checker=None,
            requires_safety_checker=False,
        )

        # Replace the model component with our trained version to include LoRA weights
        if model_component_name == "transformer":
            pipeline.transformer = unet
        else:
            pipeline.unet = unet
        pipeline = pipeline.to(device)

        # Generate image
        with torch.no_grad():
            image = pipeline(
                eval_prompt,
                num_inference_steps=int(args.get("eval_num_inference_steps", 50)),
                guidance_scale=float(args.get("eval_guidance_scale", 7.5)),
                height=int(args.get("resolution", 512)),
                width=int(args.get("resolution", 512)),
            ).images[0]

        # Save image
        image_path = storage.join(eval_images_dir, f"epoch_{epoch}.png")
        image.save(image_path)

        print(f"Evaluation image saved to: {image_path}")

    # Data transforms with enhanced augmentation (similar to Kohya)
    interpolation = getattr(transforms.InterpolationMode, args.get("image_interpolation_mode", "lanczos").upper(), None)
    args["resolution"] = int(args.get("resolution", 512))

    # Build transforms list conditionally
    transform_list = [
        transforms.Resize(args.get("resolution", 512), interpolation=interpolation),
    ]

    # Add cropping
    if args.get("center_crop", False):
        transform_list.append(transforms.CenterCrop(args.get("resolution", 512)))
    else:
        transform_list.append(transforms.RandomCrop(args.get("resolution", 512)))

    # Add augmentations
    if args.get("random_flip", False):
        transform_list.append(transforms.RandomHorizontalFlip())

    # Add color augmentations if enabled
    if args.get("color_jitter", False):
        transform_list.append(
            transforms.ColorJitter(
                brightness=args.get("color_jitter_brightness", 0.1),
                contrast=args.get("color_jitter_contrast", 0.1),
                saturation=args.get("color_jitter_saturation", 0.1),
                hue=args.get("color_jitter_hue", 0.05),
            )
        )

    # Add rotation if enabled
    if args.get("random_rotation", False):
        transform_list.append(
            transforms.RandomApply(
                [transforms.RandomRotation(args.get("rotation_degrees", 5))], p=args.get("rotation_prob", 0.3)
            )
        )

    # Final transforms
    transform_list.extend(
        [
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5]),
        ]
    )

    train_transforms = transforms.Compose(transform_list)

    def tokenize_captions(examples, is_train=True):
        captions = []
        caption_column = args.get("caption_column", "text")
        trigger_word = args.get("trigger_word", "").strip()
        caption_dropout_rate = float(args.get("caption_dropout_rate", 0.0))

        # Check if caption column exists in the dataset
        if caption_column not in examples:
            print(
                f"Warning: Caption column '{caption_column}' not found in dataset. Training on images only (caption dropout = 1.0)"
            )
            # Create empty captions for all examples and force caption dropout
            num_examples = len(next(iter(examples.values())))  # Get number of examples from any column
            captions = [""] * num_examples
            caption_dropout_rate = 1.0  # Force complete caption dropout
        else:
            # Process captions normally
            for caption in examples[caption_column]:
                if isinstance(caption, str):
                    processed_caption = caption
                elif isinstance(caption, (list, np.ndarray)):
                    processed_caption = random.choice(caption) if is_train else caption[0]
                else:
                    raise ValueError(
                        f"Caption column `{caption_column}` should contain either strings or lists of strings."
                    )

                # Add caption dropout for better unconditional generation
                if is_train and caption_dropout_rate > 0 and random.random() < caption_dropout_rate:
                    processed_caption = ""  # Drop caption to train unconditional
                else:
                    # Add trigger word to the beginning of the caption if specified
                    if trigger_word:
                        processed_caption = f"{trigger_word}, {processed_caption}"

                captions.append(processed_caption)

        # Primary tokenizer (always present)
        inputs = tokenizer(
            captions, max_length=tokenizer.model_max_length, padding="max_length", truncation=True, return_tensors="pt"
        )

        result = {"input_ids": inputs.input_ids}

        # Secondary tokenizer for SDXL
        if tokenizer_2 is not None:
            inputs_2 = tokenizer_2(
                captions,
                max_length=tokenizer_2.model_max_length,
                padding="max_length",
                truncation=True,
                return_tensors="pt",
            )
            result["input_ids_2"] = inputs_2.input_ids

        return result

    image_column = args.get("image_column", "image")

    def preprocess_train(examples):
        images = [image.convert("RGB") for image in examples[image_column]]

        # Enhanced preprocessing for SDXL with proper image metadata tracking
        processed_images = []
        original_sizes = []
        crop_coords_top_left = []
        target_sizes = []

        for image in images:
            original_size = image.size  # (width, height)
            original_sizes.append(original_size)

            # Apply transforms and track crop coordinates
            transformed_image = train_transforms(image)
            processed_images.append(transformed_image)

            # For SDXL, we need to track the crop coordinates
            # If using center crop, calculate the crop coordinates
            if args.get("center_crop", False):
                crop_size = args.get("resolution", 512)
                left = (original_size[0] - crop_size) // 2
                top = (original_size[1] - crop_size) // 2
                crop_coords_top_left.append((left, top))
            else:
                # For random crop, we'll use (0, 0) as we can't know the exact coordinates
                crop_coords_top_left.append((0, 0))

            # Target size is the final resolution
            target_size = (args.get("resolution", 512), args.get("resolution", 512))
            target_sizes.append(target_size)

        examples["pixel_values"] = processed_images
        examples["original_sizes"] = original_sizes
        examples["crop_coords_top_left"] = crop_coords_top_left
        examples["target_sizes"] = target_sizes

        # Get tokenization results
        tokenization_results = tokenize_captions(examples)
        examples["input_ids"] = tokenization_results["input_ids"]

        # Add second input_ids for SDXL if present
        if "input_ids_2" in tokenization_results:
            examples["input_ids_2"] = tokenization_results["input_ids_2"]

        return examples

    train_dataset = dataset.with_transform(preprocess_train)

    def collate_fn(examples):
        pixel_values = torch.stack([example["pixel_values"] for example in examples])
        pixel_values = pixel_values.to(memory_format=torch.contiguous_format).float()
        input_ids = torch.stack([example["input_ids"] for example in examples])

        batch = {"pixel_values": pixel_values, "input_ids": input_ids}

        # Add second input_ids for SDXL if present
        if "input_ids_2" in examples[0]:
            input_ids_2 = torch.stack([example["input_ids_2"] for example in examples])
            batch["input_ids_2"] = input_ids_2

        # Add SDXL-specific metadata for proper conditioning
        if "original_sizes" in examples[0]:
            batch["original_sizes"] = [example["original_sizes"] for example in examples]
            batch["crop_coords_top_left"] = [example["crop_coords_top_left"] for example in examples]
            batch["target_sizes"] = [example["target_sizes"] for example in examples]

        return batch

    train_dataloader = torch.utils.data.DataLoader(
        train_dataset,
        shuffle=True,
        collate_fn=collate_fn,
        batch_size=int(args.get("train_batch_size", 16)),
        num_workers=int(args.get("dataloader_num_workers", 0)),
    )

    optimizer = torch.optim.AdamW(
        lora_layers,
        lr=float(args.get("learning_rate", 1e-4)),
        betas=(float(args.get("adam_beta1", 0.9)), float(args.get("adam_beta2", 0.999))),
        weight_decay=float(args.get("adam_weight_decay", 1e-2)),
        eps=float(args.get("adam_epsilon", 1e-8)),
    )

    # Scheduler
    num_train_epochs = int(args.get("num_train_epochs", 100))
    gradient_accumulation_steps = int(args.get("gradient_accumulation_steps", 1))
    # max_train_steps = args.get("max_train_steps", None)
    max_train_steps = None
    if max_train_steps is None:
        num_update_steps_per_epoch = math.ceil(len(train_dataloader) / gradient_accumulation_steps)
        max_train_steps = num_train_epochs * num_update_steps_per_epoch
    else:
        max_train_steps = int(max_train_steps)

    lr_scheduler = get_scheduler(
        args.get("lr_scheduler", "constant"),
        optimizer=optimizer,
        num_warmup_steps=int(args.get("lr_warmup_steps", 500)),
        num_training_steps=max_train_steps,
    )

    # Training loop
    print("***** Running training *****")
    print(f"  Num examples = {len(train_dataset)}")
    print(f"  Num Epochs = {num_train_epochs}")
    print(f"  Batch size = {args.get('train_batch_size', 16)}")
    print(f"  Total optimization steps = {max_train_steps}")
    if eval_prompt:
        print(f"  Evaluation prompt: '{eval_prompt}'")
        print(f"  Evaluation every {eval_steps} epoch(s)")

    args["noise_offset"] = int(args.get("noise_offset", 0))

    global_step = 0
    for epoch in range(num_train_epochs):
        unet.train()
        for step, batch in enumerate(train_dataloader):
            # Convert images to latent space
            latents = vae.encode(batch["pixel_values"].to(device, dtype=weight_dtype)).latent_dist.sample()
            latents = latents * vae.config.scaling_factor

            # Sample noise
            noise = torch.randn_like(latents)
            if args.get("noise_offset", 0):
                noise += args["noise_offset"] * torch.randn(
                    (latents.shape[0], latents.shape[1], 1, 1), device=latents.device
                )

            bsz = latents.shape[0]
            timesteps = torch.randint(
                0, noise_scheduler.config.num_train_timesteps, (bsz,), device=latents.device
            ).long()
            noisy_latents = noise_scheduler.add_noise(latents, noise, timesteps)

            # Enhanced text encoding - always use encode_prompt for SDXL
            if is_sdxl:
                # Always use encode_prompt for SDXL, regardless of text_encoder_2
                prompts = tokenizer.batch_decode(batch["input_ids"], skip_special_tokens=True)
                # if tokenizer_2 is not None and "input_ids_2" in batch:
                #     prompts_2 = tokenizer_2.batch_decode(batch["input_ids_2"], skip_special_tokens=True)
                # else:
                #     prompts_2 = None

                text_encoders = [text_encoder, text_encoder_2] if text_encoder_2 is not None else [text_encoder]
                tokenizers = [tokenizer, tokenizer_2] if tokenizer_2 is not None else [tokenizer]

                # Create a temporary pipeline-like object for encode_prompt compatibility
                class TempPipeline:
                    def __init__(self, text_encoder, text_encoder_2, tokenizer, tokenizer_2):
                        self.text_encoder = text_encoder
                        self.text_encoder_2 = text_encoder_2
                        self.tokenizer = tokenizer
                        self.tokenizer_2 = tokenizer_2

                temp_pipe = TempPipeline(text_encoder, text_encoder_2, tokenizer, tokenizer_2)

                encoder_hidden_states, _, pooled_prompt_embeds, _ = encode_prompt(
                    temp_pipe,
                    text_encoders,
                    tokenizers,
                    prompts,
                    device,
                    num_images_per_prompt=1,
                    do_classifier_free_guidance=False,
                )
            else:
                # Standard single text encoder approach
                encoder_hidden_states = text_encoder(batch["input_ids"].to(device), return_dict=False)[0]
                pooled_prompt_embeds = None

                # For SDXL with dual text encoders, handle dimension compatibility and concatenate
                if text_encoder_2 is not None and "input_ids_2" in batch:
                    encoder_hidden_states_2 = text_encoder_2(batch["input_ids_2"].to(device), return_dict=False)[0]

                    # Handle dimension mismatch - ensure both tensors have the same number of dimensions
                    if encoder_hidden_states.dim() != encoder_hidden_states_2.dim():
                        # If one is 2D and the other is 3D, add a dimension to the 2D tensor
                        if encoder_hidden_states.dim() == 2 and encoder_hidden_states_2.dim() == 3:
                            encoder_hidden_states = encoder_hidden_states.unsqueeze(1)
                        elif encoder_hidden_states.dim() == 3 and encoder_hidden_states_2.dim() == 2:
                            encoder_hidden_states_2 = encoder_hidden_states_2.unsqueeze(1)

                    # Ensure sequence lengths match for concatenation
                    seq_len_1 = (
                        encoder_hidden_states.shape[1]
                        if encoder_hidden_states.dim() == 3
                        else encoder_hidden_states.shape[0]
                    )
                    seq_len_2 = (
                        encoder_hidden_states_2.shape[1]
                        if encoder_hidden_states_2.dim() == 3
                        else encoder_hidden_states_2.shape[0]
                    )

                    if seq_len_1 != seq_len_2:
                        # Pad the shorter sequence to match the longer one
                        max_seq_len = max(seq_len_1, seq_len_2)

                        if encoder_hidden_states.dim() == 3:
                            if encoder_hidden_states.shape[1] < max_seq_len:
                                pad_size = max_seq_len - encoder_hidden_states.shape[1]
                                padding = torch.zeros(
                                    encoder_hidden_states.shape[0],
                                    pad_size,
                                    encoder_hidden_states.shape[2],
                                    device=encoder_hidden_states.device,
                                    dtype=encoder_hidden_states.dtype,
                                )
                                encoder_hidden_states = torch.cat([encoder_hidden_states, padding], dim=1)

                            if encoder_hidden_states_2.shape[1] < max_seq_len:
                                pad_size = max_seq_len - encoder_hidden_states_2.shape[1]
                                padding = torch.zeros(
                                    encoder_hidden_states_2.shape[0],
                                    pad_size,
                                    encoder_hidden_states_2.shape[2],
                                    device=encoder_hidden_states_2.device,
                                    dtype=encoder_hidden_states_2.dtype,
                                )
                                encoder_hidden_states_2 = torch.cat([encoder_hidden_states_2, padding], dim=1)

                    # Concatenate along the feature dimension (last dimension)
                    encoder_hidden_states = torch.cat([encoder_hidden_states, encoder_hidden_states_2], dim=-1)

            # Loss target
            prediction_type = args.get("prediction_type", None)
            if prediction_type is not None:
                noise_scheduler.register_to_config(prediction_type=prediction_type)

            if noise_scheduler.config.prediction_type == "epsilon":
                target = noise
            elif noise_scheduler.config.prediction_type == "v_prediction":
                target = noise_scheduler.get_velocity(latents, noise, timesteps)
            else:
                raise ValueError(
                    f"Unknown prediction type {noise_scheduler.config.prediction_type}"
                )  # Handle SDXL-specific conditioning parameters with proper metadata
            unet_kwargs = {"timestep": timesteps, "encoder_hidden_states": encoder_hidden_states, "return_dict": False}

            # SDXL requires additional conditioning kwargs with proper pooled embeddings and time_ids
            if is_sdxl:
                batch_size = noisy_latents.shape[0]

                # Use proper pooled embeddings if available, otherwise create dummy ones
                if pooled_prompt_embeds is not None:
                    text_embeds = (
                        pooled_prompt_embeds.repeat(batch_size, 1)
                        if pooled_prompt_embeds.shape[0] == 1
                        else pooled_prompt_embeds
                    )
                else:
                    # Fallback to dummy embeddings for compatibility
                    text_embeds = torch.zeros(batch_size, 1280, device=device, dtype=weight_dtype)

                # Compute proper time_ids from actual image metadata if available
                if "original_sizes" in batch and "crop_coords_top_left" in batch and "target_sizes" in batch:
                    time_ids_list = []
                    for i in range(batch_size):
                        original_size = batch["original_sizes"][i]
                        crop_coords = batch["crop_coords_top_left"][i]
                        target_size = batch["target_sizes"][i]

                        # Compute time_ids for this sample
                        time_ids = compute_time_ids(
                            original_size,
                            crop_coords,
                            target_size,
                            dtype=weight_dtype,
                            device=device,
                            weight_dtype=weight_dtype,
                        )
                        time_ids_list.append(time_ids)

                    time_ids = torch.cat(time_ids_list, dim=0)
                else:
                    # Fallback to dummy time_ids for compatibility
                    resolution = int(args.get("resolution", 512))
                    time_ids = torch.tensor(
                        [[resolution, resolution, 0, 0, resolution, resolution]] * batch_size,
                        device=device,
                        dtype=weight_dtype,
                    )

                added_cond_kwargs = {"text_embeds": text_embeds, "time_ids": time_ids}
                unet_kwargs["added_cond_kwargs"] = added_cond_kwargs

            model_pred = unet(noisy_latents, **unet_kwargs)[0]

            # Use improved loss computation with support for different loss types and weighting
            loss = compute_loss(model_pred, target, timesteps, noise_scheduler, args)
            print(f"Step {step + 1}/{len(train_dataloader)} - Loss: {loss.item()}")

            loss.backward()

            if (step + 1) % gradient_accumulation_steps == 0 or (step + 1) == len(train_dataloader):
                torch.nn.utils.clip_grad_norm_(list(lora_layers), float(args.get("max_grad_norm", 1.0)))
                optimizer.step()
                lr_scheduler.step()
                optimizer.zero_grad()

                # Update EMA if enabled (only for LoRA parameters)
                if ema_unet is not None:
                    try:
                        # Only step EMA with LoRA parameters to match initialization
                        lora_parameters_for_ema = [p for p in unet.parameters() if p.requires_grad]
                        if lora_parameters_for_ema:
                            ema_unet.step(lora_parameters_for_ema)
                    except Exception as e:
                        print(f"Warning: EMA step failed: {e}")
                        print("Disabling EMA for the rest of training to prevent memory issues")
                        ema_unet = None

                # Memory cleanup after gradient accumulation to prevent OOM
                if torch.cuda.is_available() and global_step % 10 == 0:  # Every 10 steps
                    torch.cuda.empty_cache()

                global_step += 1

                # Progress reporting
                percent_complete = 100.0 * global_step / max_train_steps
                tlab_trainer.progress_update(percent_complete)
                tlab_trainer.log_metric("train/loss", loss.item(), global_step)
                tlab_trainer.log_metric("train/lr", lr_scheduler.get_last_lr()[0], global_step)

                # Log memory usage periodically when EMA is enabled
                if torch.cuda.is_available() and ema_unet is not None and global_step % 50 == 0:
                    memory_used = torch.cuda.memory_allocated() / (1024**3)
                    memory_reserved = torch.cuda.memory_reserved() / (1024**3)
                    tlab_trainer.log_metric("train/gpu_memory_used_gb", memory_used, global_step)
                    tlab_trainer.log_metric("train/gpu_memory_reserved_gb", memory_reserved, global_step)
                    print(
                        f"Step {global_step}: GPU memory used: {memory_used:.2f}GB, reserved: {memory_reserved:.2f}GB"
                    )

                # Log additional metrics for monitoring
                if global_step % 10 == 0:  # Log every 10 steps to avoid spam
                    tlab_trainer.log_metric("train/epoch", epoch, global_step)
                    if args.get("snr_gamma") is not None or args.get("min_snr_gamma") is not None:
                        tlab_trainer.log_metric("train/snr_weighted_loss", loss.item(), global_step)

                if global_step >= max_train_steps:
                    break

        # Generate evaluation image at the end of epoch
        if eval_prompt and (epoch + 1) % eval_steps == 0:
            unet.eval()
            generate_eval_image(epoch + 1)
            unet.train()

        if global_step >= max_train_steps:
            break

    # # Final evaluation image
    # if eval_prompt:
    #     unet.eval()
    #     generate_eval_image("final")

    # Save LoRA weights using the proven working method that worked perfectly with SD 1.5
    unet = unet.to(torch.float32)
    model_lora_state_dict = convert_state_dict_to_diffusers(get_peft_model_state_dict(unet))
    # # Fix LoRA key naming for SDXL compatibility
    # fixed_state_dict = {}
    # for key, tensor in model_lora_state_dict.items():
    #     if key.endswith(".lora.down.weight"):
    #         new_key = key.replace(".lora.down.weight", ".lora_A.default_0.weight")
    #     elif key.endswith(".lora.up.weight"):
    #         new_key = key.replace(".lora.up.weight", ".lora_B.default_0.weight")
    #     else:
    #         new_key = key
    #     fixed_state_dict[new_key] = tensor
    # model_lora_state_dict = fixed_state_dict
    save_directory = args.get("adaptor_output_dir", output_dir)

    print(f"Saving LoRA weights to {save_directory}")

    storage.makedirs(save_directory, exist_ok=True)

    # Primary method: Use the original working approach that was perfect for SD 1.5
    # Try architecture-specific save methods first, then fall back to universal methods
    saved_successfully = False

    # Save a json file in the save directory with model architecture and LoRA config and a flag which says tlab_trainer
    # was used to train this LoRA
    print("Saving LoRA configuration information...")
    save_info = {
        "model_architecture": model_architecture,
        "lora_config": {
            "r": str(unet_lora_config.r),
            "lora_alpha": str(unet_lora_config.lora_alpha),
            "target_modules": str(unet_lora_config.target_modules),
        },
        "tlab_trainer_used": True,
    }
    with storage.open(storage.join(save_directory, "tlab_adaptor_info.json"), "w", encoding="utf-8") as f:
        json.dump(save_info, f, indent=4)

    # Method 1: Try the original SD 1.x approach that worked perfectly
    if not is_sdxl and not is_sd3 and not is_flux:
        try:
            StableDiffusionPipeline.save_lora_weights(
                save_directory=save_directory,
                unet_lora_layers=model_lora_state_dict,
                safe_serialization=True,
            )
            print(f"LoRA weights saved to {save_directory} using StableDiffusionPipeline.save_lora_weights (SD 1.x)")
            saved_successfully = True
        except Exception as e:
            print(f"Error with StableDiffusionPipeline.save_lora_weights: {e}")

    # Method 2: Try SDXL-specific save method
    if not saved_successfully and is_sdxl:
        try:
            from diffusers import StableDiffusionXLPipeline

            # For SDXL, we need to handle the dual text encoders properly
            # Only save UNet LoRA layers as we're not training text encoders in this config
            StableDiffusionXLPipeline.save_lora_weights(
                save_directory=save_directory,
                unet_lora_layers=model_lora_state_dict,
                text_encoder_lora_layers=None,  # Explicitly set to None for UNet-only training
                text_encoder_2_lora_layers=None,  # Explicitly set to None for UNet-only training
                safe_serialization=True,
            )
            print(f"LoRA weights saved to {save_directory} using StableDiffusionXLPipeline.save_lora_weights (SDXL)")
            saved_successfully = True
        except Exception as e:
            print(f"Error with StableDiffusionXLPipeline.save_lora_weights: {e}")
            print(f"Detailed error: {str(e)}")

    # Method 3: Try SD3-specific save method
    if not saved_successfully and is_sd3:
        try:
            # SD3 pipelines may have their own save method
            from diffusers import StableDiffusion3Pipeline

            StableDiffusion3Pipeline.save_lora_weights(
                save_directory=save_directory,
                unet_lora_layers=model_lora_state_dict,
                safe_serialization=True,
            )
            print(f"LoRA weights saved to {save_directory} using StableDiffusion3Pipeline.save_lora_weights (SD3)")
            saved_successfully = True
        except Exception as e:
            print(f"Error with StableDiffusion3Pipeline.save_lora_weights: {e}")

    # Method 4: Try FLUX-specific save method
    if not saved_successfully and is_flux:
        try:
            # FLUX pipelines may have their own save method and might expect transformer_lora_layers
            from diffusers import FluxPipeline

            # Try with transformer_lora_layers parameter first for FLUX
            try:
                FluxPipeline.save_lora_weights(
                    save_directory=save_directory,
                    transformer_lora_layers=model_lora_state_dict,
                    safe_serialization=True,
                )
                print(
                    f"LoRA weights saved to {save_directory} using FluxPipeline.save_lora_weights with transformer_lora_layers (FLUX)"
                )
                saved_successfully = True
            except TypeError:
                # Fallback to unet_lora_layers if transformer_lora_layers is not supported
                FluxPipeline.save_lora_weights(
                    save_directory=save_directory,
                    unet_lora_layers=model_lora_state_dict,
                    safe_serialization=True,
                )
                print(
                    f"LoRA weights saved to {save_directory} using FluxPipeline.save_lora_weights with unet_lora_layers (FLUX)"
                )
                saved_successfully = True
        except Exception as e:
            print(f"Error with FluxPipeline.save_lora_weights: {e}")

    # Method 5: Try the generic StableDiffusionPipeline method as fallback for all architectures
    if not saved_successfully:
        try:
            StableDiffusionPipeline.save_lora_weights(
                save_directory=save_directory,
                unet_lora_layers=model_lora_state_dict,
                safe_serialization=True,
            )
            print(
                f"LoRA weights saved to {save_directory} using StableDiffusionPipeline.save_lora_weights (generic fallback)"
            )
            saved_successfully = True
        except Exception as e:
            print(f"Error with generic StableDiffusionPipeline.save_lora_weights: {e}")

    # Method 6: Direct safetensors save as universal fallback
    if not saved_successfully:
        try:
            from safetensors.torch import save_file

            save_file(model_lora_state_dict, storage.join(save_directory, "pytorch_lora_weights.safetensors"))
            print(
                f"LoRA weights saved to {save_directory}/pytorch_lora_weights.safetensors using safetensors (universal fallback)"
            )
            print(
                f"To load this LoRA, use: pipeline.load_lora_weights('{save_directory}', weight_name='pytorch_lora_weights.safetensors')"
            )
            saved_successfully = True
        except ImportError:
            # Final fallback to standard PyTorch format
            torch.save(model_lora_state_dict, storage.join(save_directory, "pytorch_lora_weights.bin"))
            print(
                f"LoRA weights saved to {save_directory}/pytorch_lora_weights.bin using PyTorch format (final fallback)"
            )
            print(
                f"To load this LoRA, use: pipeline.load_lora_weights('{save_directory}', weight_name='pytorch_lora_weights.bin')"
            )
            saved_successfully = True
        except Exception as e:
            print(f"Error saving LoRA weights with safetensors: {e}")

    if saved_successfully:
        print(f"LoRA weights successfully saved to {save_directory}")
    else:
        print(f"Failed to save LoRA weights to {save_directory}")


train_diffusion_lora()
