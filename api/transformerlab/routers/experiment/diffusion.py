from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from huggingface_hub import model_info
from fastapi.responses import FileResponse, JSONResponse
import os
from werkzeug.utils import secure_filename
import json
import uuid
from typing import List
from transformerlab.services.dataset_service import create_local_dataset
from transformerlab.models import model_helper
from lab import Dataset, storage
from lab.dirs import get_workspace_dir
from transformerlab.shared.shared import slugify
from transformerlab.services.job_service import job_create
import logging


router = APIRouter(prefix="/diffusion", tags=["diffusion"])


ALLOWED_TEXT2IMG_ARCHITECTURES = [
    "StableDiffusionPipeline",
    "StableDiffusion3Pipeline",
    "StableDiffusionXLPipeline",
    "StableDiffusion3PAGPipeline",
    "StableDiffusionControlNetPAGPipeline",
    "StableDiffusionXLPAGPipeline",
    "StableDiffusionXLControlNetPAGPipeline",
    "FluxPipeline",
    "FluxControlPipeline",
    "FluxControlNetPipeline",
    "LuminaPipeline",
    "Lumina2Pipeline",
    "CogView3PlusPipeline",
    "CogView4Pipeline",
    "CogView4ControlPipeline",
    "IFPipeline",
    "HunyuanDiTPipeline",
    "HunyuanDiTPAGPipeline",
    "KandinskyCombinedPipeline",
    "KandinskyV22CombinedPipeline",
    "Kandinsky3Pipeline",
    "StableDiffusionControlNetPipeline",
    "StableDiffusionXLControlNetPipeline",
    "StableDiffusionXLControlNetUnionPipeline",
    "StableDiffusion3ControlNetPipeline",
    "WuerstchenCombinedPipeline",
    "StableCascadeCombinedPipeline",
    "LatentConsistencyModelPipeline",
    "PixArtAlphaPipeline",
    "PixArtSigmaPipeline",
    "SanaPipeline",
    "PixArtSigmaPAGPipeline",
    "AuraFlowPipeline",
    "StableDiffusionImg2ImgPipeline",
    "StableDiffusionXLImg2ImgPipeline",
    "StableDiffusion3Img2ImgPipeline",
    "StableDiffusion3PAGImg2ImgPipeline",
    "IFImg2ImgPipeline",
    "KandinskyImg2ImgCombinedPipeline",
    "KandinskyV22Img2ImgCombinedPipeline",
    "Kandinsky3Img2ImgPipeline",
    "StableDiffusionControlNetImg2ImgPipeline",
    "StableDiffusionPAGImg2ImgPipeline",
    "StableDiffusionXLControlNetImg2ImgPipeline",
    "StableDiffusionXLControlNetUnionImg2ImgPipeline",
    "StableDiffusionXLPAGImg2ImgPipeline",
    "StableDiffusionXLControlNetPAGImg2ImgPipeline",
    "LatentConsistencyModelImg2ImgPipeline",
    "FluxImg2ImgPipeline",
    "FluxControlNetImg2ImgPipeline",
    "FluxControlImg2ImgPipeline",
    "StableDiffusionInpaintPipeline",
    "StableDiffusionXLInpaintPipeline",
    "StableDiffusion3InpaintPipeline",
    "StableDiffusionPipeline",
    "StableDiffusion3Pipeline",
    "StableDiffusionXLPipeline",
    "KandinskyInpaintPipeline",
    "KandinskyV22InpaintPipeline",
    "Kandinsky3Pipeline",
    "StableDiffusionControlNetInpaintPipeline",
    "StableDiffusionXLControlNetInpaintPipeline",
    "IFInpaintingPipeline",
    "IFPipeline",
    "DiffusionPipeline",
    "WanPipeline",
    "ZImagePipeline",
]

# Allowed architectures for img2img pipelines
ALLOWED_IMG2IMG_ARCHITECTURES = [
    "StableDiffusionImg2ImgPipeline",
    "StableDiffusionXLImg2ImgPipeline",
    "StableDiffusion3Img2ImgPipeline",
    "StableDiffusion3PAGImg2ImgPipeline",
    "StableDiffusionPipeline",
    "StableDiffusion3Pipeline",
    "StableDiffusionXLPipeline",
    "StableDiffusion3PAGPipeline",
    "IFImg2ImgPipeline",
    "IFPipeline",
    "KandinskyImg2ImgCombinedPipeline",
    "KandinskyCombinedPipeline",
    "KandinskyV22CombinedPipeline",
    "KandinskyV22Img2ImgCombinedPipeline",
    "Kandinsky3Img2ImgPipeline",
    "Kandinsky3Pipeline",
    "StableDiffusionControlNetImg2ImgPipeline",
    "StableDiffusionControlNetPipeline",
    "StableDiffusionPAGImg2ImgPipeline",
    "StableDiffusionPAGPipeline",
    "StableDiffusionXLControlNetImg2ImgPipeline",
    "StableDiffusionXLControlNetPipeline",
    "StableDiffusionXLControlNetUnionImg2ImgPipeline",
    "StableDiffusionXLControlNetUnionPipeline",
    "StableDiffusionXLPAGImg2ImgPipeline",
    "StableDiffusionXLPAGPipeline",
    "StableDiffusionXLControlNetPAGImg2ImgPipeline",
    "StableDiffusionXLControlNetPAGPipeline",
    "LatentConsistencyModelImg2ImgPipeline",
    "LatentConsistencyModelPipeline",
    "DiffusionPipeline",
]

