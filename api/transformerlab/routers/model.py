import json
from typing import Annotated
from fastapi import APIRouter, Body
from fastchat.model.model_adapter import get_conversation_template
from huggingface_hub import create_repo, upload_folder, HfApi
from huggingface_hub import ModelCard, ModelCardData
from huggingface_hub.utils import HfHubHTTPError
from transformers import AutoTokenizer


import os

from transformerlab.models import model_helper
from transformerlab.models import basemodel
from transformerlab.services import model_service
from transformerlab.models import huggingfacemodel
from transformerlab.models import filesystemmodel
from lab.dirs import get_workspace_dir
from lab.model import Model as ModelService
from lab import storage

from werkzeug.utils import secure_filename


router = APIRouter(tags=["model"])


async def get_model_dir(model_id: str):
    """
    Helper function gets the directory for a model ID
    model_id may be in Hugging Face format
    """
    model_id_without_author = model_id.split("/")[-1]
    from lab.dirs import get_models_dir

    models_dir = await get_models_dir()
    return storage.join(models_dir, model_id_without_author)


async def get_current_org_id() -> str | None:
    """
    Resolve the current organization id from workspace path when multitenant is enabled.
    Returns None if multitenancy is disabled or org id cannot be determined.
    """
    try:
        from lab.dirs import get_workspace_dir

        ws = await get_workspace_dir()
        if "/orgs/" in ws:
            return ws.split("/orgs/")[-1].split("/")[0]
    except Exception:
        pass
    return None


@router.get("/model/upload_to_huggingface", summary="Given a model ID, upload it to Hugging Face.")
async def upload_model_to_huggingface(
    model_id: str, model_name: str = "transformerlab-model", organization_name: str = "", model_card_data: str = "{}"
):
    """
    Given a model ID, upload it to Hugging Face.
    """
    model_directory = await get_model_dir(model_id)
    api = HfApi()
    try:
        # Using HF API to check user info and use it for the model creation
        user_info = api.whoami()
        username = user_info["name"]
        orgs = user_info["orgs"]
        if organization_name not in orgs and organization_name != "":
            return {
                "status": "error",
                "message": f"User {username} is not a member of organization {organization_name}",
            }
        elif organization_name in orgs and organization_name != "":
            username = organization_name
    except Exception as e:
        print(f"Error getting Hugging Face user info: {e}")
        return {"status": "error", "message": "An internal error has occurred while getting Hugging Face user info."}
    repo_id = f"{username}/{model_name}"
    try:  # Checking if repo already exists.
        api.repo_info(repo_id)
        print(f"Repo {repo_id} already exists")
    except HfHubHTTPError as e:
        if e.response.status_code == 404:
            # Should we add a toggle for them to allow private repos?
            create_repo(repo_id)
        else:
            print(f"Error creating Hugging Face repo: {e}")
            return {"status": "error", "message": "An internal error has occurred while creating Hugging Face repo."}

    # Upload regardless in case they want to make changes/add to to an existing repo.
    upload_folder(folder_path=model_directory, repo_id=repo_id)
    # If they added basic model card data, add it to the model card.
    if model_card_data != "{}":
        model_card_data = json.loads(model_card_data)
        card_data = ModelCardData(**model_card_data)
        content = f"""
        ---
        {card_data.to_yaml()}
        ---

        # My Model Card

        This model created by [@{username}]
        """
        card = ModelCard(content)
        card.push_to_hub(repo_id)

    return {"status": "success", "message": "Model uploaded to Hugging Face: {model_name}"}


@router.get("/model/local/{model_id}")
async def model_details_from_source(model_id: str):
    # convert "~~~"" in string to "/":
    model_id = model_id.replace("~~~", "/")

    # Try to get from huggingface first
    model = model_helper.get_model_by_source_id("huggingface", model_id)

    # If there is no model then try looking in the filesystem
    if not model:
        model = model_details_from_filesystem(model_id)

    return model


