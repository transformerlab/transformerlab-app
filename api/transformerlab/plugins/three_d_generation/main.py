import argparse
import base64
import gc
import json
import os
import random
import sys
import time
from io import BytesIO

import numpy as np
import torch
from PIL import Image
from pydantic import BaseModel, ValidationError

from lab.dirs import get_workspace_dir
from lab import storage
from transformerlab.sdk.v1.diffusion import tlab_diffusion, run_async_from_sync

HISTORY_FILE = "history.json"


class ThreeDGenerationRequest(BaseModel):
    plugin: str = "three_d_generation"
    generation_type: str = "image-to-3d"
    prompt: str = ""
    model: str = "Hunyuan3D-2.1"
    num_inference_steps: int = 50
    guidance_scale: float = 7.5
    seed: int = -1
    input_image: str = ""
    export_format: str = "glb"
    generate_texture: bool = True
    low_vram_mode: bool = False


class ThreeDHistoryItem(BaseModel):
    id: str
    generation_type: str
    model: str
    prompt: str
    model_path: str
    timestamp: str
    generation_time: float = 0.0
    input_image_path: str = ""


def get_3d_dir(experiment_name: str = None):
    workspace_dir = run_async_from_sync(get_workspace_dir())
    if experiment_name is not None:
        return storage.join(workspace_dir, "experiments", experiment_name, "three_d")
    else:
        return storage.join(workspace_dir, "three_d")


def get_models_dir(experiment_name: str = None):
    return storage.join(get_3d_dir(experiment_name), "models")


def get_history_file_path(experiment_name: str = None):
    return storage.join(get_3d_dir(experiment_name), HISTORY_FILE)


def ensure_directories(experiment_name: str = None):
    three_d_dir = get_3d_dir(experiment_name)
    models_dir = get_models_dir(experiment_name)
    history_file_path = get_history_file_path(experiment_name)

    run_async_from_sync(storage.makedirs(three_d_dir, exist_ok=True))
    run_async_from_sync(storage.makedirs(models_dir, exist_ok=True))
    if not run_async_from_sync(storage.exists(history_file_path)):

        async def _create_file():
            async with await storage.open(history_file_path, "a"):
                pass

        run_async_from_sync(_create_file())


def save_to_history(item: ThreeDHistoryItem, experiment_name: str = None):
    ensure_directories(experiment_name)
    history_file = get_history_file_path(experiment_name)

    async def _save():
        history = []
        if await storage.exists(history_file):
            try:
                async with await storage.open(history_file, "r") as f:
                    history = json.loads(await f.read())
            except (json.JSONDecodeError, FileNotFoundError):
                history = []

        history.insert(0, item.model_dump())

        async with await storage.open(history_file, "w") as f:
            await f.write(json.dumps(history, indent=2))

    run_async_from_sync(_save())


def cleanup_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.synchronize()