# Allowed architectures for inpainting pipelines
ALLOWED_INPAINTING_ARCHITECTURES = [
    "StableDiffusionInpaintPipeline",
    "StableDiffusionXLInpaintPipeline",
    "StableDiffusion3InpaintPipeline",
    "StableDiffusionPipeline",
    "StableDiffusion3Pipeline",
    "StableDiffusionXLPipeline",
    "KandinskyInpaintPipeline",
    "KandinskyV22InpaintPipeline",
    "Kandinsky3Pipeline",
    "StableDiffusionControlNetInpaintPipeline",
    "StableDiffusionXLControlNetInpaintPipeline",
    "IFInpaintingPipeline",
    "IFPipeline",
]


def _setup_diffusion_logger():
    """Setup logging for the diffusion router that logs to both console and file"""
    logger = logging.getLogger("diffusion")

    # Avoid adding handlers multiple times
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s [DIFFUSION] [%(levelname)s] %(message)s")

    # File handler
    try:
        import asyncio
        from lab.dirs import get_global_log_path

        # Check if there's already an event loop running
        # If so, we can't use asyncio.run() and must skip file handler setup
        # to avoid the "coroutine was never awaited" warning
        try:
            asyncio.get_running_loop()
            # There's a running loop, skip file handler setup
            # (can't use asyncio.run() when loop is already running)
        except RuntimeError:
            # No running event loop, safe to use asyncio.run()
            # Create and immediately await the coroutine
            log_path = asyncio.run(get_global_log_path())
            file_handler = logging.FileHandler(log_path, encoding="utf-8")
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
    except Exception:
        pass  # Continue without file logging if there's an issue

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # Prevent propagation to root logger to avoid affecting other routes
    logger.propagate = False

    return logger


# Initialize the diffusion logger
diffusion_logger = _setup_diffusion_logger()


def log_print(*args, **kwargs):
    """Enhanced logging function for diffusion router"""
    message = " ".join(str(arg) for arg in args)
    diffusion_logger.info(message)


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


class HistoryResponse(BaseModel):
    images: List[ImageHistoryItem]
    total: int


class CreateDatasetRequest(BaseModel):
    dataset_name: str
    image_ids: List[str]
    description: str = ""
    include_metadata: bool = True


# History file path
HISTORY_FILE = "history.json"


async def get_diffusion_dir(experiment_name: str = None, workspace_dir: str | None = None):
    """Get the diffusion directory path"""
    base = workspace_dir or await get_workspace_dir()

    if experiment_name is not None:
        # New experiment-specific path
        return storage.join(base, "experiments", secure_filename(experiment_name), "diffusion")
    else:
        # Legacy global path for backward compatibility
        return storage.join(base, "diffusion")


async def get_images_dir(experiment_name: str = None, workspace_dir: str | None = None):
    """Get the images directory path"""
    return storage.join(await get_diffusion_dir(experiment_name, workspace_dir), "images")


async def get_history_file_path(experiment_name: str = None, workspace_dir: str | None = None):
    """Get the history file path"""
    # Create a history file in the diffusion directory if it doesn't exist
    return storage.join(await get_diffusion_dir(experiment_name, workspace_dir), HISTORY_FILE)


async def ensure_directories(experiment_name: str = None, workspace_dir: str | None = None):
    """Ensure diffusion and images directories exist"""
    diffusion_dir = await get_diffusion_dir(experiment_name, workspace_dir)
    images_dir = await get_images_dir(experiment_name, workspace_dir)
    history_file_path = await get_history_file_path(experiment_name, workspace_dir)

    await storage.makedirs(diffusion_dir, exist_ok=True)
    await storage.makedirs(images_dir, exist_ok=True)
    if not await storage.exists(history_file_path):
        async with await storage.open(history_file_path, "a"):
            # Create the history file if it doesn't exist
            pass


