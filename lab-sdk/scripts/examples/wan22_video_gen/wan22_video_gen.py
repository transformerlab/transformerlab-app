#!/usr/bin/env python3
"""
Wan 2.2 video generation script using the Wan AI video generation model.

Generates a video from a text prompt using Wan2.2-T2V (text-to-video) or
Wan2.2-I2V (image-to-video) and saves the result as a job artifact.

Requirements:
    pip install torch torchvision diffusers transformers accelerate

Model: Wan-AI/Wan2.2-T2V-A14B (or Wan-AI/Wan2.2-T2V-1.3B for a smaller model)
"""

import os
import argparse
import json
from datetime import datetime

from lab import lab


def generate_video(
    prompt: str,
    model_id: str,
    num_frames: int,
    height: int,
    width: int,
    guidance_scale: float,
    num_inference_steps: int,
    seed: int,
    output_dir: str,
) -> str:
    """
    Generate a video from a text prompt using Wan2.2.

    Returns the path to the generated video file.
    """
    import torch
    from diffusers import AutoencoderKLWan, WanPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
    from diffusers.utils import export_to_video

    lab.log(f"Loading Wan2.2 model: {model_id}")
    lab.update_progress(10)

    # Use float16 if CUDA is available to save VRAM, else float32 for CPU
    dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    device = "cuda" if torch.cuda.is_available() else "cpu"
    lab.log(f"Using device: {device}, dtype: {dtype}")

    # Load VAE separately to allow dtype override (required for Wan2.2)
    vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae", torch_dtype=torch.float32)

    # Load the full pipeline
    pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=dtype)
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=8.0)
    pipe.to(device)

    lab.log(f"Model loaded. Generating video for prompt: '{prompt}'")
    lab.update_progress(30)

    # Set random seed for reproducibility
    generator = torch.Generator(device=device).manual_seed(seed)

    # Run inference
    output = pipe(
        prompt=prompt,
        negative_prompt="low quality, blurry, distorted, watermark, text",
        height=height,
        width=width,
        num_frames=num_frames,
        guidance_scale=guidance_scale,
        num_inference_steps=num_inference_steps,
        generator=generator,
    )

    lab.update_progress(80)
    lab.log("Video generation complete. Saving to disk...")

    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = os.path.join(output_dir, f"wan22_output_{timestamp}.mp4")

    export_to_video(output.frames[0], output_path, fps=16)
    lab.log(f"Video saved: {output_path}")
    return output_path


def main() -> None:
    """
    Entry point when running as a TransformerLab job.

    Reads parameters from job config (set via task.yaml `parameters` block or
    overridden at launch time), generates a video, and saves it as an artifact.
    """
    lab.init()

    # Read parameters from job config; fall back to defaults
    config = lab.get_config()
    params = config.get("parameters", config)  # support both nested and flat

    prompt = params.get("prompt", "A serene mountain landscape at sunset with clouds drifting by")
    model_id = params.get("model_id", "Wan-AI/Wan2.2-T2V-1.3B")
    num_frames = int(params.get("num_frames", 49))
    height = int(params.get("height", 480))
    width = int(params.get("width", 832))
    guidance_scale = float(params.get("guidance_scale", 5.0))
    num_inference_steps = int(params.get("num_inference_steps", 50))
    seed = int(params.get("seed", 42))
    output_dir = params.get("output_dir", os.getenv("OUTPUT_DIR", "./wan22_output"))

    lab.log(f"Starting Wan2.2 video generation")
    lab.log(f"Prompt: {prompt}")
    lab.log(f"Model: {model_id}")
    lab.log(f"Frames: {num_frames}, Resolution: {width}x{height}")

    try:
        video_path = generate_video(
            prompt=prompt,
            model_id=model_id,
            num_frames=num_frames,
            height=height,
            width=width,
            guidance_scale=guidance_scale,
            num_inference_steps=num_inference_steps,
            seed=seed,
            output_dir=output_dir,
        )

        lab.update_progress(90)

        # Save generation metadata alongside the video
        meta_path = video_path.replace(".mp4", "_metadata.json")
        with open(meta_path, "w") as f:
            json.dump(
                {
                    "prompt": prompt,
                    "model_id": model_id,
                    "num_frames": num_frames,
                    "height": height,
                    "width": width,
                    "guidance_scale": guidance_scale,
                    "num_inference_steps": num_inference_steps,
                    "seed": seed,
                    "generated_at": datetime.now().isoformat(),
                },
                f,
                indent=2,
            )

        # Save video and metadata as artifacts
        saved_video = lab.save_artifact(video_path, name=os.path.basename(video_path))
        saved_meta = lab.save_artifact(meta_path, name=os.path.basename(meta_path))
        lab.log(f"Artifacts saved: {saved_video}, {saved_meta}")

        lab.finish("Wan2.2 video generation completed successfully")

    except KeyboardInterrupt:
        lab.error("Stopped by user")

    except Exception as e:
        import traceback

        lab.log(f"Error during video generation: {e}")
        lab.log(traceback.format_exc())
        lab.error(str(e))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a video with Wan2.2")
    parser.add_argument("--prompt", type=str, default=None, help="Text prompt for video generation")
    parser.add_argument("--model-id", type=str, default=None, help="HuggingFace model ID")
    parser.add_argument("--num-frames", type=int, default=None, help="Number of frames to generate")
    parser.add_argument("--height", type=int, default=None, help="Video height in pixels")
    parser.add_argument("--width", type=int, default=None, help="Video width in pixels")
    parser.add_argument("--steps", type=int, default=None, help="Number of inference steps")
    parser.add_argument("--seed", type=int, default=None, help="Random seed")
    args = parser.parse_args()

    # Inject CLI args into env so lab.get_config() picks them up via parameters
    if args.prompt:
        os.environ.setdefault("WAN_PROMPT", args.prompt)
    if args.model_id:
        os.environ.setdefault("WAN_MODEL_ID", args.model_id)

    main()
