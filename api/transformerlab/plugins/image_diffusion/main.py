from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from huggingface_hub import model_info
import base64
from io import BytesIO
import torch
import asyncio
import threading
import gc
from lab.dirs import get_workspace_dir
from lab import storage
from diffusers import (
    StableDiffusionUpscalePipeline,
    StableDiffusionLatentUpscalePipeline,
    AutoPipelineForText2Image,
    AutoPipelineForImage2Image,
    AutoPipelineForInpainting,
    EulerDiscreteScheduler,
    LMSDiscreteScheduler,
    EulerAncestralDiscreteScheduler,
    DPMSolverMultistepScheduler,
    ControlNetModel,
    StableDiffusionControlNetPAGPipeline,
    StableDiffusionXLControlNetPAGPipeline,
    FluxControlNetPipeline,
    StableDiffusionControlNetPipeline,
    StableDiffusionXLControlNetPipeline,
    StableDiffusionXLControlNetUnionPipeline,
    StableDiffusion3ControlNetPipeline,
    StableDiffusionControlNetImg2ImgPipeline,
    StableDiffusionXLControlNetImg2ImgPipeline,
    StableDiffusionXLControlNetUnionImg2ImgPipeline,
    StableDiffusionXLControlNetPAGImg2ImgPipeline,
    FluxControlNetImg2ImgPipeline,
    StableDiffusionControlNetInpaintPipeline,
    StableDiffusionXLControlNetInpaintPipeline,
    DiffusionPipeline,
)
import os
import sys
import random
from werkzeug.utils import secure_filename
import json
from datetime import datetime
import time
from PIL import Image

from transformerlab.sdk.v1.diffusion import tlab_diffusion
import numpy as np
import subprocess

scheduler_map = {
    "EulerDiscreteScheduler": EulerDiscreteScheduler,
    "LMSDiscreteScheduler": LMSDiscreteScheduler,
    "EulerAncestralDiscreteScheduler": EulerAncestralDiscreteScheduler,
    "DPMSolverMultistepScheduler": DPMSolverMultistepScheduler,
}

# Fixed upscaling models
UPSCALE_MODEL_STANDARD = "stabilityai/stable-diffusion-x4-upscaler"
UPSCALE_MODEL_LATENT = "stabilityai/sd-x2-latent-upscaler"

# History file path
HISTORY_FILE = "history.json"


def preprocess_for_controlnet(input_pil: Image.Image, process_type: str) -> Image.Image:
    """
    Preprocess the input image depending on the controlnet_id (repo name or alias).
    Returns a PIL image suitable as ControlNet reference.
    Releases memory aggressively after detector use.
    """
    from controlnet_aux import (
        OpenposeDetector,
        HEDdetector,
        MidasDetector,
        LineartDetector,
        NormalBaeDetector,
        SamDetector,
        ZoeDetector,
    )
    import cv2

    name = process_type.lower()

    try:
        if "canny" in name:
            np_image = np.array(input_pil.convert("RGB"))
            edges = cv2.Canny(np_image, 100, 200)
            edges_rgb = cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)
            return Image.fromarray(edges_rgb)

        elif "openpose" in name:
            detector = OpenposeDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "depth" in name and "zoe" in name:
            detector = ZoeDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "depth" in name:
            detector = MidasDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "hed" in name or "scribble" in name or "softedge" in name:
            detector = HEDdetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "seg" in name:
            detector = SamDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "normal" in name:
            detector = NormalBaeDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        elif "lineart" in name:
            detector = LineartDetector.from_pretrained("lllyasviel/Annotators")
            output = detector(input_pil)
            del detector
            return output

        else:
            raise ValueError(f"No preprocessing rule found for ControlNet: {process_type}")

    finally:
        # Force cleanup regardless of detector path
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


# Request schema for image generation
class DiffusionRequest(BaseModel):
    plugin: str = "image_diffusion"
    model: str
    prompt: str = ""
    adaptor: str = ""
    use_multi_gpu: bool = False
    enable_sharding: bool = True
    adaptor_scale: float = 1.0
    num_inference_steps: int = 30
    guidance_scale: float = 7.5
    seed: int | None = None
    upscale: bool = False
    upscale_factor: int = 4
    num_images: int = 1
    generation_id: str | None = None
    scheduler: str = "default"
    process_type: str | None = None

    @property
    def validated_num_images(self) -> int:
        """Ensure num_images is within reasonable bounds"""
        return max(1, min(self.num_images, 8))

    # Negative prompting
    negative_prompt: str = ""
    # Advanced guidance control
    eta: float = 0.0
    clip_skip: int = 0
    guidance_rescale: float = 0.0
    height: int = 0
    width: int = 0
    # Image-to-image specific fields
    input_image: str = ""  # Base64 encoded input image
    strength: float = 0.8  # Denoising strength for img2img (0.0 = no change, 1.0 = full generation)
    is_img2img: bool = False  # Whether this is an img2img generation
    # Inpainting specific fields
    mask_image: str = ""  # Base64 encoded mask image for inpainting
    is_inpainting: bool = False  # Whether this is an inpainting generation
    is_controlnet: str = ""  # Check if using ControlNet
    # Intermediate image saving
    save_intermediate_images: bool = True  # Whether to save intermediate images during generation