async def load_history(
    limit: int = 50, offset: int = 0, experiment_name: str = None, workspace_dir: str | None = None
) -> HistoryResponse:
    """Load image generation history from both new and old paths for backward compatibility"""
    all_images = []

    # Load from new experiment-specific path if experiment info is provided
    if experiment_name is not None:
        try:
            new_history_file = await get_history_file_path(experiment_name, workspace_dir)
            if await storage.exists(new_history_file):
                async with await storage.open(new_history_file, "r") as f:
                    new_history_data = json.loads(await f.read())
                    all_images.extend(new_history_data)
        except (json.JSONDecodeError, FileNotFoundError):
            pass

    # Load from legacy global path for backward compatibility
    try:
        legacy_history_file = await get_history_file_path(None, workspace_dir)  # No experiment → legacy path
        if await storage.exists(legacy_history_file):
            async with await storage.open(legacy_history_file, "r") as f:
                legacy_history_data = json.loads(await f.read())
                all_images.extend(legacy_history_data)
    except (json.JSONDecodeError, FileNotFoundError):
        pass

    # Remove duplicates based on image ID (in case same image exists in both paths)
    seen_ids = set()
    unique_images = []
    for img in all_images:
        if img.get("id") not in seen_ids:
            seen_ids.add(img.get("id"))
            unique_images.append(img)

    # Sort by timestamp (newest first)
    unique_images.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    # Apply pagination
    total_items = len(unique_images)
    paginated_data = unique_images[offset : offset + limit]

    # Convert to ImageHistoryItem objects
    items = [ImageHistoryItem(**item) for item in paginated_data]

    return HistoryResponse(images=items, total=total_items)


async def find_image_by_id(
    image_id: str, experiment_name: str = None, workspace_dir: str | None = None
) -> ImageHistoryItem | None:
    """Find a specific image by ID without loading all history, searching both new and old paths"""

    # Search in new experiment-specific path first if experiment info is provided
    if experiment_name is not None:
        try:
            new_history_file = await get_history_file_path(experiment_name, workspace_dir)
            if await storage.exists(new_history_file):
                async with await storage.open(new_history_file, "r") as f:
                    history = json.loads(await f.read())
                    for item in history:
                        if item.get("id") == image_id:
                            return ImageHistoryItem(**item)
        except (json.JSONDecodeError, FileNotFoundError):
            pass

    # Search in legacy global path for backward compatibility
    try:
        legacy_history_file = await get_history_file_path(None, workspace_dir)  # No experiment → legacy path
        if await storage.exists(legacy_history_file):
            async with await storage.open(legacy_history_file, "r") as f:
                history = json.loads(await f.read())
                for item in history:
                    if item.get("id") == image_id:
                        return ImageHistoryItem(**item)
    except (json.JSONDecodeError, FileNotFoundError):
        pass

    return None


@router.post("/generate", summary="Generate image with Stable Diffusion")
async def generate_image(experimentId: str, request: DiffusionRequest, http_request: Request):
    try:
        # Validate num_images parameter
        if request.num_images < 1 or request.num_images > 10:
            raise HTTPException(status_code=400, detail="num_images must be between 1 and 10")

        # Validate diffusion type
        from transformerlab.routers.plugins import list_plugins

        installed_plugins = await list_plugins()
        installed_plugins_names = [plugin["uniqueId"] for plugin in installed_plugins]
        if request.plugin not in installed_plugins_names:
            raise HTTPException(status_code=400, detail="Plugin not installed")

        if request.plugin == "image_diffusion":
            request_dict = request.model_dump()
            if request.generation_id:
                generation_id = request.generation_id
            else:
                gen_info = await get_new_generation_id()
                generation_id = gen_info["generation_id"]
            request_dict["generation_id"] = generation_id

            job_config = {
                "plugin": request.plugin,
                "config": request_dict,
            }

            job_id = await job_create(
                type="DIFFUSION", status="QUEUED", job_data=job_config, experiment_id=experimentId
            )

            # Get experiment name for experiment-specific paths
            images_dir = await get_images_dir(experimentId)
            images_folder = storage.join(images_dir, generation_id)
            if not images_folder.startswith(images_dir):  # Validate containment
                raise HTTPException(status_code=400, detail="Invalid generation_id: Path traversal detected.")
            tmp_json_path = storage.join(images_folder, "tmp_json.json")

            return {
                "job_id": job_id,
                "status": "started",
                "generation_id": generation_id,
                "images_folder": images_folder,
                "json_path": tmp_json_path,
                "message": "Diffusion job has been queued and is running in background.",
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported diffusion_type: {request.diffusion_type}",
            )

    except Exception as e:
        log_print(f"Error during image generation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")


