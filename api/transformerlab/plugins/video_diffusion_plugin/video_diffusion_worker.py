import argparse
import json
import os
import time
import torch
import gc
import base64
from io import BytesIO
from PIL import Image
import imageio
from diffusers import (
    StableVideoDiffusionPipeline,
    WanPipeline,
    AutoencoderKL,
    WanImageToVideoPipeline,
    AutoPipelineForText2Image,
)
from pydantic import BaseModel, ValidationError
from huggingface_hub import model_info


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
    negative_prompt: str = ""
    height: int = 576
    width: int = 1024
    # Image-to-video specific fields
    input_image: str = ""
    strength: float = 0.8
    is_img2video: bool = False
    motion_bucket_id: int = 127
    noise_aug_strength: float = 0.02
    # Text-to-video specific fields
    is_text2video: bool = False
    guidance_scale: float = 5.0
    guidance_scale_2: float = 3.0


def cleanup_pipeline(pipe=None):
    """Clean up pipeline to free VRAM."""
    try:
        if pipe is not None:
            del pipe
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception as e:
        print(f"Error during pipeline cleanup: {e}")


def get_pipeline(
    model: str,
    device: str = "cuda",
    is_img2video: bool = False,
    is_text2video: bool = False,
):
    """Load the appropriate video diffusion pipeline."""
    try:
        info = model_info(model)
        config = getattr(info, "config", {})
        diffusers_config = config.get("diffusers", {})
        architecture = diffusers_config.get("_class_name", "")
    except Exception as e:
        print(f"Could not get model info from hub, falling back to basic logic. Error: {e}")
        architecture = ""

    if is_text2video:
        try:
            # Specific VAE loading for WanPipeline as per documentation
            vae = AutoencoderKL.from_pretrained(model, subfolder="vae", torch_dtype=torch.float32)
            pipe = WanPipeline.from_pretrained(
                model,
                vae=vae,
                torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            )
            print(f"Loaded text-to-video (WanPipeline) for model {model} on device {device}")
        except Exception as e:
            print(f"Failed to load WanPipeline, falling back to AutoPipeline. Error: {e}")
            # Fallback for other potential text-to-video pipelines
            pipe = AutoPipelineForText2Image.from_pretrained(
                model,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            )
            print(f"Loaded generic text-to-video pipeline for model {model} on device {device}")
    elif is_img2video:
        if architecture == "WanImageToVideoPipeline":
            pipe = WanImageToVideoPipeline.from_pretrained(
                model,
                torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32,
            )
            print(f"Loaded image-to-video (WanImageToVideoPipeline) for model {model} on device {device}")
        else:
            # Default to StableVideoDiffusionPipeline for other img2video models
            pipe = StableVideoDiffusionPipeline.from_pretrained(
                model,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
                variant="fp16" if device == "cuda" else None,
            )
            print(f"Loaded image-to-video (StableVideoDiffusionPipeline) for model {model} on device {device}")
    else:
        # Default case or error
        raise ValueError("Pipeline type could not be determined. Set 'is_text2video' or 'is_img2video'.")

    pipe.to(device)
    return pipe


def write_result(output_dir, success, **kwargs):
    """Write the result of the generation to a JSON file."""
    result = {"success": success, **kwargs}
    result_path = os.path.join(output_dir, "result.json")
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)


# --- Main Worker Logic ---


def main():
    parser = argparse.ArgumentParser(description="Video Diffusion Worker")
    parser.add_argument("--config", type=str, required=True, help="Path to the configuration JSON file.")
    parser.add_argument("--output-dir", type=str, required=True, help="Directory to save the output video and result.")
    parser.add_argument("--worker-id", type=str, required=True, help="Unique ID for this generation job.")
    args = parser.parse_args()

    try:
        # Load configuration
        with open(args.config, "r") as f:
            config = json.load(f)

        # Validate configuration
        try:
            request = VideoDiffusionRequest(**config)
        except ValidationError as e:
            raise ValueError(f"Invalid configuration: {e}")

        # Setup device
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu":
            print("Warning: Running on CPU. This will be very slow.")

        # Determine generation type
        is_text2video = request.is_text2video
        is_img2video = not is_text2video and (request.is_img2video or bool(request.input_image.strip()))

        if not is_text2video and not is_img2video:
            raise ValueError("An input image is required for video generation unless 'is_text2video' is enabled.")

        # Load pipeline
        print(f"Loading model: {request.model}")
        pipe = get_pipeline(
            request.model,
            device,
            is_img2video=is_img2video,
            is_text2video=is_text2video,
        )

        # Prepare input image if provided
        input_image_obj = None
        if is_img2video:
            try:
                image_data = base64.b64decode(request.input_image)
                input_image_obj = Image.open(BytesIO(image_data)).convert("RGB")
                print("Input image loaded successfully.")
            except Exception as e:
                raise ValueError(f"Failed to decode or open input image: {e}")
        elif not is_text2video:
            # SVD requires an input image
            raise ValueError("Image-to-video generation requires an input image.")

        # Set seed
        seed = request.seed
        if seed is None or seed < 0:
            seed = torch.randint(0, 2**32 - 1, (1,)).item()
        generator = torch.manual_seed(seed)
        print(f"Using seed: {seed}")

        # Start generation
        generation_start_time = time.time()
        print("Starting video generation...")

        generation_kwargs = {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "height": request.height,
            "width": request.width,
            "num_inference_steps": request.num_inference_steps,
            "num_frames": request.num_frames,
            "generator": generator,
        }

        if is_text2video:
            generation_kwargs["guidance_scale"] = request.guidance_scale
            if isinstance(pipe, WanPipeline):
                generation_kwargs["guidance_scale_2"] = request.guidance_scale_2
        elif is_img2video:
            generation_kwargs["image"] = input_image_obj
            if isinstance(pipe, WanImageToVideoPipeline):
                generation_kwargs["guidance_scale"] = request.guidance_scale
            elif isinstance(pipe, StableVideoDiffusionPipeline):
                generation_kwargs["motion_bucket_id"] = request.motion_bucket_id
                generation_kwargs["noise_aug_strength"] = request.noise_aug_strength
                generation_kwargs["decode_chunk_size"] = 8

        frames = pipe(**generation_kwargs).frames[0]

        generation_time = time.time() - generation_start_time
        print(f"Video generation completed in {generation_time:.2f} seconds.")

        # Save video
        video_filename = "video.mp4"
        video_path = os.path.join(args.output_dir, video_filename)
        imageio.mimsave(video_path, frames, fps=request.fps)
        print(f"Video saved to {video_path}")

        # Write success result
        write_result(
            args.output_dir,
            success=True,
            video_path=video_path,
            generation_time=generation_time,
            seed=seed,
        )

    except Exception as e:
        error_message = str(e)
        print(f"Error in video diffusion worker: {error_message}")
        # Write failure result
        write_result(
            args.output_dir,
            success=False,
            error=error_message,
        )
    finally:
        # Cleanup
        cleanup_pipeline()
        print("Worker finished.")


if __name__ == "__main__":
    main()
