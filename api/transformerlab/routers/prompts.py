import json
import os
from typing import Annotated

from fastapi import APIRouter, Body
from lab import dirs as lab_dirs

from transformerlab.shared import dirs
from transformerlab.shared.shared import slugify

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("/list")
async def list_prompts():
    """List the prompt templates available in the prompt gallery"""

    remote_gallery_file = os.path.join(
        dirs.TFL_SOURCE_CODE_DIR, "transformerlab/galleries/prompt-gallery.json"
    )

    with open(remote_gallery_file) as f:
        prompt_gallery = json.load(f)

    prompt_templates = []
    prompts_dir = lab_dirs.get_prompt_templates_dir()
    for file in os.listdir(prompts_dir):
        if file.endswith(".json"):
            with open(os.path.join(prompts_dir, file)) as f:
                try:
                    prompt = json.load(f)
                    prompt["source"] = "local"
                    prompt_templates.append(prompt)
                except Exception as e:
                    print(f"Error loading prompt template from file: {file}: {e}, skipping")

    return prompt_gallery + prompt_templates


@router.post("/new")
async def new_prompt(title: Annotated[str, Body()], text: Annotated[str, Body()]):
    """Create a new prompt template"""

    if "{text}" not in text:
        return {"status": "error", "message": "The text must include the placeholder {text}"}

    slug = slugify(title)
    prompts_dir = lab_dirs.get_prompt_templates_dir()

    prompt_file = os.path.join(prompts_dir, f"{slug}.json")

    json_str = "{}"

    with open(prompt_file, "w") as f:
        j = {"id": slug, "title": title, "text": text}
        json_str = json.dumps(j, indent=4)
        f.write(json_str)

    return {"status": "success", "data": json_str}


@router.get("/delete/{prompt_id}")
async def delete_prompt(prompt_id: str):
    """Delete a prompt template"""

    prompts_dir = lab_dirs.get_prompt_templates_dir()
    prompt_file = os.path.join(prompts_dir, f"{prompt_id}.json")

    if os.path.exists(prompt_file):
        os.remove(prompt_file)
        return {"status": "success", "message": f"Prompt {prompt_id} deleted"}
    else:
        return {"status": "error", "message": f"Prompt {prompt_id} not found"}