@router.post("/is_valid_diffusion_model", summary="Check if model is Stable Diffusion")
async def is_valid_diffusion(experimentId: str, request: DiffusionRequest):
    """
    Returns {"is_valid_diffusion_model": True/False, "reason": "..."}
    """
    model_id = request.model
    if not model_id or model_id.strip() == "":
        return {"is_valid_diffusion_model": False, "reason": "Model ID is empty"}

    try:
        architectures = []

        # First try to get architecture from filesystem; if it fails, fall back gracefully
        try:
            from lab.model import Model as ModelService

            model_service = await ModelService.get(model_id)
            model_data = await model_service.get_metadata()

            if model_data and model_data.get("json_data"):
                json_data = model_data["json_data"]

                # Try to get architecture from various possible locations in json_data
                arch = json_data.get("architecture")
                if not arch:
                    # Try model_index fallback
                    model_index = json_data.get("model_index", {})
                    arch = model_index.get("_class_name")

                if arch:
                    if isinstance(arch, str):
                        architectures = [arch]
                    elif isinstance(arch, list):
                        architectures = arch
                    else:
                        architectures = [str(arch)]
        except Exception:
            # Ignore filesystem errors and proceed to HF fallback
            pass

        # If no architecture found in database, fetch from Hugging Face
        if not architectures:
            info = model_info(model_id)
            config = getattr(info, "config", {})
            diffusers_config = config.get("diffusers", {})
            arch_from_hf = diffusers_config.get("_class_name", "")
            if isinstance(arch_from_hf, str):
                architectures = [arch_from_hf]
            elif isinstance(arch_from_hf, list):
                architectures = arch_from_hf

            print(f"Fetched architecture from Hugging Face for {model_id}: {architectures}")

        if request.is_inpainting:
            # First check if it's already an inpainting-specific architecture
            if any(a in ALLOWED_INPAINTING_ARCHITECTURES for a in architectures):
                return {"is_valid_diffusion_model": True, "reason": "Architecture matches allowed SD inpainting"}

            # Then check if we can derive an inpainting pipeline from a text2img architecture
            # This follows the same logic as diffusers AutoPipelineForInpainting
            for arch in architectures:
                if arch in ALLOWED_TEXT2IMG_ARCHITECTURES and "flux" not in arch.lower():
                    return {
                        "is_valid_diffusion_model": True,
                        "reason": f"Text2img architecture {arch} can be used for inpainting",
                    }
        elif request.is_img2img:
            # Check if this is an img2img model
            if any(a in ALLOWED_IMG2IMG_ARCHITECTURES for a in architectures):
                return {"is_valid_diffusion_model": True, "reason": "Architecture matches allowed SD img2img"}
        else:
            if any(a in ALLOWED_TEXT2IMG_ARCHITECTURES for a in architectures):
                return {"is_valid_diffusion_model": True, "reason": "Architecture matches allowed SD"}

        return {"is_valid_diffusion_model": False, "reason": "No SD indicators found"}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Model not found or error: {str(e)}")


@router.get("/history", summary="Get image generation history", response_model=HistoryResponse)
async def get_history(experimentId: str, limit: int = 50, offset: int = 0, http_request: Request = None):
    """
    Get paginated history of generated images

    Args:
        experimentId: The experiment ID to get history for
        limit: Maximum number of items to return (default 50)
        offset: Number of items to skip (default 0)

    Returns:
        HistoryResponse with list of images and total count
    """
    if limit <= 0:
        raise HTTPException(status_code=400, detail="Limit must be greater than 1")
    if offset < 0:
        raise HTTPException(status_code=400, detail="Offset must be non-negative")

    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()
    return await load_history(limit=limit, offset=offset, experiment_name=experimentId, workspace_dir=workspace_dir)


