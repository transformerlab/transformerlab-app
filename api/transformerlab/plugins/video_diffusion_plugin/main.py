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
from diffusers import StableVideoDiffusionPipeline, AutoPipelineForText2Image, AutoPipelineForImage2Image
import os
import sys
import random
import json
from datetime import datetime
import time
from PIL import Image
import imageio

from transformerlab.sdk.v1.diffusion import tlab_diffusion

HISTORY_FILE = "history.json"


class VideoDiffusionRequest(BaseModel):
    plugin: str = "video_diffusion"
    model: str
    prompt: str = ""
    use_multi_gpu: bool = False
    enable_sharding: bool = True
    num_inference_steps: int = 25
    seed: int | None = None
    num_frames: int = 25
    fps: int = 7
    generation_id: str | None = None
    # Negative prompting
    negative_prompt: str = ""
    height: int = 576
    width: int = 1024
    # Image-to-video specific fields
    input_image: str = ""
    strength: float = 0.8
    is_img2video: bool = False
    motion_bucket_id: int = 127
    noise_aug_strength: float = 0.02


class VideoHistoryItem(BaseModel):
    id: str
    model: str
    prompt: str
    num_inference_steps: int
    seed: int | None
    video_path: str
    timestamp: str
    negative_prompt: str
    height: int
    width: int
    generation_time: float = 0.0
    num_frames: int
    fps: int
    # Image-to-video specific fields
    input_image_path: str = ""
    strength: float = 0.8
    is_img2video: bool = False
    motion_bucket_id: int = 127
    noise_aug_strength: float = 0.02


_PIPELINES_LOCK = threading.Lock()


def cleanup_pipeline(pipe=None):
    """Clean up pipeline to free VRAM"""
    try:
        if pipe is not None:
            # Clean up pipeline components explicitly
            if hasattr(pipe, "unet") and pipe.unet is not None:
                del pipe.unet
            if hasattr(pipe, "image_encoder") and pipe.image_encoder is not None:
                del pipe.image_encoder
            if hasattr(pipe, "vae") and pipe.vae is not None:
                del pipe.vae
            if hasattr(pipe, "scheduler") and pipe.scheduler is not None:
                del pipe.scheduler
            del pipe

        # Garbage collection multiple times
        gc.collect()
        gc.collect()

        if torch.cuda.is_available():
            # Clear CUDA cache
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
            torch.cuda.ipc_collect()
            torch.cuda.empty_cache()

    except Exception as e:
        print(f"Error during pipeline cleanup: {e}")


def get_pipeline(
    model: str,
    device: str = "cuda",
    is_img2video: bool = False,
):
    with _PIPELINES_LOCK:
        if is_img2video:
            pipe = StableVideoDiffusionPipeline.from_pretrained(
                model,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                variant="fp16" if device == "cuda" else None,
            )
            print(f"Loaded image-to-video pipeline for model {model} on device {device}")
        else:
            pass

        pipe.to(device)
        return pipe


def get_python_executable():
    """Get the path to the current Python executable."""
    return sys.executable


def get_diffusion_dir(experiment_name: str = None):
    """Get the diffusion directory path."""
    workspace_dir = get_workspace_dir()
    if experiment_name is not None:
        return storage.join(workspace_dir, "experiments", experiment_name, "diffusion")
    else:
        return storage.join(workspace_dir, "diffusion")


def get_videos_dir(experiment_name: str = None):
    """Get the videos directory path."""
    return storage.join(get_diffusion_dir(experiment_name), "videos")


def get_history_file_path(experiment_name: str = None):
    """Get the history file path."""
    return storage.join(get_diffusion_dir(experiment_name), HISTORY_FILE)


def ensure_directories(experiment_name: str = None):
    """Ensure diffusion and videos directories exist."""
    diffusion_dir = get_diffusion_dir(experiment_name)
    videos_dir = get_videos_dir(experiment_name)
    history_file_dir = get_history_file_path(experiment_name)

    os.makedirs(diffusion_dir, exist_ok=True)
    os.makedirs(videos_dir, exist_ok=True)
    if not storage.exists(history_file_dir):
        with storage.open(history_file_dir, "a"):
            pass


def save_to_history(item: VideoHistoryItem, experiment_name: str = None):
    """Save a video generation record to history."""
    ensure_directories(experiment_name)
    history_file_path = get_history_file_path(experiment_name)

    history = []
    if storage.exists(history_file_path):
        try:
            with storage.open(history_file_path, "r") as f:
                history = json.load(f)
        except (json.JSONDecodeError, FileNotFoundError):
            history = []

    # Add new item to the beginning of the list
    history.insert(0, item.model_dump())

    # Save updated history
    with storage.open(history_file_path, "w") as f:
        json.dump(history, f, indent=4)