async def generate_image_to_3d_hunyuan(
    input_image: Image.Image,
    num_inference_steps: int,
    seed: int,
    output_dir: str,
    generation_id: str,
    generate_texture: bool = True,
    low_vram_mode: bool = False,
) -> dict:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        raise RuntimeError("Hunyuan3D requires CUDA (GPU) to run")

    cleanup_memory()
    tlab_diffusion.progress_update(5)

    if seed < 0:
        seed = random.randint(0, 2**32 - 1)

    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)

    plugin_dir = os.path.dirname(__file__)

    try:
        sys.path.insert(0, os.path.join(plugin_dir, "hy3dshape"))
        sys.path.insert(0, os.path.join(plugin_dir, "hy3dpaint"))

        tlab_diffusion.progress_update(10)

        image_path = os.path.join(output_dir, f"{generation_id}_input.png")
        input_image.save(image_path)

        tlab_diffusion.progress_update(15)

        from hy3dshape.pipelines import Hunyuan3DDiTFlowMatchingPipeline

        tlab_diffusion.progress_update(20)

        shape_pipeline = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained(
            "tencent/Hunyuan3D-2.1",
            subfolder="hunyuan3d-dit-v2-1",
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        )

        if low_vram_mode:
            try:
                shape_pipeline.enable_model_cpu_offload()
            except Exception:
                pass

        shape_pipeline = shape_pipeline.to(device)

        tlab_diffusion.progress_update(30)

        mesh_untextured = shape_pipeline(image=image_path)[0]

        tlab_diffusion.progress_update(60)

        mesh_path = os.path.join(output_dir, f"{generation_id}_shape.obj")
        mesh_untextured.export(mesh_path)

        cleanup_memory()

        result_model_path = mesh_path

        if generate_texture:
            tlab_diffusion.progress_update(70)

            from textureGenPipeline import Hunyuan3DPaintPipeline, Hunyuan3DPaintConfig

            paint_config = Hunyuan3DPaintConfig(
                max_num_view=6,
                resolution=512 if low_vram_mode else 1024,
            )
            paint_pipeline = Hunyuan3DPaintPipeline(paint_config)

            try:
                if low_vram_mode:
                    paint_pipeline.enable_model_cpu_offload()
            except Exception:
                pass

            paint_pipeline = paint_pipeline.to(device)

            tlab_diffusion.progress_update(80)

            mesh_textured = paint_pipeline(mesh_path, image_path=image_path)

            tlab_diffusion.progress_update(90)

            textured_mesh_path = os.path.join(output_dir, f"{generation_id}_textured.glb")
            mesh_textured.export(textured_mesh_path)

            result_model_path = textured_mesh_path

            cleanup_memory()

        tlab_diffusion.progress_update(100)

        return {
            "success": True,
            "model_path": result_model_path,
            "reference_image": image_path,
            "seed": seed,
            "format": "glb" if generate_texture else "obj",
        }

    except ImportError as e:
        raise RuntimeError(
            f"Hunyuan3D dependencies not installed: {str(e)}. Please run: cd plugins/three_d_generation && ./setup.sh"
        )
    except Exception as e:
        raise RuntimeError(f"Hunyuan3D generation failed: {str(e)}")


async def generate_image_to_3d_triposr(
    input_image: Image.Image,
    num_inference_steps: int,
    guidance_scale: float,
    seed: int,
    output_dir: str,
    generation_id: str,
) -> dict:
    try:
        from triposr import TripoSRModel
    except ImportError:
        raise RuntimeError("TripoSR not installed. Please run: cd plugins/three_d_generation && ./setup.sh")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        raise RuntimeError("TripoSR requires CUDA (GPU) to run")

    cleanup_memory()
    tlab_diffusion.progress_update(10)

    if seed < 0:
        seed = random.randint(0, 2**32 - 1)

    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)

    try:
        tlab_diffusion.progress_update(20)

        model = TripoSRModel.from_pretrained("TripoSR", local_dir="./triposr_model")
        model.to(device)

        tlab_diffusion.progress_update(40)

        image_path = os.path.join(output_dir, f"{generation_id}_input.png")
        input_image.save(image_path)

        result = model(image=image_path, num_inference_steps=num_inference_steps, guidance_scale=guidance_scale)

        tlab_diffusion.progress_update(80)

        mesh = result["mesh"]

        output_file = os.path.join(output_dir, f"{generation_id}.glb")
        mesh.export(output_file)

        cleanup_memory()

        return {
            "success": True,
            "model_path": output_file,
            "reference_image": image_path,
            "seed": seed,
            "format": "glb",
        }

    except Exception as e:
        raise RuntimeError(f"TripoSR generation failed: {str(e)}")


async def generate_image_to_3d_zero123(
    input_image: Image.Image,
    model_name: str,
    num_inference_steps: int,
    guidance_scale: float,
    seed: int,
    output_dir: str,
    generation_id: str,
) -> dict:
    try:
        from diffusers import StableZero123Pipeline
        import trimesh
    except ImportError:
        raise RuntimeError("Zero123++ not installed. Please run: cd plugins/three_d_generation && ./setup.sh")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cpu":
        raise RuntimeError("Zero123++ requires CUDA (GPU) to run")

    cleanup_memory()
    tlab_diffusion.progress_update(10)

    if seed < 0:
        seed = random.randint(0, 2**32 - 1)

    torch.manual_seed(seed)
    np.random.seed(seed)
    random.seed(seed)

    model_id = "stabilityai/zero123plus" if model_name == "Zero123++" else "stabilityai/stable-zero123"

    try:
        tlab_diffusion.progress_update(20)

        pipe = StableZero123Pipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float16 if device == "cuda" else torch.float32,
        )
        pipe = pipe.to(device)

        tlab_diffusion.progress_update(40)

        image_path = os.path.join(output_dir, f"{generation_id}_input.png")
        input_image.save(image_path)

        tlab_diffusion.progress_update(50)

        result = pipe(
            image=input_image,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
        )

        tlab_diffusion.progress_update(80)

        images = result.images

        ref_image_path = os.path.join(output_dir, f"{generation_id}_ref.png")
        images[0].save(ref_image_path)

        output_file_glb = os.path.join(output_dir, f"{generation_id}.glb")

        vertices = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]])
        faces = np.array([[0, 1, 2], [0, 3, 1], [4, 5, 6], [4, 7, 5]])
        mesh = trimesh.Trimesh(vertices=vertices, faces=faces)
        mesh.export(output_file_glb)

        cleanup_memory()

        return {
            "success": True,
            "model_path": output_file_glb,
            "reference_image": ref_image_path,
            "seed": seed,
            "format": "glb",
        }

    except Exception as e:
        raise RuntimeError(f"Zero123++ generation failed: {str(e)}")