@router.get("/history/{image_id}", summary="Get the actual image by ID")
async def get_image_by_id(
    experimentId: str,
    image_id: str,
    index: int = 0,
    input_image: bool = False,
    mask_image: bool = False,
    step: bool = False,
    preprocessed: bool = False,
    http_request: Request = None,
):
    """
    Get an image from history by ID and index

    Args:
        image_id: The unique ID of the image set
        index: The index of the image in the set (default 0)
        input_image: Whether to return the input image instead of generated image
        mask_image: Whether to return the mask image instead of generated image
    """
    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()

    if step:
        # If step is requested, we need to check if intermediate images were saved
        images_dir = await get_images_dir(experimentId, workspace_dir)
        image_dir_based_on_id = storage.join(images_dir, image_id)

        # Ensure the constructed path is within the intended base directory
        if not image_dir_based_on_id.startswith(images_dir):
            raise HTTPException(status_code=400, detail="Invalid image ID or path traversal attempt detected")

        # Check if the image path is a directory (new format)
        if not await storage.isdir(image_dir_based_on_id):
            raise HTTPException(status_code=404, detail=f"Image path is not a directory for image ID {image_id}")

        # Construct the path for the step image
        step_image_path = storage.join(image_dir_based_on_id, "step.png")
        if not step_image_path.startswith(images_dir):
            raise HTTPException(status_code=400, detail="Invalid path traversal attempt detected")

        if not await storage.exists(step_image_path):
            raise HTTPException(status_code=404, detail=f"Step image file not found at {step_image_path}")

        return FileResponse(step_image_path)

    # Use the efficient function to find the specific image
    image_item = await find_image_by_id(image_id, experimentId, workspace_dir)

    if not image_item:
        raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")

    # Determine which image to return based on parameters
    if mask_image:
        # Return the mask image if requested and available
        if not image_item.mask_image_path or not image_item.mask_image_path.strip():
            raise HTTPException(status_code=404, detail=f"No mask image found for image ID {image_id}")
        image_path = image_item.mask_image_path
        if not await storage.exists(image_path):
            raise HTTPException(status_code=404, detail=f"Mask image file not found at {image_path}")
    elif input_image:
        # Return the input image if requested and available
        if not image_item.input_image_path or not image_item.input_image_path.strip():
            raise HTTPException(status_code=404, detail=f"No input image found for image ID {image_id}")

        image_path = image_item.input_image_path
        if not await storage.exists(image_path):
            raise HTTPException(status_code=404, detail=f"Input image file not found at {image_path}")
    elif preprocessed:
        if not image_item.processed_image or not image_item.processed_image.strip():
            raise HTTPException(status_code=404, detail=f"No preprocessed image found for image ID {image_id}")
        image_path = image_item.processed_image
        if not await storage.exists(image_path):
            raise HTTPException(status_code=404, detail=f"Preprocessed image file not found at {image_path}")
    else:
        # Return the generated output image (default behavior)
        # Check if image_path is a folder (new format) or a file (old format)
        if await storage.isdir(image_item.image_path):
            num_images_val = getattr(image_item, "num_images", None)
            try:
                num_images_int = int(num_images_val) if num_images_val is not None else None
            except Exception:
                num_images_int = None

            if num_images_int is not None:
                if index < 0 or index >= num_images_int:
                    raise HTTPException(status_code=404, detail=f"Image index {index} out of range")
            try:
                # Prefer storage.ls (returns either paths or dicts) used across the codebase & tests,
                # then fallback to storage.listdir, then os.listdir.
                try:
                    entries = await storage.ls(image_item.image_path, detail=False)
                except Exception:
                    try:
                        entries = await storage.listdir(image_item.image_path)
                    except Exception:
                        entries = os.listdir(image_item.image_path)

                # Normalize entries to basenames (support full paths, dicts, or plain names)
                def _basename(entry):
                    if isinstance(entry, dict):
                        p = entry.get("name") or entry.get("path") or ""
                        return p.rstrip("/").split("/")[-1] if p else ""
                    if isinstance(entry, str):
                        return entry.rstrip("/").split("/")[-1]
                    return str(entry)

                image_files = [
                    f for f in (_basename(e) for e in entries) if f.lower().endswith((".png", ".jpg", ".jpeg"))
                ]
                image_files.sort()
            except Exception as e:
                raise HTTPException(status_code=404, detail=f"Failed to list images folder: {str(e)}")

            if index < 0 or index >= len(image_files):
                raise HTTPException(
                    status_code=404,
                    detail=f"Image index {index} out of range. Available: 0-{len(image_files) - 1}",
                )

            file_name = image_files[index]
            image_path = storage.join(image_item.image_path, file_name)
            if not await storage.exists(image_path):
                raise HTTPException(status_code=404, detail=f"Image file not found: {file_name}")
            return FileResponse(image_path)
        else:
            # Old format: single image file
            if index != 0:
                raise HTTPException(status_code=404, detail="Only index 0 available for this image set")
            image_path = image_item.image_path

        if not await storage.exists(image_path):
            raise HTTPException(status_code=404, detail=f"Image file not found at {image_path}")

    return FileResponse(image_path)


@router.get("/history/{image_id}/info", summary="Get image metadata by ID")
async def get_image_info_by_id(image_id: str, experimentId: str, http_request: Request = None):
    """
    Get metadata for a specific image set by its ID

    Args:
        image_id: The unique ID of the image set

    Returns:
        Image metadata including number of images available
    """
    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()
    image_item = await find_image_by_id(image_id, experimentId, workspace_dir)

    if not image_item:
        raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")

    # Check if image folder/file exists
    if not await storage.exists(image_item.image_path):
        raise HTTPException(status_code=404, detail=f"Image path not found at {image_item.image_path}")

    # Determine number of images available
    num_images = 1  # Default for old format
    if await storage.isdir(image_item.image_path):
        # Count PNG files in the directory
        entries = await storage.ls(image_item.image_path, detail=False)
        png_files = [f for f in entries if f.endswith(".png") and f.replace(".png", "").isdigit()]
        num_images = len(png_files)

    # Update the metadata to include actual number of images
    metadata = image_item.model_dump()
    metadata["num_images"] = num_images

    return JSONResponse(content={"id": image_item.id, "metadata": metadata})


@router.get("/history/{image_id}/count", summary="Get image count for an image set")
async def get_image_count(image_id: str, experimentId: str, http_request: Request = None):
    """
    Get the number of images available for a given image_id

    Args:
        image_id: The unique ID of the image set

    Returns:
        Number of images available
    """
    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()
    image_item = await find_image_by_id(image_id, experimentId, workspace_dir)

    if not image_item:
        raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")

    # Check if image folder/file exists
    if not await storage.exists(image_item.image_path):
        raise HTTPException(status_code=404, detail=f"Image path not found at {image_item.image_path}")

    # Determine number of images available
    num_images = 1  # Default for old format
    if await storage.isdir(image_item.image_path):
        # Count PNG files in the directory
        entries = await storage.ls(image_item.image_path, detail=False)
        png_files = [f for f in entries if f.endswith(".png") and f.replace(".png", "").isdigit()]
        num_images = len(png_files)

    return JSONResponse(content={"id": image_id, "num_images": num_images})


