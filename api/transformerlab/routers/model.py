from typing import Annotated
from fastapi import APIRouter, Body
from fastchat.model.model_adapter import get_conversation_template
from huggingface_hub import HfApi
from transformers import AutoTokenizer


from transformerlab.services import model_service
from transformerlab.services.cache_service import cached
from lab.dirs import get_workspace_dir
from lab.model import Model as ModelService
from lab import storage

from werkzeug.utils import secure_filename


router = APIRouter(tags=["model"])


@router.get("/model/get_conversation_template")
async def get_model_prompt_template(model: str):
    # Below we grab the conversation template from FastChat's model adapter
    # solution by passing in the model name
    return get_conversation_template(model)


@router.get("/model/list")
@cached(key="models:list", ttl="7d", tags=["models", "models:list"])
async def model_local_list():
    # the model list is a combination of downloaded hugging face models and locally generated models
    models = await model_service.list_installed_models()

    # Augment each model with version group info if any
    try:
        from transformerlab.services import asset_version_service

        group_map = await asset_version_service.get_all_asset_group_map("model")
        for model in models:
            model_id = model.get("model_id", "")
            if model_id in group_map:
                model["version_groups"] = group_map[model_id]
            else:
                model["version_groups"] = []
    except Exception as e:
        print(f"Warning: could not fetch model version groups: {e}")

    return models


@router.get("/model/create")
async def model_local_create(id: str, name: str, json_data={}):
    # Use filesystem instead of database
    try:
        model_service = await ModelService.create(id)
        await model_service.set_metadata(model_id=id, name=name, json_data=json_data)
        return {"message": "model created"}
    except FileExistsError:
        return {"status": "error", "message": f"Model {id} already exists"}
    except Exception as e:
        print(f"Error creating model {id}: {e}")
        return {"status": "error", "message": "Failed to create model due to an internal error."}


@router.get("/model/delete")
async def model_local_delete(model_id: str, delete_from_cache: bool = False):
    # Try to delete from filesystem first using SDK
    try:
        model_service = await ModelService.get(model_id)
        # Delete the entire directory
        model_dir = await model_service.get_dir()
        if await storage.exists(model_dir):
            await storage.rm_tree(model_dir)
            print(f"Deleted filesystem model: {model_id}")
    except FileNotFoundError:
        # Model not found in filesystem, continue with other deletion methods
        pass
    except Exception as e:
        print(f"Error deleting filesystem model {model_id}: {e}")

    # Also try the legacy method for backward compatibility
    from lab.dirs import get_models_dir

    root_models_dir = await get_models_dir()

    # Sanitize and validate model_dir
    unsafe_model_dir = model_id.rsplit("/", 1)[-1]
    # Use storage.join for path normalization
    model_dir = unsafe_model_dir
    candidate_index_file = storage.join(root_models_dir, model_dir, "index.json")

    # For fsspec, validate paths are within root_models_dir by checking they start with it
    if not await storage.exists(candidate_index_file):
        pass  # File doesn't exist, skip legacy deletion
    elif not candidate_index_file.startswith(root_models_dir):
        print("ERROR: Invalid index file path")
    elif await storage.isfile(candidate_index_file):
        model_path = storage.join(root_models_dir, model_dir)
        if not model_path.startswith(root_models_dir):
            print("ERROR: Invalid directory structure")
        print(f"Deleteing {model_path}")
        await storage.rm_tree(model_path)

    else:
        if delete_from_cache:
            # Delete from the huggingface cache
            try:
                model_service.delete_model_from_hf_cache(model_id)
            except Exception as e:
                print(f"Error deleting model from HuggingFace cache: {e}")
                # return {"message": "Error deleting model from HuggingFace cache"}
        else:
            # If this is a hugging face model then delete from the database but leave in the cache
            print(
                f"Deleting model {model_id}. Note that this will not free up space because it remains in the HuggingFace cache."
            )
            print("If you want to delete the model from the HuggingFace cache, you must delete it from:")
            print("~/.cache/huggingface/hub/")

    return {"message": "model deleted"}


@router.post("/model/pefts")
async def model_gets_pefts(
    model_id: Annotated[str, Body()],
):
    workspace_dir = await get_workspace_dir()
    model_id = secure_filename(model_id)
    adaptors_dir = storage.join(workspace_dir, "adaptors", model_id)

    if not await storage.exists(adaptors_dir):
        return []

    # Use storage.ls to list directory contents
    try:
        all_items = await storage.ls(adaptors_dir, detail=False)
        adaptors = []
        for item_path in all_items:
            # Extract just the name from full path (works for both local and remote)
            name = item_path.split("/")[-1].split("\\")[-1]  # Handle both / and \ separators
            if not name.startswith(".") and await storage.isdir(item_path):
                adaptors.append(name)
    except Exception:
        # Fallback to empty list if listing fails
        adaptors = []
    return sorted(adaptors)


@router.get("/model/delete_peft")
async def model_delete_peft(model_id: str, peft: str):
    workspace_dir = await get_workspace_dir()
    secure_model_id = secure_filename(model_id)
    adaptors_dir = storage.join(workspace_dir, "adaptors", secure_model_id)
    # Check if the peft exists
    if await storage.exists(adaptors_dir):
        peft_path = storage.join(adaptors_dir, peft)
    else:
        # Assume the adapter is stored in the older naming convention format
        peft_path = storage.join(workspace_dir, "adaptors", model_id, peft)

    await storage.rm_tree(peft_path)

    return {"message": "success"}


@router.get("/model/chat_template")
async def chat_template(model_name: str):
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
        )
        template = getattr(tokenizer, "chat_template", None)
        if template:
            return {"status": "success", "data": template}
    except Exception:
        return {"status": "error", "message": f"Invalid model name: {model_name}", "data": None}


@router.get("/model/pipeline_tag")
async def get_pipeline_tag(model_name: str):
    """
    Get the pipeline tag for a model from the filesystem or Hugging Face Hub.

    Args:
        model_name: The Hugging Face model ID (e.g., "mlx-community/Kokoro-82M-bf16")

    Returns:
        JSON response with status and pipeline tag data
    """
    # First try to get from filesystem
    try:
        model_service = await ModelService.get(model_name)
        model_data = await model_service.get_metadata()
        if model_data and model_data.get("json_data") and "pipeline_tag" in model_data["json_data"]:
            pipeline_tag = model_data["json_data"]["pipeline_tag"]
            return {"status": "success", "data": pipeline_tag, "model_id": model_name}
    except FileNotFoundError:
        # Model not found in filesystem, continue with other methods
        pass
    except Exception as e:
        print(f"Error reading filesystem model {model_name}: {e}")

    # If not in filesystem or database, fetch from Hugging Face Hub
    try:
        api = HfApi()
        model_info = api.model_info(model_name)
        pipeline_tag = model_info.pipeline_tag

        return {"status": "success", "data": pipeline_tag, "model_id": model_name}
    except Exception as e:
        ## Assume text generation if we can't get the tag (this fixes things for local models)
        print(f"Error fetching pipeline tag for {model_name}: {type(e).__name__}: {e}")
        return {"status": "success", "data": "text-generation", "model_id": model_name}
