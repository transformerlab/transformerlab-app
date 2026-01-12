import json
import os
from typing import Annotated, Optional, Union

from fastapi import APIRouter, Body
from pydantic import BaseModel

from transformerlab.shared.batched_requests import process_dataset, process_audio_dataset
from transformerlab.shared.shared import slugify

from werkzeug.utils import secure_filename

router = APIRouter(prefix="/batch", tags=["batched_prompts"])


# Pydantic model for batch_predict request
class BatchChatCompletionRequest(BaseModel):
    model: str
    adaptor: Optional[str] = None
    api_key: Optional[str] = "dummy"
    temperature: float = 0.01
    max_tokens: int = 1024
    top_p: float = 1.0
    min_p: float = 0.0
    batch_size: int = 128
    inference_url: str = "http://localhost:8338/v1/chat/completions"
    messages: list[list[dict]]


class BatchAudioRequest(BaseModel):
    model: str
    adaptor: Optional[str] = None
    experiment_id: str
    texts: list[str]
    file_prefix: str = "audio"
    sample_rate: int = 22050
    temperature: float = 0.7
    speed: float = 1.0
    top_p: float = 1.0
    voice: Optional[str] = None
    audio_path: Optional[str] = None
    batch_size: int = 64
    inference_url: str = "http://localhost:8338/v1/audio/speech"


@router.get("/list")
async def list_prompts():
    """List the batched prompts that we have on disk"""

    batched_prompts = []
    from lab.dirs import get_batched_prompts_dir

    batched_prompts_dir = await get_batched_prompts_dir()
    for file in os.listdir(batched_prompts_dir):
        if file.endswith(".json"):
            with open(os.path.join(batched_prompts_dir, file), "r") as f:
                try:
                    p = json.load(f)
                    name = file.split(".")[0]
                    batched_prompts.append({"name": name, "prompts": p})
                except Exception as e:
                    print(f"Error loading batched prompt file: {file}: {e}, skipping")

    return batched_prompts


# The prompt can either be a list of lists of dics (for conversations)
# or a list of strings (for completions)
@router.post("/new")
async def new_prompt(name: Annotated[str, Body()], prompts: Annotated[Union[list[list[dict]], list[str]], Body()]):
    """Create a new batched prompt"""

    name = secure_filename(name)
    slug = slugify(name)
    from lab.dirs import get_batched_prompts_dir

    prompts_dir = await get_batched_prompts_dir()
    prompt_file = os.path.join(prompts_dir, f"{slug}.json")

    with open(prompt_file, "w") as f:
        json_str = json.dumps(prompts, indent=4)
        f.write(json_str)

    return {"status": "success", "data": prompts}


@router.get("/delete/{prompt_id}")
async def delete_prompt(prompt_id: str):
    """Delete a batched prompt"""

    prompt_id = secure_filename(prompt_id)
    from lab.dirs import get_batched_prompts_dir

    prompts_dir = await get_batched_prompts_dir()
    prompt_file = os.path.join(prompts_dir, f"{prompt_id}.json")

    if os.path.exists(prompt_file):
        os.remove(prompt_file)
        return {"status": "success", "message": f"Prompt {prompt_id} deleted"}
    else:
        return {"status": "error", "message": f"Prompt {prompt_id} not found"}


@router.post("/chat/completions")
async def batch_chat_completion(request: BatchChatCompletionRequest):
    """Predict on a batch of prompts"""

    prompts = request.messages
    model = request.model
    adaptor = request.adaptor
    api_key = request.api_key
    temperature = request.temperature
    max_tokens = request.max_tokens
    top_p = request.top_p
    min_p = request.min_p
    inference_url = request.inference_url
    batch_size = request.batch_size

    results = await process_dataset(
        prompts,
        batch_size=batch_size,
        model=model,
        adaptor=adaptor,
        api_key=api_key,
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=top_p,
        min_p=min_p,
        inference_url=inference_url,
    )

    return results


@router.post("/audio/speech")
async def batch_audio_speech(request: BatchAudioRequest):
    """Generate multiple audios from a batch of texts."""

    # Build per-item payloads mirroring /v1/audio/speech
    items = []
    for idx, text in enumerate(request.texts):
        payload = {
            "experiment_id": request.experiment_id,
            "model": request.model,
            "adaptor": request.adaptor,
            "text": text,
            "file_prefix": f"{request.file_prefix}_{idx + 1:03d}",
            "sample_rate": request.sample_rate,
            "temperature": request.temperature,
            "speed": request.speed,
            "top_p": request.top_p,
        }
        if request.voice:
            payload["voice"] = request.voice
        if request.audio_path:
            payload["audio_path"] = request.audio_path
        items.append(payload)

    results = await process_audio_dataset(
        items,
        batch_size=request.batch_size,
        inference_url=request.inference_url,
    )

    return results