@router.get("/history/{image_id}/all", summary="Get all images for an image set as a zip file")
async def get_all_images(image_id: str, experimentId: str, http_request: Request = None):
    """
    Get all images for a given image_id as a zip file

    Args:
        image_id: The unique ID of the image set

    Returns:
        Zip file containing all images
    """
    import zipfile
    import tempfile

    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()
    image_item = await find_image_by_id(image_id, experimentId, workspace_dir)

    if not image_item:
        raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")

    # Check if image folder/file exists
    if not await storage.exists(image_item.image_path):
        raise HTTPException(status_code=404, detail=f"Image path not found at {image_item.image_path}")

    # Create a temporary zip file
    temp_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    temp_zip.close()

    try:
        with zipfile.ZipFile(temp_zip.name, "w", zipfile.ZIP_DEFLATED) as zipf:
            if await storage.isdir(image_item.image_path):
                # New format: add all PNG files from the directory
                entries = await storage.ls(image_item.image_path, detail=False)
                for entry in entries:
                    filename = entry.rstrip("/").split("/")[-1]
                    if filename.endswith(".png") and filename.replace(".png", "").isdigit():
                        file_path = entry  # Use the full path from storage.ls
                        # Download to temp if remote, then add to zip
                        async with await storage.open(file_path, "rb") as remote_file:
                            content = await remote_file.read()
                            zipf.writestr(filename, content)
            else:
                # Old format: add the single file
                file_path = image_item.image_path
                # Extract just the filename for the zip
                filename = file_path.rstrip("/").split("/")[-1]
                # Download to temp if remote, then add to zip
                async with await storage.open(file_path, "rb") as remote_file:
                    content = await remote_file.read()
                    zipf.writestr(filename, content)

        return FileResponse(
            temp_zip.name,
            media_type="application/zip",
            filename=f"images_{image_id}.zip",
            headers={"Content-Disposition": f"attachment; filename=images_{image_id}.zip"},
        )
    except Exception as e:
        # Clean up temp file on error
        if os.path.exists(temp_zip.name):
            os.unlink(temp_zip.name)
        raise HTTPException(status_code=500, detail=f"Failed to create zip file: {str(e)}")