@tlab_diffusion.async_job_wrapper(progress_start=0, progress_end=100)
async def video_diffusion_generate_job():
    job_config = tlab_diffusion.params.copy()

    experiment_name = job_config.get("experiment_name", None)
    if experiment_name and experiment_name != "default":
        print(f"Using experiment-specific paths for experiment: {experiment_name}")
    else:
        experiment_name = None
        print("Using legacy global paths")

    if "input_image_path" in job_config and job_config["input_image_path"]:
        try:
            with open(job_config["input_image_path"], "rb") as f:
                encoded = base64.b64encode(f.read()).decode("utf-8")
            job_config["input_image"] = encoded
        except Exception as e:
            print(f"[main.py] Failed to encode input_image_path: {e}", flush=True)
        finally:
            del job_config["input_image_path"]

    valid_keys = VideoDiffusionRequest.model_fields.keys()
    filtered_config = {k: v for k, v in job_config.items() if k in valid_keys}

    try:
        request = VideoDiffusionRequest(**filtered_config)
    except ValidationError as e:
        print(f"[VIDEO DIFFUSION] Validation error: {e}", flush=True)
        raise HTTPException(status_code=422, detail="Invalid request parameters")

    try:
        tlab_diffusion.progress_update(0)
        generation_id = request.generation_id
        print(f"Generation ID: {generation_id}", flush=True)
        timestamp = datetime.now().isoformat()

        if not generation_id.replace("-", "").isalnum() or len(generation_id) != 36:
            raise HTTPException(status_code=400, detail="Invalid generation_id format")

        ensure_directories(experiment_name)
        videos_folder = os.path.normpath(os.path.join(get_videos_dir(experiment_name), generation_id))
        if not videos_folder.startswith(get_videos_dir(experiment_name)):
            raise HTTPException(status_code=400, detail="Invalid generation_id leading to unsafe path")
        os.makedirs(videos_folder, exist_ok=True)

        is_img2video = request.is_img2video or bool(request.input_image.strip())

        input_image_obj = None
        input_image_path = ""
        uuid_suffix = str(generation_id)

        if is_img2video:
            try:
                image_data = base64.b64decode(request.input_image)
                input_image_obj = Image.open(BytesIO(image_data)).convert("RGB")

                ensure_directories(experiment_name)
                input_image_filename = f"input_image_{uuid_suffix}.png"
                input_image_path = os.path.join(get_videos_dir(experiment_name), input_image_filename)
                input_image_obj.save(input_image_path, format="PNG")
            except Exception as e:
                print(f"[VIDEO DIFFUSION] Failed to process input image: {e}", flush=True)
                raise HTTPException(status_code=400, detail="Invalid input image data")

        tlab_diffusion.progress_update(10)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu":
            device = "mps" if torch.backends.mps.is_available() else "cpu"
        cleanup_pipeline()
        pipe = get_pipeline(
            model=request.model,
            device=device,
            is_img2video=is_img2video,
        )
        tlab_diffusion.progress_update(30)

        if request.seed is None or request.seed < 0:
            request.seed = random.randint(0, 2**32 - 1)
        else:
            seed = request.seed

        generator = torch.manual_seed(seed)

        def run_pipe():
            try:
                generation_kwargs = {
                    "image": input_image_obj,
                    "height": request.height,
                    "width": request.width,
                    "num_inference_steps": request.num_inference_steps,
                    "seed": seed,
                    "num_frames": request.num_frames,
                    "motion_bucket_id": request.motion_bucket_id,
                    "noise_aug_strength": request.noise_aug_strength,
                    "decode_chunk_size": 8,
                    "generator": generator,
                }

                def progress_callback(step, timestep, latents):
                    progress = 30 + int(70 * (step / request.num_inference_steps))
                    tlab_diffusion.progress_update(progress)

                generation_kwargs["callback"] = progress_callback
                result = pipe(**generation_kwargs)
                frames = result.frames[0]

                del result
                del generation_kwargs
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                return frames
            except Exception as e:
                print(f"Error during video generation: {e}", flush=True)
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                raise e

        generation_start_time = time.time()
        print("Starting video generation...")

        frames = await asyncio.get_event_loop().run_in_executor(None, run_pipe)

        generation_time = time.time() - generation_start_time
        print("Starting aggressive memory cleanup")
        cleanup_pipeline(pipe)
        pipe = None
        input_image_obj = None
        generator = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        print("Memory cleanup done")

        tlab_diffusion.progress_update(90)
        video_filename = "video.mp4"
        video_path = os.path.join(videos_folder, video_filename)
        imageio.mimsave(video_path, frames, fps=request.fps)
        print(f"Video saved to {video_path}")

        tlab_diffusion.progress_update(95)
        history_item = VideoHistoryItem(
            id=generation_id,
            model=request.model,
            prompt=request.prompt,
            num_inference_steps=request.num_inference_steps,
            seed=request.seed,
            video_path=video_path,
            timestamp=timestamp,
            negative_prompt=request.negative_prompt,
            height=request.height,
            width=request.width,
            generation_time=generation_time,
            num_frames=request.num_frames,
            fps=request.fps,
            input_image_path=input_image_path,
            strength=request.strength,
            is_img2video=is_img2video,
            motion_bucket_id=request.motion_bucket_id,
            noise_aug_strength=request.noise_aug_strength,
        )
        save_to_history(history_item, experiment_name)

        output_date = {
            "id": generation_id,
            "prompt": request.prompt,
            "video_path": video_path,
            "timestamp": timestamp,
            "generation_time": generation_time,
            "error_code": 0,
        }

        output_path = os.path.join(videos_folder, "output.json")
        with open(output_path, "w") as f:
            json.dump(output_date, f, indent=2)

        tlab_diffusion.progress_update(100)

    except Exception as e:
        print(f"[VIDEO DIFFUSION] Generation failed: {e}", flush=True)
        raise HTTPException(status_code=500, detail="Video generation failed")


video_diffusion_generate_job()