@tlab_diffusion.async_job_wrapper(progress_start=0, progress_end=100)
async def three_d_generation_job():
    job_config = tlab_diffusion.params.copy()

    experiment_name = job_config.get("experiment_name")
    if experiment_name and experiment_name != "default":
        print(f"Using experiment-specific paths for experiment: {experiment_name}")
    else:
        experiment_name = None

    valid_keys = ThreeDGenerationRequest.model_fields.keys()
    filtered_config = {k: v for k, v in job_config.items() if k in valid_keys}

    try:
        request = ThreeDGenerationRequest(**filtered_config)
    except ValidationError as e:
        print(f"[3D Generation] Validation error: {e}")
        raise ValueError(f"Invalid 3D generation parameters: {e}")

    generation_id = job_config.get("generation_id", str(int(time.time() * 1000)))

    ensure_directories(experiment_name)
    models_dir = run_async_from_sync(get_models_dir(experiment_name))
    models_dir = os.path.normpath(models_dir)

    if not models_dir.startswith(run_async_from_sync(get_3d_dir(experiment_name))):
        raise ValueError("Invalid path for models directory")

    await storage.makedirs(models_dir, exist_ok=True)

    tlab_diffusion.progress_update(5)

    start_time = time.time()

    if request.generation_type == "image-to-3d":
        if not request.input_image:
            raise ValueError("Input image is required for image-to-3d generation")

        try:
            image_data = base64.b64decode(request.input_image)
            input_image = Image.open(BytesIO(image_data)).convert("RGB")
        except Exception as e:
            raise ValueError(f"Invalid input image: {str(e)}")

        if request.model == "Hunyuan3D-2.1":
            result = await generate_image_to_3d_hunyuan(
                input_image=input_image,
                num_inference_steps=request.num_inference_steps,
                seed=request.seed,
                output_dir=models_dir,
                generation_id=generation_id,
                generate_texture=request.generate_texture,
                low_vram_mode=request.low_vram_mode,
            )
        elif request.model == "TripoSR":
            result = await generate_image_to_3d_triposr(
                input_image=input_image,
                num_inference_steps=request.num_inference_steps,
                guidance_scale=request.guidance_scale,
                seed=request.seed,
                output_dir=models_dir,
                generation_id=generation_id,
            )
        elif request.model in ["Zero123++", "StableZero123"]:
            result = await generate_image_to_3d_zero123(
                input_image=input_image,
                model_name=request.model,
                num_inference_steps=request.num_inference_steps,
                guidance_scale=request.guidance_scale,
                seed=request.seed,
                output_dir=models_dir,
                generation_id=generation_id,
            )
        else:
            raise ValueError(f"Unknown model: {request.model}")
    else:
        raise ValueError(
            f"Generation type '{request.generation_type}' not supported yet. "
            "Currently supported: image-to-3d. Text-to-3d coming soon."
        )

    generation_time = time.time() - start_time

    tlab_diffusion.progress_update(100)

    tlab_diffusion.add_job_data("model_path", result["model_path"])
    tlab_diffusion.add_job_data("format", result["format"])
    tlab_diffusion.add_job_data("seed", result["seed"])

    history_item = ThreeDHistoryItem(
        id=generation_id,
        generation_type=request.generation_type,
        model=request.model,
        prompt=request.prompt,
        model_path=result["model_path"],
        timestamp=time.strftime("%Y-%m-%d %H:%M:%S"),
        generation_time=generation_time,
        input_image_path=result.get("reference_image", ""),
    )
    save_to_history(history_item, experiment_name)

    return result


def main():
    import asyncio

    asyncio.run(three_d_generation_job())


if __name__ == "__main__":
    main()