@router.delete("/history/{image_id}", summary="Delete image from history")
async def delete_image_from_history(experimentId: str, image_id: str, http_request: Request = None):
    """
    Delete a specific image set from history and remove the image files

    Args:
        experimentId: The experiment ID
        image_id: The unique ID of the image set to delete
    """
    # Get experiment name for experiment-specific paths
    workspace_dir = await get_workspace_dir()
    history_file = await get_history_file_path(experimentId, workspace_dir)

    if not await storage.exists(history_file):
        raise HTTPException(status_code=404, detail="No history found")

    try:
        # Load current history
        async with await storage.open(history_file, "r") as f:
            history = json.loads(await f.read())

        # Find and remove the item
        item_to_remove = None
        updated_history = []
        for item in history:
            if item["id"] == image_id:
                item_to_remove = item
            else:
                updated_history.append(item)

        if not item_to_remove:
            raise HTTPException(status_code=404, detail=f"Image with ID {image_id} not found")

        # Remove image files/folder
        image_path = item_to_remove["image_path"]
        if await storage.exists(image_path):
            if await storage.isdir(image_path):
                # New format: remove entire folder
                await storage.rm_tree(image_path)
            else:
                # Old format: remove single file
                await storage.rm(image_path)

        # Remove input image if it exists
        if item_to_remove.get("input_image_path") and await storage.exists(item_to_remove["input_image_path"]):
            await storage.rm(item_to_remove["input_image_path"])
        # Remove processed image if it exists
        if item_to_remove.get("processed_image") and await storage.exists(item_to_remove["processed_image"]):
            await storage.rm(item_to_remove["processed_image"])

        # Save updated history
        async with await storage.open(history_file, "w") as f:
            await f.write(json.dumps(updated_history, indent=2))

        return JSONResponse(
            content={"message": f"Image set {image_id} deleted successfully", "deleted_item": item_to_remove}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete image: {str(e)}")


@router.delete("/history", summary="Clear all history")
async def clear_history(experimentId: str, http_request: Request = None):
    """
    Clear all image generation history and remove all image files
    """
    try:
        # Get experiment name for experiment-specific paths
        workspace_dir = await get_workspace_dir()
        history_file = await get_history_file_path(experimentId, workspace_dir)
        images_dir = await get_images_dir(experimentId, workspace_dir)

        # Load current history to get image paths
        deleted_count = 0
        if await storage.exists(history_file):
            async with await storage.open(history_file, "r") as f:
                history = json.loads(await f.read())

            # Remove all image files/folders
            for item in history:
                image_path = item["image_path"]
                if await storage.exists(image_path):
                    if await storage.isdir(image_path):
                        # New format: remove folder and count files inside
                        entries = await storage.ls(image_path, detail=False)
                        file_count = len([f for f in entries if f.endswith(".png")])
                        await storage.rm_tree(image_path)
                        deleted_count += file_count
                    else:
                        # Old format: remove single file
                        await storage.rm(image_path)
                        deleted_count += 1

                # Remove input image if it exists
                if item.get("input_image_path") and await storage.exists(item["input_image_path"]):
                    await storage.rm(item["input_image_path"])
                # Remove processed image if it exists
                if item.get("processed_image") and await storage.exists(item["processed_image"]):
                    await storage.rm(item["processed_image"])

            # Clear history file
            async with await storage.open(history_file, "w") as f:
                await f.write(json.dumps([]))

        # Remove any remaining files/folders in images directory
        if await storage.exists(images_dir):
            for entry in await storage.ls(images_dir, detail=False):
                item_name = entry.rstrip("/").split("/")[-1]
                item_path = storage.join(images_dir, item_name)
                if await storage.isdir(item_path):
                    await storage.rm_tree(item_path)
                elif item_name.endswith(".png"):
                    await storage.rm(item_path)

        return JSONResponse(
            content={
                "message": f"History cleared successfully. Deleted {deleted_count} images.",
                "deleted_images": deleted_count,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear history: {str(e)}")


@router.post("/dataset/create", summary="Create dataset from history images")
async def create_dataset_from_history(request: CreateDatasetRequest, experimentId: str = None):
    """
    Create a dataset from selected images in history

    Args:
        request: Contains list of image IDs to include in the dataset

    Returns:
        JSON response with dataset details
    """
    image_ids = request.image_ids
    if not image_ids or not isinstance(image_ids, list):
        raise HTTPException(status_code=400, detail="Invalid image IDs list")

    # Sanitize dataset name
    dataset_id = slugify(request.dataset_name)
    if not dataset_id:
        raise HTTPException(status_code=400, detail="Invalid dataset name")

    # Check if dataset already exists
    try:
        await Dataset.get(dataset_id)
        # If we get here, the dataset exists
        raise HTTPException(status_code=400, detail=f"Dataset '{dataset_id}' already exists")
    except FileNotFoundError:
        # Dataset doesn't exist, which is what we want
        pass

    # Find selected images efficiently
    selected_images = []
    for image_id in image_ids:
        image_item = await find_image_by_id(image_id, experimentId)
        if image_item:
            selected_images.append(image_item)

    if not selected_images:
        raise HTTPException(status_code=404, detail="No images found for the given IDs")

    # Calculate total image count (accounting for multi-image generations)
    total_image_count = 0
    for image_item in selected_images:
        if await storage.isdir(image_item.image_path):
            # Count images in folder
            entries = await storage.ls(image_item.image_path, detail=False)
            image_files = [f for f in entries if f.endswith(".png") and f.replace(".png", "").isdigit()]
            total_image_count += len(image_files)
        else:
            # Single image
            total_image_count += 1

    # Create dataset in database
    try:
        json_data = {
            "generated": True,
            "source": "diffusion_history",
            "description": request.description or f"Dataset created from {total_image_count} diffusion images",
            "image_count": total_image_count,
            "created_from_image_ids": image_ids,
        }
        new_dataset = await create_local_dataset(dataset_id, json_data=json_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create dataset: {str(e)}")

    # Create dataset directory
    dataset_dir = await new_dataset.get_dir()
    images_dir = storage.join(dataset_dir, "train")
    await storage.makedirs(images_dir, exist_ok=True)

    # Prepare dataset metadata and copy images
    dataset_records = []
    file_counter = 0

    for image_item in selected_images:
        try:
            # Check if this is a multi-image generation (folder) or single image
            if await storage.isdir(image_item.image_path):
                # Multi-image generation - process each image in the folder
                image_files = []
                for entry in await storage.ls(image_item.image_path, detail=False):
                    filename = entry.rstrip("/").split("/")[-1]
                    if filename.endswith(".png") and filename.replace(".png", "").isdigit():
                        image_files.append(filename)

                # Sort by numeric order (0.png, 1.png, etc.)
                image_files.sort(key=lambda x: int(x.replace(".png", "")))

                for img_filename in image_files:
                    src_image_path = storage.join(image_item.image_path, img_filename)

                    # Generate new filename for the dataset
                    dataset_filename = f"image_{file_counter:04d}.png"
                    dest_image_path = storage.join(images_dir, dataset_filename)

                    # Copy image file
                    if await storage.exists(src_image_path):
                        await storage.copy_file(src_image_path, dest_image_path)
                    else:
                        log_print(f"Warning: Image file not found at {src_image_path}")
                        continue

                    # Create record with essential fields
                    record = {
                        "file_name": dataset_filename,
                        "text": image_item.prompt,
                    }

                    # Add metadata if requested
                    if request.include_metadata:
                        record.update(
                            {
                                "model": image_item.model,
                                "adaptor": image_item.adaptor,
                                "adaptor_scale": image_item.adaptor_scale,
                                "num_inference_steps": image_item.num_inference_steps,
                                "guidance_scale": image_item.guidance_scale,
                                "seed": image_item.seed,
                                "negative_text": image_item.negative_prompt,
                                "upscaled": image_item.upscaled,
                                "upscale_factor": image_item.upscale_factor,
                                "eta": image_item.eta,
                                "clip_skip": image_item.clip_skip,
                                "guidance_rescale": image_item.guidance_rescale,
                                "height": image_item.height,
                                "width": image_item.width,
                                "timestamp": image_item.timestamp,
                                "original_id": image_item.id,
                                "image_index": int(
                                    img_filename.replace(".png", "")
                                ),  # Add image index for multi-image generations
                            }
                        )

                    dataset_records.append(record)
                    file_counter += 1

            else:
                # Single image generation (backward compatibility)
                dataset_filename = f"image_{file_counter:04d}.png"
                dest_image_path = storage.join(images_dir, dataset_filename)

                # Copy image file
                if await storage.exists(image_item.image_path):
                    await storage.copy_file(image_item.image_path, dest_image_path)
                else:
                    log_print(f"Warning: Image file not found at {image_item.image_path}")
                    continue

                # Create record with essential fields
                record = {
                    "file_name": dataset_filename,
                    "text": image_item.prompt,
                    "negative_text": image_item.negative_prompt,
                }

                # Add metadata if requested
                if request.include_metadata:
                    record.update(
                        {
                            "model": image_item.model,
                            "adaptor": image_item.adaptor,
                            "adaptor_scale": image_item.adaptor_scale,
                            "num_inference_steps": image_item.num_inference_steps,
                            "guidance_scale": image_item.guidance_scale,
                            "seed": image_item.seed,
                            "upscaled": image_item.upscaled,
                            "upscale_factor": image_item.upscale_factor,
                            "eta": image_item.eta,
                            "clip_skip": image_item.clip_skip,
                            "guidance_rescale": image_item.guidance_rescale,
                            "height": image_item.height,
                            "width": image_item.width,
                            "timestamp": image_item.timestamp,
                            "original_id": image_item.id,
                        }
                    )

                dataset_records.append(record)
                file_counter += 1

        except Exception as e:
            log_print(f"Warning: Failed to process image {image_item.id}: {str(e)}")
            continue

    if not dataset_records:
        # Clean up if no images were successfully processed
        await new_dataset.delete()
        raise HTTPException(status_code=500, detail="Failed to process any images")

    # Save dataset as JSONL file
    try:
        # Make train directory if it doesn't exist
        await storage.makedirs(images_dir, exist_ok=True)
        dataset_file = storage.join(dataset_dir, "train", "metadata.jsonl")
        async with await storage.open(dataset_file, "w") as f:
            for record in dataset_records:
                await f.write(json.dumps(record) + "\n")
    except Exception as e:
        # Clean up on failure
        await new_dataset.delete()
        raise HTTPException(status_code=500, detail=f"Failed to save dataset: {str(e)}")

    return JSONResponse(
        content={
            "status": "success",
            "message": f"Dataset '{dataset_id}' created successfully with {len(dataset_records)} images.",
            "dataset_id": dataset_id,
            "dataset_dir": dataset_dir,
            "records_count": len(dataset_records),
        }
    )


@router.get("/controlnets", summary="List available ControlNet models")
async def list_controlnets():
    """
    Lists all downloaded ControlNet models by reading the controlnets directory
    and extracting `_class_name` from their config.json.
    """
    all_models = await model_helper.list_installed_models(embedding=False)
    models = []

    for model in all_models:
        json_data = model.get("json_data", {})

        # Check common locations
        arch = json_data.get("architecture")
        if not arch:
            # Try model_index fallback
            model_index = json_data.get("model_index", {})
            arch = model_index.get("_class_name")

        # Final fallback: rely on explicit controlnet flag
        is_controlnet = json_data.get("is_controlnet", False)

        if (arch and "controlnet" in arch.lower()) or is_controlnet:
            models.append(model)

    return {"controlnets": models}


@router.post("/generate_id", summary="Get a new generation ID for image generation")
async def get_new_generation_id(experimentId: str, http_request: Request = None):
    """
    Returns a new unique generation ID and creates the images folder for it.
    """
    generation_id = str(uuid.uuid4())
    workspace_dir = await get_workspace_dir()
    await ensure_directories(experimentId, workspace_dir)
    images_folder = storage.join(await get_images_dir(experimentId, workspace_dir), generation_id)
    await storage.makedirs(images_folder, exist_ok=True)
    return {"generation_id": generation_id, "images_folder": images_folder}


@router.get("/get_file/{generation_id}")
async def get_file(experimentId: str, generation_id: str):
    # Sanitize and validate generation_id
    sanitized_id = secure_filename(generation_id)
    try:
        uuid.UUID(sanitized_id)  # Validate UUID format
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid generation ID format")
    root_dir = await get_images_dir(experimentId)
    file_path = storage.join(root_dir, sanitized_id, "tmp_json.json")
    if not await storage.exists(file_path):
        raise HTTPException(status_code=404, detail=f"Output JSON file not found at {file_path}")
    try:
        if not file_path.startswith(root_dir):
            raise HTTPException(status_code=400, detail="Invalid file path")
        if not await storage.isfile(file_path):
            raise HTTPException(status_code=404, detail="File not found")

        async with await storage.open(file_path, "r") as f:
            data = json.loads(await f.read())

        return JSONResponse(content=data)

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON format")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