# Response schema for history
class ImageHistoryItem(BaseModel):
    id: str
    model: str
    prompt: str
    adaptor: str
    adaptor_scale: float
    num_inference_steps: int
    guidance_scale: float
    seed: int | None
    image_path: str
    timestamp: str
    upscaled: bool = False
    upscale_factor: int = 1
    negative_prompt: str = ""
    eta: float = 0.0
    clip_skip: int = 0
    guidance_rescale: float = 0.0
    height: int = 0
    width: int = 0
    generation_time: float = 0.0
    num_images: int = 1
    # Image-to-image specific fields
    input_image_path: str = ""  # Path to input image (for img2img)
    processed_image: str | None = None  # the preprocessed image for ControlNets
    strength: float = 0.8  # Denoising strength used
    is_img2img: bool = False  # Whether this was an img2img generation
    # Inpainting specific fields
    mask_image_path: str = ""  # Path to mask image (for inpainting)
    is_inpainting: bool = False  # Whether this was an inpainting generation
    is_controlnet: str = ""
    scheduler: str = "default"
    # Intermediate image saving
    saved_intermediate_images: bool = True  # Whether intermediate images were saved


_PIPELINES_LOCK = threading.Lock()


def load_controlnet_model(controlnet_id: str, device: str = "cuda") -> ControlNetModel:
    controlnet_model = ControlNetModel.from_pretrained(
        controlnet_id, torch_dtype=torch.float16 if device != "cpu" else torch.float32
    )
    return controlnet_model


def latents_to_rgb(latents):
    """Convert SDXL latents (4 channels) to RGB tensors (3 channels)"""
    weights = (
        (60, -60, 25, -70),
        (60, -5, 15, -50),
        (60, 10, -5, -35),
    )

    weights_tensor = torch.t(torch.tensor(weights, dtype=latents.dtype).to(latents.device))
    biases_tensor = torch.tensor((150, 140, 130), dtype=latents.dtype).to(latents.device)
    rgb_tensor = torch.einsum("...lxy,lr -> ...rxy", latents, weights_tensor) + biases_tensor.unsqueeze(-1).unsqueeze(
        -1
    )
    image_array = rgb_tensor.clamp(0, 255).byte().cpu().numpy().transpose(1, 2, 0)

    return Image.fromarray(image_array)


def create_decode_callback(images_folder):
    """Create a callback function to decode and save latents at each step"""

    def decode_tensors(pipe, step, timestep, callback_kwargs):
        try:
            latents = callback_kwargs["latents"]
            # Use the first latent in the batch for preview
            image = latents_to_rgb(latents[0])
            step_image_path = os.path.join(images_folder, "step.png")
            image.save(step_image_path)
        except Exception as e:
            print(f"Warning: Failed to save intermediate image for step {step}: {str(e)}")

        return callback_kwargs

    return decode_tensors


def cleanup_pipeline(pipe=None):
    """Clean up pipeline to free VRAM"""
    try:
        if pipe is not None:
            # Clean up pipeline components explicitly
            if hasattr(pipe, "unet") and pipe.unet is not None:
                del pipe.unet
            if hasattr(pipe, "transformer") and pipe.transformer is not None:
                del pipe.transformer
            if hasattr(pipe, "vae") and pipe.vae is not None:
                del pipe.vae
            if hasattr(pipe, "text_encoder") and pipe.text_encoder is not None:
                del pipe.text_encoder
            if hasattr(pipe, "text_encoder_2") and pipe.text_encoder_2 is not None:
                del pipe.text_encoder_2
            if hasattr(pipe, "scheduler") and pipe.scheduler is not None:
                del pipe.scheduler
            if hasattr(pipe, "controlnet") and pipe.controlnet is not None:
                del pipe.controlnet
            del pipe

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


def is_zimage_model(model: str) -> bool:
    """Return True if the model architecture is ZImagePipeline."""
    try:
        info = model_info(model)
        config = getattr(info, "config", {})
        diffusers_config = config.get("diffusers", {})
        architectures = diffusers_config.get("_class_name", "")
        if isinstance(architectures, str):
            architectures = [architectures]
        if any(arch == "ZImagePipeline" for arch in architectures):
            return True
    except Exception as e:
        print(f"Error checking model {model} for Z-Image: {e}")
    # Fallback: infer from model name when config lacks architecture (e.g., Tongyi Z-Image Turbo)
    name = (model or "").lower()
    return "z-image" in name or "zimage" in name