@router.get("/model/details/{model_id}")
async def model_details_from_filesystem(model_id: str):
    # convert "~~~"" in string to "/":
    model_id = model_id.replace("~~~", "/")

    # TODO: Refactor this code with models/list function
    # see if the model exists locally
    model_path = await get_model_dir(model_id)
    if await storage.isdir(model_path):
        # Look for model information using SDK methods
        try:
            from lab.model import Model as ModelService

            model_service = ModelService(model_id)
            filedata = await model_service.get_metadata()

            # Some models are a single file (possibly of many in a directory, e.g. GGUF)
            # For models that have model_filename set we should link directly to that specific file
            if "json_data" in filedata and filedata["json_data"]:
                return filedata["json_data"]

        except FileNotFoundError:
            # do nothing: file doesn't exist
            pass

    return {}


@router.get("/model/get_conversation_template")
async def get_model_prompt_template(model: str):
    # Below we grab the conversation template from FastChat's model adapter
    # solution by passing in the model name
    return get_conversation_template(model)


@router.get("/model/list")
async def model_local_list(embedding=False):
    # the model list is a combination of downloaded hugging face models and locally generated models
    return await model_service.list_installed_models(embedding)


@router.get("/model/provenance/{model_id}")
async def model_provenance(model_id: str):
    # Get the provenance of a model along with the jobs that created it and evals that were done on each model

    model_id = model_id.replace("~~~", "/")

    return await model_service.list_model_provenance(model_id)


@router.get("/model/count_downloaded")
async def model_count_downloaded():
    # Currently used to determine if user has any downloaded models
    # Use filesystem instead of database
    models = await ModelService.list_all()
    count = len(models)
    return {"status": "success", "data": count}


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
                huggingfacemodel.delete_model_from_hf_cache(model_id)
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


async def get_model_from_db(model_id: str):
    # Get model from filesystem
    model_service = await ModelService.get(model_id)
    return await model_service.get_metadata()


@router.get("/model/import_from_source")
async def model_import_local_source(model_source: str, model_id: str):
    """
    Given a model_source and a model_id within that source,
    try to import a file into TransformerLab.
    """

    if model_source not in model_helper.list_model_sources():
        return {"status": "error", "message": f"Invalid model source {model_source}."}

    model = model_helper.get_model_by_source_id(model_source, model_id)
    if not model:
        return {"status": "error", "message": f"{model_id} not found in {model_source}."}

    return await model_import(model)


@router.get("/model/import_from_local_path")
async def model_import_local_path(model_path: str):
    """
    Given model_path pointing to a local directory of a file,
    try to import a model into Transformer Lab.
    """

    # Restrict to workspace directory only
    workspace_dir = await get_workspace_dir()
    # Normalize both workspace and input paths
    abs_workspace_dir = os.path.abspath(os.path.normpath(workspace_dir))
    abs_model_path = os.path.abspath(os.path.normpath(model_path))
    if not abs_model_path.startswith(abs_workspace_dir + os.sep):
        return {
            "status": "error",
            "message": f"Path traversal or invalid path detected: {model_path}. Only paths inside {workspace_dir} are allowed.",
        }

    if os.path.isdir(abs_model_path):
        model = filesystemmodel.FilesystemModel(abs_model_path)
    elif os.path.isfile(abs_model_path):
        model = filesystemmodel.FilesystemGGUFModel(abs_model_path)
    else:
        return {"status": "error", "message": f"Invalid model path {model_path}."}

    return await model_import(model)


def import_error(message: str):
    """
    Separate function just to factor out printing and returning the same error.
    """
    print("Import error: %s", message)
    return {"status": "error", "message": "An internal error has occurred. Please try again later."}


async def model_import(model: basemodel.BaseModel):
    """
    Called by model import endpoints.
    Takes a BaseMOdel object and uses the information contained within to import.
    """

    print(f"Importing {model.id}...")

    # Get full model details
    json_data = await model.get_json_data()

    # Only add a row for uninstalled and supported repos
    architecture = json_data.get("architecture", "unknown")
    if model.status != "OK":
        return import_error(model.status)
    if await model_service.is_model_installed(model.id):
        return import_error(f"{model.id} is already installed.")
    if architecture == "unknown" or architecture == "":
        return import_error("Unable to determine model architecture.")

    await model.install()

    print(f"{model.id} imported successfully.")

    return {"status": "success", "data": model.id}


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
