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
from diffusers import StableVideoDiffusionPipeline
from pydantic import BaseModel, ValidationError


# --- Pydantic Models (copied from main.py for validation) ---
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
    input_image: str = ""
    strength: float = 0.8
    is_img2video: bool = False
    motion_bucket_id: int = 127
    noise_aug_strength: float = 0.02


# --- Helper Functions (adapted from main.py) ---


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


def get_pipeline(model: str, device: str = "cuda"):
    """Load the StableVideoDiffusionPipeline."""
    try:
        pipe = StableVideoDiffusionPipeline.from_pretrained(
            model,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            variant="fp16" if device == "cuda" else None,
        )
        pipe.to(device)
        return pipe
    except Exception as e:
        print(f"Failed to load pipeline for model {model}: {e}")
        raise


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

        # Load pipeline
        print(f"Loading model: {request.model}")
        pipe = get_pipeline(request.model, device)

        # Prepare input image if provided
        input_image_obj = None
        is_img2video = request.is_img2video or bool(request.input_image.strip())
        if is_img2video:
            try:
                image_data = base64.b64decode(request.input_image)
                input_image_obj = Image.open(BytesIO(image_data)).convert("RGB")
                print("Input image loaded successfully.")
            except Exception as e:
                raise ValueError(f"Failed to decode or open input image: {e}")
        else:
            # SVD requires an input image
            raise ValueError("Video generation requires an input image.")

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
            "image": input_image_obj,
            "height": request.height,
            "width": request.width,
            "num_inference_steps": request.num_inference_steps,
            "num_frames": request.num_frames,
            "motion_bucket_id": request.motion_bucket_id,
            "noise_aug_strength": request.noise_aug_strength,
            "decode_chunk_size": 8,
            "generator": generator,
        }

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