def get_pipeline(
    model: str,
    adaptor: str = "",
    device: str = "cuda",
    is_img2img: bool = False,
    is_inpainting: bool = False,
    is_controlnet: bool = False,
    scheduler="default",
    controlnet_id="off",
):
    # cache_key = get_pipeline_key(model, adaptor, is_img2img, is_inpainting)

    with _PIPELINES_LOCK:
        # Detect Z-Image architecture (non-controlnet path)
        is_zimage = is_zimage_model(model)

        # Load appropriate pipeline based on type
        if is_controlnet:
            CONTROLNET_PIPELINE_MAP = {
                "StableDiffusionPipeline": StableDiffusionControlNetPipeline,
                "StableDiffusionImg2ImgPipeline": StableDiffusionControlNetImg2ImgPipeline,
                "StableDiffusionInpaintPipeline": StableDiffusionControlNetInpaintPipeline,
                "StableDiffusionXLPipeline": StableDiffusionXLControlNetPipeline,
                "StableDiffusionXLImg2ImgPipeline": StableDiffusionXLControlNetImg2ImgPipeline,
                "StableDiffusionXLInpaintPipeline": StableDiffusionXLControlNetInpaintPipeline,
                "StableDiffusionXLControlNetUnionPipeline": StableDiffusionXLControlNetUnionPipeline,
                "StableDiffusionXLControlNetUnionImg2ImgPipeline": StableDiffusionXLControlNetUnionImg2ImgPipeline,
                "StableDiffusionControlNetPAGPipeline": StableDiffusionControlNetPAGPipeline,
                "StableDiffusionXLControlNetPAGPipeline": StableDiffusionXLControlNetPAGPipeline,
                "StableDiffusionXLControlNetPAGImg2ImgPipeline": StableDiffusionXLControlNetPAGImg2ImgPipeline,
                "FluxPipeline": FluxControlNetPipeline,
                "FluxImg2ImgPipeline": FluxControlNetImg2ImgPipeline,
                "StableDiffusion3Pipeline": StableDiffusion3ControlNetPipeline,
            }

            print(f"Loading ControlNet pipeline ({controlnet_id}) for model: {model}")

            try:
                info = model_info(model)
                config = getattr(info, "config", {})
                diffusers_config = config.get("diffusers", {})
                architecture = diffusers_config.get("_class_name", "")
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Model not found or error: {str(e)}")

            controlnet_model = load_controlnet_model(controlnet_id, device)
            if controlnet_model is None:
                raise ValueError(f"Unknown ControlNet type: {controlnet_id}")

            controlnet_pipeline = CONTROLNET_PIPELINE_MAP.get(architecture)
            if not controlnet_pipeline:
                raise ValueError("ControlNet architecture not supported")

            print(f"Loaded ControlNet pipeline {controlnet_pipeline} for model {model}")
            pipe = controlnet_pipeline.from_pretrained(
                model,
                controlnet=controlnet_model,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
                use_safetensors=True,
            )
        elif is_inpainting:
            pipe = AutoPipelineForInpainting.from_pretrained(
                model,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )
            print(f"Loaded inpainting pipeline for model: {model}")
        elif is_img2img:
            pipe = AutoPipelineForImage2Image.from_pretrained(
                model,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )
            print(f"Loaded image-to-image pipeline for model: {model}")
        elif is_zimage:
            pipe = DiffusionPipeline.from_pretrained(
                model,
                torch_dtype=torch.bfloat16 if device != "cpu" else torch.float32,
                low_cpu_mem_usage=False,
            )
            print(f"Loaded Z-Image pipeline for model: {model} with dtype {pipe.dtype}")
        else:
            pipe = AutoPipelineForText2Image.from_pretrained(
                model,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )
            print(f"Loaded text-to-image pipeline for model: {model} with dtype {pipe.dtype}")
        pipe = pipe.to(device)

        # Load LoRA adaptor if provided - same code for local and HF Hub!
        if adaptor and adaptor.strip():
            try:
                workspace_dir = asyncio.run(get_workspace_dir())
                adaptor_dir = storage.join(
                    workspace_dir,
                    "adaptors",
                    secure_filename(model),
                )
                adaptor_path = storage.join(adaptor_dir, secure_filename(adaptor))
                if asyncio.run(storage.exists(adaptor_path)):
                    pipe.load_lora_weights(adaptor_path)
                    # if not isinstance(pipe, StableDiffusionXLPipeline):
                    #     pipe.load_lora_weights(adaptor_path)
                    # else:
                    #     # pipe.load_lora_weights('Norod78/sdxl-humeow-lora-r16')
                    #     json_file_path = os.path.join(adaptor_path,'tlab_adaptor_info.json')
                    #     if os.path.exists(json_file_path):
                    #         with open(json_file_path, 'r') as f:
                    #             adaptor_info = json.load(f)
                    #         if adaptor_info.get('tlab_trainer_used') is not None and adaptor_info['tlab_trainer_used']:
                    #             try:
                    #                 pipe.load_lora_weights(adaptor_path)
                    #             except Exception as e:
                    #                 try:
                    #                     # Load LoRA weights
                    #                     state_dict, network_alphas = pipe.lora_state_dict(adaptor_path, prefix=None)
                    #                     pipe.load_lora_into_unet(state_dict, network_alphas=network_alphas, unet=pipe.unet)
                    #                 except Exception as e2:
                    #                     print(f"Warning: Failed to load LoRA adaptor '{adaptor}' with TFLab trainer info")
                    #                     print(f"Adaptor path: {adaptor_path}")
                    #                     print(f"Error: {str(e2)}")
                    #         else:
                    #             # Load LoRA weights for non-TFLab adaptors
                    #             pipe.load_lora_weights(adaptor_path)
                    #     else:
                    #         # If no JSON file, assume it's a standard LoRA adaptor
                    #         print(f"No TFLab adaptor info found for {adaptor}, loading as standard LoRA")
                    #         pipe.load_lora_weights(adaptor_path)
                    # pipe.load_lora_weights(adaptor_path)
                    print(f"Loaded LoRA adaptor: {adaptor}")
                else:
                    print(
                        f"Warning: No LoRA adaptor found at {adaptor_path}, trying to load as standard LoRA from Huggingface"
                    )
                    pipe.load_lora_weights(adaptor_path)
            except Exception as e:
                print(f"Warning: Failed to load LoRA adaptor '{adaptor}'")
                print(f"Adaptor path: {adaptor_path}")
                print(
                    "Try checking if the adaptor and model are compatible in terms of shapes. Some adaptors may not work with all models even if it is the same architecture."
                )
                print(f"Error: {str(e)}")
                # Continue without LoRA rather than failing
        print(f"[DEBUG] Received scheduler value: {scheduler}")

        # This will trap missing keys
        try:
            if scheduler != "default":
                scheduler_class = scheduler_map[scheduler]
                pipe.scheduler = scheduler_class.from_config(pipe.scheduler.config)
                print(f"[DEBUG] Set scheduler to: {type(pipe.scheduler).__name__}")
        except KeyError:
            print(f"[ERROR] Unknown scheduler: {scheduler}")
        except Exception as e:
            print(f"[ERROR] Failed to apply scheduler {scheduler}: {e}")

        print(f"Using scheduler: {type(pipe.scheduler).__name__}")

        # _PIPELINES[cache_key] = pipe
        return pipe


def get_upscale_pipeline(upscale_factor: int = 4, device: str = "cuda"):
    """Get the appropriate upscaling pipeline based on the factor"""
    # cache_key = f"upscale_{upscale_factor}"

    with _PIPELINES_LOCK:
        # if cache_key in _PIPELINES:
        #     return _PIPELINES[cache_key]

        if upscale_factor == 2:
            # Use latent upscaler for 2x
            pipe = StableDiffusionLatentUpscalePipeline.from_pretrained(
                UPSCALE_MODEL_LATENT,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )
        else:
            # Use standard upscaler for 4x (default)
            pipe = StableDiffusionUpscalePipeline.from_pretrained(
                UPSCALE_MODEL_STANDARD,
                torch_dtype=torch.float16 if device != "cpu" else torch.float32,
                safety_checker=None,
                requires_safety_checker=False,
            )

        pipe = pipe.to(device)
        # _PIPELINES[cache_key] = pipe
        return pipe


def upscale_image(image: Image.Image, prompt: str, upscale_factor: int = 4, device: str = "cuda"):
    """Upscale an image using Stable Diffusion upscaler"""
    upscale_pipe = get_upscale_pipeline(upscale_factor, device)

    try:
        if upscale_factor == 2:
            # For latent upscaler, we need to resize the image first
            # The latent upscaler expects a specific size
            width, height = image.size
            # Resize to be compatible with latent upscaler
            image = image.resize((width // 8 * 8, height // 8 * 8))

            result = upscale_pipe(
                prompt=prompt,
                image=image,
                num_inference_steps=20,
                guidance_scale=0,
            )
        else:
            # For standard 4x upscaler
            result = upscale_pipe(
                prompt=prompt,
                image=image,
                num_inference_steps=20,
                guidance_scale=0,
            )

        return result.images[0]
    finally:
        # Clean up the upscale pipeline to free VRAM
        cleanup_pipeline(upscale_pipe)


def get_python_executable():
    """Get the Python executable path"""
    return sys.executable


def get_diffusion_dir(experiment_name: str = None):
    """Get the diffusion directory path"""
    workspace_dir = asyncio.run(get_workspace_dir())
    if experiment_name is not None:
        return storage.join(workspace_dir, "experiments", experiment_name, "diffusion")
    else:
        return storage.join(workspace_dir, "diffusion")


def get_images_dir(experiment_name: str = None):
    """Get the images directory path"""
    return storage.join(get_diffusion_dir(experiment_name), "images")


def get_history_file_path(experiment_name: str = None):
    """Get the history file path"""
    # Create a history file in the diffusion directory if it doesn't exist
    return storage.join(get_diffusion_dir(experiment_name), HISTORY_FILE)


def ensure_directories(experiment_name: str = None):
    """Ensure diffusion and images directories exist"""
    diffusion_dir = get_diffusion_dir(experiment_name)
    images_dir = get_images_dir(experiment_name)
    history_file_path = get_history_file_path(experiment_name)

    asyncio.run(storage.makedirs(diffusion_dir, exist_ok=True))
    asyncio.run(storage.makedirs(images_dir, exist_ok=True))
    if not asyncio.run(storage.exists(history_file_path)):
        async def _create_file():
            async with await storage.open(history_file_path, "a"):
                pass
        asyncio.run(_create_file())


def save_to_history(item: ImageHistoryItem, experiment_name: str = None):
    """Save an image generation record to history"""
    ensure_directories(experiment_name)
    history_file = get_history_file_path(experiment_name)

    async def _save():
        # Load existing history
        history = []
        if await storage.exists(history_file):
            try:
                async with await storage.open(history_file, "r") as f:
                    history = json.loads(await f.read())
            except (json.JSONDecodeError, FileNotFoundError):
                history = []

        # Add new item to the beginning of the list
        history.insert(0, item.model_dump())

        # Save updated history
        async with await storage.open(history_file, "w") as f:
            await f.write(json.dumps(history, indent=2))
    
    asyncio.run(_save())


def should_use_diffusion_worker(model) -> bool:
    """Use the diffusion worker only for FLUX models"""
    # return use_multi_gpu and torch.cuda.device_count() > 1
    try:
        # Check if model has FLUX components by looking for config
        from huggingface_hub import model_info

        info = model_info(model)
        config = getattr(info, "config", {})
        diffusers_config = config.get("diffusers", {})
        architectures = diffusers_config.get("_class_name", "")
        if isinstance(architectures, str):
            architectures = [architectures]
        for arch in architectures:
            if "flux" in arch.lower():
                return True

        return False
    except Exception:
        return False


async def run_multi_gpu_generation(
    request: DiffusionRequest,
    generation_id: str,
    images_folder: str,
    input_image_path: str = "",
    mask_image_path: str = "",
    is_img2img: bool = False,
    is_inpainting: bool = False,
    experiment_name: str = None,
) -> dict:
    """Run image generation using multi-GPU subprocess approach"""

    # Set seed - use provided seed or generate a random one
    if request.seed is None or request.seed < 0:
        seed = random.randint(0, 2**32 - 1)
    else:
        seed = request.seed

    # Prepare configuration for worker
    config = {
        "model": request.model,
        "adaptor": request.adaptor,
        "adaptor_scale": request.adaptor_scale,
        "prompt": request.prompt,
        "negative_prompt": request.negative_prompt,
        "num_images": request.num_images,
        "num_inference_steps": request.num_inference_steps,
        "guidance_scale": request.guidance_scale,
        "seed": seed,
        "eta": request.eta,
        "clip_skip": request.clip_skip,
        "guidance_rescale": request.guidance_rescale,
        "height": request.height,
        "width": request.width,
        "strength": request.strength,
        "is_img2img": is_img2img,
        "input_image": request.input_image if (is_img2img or is_inpainting) else "",
        "is_inpainting": is_inpainting,
        "mask_image": request.mask_image if is_inpainting else "",
        "upscale": request.upscale,
        "upscale_factor": request.upscale_factor,
        "enable_sharding": request.enable_sharding,
        "is_controlnet": request.is_controlnet,
        "scheduler": request.scheduler,
    }

    # Save config to temporary file
    ensure_directories(experiment_name)
    config_path = storage.join(get_diffusion_dir(experiment_name), secure_filename(f"config_{generation_id}.json"))
    
    async def _save_config():
        async with await storage.open(config_path, "w") as f:
            await f.write(json.dumps(config, indent=2))
    await _save_config()

    # Get worker script path
    # current_dir = os.path.dirname(os.path.abspath(__file__))

    current_dir = os.path.dirname(os.path.abspath(__file__))
    worker_script = os.path.join(os.path.dirname(current_dir), "image_diffusion", "diffusion_worker.py")

    try:
        # Setup environment for accelerate
        env = os.environ.copy()
        env["CUDA_VISIBLE_DEVICES"] = ",".join([str(i) for i in range(torch.cuda.device_count())])

        # Build command for accelerate launch
        cmd = [
            get_python_executable(),
            "-m",
            "accelerate.commands.launch",
            "--num_processes",
            str(1),
            worker_script,
            "--config",
            config_path,
            "--output-dir",
            images_folder,
            "--worker-id",
            generation_id,
        ]

        print(f"Running multi-GPU generation with command: {' '.join(cmd)}")

        # Start the process asynchronously
        process = await asyncio.create_subprocess_exec(
            *cmd,
            env=env,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,  # Redirect stderr to stdout
        )

        # Print output in real-time asynchronously
        output_lines = []
        while True:
            line = await process.stdout.readline()
            if line:
                line_text = line.decode("utf-8").rstrip()
                print(line_text)  # Print to console in real-time
                output_lines.append(line_text + "\n")
            else:
                break

        # Wait for process to complete and get return code
        return_code = await process.wait()

        # Combine all output for error checking
        combined_output = "".join(output_lines)

        if return_code != 0:
            print(f"Worker subprocess failed with return code {return_code}")
            print(f"Combined output: {combined_output}")

            # Check if it's an OOM error (exitcode -9 indicates process was killed)
            if return_code == -9 or "CUDA out of memory" in combined_output or "OutOfMemoryError" in combined_output:
                # Try to load any partial result to get OOM details
                result_path = os.path.join(images_folder, "result.json")
                if await storage.exists(result_path):
                    try:
                        async with await storage.open(result_path, "r") as f:
                            worker_result = json.loads(await f.read())
                        if worker_result.get("error_type") == "OOM":
                            oom_suggestions = worker_result.get("suggestions", [])
                            suggestion_text = "\n".join([f"  • {s}" for s in oom_suggestions])
                            raise RuntimeError(
                                f"CUDA Out of Memory during multi-GPU generation.\n\nSuggestions:\n{suggestion_text}"
                            )
                    except Exception:
                        pass
                raise RuntimeError(
                    "CUDA Out of Memory during multi-GPU generation. Try reducing image resolution, inference steps, or closing other GPU processes."
                )

            raise RuntimeError(f"Multi-GPU generation failed: {combined_output}")

        # Load result from worker
        result_path = os.path.join(images_folder, "result.json")
        if not await storage.exists(result_path):
            raise RuntimeError("Worker did not produce result file")

        async with await storage.open(result_path, "r") as f:
            worker_result = json.loads(await f.read())

        if not worker_result.get("success", False):
            error_msg = worker_result.get("error", "Unknown error")
            error_type = worker_result.get("error_type", "")

            if error_type == "OOM":
                suggestions = worker_result.get("suggestions", [])
                suggestion_text = "\n".join([f"  • {s}" for s in suggestions])
                raise RuntimeError(f"CUDA Out of Memory: {error_msg}\n\nSuggestions:\n{suggestion_text}")
            else:
                raise RuntimeError(f"Worker reported failure: {error_msg}")

        # Clean up config file
        try:
            if await storage.exists(config_path):
                await storage.rm(config_path)
        except Exception:
            pass

        return {
            "images": worker_result["images"],
            "generation_time": worker_result["generation_time"],
            "seed": worker_result["seed"],
            "num_images": worker_result["num_images"],
        }

    except subprocess.TimeoutExpired:
        print("Multi-GPU generation timed out")
        raise RuntimeError("Generation timed out after 10 minutes")
    except Exception as e:
        # Clean up config file on error
        try:
            if await storage.exists(config_path):
                await storage.rm(config_path)
        except Exception:
            pass
        raise e


@tlab_diffusion.async_job_wrapper(progress_start=0, progress_end=100)
async def diffusion_generate_job():
    # Map from file path keys to DiffusionRequest keys
    image_path_keys = {"input_image_path": "input_image", "mask_image_path": "mask_image"}

    # Make a shallow copy to avoid mutating the original
    job_config = tlab_diffusion.params.copy()

    # Get experiment name for experiment-specific paths
    experiment_name = tlab_diffusion.params.get("experiment_name")
    if experiment_name and experiment_name != "default":
        print(f"Using experiment-specific paths for experiment: {experiment_name}")
    else:
        experiment_name = None
        print("Using legacy global paths")

    # Convert image paths to base64 and remove original keys
    for path_key, base64_key in image_path_keys.items():
        if path_key in job_config and job_config[path_key]:
            try:
                with open(job_config[path_key], "rb") as f:
                    encoded = base64.b64encode(f.read()).decode("utf-8")
                job_config[base64_key] = encoded
            except Exception as e:
                print(f"[main.py] Failed to encode {path_key}: {e}", flush=True)
            finally:
                del job_config[path_key]

    # Filter out unknown keys before constructing the Pydantic model
    valid_keys = DiffusionRequest.model_fields.keys()
    filtered_config = {k: v for k, v in job_config.items() if k in valid_keys}

    # Instantiate the request
    try:
        request = DiffusionRequest(**filtered_config)
    except ValidationError:
        print("[DIFFUSION] Validation error while creating DiffusionRequest", flush=True)
        raise HTTPException(status_code=422, detail="Invalid diffusion request parameters")

    try:
        tlab_diffusion.progress_update(0)
        request = DiffusionRequest(**job_config)
        # Validate num_images parameter
        if request.num_images < 1 or request.num_images > 10:
            raise HTTPException(status_code=400, detail="num_images must be between 1 and 10")

        # Use provided generation_id if present, otherwise generate a new one
        generation_id = request.generation_id
        print(f"Generation ID: {generation_id}")
        timestamp = datetime.now().isoformat()

        # Validate generation_id to ensure it matches UUID format
        if not generation_id.replace("-", "").isalnum() or len(generation_id) != 36:
            raise HTTPException(status_code=400, detail="Invalid generation_id format")

        # Create folder for images
        ensure_directories(experiment_name)
        images_folder = os.path.normpath(os.path.join(get_images_dir(experiment_name), generation_id))
        if not images_folder.startswith(get_images_dir(experiment_name)):
            raise HTTPException(status_code=400, detail="Invalid path for images_folder")
        await storage.makedirs(images_folder, exist_ok=True)

        # Determine pipeline type based on flags and provided images
        controlnet_id = request.is_controlnet or "off"
        is_controlnet = controlnet_id != "off"
        process_type = request.process_type

        if is_controlnet:
            is_img2img = False
            is_inpainting = False
        else:
            is_inpainting = request.is_inpainting or (
                bool(request.input_image.strip()) and bool(request.mask_image.strip())
            )
            is_img2img = request.is_img2img or (bool(request.input_image.strip()) and not is_inpainting)

        # Process input image and mask if needed
        input_image_obj = None
        mask_image_obj = None
        input_image_path = ""
        mask_image_path = ""
        preprocessed_image_path = None
        uuid_suffix = str(generation_id)

        if is_inpainting or is_img2img or is_controlnet:
            try:
                # Decode base64 input image
                image_data = base64.b64decode(request.input_image)
                input_image_obj = Image.open(BytesIO(image_data)).convert("RGB")

                # Save input image for history
                ensure_directories(experiment_name)
                input_image_filename = f"input_{uuid_suffix}.png"
                input_image_path = os.path.join(get_images_dir(experiment_name), input_image_filename)
                input_image_obj.save(input_image_path, format="PNG")
                print(f"Input image saved: {input_image_path}")

                if is_controlnet and input_image_obj:
                    print(f"Running preprocessing for controlnet_id={controlnet_id}")
                    try:
                        if process_type is not None:
                            input_image_obj = preprocess_for_controlnet(input_image_obj, process_type)
                        else:
                            print("You must select a image preprocessing type for the ControlNet.")

                        # Save preprocessed image
                        preprocessed_image_filename = f"preprocessed_{uuid_suffix}.png"
                        preprocessed_image_path = os.path.join(
                            get_images_dir(experiment_name), preprocessed_image_filename
                        )
                        input_image_obj.save(preprocessed_image_path, format="PNG")
                        print(f"Preprocessed image saved: {preprocessed_image_path}")
                    except Exception as e:
                        raise HTTPException(status_code=400, detail=f"Preprocessing failed: {str(e)}")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid input image: {str(e)}")

        if is_inpainting:
            try:
                # Decode base64 mask image
                mask_data = base64.b64decode(request.mask_image)
                mask_image_obj = Image.open(BytesIO(mask_data)).convert("L")  # Convert to grayscale

                # Save mask image for history
                ensure_directories(experiment_name)
                mask_image_filename = f"mask_{uuid_suffix}.png"
                mask_image_path = os.path.join(get_images_dir(experiment_name), mask_image_filename)
                mask_image_obj.save(mask_image_path, format="PNG")
                print(f"Mask image saved: {mask_image_path}")
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid mask image: {str(e)}")

        tlab_diffusion.progress_update(10)

        # Check if we should use multi-GPU approach
        if should_use_diffusion_worker(request.model):
            print(f"Using Diffusion Worker subprocess approach for model: {request.model}")
            use_single_gpu = False

            tlab_diffusion.progress_update(30)

            try:
                result = await run_multi_gpu_generation(
                    request,
                    generation_id,
                    images_folder,
                    input_image_path,
                    mask_image_path,
                    is_img2img,
                    is_inpainting,
                    experiment_name,
                )

                images = []
                for img_path in result["images"]:
                    images.append(Image.open(img_path))

                total_generation_time = result["generation_time"]
                seed = result["seed"]

                # Get dimensions from the first image
                first_image = images[0]
                actual_height = request.height if request.height > 0 else first_image.height
                actual_width = request.width if request.width > 0 else first_image.width

                tlab_diffusion.progress_update(70)

            except Exception as e:
                print(f"Multi-GPU generation failed, falling back to single GPU: {str(e)}")
                # Fall back to single GPU approach
                use_single_gpu = True

                cleanup_pipeline()

        else:
            use_single_gpu = True

        if use_single_gpu:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            if device == "cpu":
                device = "mps" if torch.backends.mps.is_available() else "cpu"
            cleanup_pipeline()  # Clean up any previous pipelines
            pipe = get_pipeline(
                request.model,
                request.adaptor,
                device=device,
                is_img2img=is_img2img,
                is_inpainting=is_inpainting,
                is_controlnet=is_controlnet,
                scheduler=request.scheduler,
                controlnet_id=controlnet_id,
            )

            tlab_diffusion.progress_update(20)

            # Set seed - use provided seed or generate a random one
            if request.seed is None or request.seed < 0:
                seed = random.randint(0, 2**32 - 1)
            else:
                seed = request.seed

            generator = torch.manual_seed(seed)

            # Process input image and mask for single GPU path
            input_image_obj = None
            mask_image_obj = None
            if is_inpainting or is_img2img or is_controlnet:
                try:
                    # Decode base64 input image
                    image_data = base64.b64decode(request.input_image)
                    input_image_obj = Image.open(BytesIO(image_data)).convert("RGB")
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid input image: {str(e)}")

            if is_inpainting:
                try:
                    # Decode base64 mask image
                    mask_data = base64.b64decode(request.mask_image)
                    mask_image_obj = Image.open(BytesIO(mask_data)).convert("L")  # Convert to grayscale
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid mask image: {str(e)}")

            # Run in thread to avoid blocking event loop
            def run_pipe():
                try:
                    generation_kwargs = {
                        "prompt": request.prompt,
                        "num_inference_steps": request.num_inference_steps,
                        "guidance_scale": request.guidance_scale,
                        "generator": generator,
                        "num_images_per_prompt": request.num_images,  # Generate multiple images
                    }

                    # Set scheduler
                    if request.scheduler != "default":
                        generation_kwargs["scheduler"] = request.scheduler

                    # Add image and mask for inpainting
                    if is_inpainting:
                        generation_kwargs["image"] = input_image_obj
                        generation_kwargs["mask_image"] = mask_image_obj
                        generation_kwargs["strength"] = request.strength
                    # Add image and strength for img2img
                    elif is_img2img:
                        generation_kwargs["image"] = input_image_obj
                        generation_kwargs["strength"] = request.strength
                    elif is_controlnet:
                        generation_kwargs["image"] = input_image_obj

                    # Add negative prompt if provided
                    if request.negative_prompt:
                        generation_kwargs["negative_prompt"] = request.negative_prompt

                    if request.eta > 0.0:
                        generation_kwargs["eta"] = request.eta

                    # Add guidance rescale if provided
                    if request.guidance_rescale > 0.0:
                        generation_kwargs["guidance_rescale"] = request.guidance_rescale

                    # Add clip skip if provided (requires scheduler support)
                    if request.clip_skip > 0:
                        generation_kwargs["clip_skip"] = request.clip_skip

                    # Set height and width if specified
                    if request.height > 0 and request.width > 0:
                        generation_kwargs["height"] = request.height
                        generation_kwargs["width"] = request.width

                    # Add LoRA scale if adaptor is being used
                    if request.adaptor and request.adaptor.strip():
                        generation_kwargs["cross_attention_kwargs"] = {"scale": request.adaptor_scale}

                    # Add intermediate image saving callback if enabled
                    if request.save_intermediate_images:
                        decode_callback = create_decode_callback(images_folder)
                    else:
                        # no-op callback to keep logic unified
                        def decode_callback(pipe, step, timestep, callback_kwargs):
                            return callback_kwargs

                    def unified_callback(pipe, step: int, timestep: int, callback_kwargs: dict):
                        try:
                            # Progress update
                            progress = 30 + int((step / request.num_inference_steps) * 60)
                            progress = min(progress, 70)
                            # progress_queue.put(progress)
                        except Exception as e:
                            print(f"Failed to enqueue progress update: {e}")

                        # Always call decode_callback, it's a no-op if not needed
                        try:
                            return decode_callback(pipe, step, timestep, callback_kwargs)
                        except Exception as e:
                            print(f"Warning: decode_callback failed: {e}")
                            return callback_kwargs

                    generation_kwargs["callback_on_step_end"] = unified_callback
                    generation_kwargs["callback_on_step_end_tensor_inputs"] = ["latents"]

                    result = pipe(**generation_kwargs)
                    images = result.images  # Get all images

                    # Clean up result object to free references
                    del result
                    del generation_kwargs

                    # Force cleanup within the executor thread
                    import gc

                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()

                    return images
                except Exception as e:
                    # Ensure cleanup even if generation fails
                    print(f"Error during image generation: {str(e)}")
                    import gc

                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    raise e

            # Time the main generation
            generation_start = time.time()
            print("Starting image generation...")

            images = await asyncio.get_event_loop().run_in_executor(None, run_pipe)

            generation_time = time.time() - generation_start

            # Aggressive cleanup immediately after generation
            print("Starting aggressive memory cleanup...")

            # Clean up the main pipeline to free VRAM
            cleanup_pipeline(pipe)

            # Additional cleanup: clear any remaining references
            pipe = None
            input_image_obj = None
            mask_image_obj = None
            generator = None

            # Force multiple garbage collection cycles
            import gc

            for _ in range(3):  # Multiple GC cycles can help
                gc.collect()

            # Additional CUDA cleanup
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
                torch.cuda.empty_cache()  # Second call
            # MPS cleanup if available
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()

            print("Memory cleanup completed")
            tlab_diffusion.progress_update(75)
            # Get dimensions from the first image
            first_image = images[0]
            actual_height = request.height if request.height > 0 else first_image.height
            actual_width = request.width if request.width > 0 else first_image.width

            total_generation_time = generation_time
            tlab_diffusion.progress_update(80)

        # Apply upscaling if requested (for both paths)
        if request.upscale:
            print(f"Upscaling {len(images)} images with factor {request.upscale_factor}x")

            def run_upscale():
                upscaled_images = []
                device = "cuda" if torch.cuda.is_available() else "cpu"
                if device == "cpu":
                    device = "mps" if torch.backends.mps.is_available() else "cpu"
                for i, image in enumerate(images):
                    print(f"Upscaling image {i + 1}/{len(images)}")
                    upscaled_image = upscale_image(image, request.prompt, request.upscale_factor, device)
                    upscaled_images.append(upscaled_image)
                return upscaled_images

            upscale_start = time.time()
            images = await asyncio.get_event_loop().run_in_executor(None, run_upscale)
            upscale_time = time.time() - upscale_start
            total_generation_time += upscale_time
            print(
                f"Generation took {total_generation_time - upscale_time:.2f}s, upscaling took {upscale_time:.2f}s, total: {total_generation_time:.2f}s"
            )
        else:
            print(f"Generation took {total_generation_time:.2f}s")

        # Save images to the folder (for single GPU path, multi-GPU already saved)
        if use_single_gpu:
            for i, image in enumerate(images):
                image_filename = f"{i}.png"
                image_path = os.path.join(images_folder, image_filename)
                image.save(image_path, format="PNG")
        tlab_diffusion.progress_update(85)
        # Get dimensions from the first image
        first_image = images[0]
        actual_height = request.height if request.height > 0 else first_image.height
        actual_width = request.width if request.width > 0 else first_image.width

        processed_image_path = preprocessed_image_path if is_controlnet else None
        tlab_diffusion.progress_update(90)
        # Save to history
        history_item = ImageHistoryItem(
            id=generation_id,
            model=request.model,
            prompt=request.prompt,
            adaptor=request.adaptor,
            adaptor_scale=request.adaptor_scale,
            num_inference_steps=request.num_inference_steps,
            guidance_scale=request.guidance_scale,
            seed=seed,
            image_path=images_folder,  # Now pointing to the folder
            timestamp=timestamp,
            upscaled=request.upscale,
            upscale_factor=request.upscale_factor if request.upscale else 1,
            negative_prompt=request.negative_prompt,
            eta=request.eta,
            clip_skip=request.clip_skip,
            guidance_rescale=request.guidance_rescale,
            height=actual_height,
            width=actual_width,
            generation_time=total_generation_time,
            num_images=len(images),  # Store the number of images generated
            # Image-to-image specific fields
            input_image_path=input_image_path,
            processed_image=processed_image_path,
            strength=request.strength if (is_img2img or is_inpainting) else 0.8,
            is_img2img=is_img2img,
            # Inpainting specific fields
            mask_image_path=mask_image_path,
            is_inpainting=is_inpainting,
            is_controlnet=request.is_controlnet,
            scheduler=request.scheduler,
            # Intermediate image saving
            saved_intermediate_images=request.save_intermediate_images,
        )
        save_to_history(history_item, experiment_name)

        # Save output metadata to tmp_json.json
        output_data = {
            "id": generation_id,
            "prompt": request.prompt,
            "adaptor": request.adaptor,
            "adaptor_scale": request.adaptor_scale,
            "image_folder": images_folder,
            "num_images": len(images),
            "timestamp": timestamp,
            "generation_time": total_generation_time,
            "error_code": 0,
        }

        output_path = os.path.join(images_folder, "tmp_json.json")
        async with await storage.open(output_path, "w") as f:
            await f.write(json.dumps(output_data, indent=2))

        tlab_diffusion.progress_update(100)

    except Exception as e:
        print(f"Error during image generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


diffusion_generate_job()
