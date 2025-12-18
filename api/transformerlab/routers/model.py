import json
import asyncio
import datetime
import dateutil.relativedelta
from typing import Annotated
import transformerlab.db.db as db
from fastapi import APIRouter, Body
from fastchat.model.model_adapter import get_conversation_template
from huggingface_hub import snapshot_download, create_repo, upload_folder, HfApi, list_repo_tree
from huggingface_hub import ModelCard, ModelCardData
from huggingface_hub.utils import HfHubHTTPError, GatedRepoError, EntryNotFoundError
from transformers import AutoTokenizer


import os
from pathlib import Path

from transformerlab.shared import shared
from transformerlab.shared import galleries

from transformerlab.models import model_helper
from transformerlab.models import basemodel
from transformerlab.models import huggingfacemodel
from transformerlab.models import filesystemmodel
import transformerlab.services.job_service as job_service
from transformerlab.services.job_service import job_update_status
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


async def get_model_details_from_gallery(model_id: str):
    """
    Given a model ID this returns the associated data from the model gallery file.
    Returns None if no such value found.
    """
    gallery = await galleries.get_models_gallery()

    result = None

    for model in gallery:
        if model["uniqueID"] == model_id or model["huggingface_repo"] == model_id:
            result = model
            break

    return result


@router.get("/model/gallery")
async def model_gallery_list_all():
    gallery = await galleries.get_models_gallery()

    # Get a list of local models to determine what has been downloaded already
    local_models = await model_helper.list_installed_models()
    local_model_names = set(model["model_id"] for model in local_models)

    # Set a date one month in the past to identify "new" models
    one_month_ago = datetime.date.today() + dateutil.relativedelta.relativedelta(months=-1)
    new_model_cutoff_date = one_month_ago.strftime("%Y-%m-%d")

    # Iterate through models and add any values needed in result
    for model in gallery:
        # Mark which models have been downloaded already by checking for uniqueID
        model["downloaded"] = True if model["uniqueID"] in local_model_names else False

        # Application filters on archived flag. If none set then set to false
        if "archived" not in model:
            model["archived"] = False

        # If no added date then set to a default
        if "added" not in model:
            model["added"] = "2024-02-01"

        # Application uses the new flag to decide whether to display a badge
        # TODO: Probably shouldn't be doing > string comparison for dates
        model["new"] = True if (model["added"] > new_model_cutoff_date) else False

    return gallery


@router.get("/model/model_groups_list", summary="Returns the grouped model gallery from model-group-gallery.json.")
async def model_groups_list_all():
    gallery = await galleries.get_model_groups_gallery()

    # Get list of locally installed models
    local_models = await model_helper.list_installed_models()
    local_model_names = set(model["model_id"] for model in local_models)

    # Define what counts as a “new” model
    one_month_ago = datetime.date.today() + dateutil.relativedelta.relativedelta(months=-1)
    new_model_cutoff_date = one_month_ago.strftime("%Y-%m-%d")

    for group in gallery:
        if "models" not in group:
            continue

        # Iterate through models and add any values needed in result
        for model in group["models"]:
            # Mark which models have been downloaded already by checking for uniqueID
            model["downloaded"] = True if model["uniqueID"] in local_model_names else False

            # Application filters on archived flag. If none set then set to false
            if "archived" not in model:
                model["archived"] = False

            # If no added date then set to a default
            if "added" not in model:
                model["added"] = "2024-02-01"

            # Application uses the new flag to decide whether to display a badge
            # TODO: Probably shouldn't be doing > string comparison for dates
            model["new"] = True if (model["added"] > new_model_cutoff_date) else False

    return gallery


@router.get("/model/gallery/sizes")
async def model_gallery_update_sizes():
    """
    TEMP INTERNAL TOOL
    Calculates updated sizes for all models in the gallery and prints.
    """

    gallery = await model_gallery_list_all()

    # Iterate through models and calculate updated model size
    for model in gallery:
        gallery_size = model.get("size_of_model_in_mb", "unknown")
        try:
            default_allow_patterns = [
                "*.json",
                "*.safetensors",
                "*.py",
                "tokenizer.model",
                "*.tiktoken",
                "*.npz",
                "*.bin",
            ]
            download_size = huggingfacemodel.get_huggingface_download_size(
                model["uniqueID"], model.get("allow_patterns", default_allow_patterns)
            )
        except Exception as e:
            download_size = -1
            print(e)
        try:
            total_size = huggingfacemodel.get_huggingface_download_size(model["uniqueID"], [])
        except Exception:
            total_size = -1
        print(model["uniqueID"])
        print("Gallery size:", gallery_size)
        print("Calculated size:", download_size / (1024 * 1024))
        print("Total size:", total_size / (1024 * 1024))
        print("--")

        if download_size > 0:
            model["size_of_model_in_mb"] = download_size / (1024 * 1024)

    return gallery


@router.get("/model/gallery/{model_id}")
async def model_gallery(model_id: str):
    # convert "~~~"" in string to "/":
    model_id = model_id.replace("~~~", "/")

    return await get_model_details_from_gallery(model_id)


# Should this be a POST request?


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


@router.get(path="/model/login_to_huggingface")
async def login_to_huggingface():
    from huggingface_hub import get_token, login

    token = await db.config_get("HuggingfaceUserAccessToken")

    saved_token_in_hf_cache = get_token()
    # print(f"Saved token in HF cache: {saved_token_in_hf_cache}")
    if saved_token_in_hf_cache:
        try:
            login(token=saved_token_in_hf_cache)
            return {"message": "OK"}
        except Exception:
            pass

    if token is None:
        return {"message": "HuggingfaceUserAccessToken not set"}

    # Note how login() works. When you login, huggingface_hub saves your token as a file to ~/.huggingface/token
    # and it is there forever, until you delete it. So you only need to login once and it
    # persists across sessions.
    # https://huggingface.co/docs/huggingface_hub/v0.19.3/en/package_reference/login#huggingface_hub.login

    try:
        login(token=token)
        return {"message": "OK"}
    except Exception:
        return {"message": "Login failed"}


@router.get(path="/model/logout_from_huggingface")
async def logout_from_huggingface():
    # Logout from Hugging Face using the huggingface_hub logout function.

    from huggingface_hub import logout
    import os

    try:
        logout()
        print("Successfully logged out from Hugging Face")

        # Also clear the token file manually as a backup
        # The token is stored at ~/.huggingface/token according to the comment
        token_file = os.path.expanduser("~/.huggingface/token")
        if os.path.exists(token_file):
            os.remove(token_file)

        return {"message": "OK"}

    except Exception:
        return {"message": "Logout failed"}


@router.get(path="/model/login_to_wandb")
async def login_to_wandb():
    # TODO: Move all of these logins and their tests to another router outside 'model' to maintain clarity
    import wandb

    token = await db.config_get("WANDB_API_KEY")

    if token is None:
        return {"message": "WANDB_API not set"}
    try:
        wandb.login(key=token, force=True, relogin=True, verify=True)
        return {"message": "OK"}
    except Exception:
        return {"message": "Login failed"}


@router.get(path="/model/test_wandb_login")
def test_wandb_login():
    import netrc

    netrc_path = Path.home() / (".netrc" if os.name != "nt" else "_netrc")
    if netrc_path.exists():
        auth = netrc.netrc(netrc_path).authenticators("api.wandb.ai")
        if auth:
            return {"message": "OK"}
        else:
            print("No W&B API key entry found in the netrc file.")
            return {"message": "No W&B API key entry found in the netrc file."}
    else:
        print(f"Netrc file not found at {netrc_path}.")
        return {"message": "Netrc file not found at {netrc_path}."}


@router.get(path="/model/set_openai_api_key")
async def set_openai_api_key():
    token = await db.config_get("OPENAI_API_KEY")
    if not token or token == "":
        return {"message": "OPENAI_API_KEY not configured in database"}

    current_key = os.getenv("OPENAI_API_KEY")
    if current_key == token:
        return {"message": "OK"}

    os.environ["OPENAI_API_KEY"] = token
    return {"message": "OK"}


@router.get(path="/model/set_anthropic_api_key")
async def set_anthropic_api_key():
    token = await db.config_get("ANTHROPIC_API_KEY")
    if not token or token == "":
        return {"message": "ANTHROPIC_API_KEY not configured in database"}

    current_key = os.getenv("ANTHROPIC_API_KEY")
    if current_key == token:
        return {"message": "OK"}

    os.environ["ANTHROPIC_API_KEY"] = token
    return {"message": "OK"}


@router.get(path="/model/set_custom_api_key")
async def set_custom_api_key():
    token_str = await db.config_get("CUSTOM_MODEL_API_KEY")
    if not token_str or token_str == "":
        return {"message": "CUSTOM_MODEL_API_KEY not configured in database"}

    current_token = os.getenv("CUSTOM_MODEL_API_KEY")
    if current_token == token_str:
        return {"message": "OK"}

    os.environ["CUSTOM_MODEL_API_KEY"] = token_str
    return {"message": "OK"}


@router.get(path="/model/check_openai_api_key")
async def check_openai_api_key():
    # Check if the OPENAI_API_KEY is set
    if os.getenv("OPENAI_API_KEY") is None:
        return {"message": "OPENAI_API_KEY not set"}
    else:
        return {"message": "OK"}


@router.get(path="/model/check_anthropic_api_key")
async def check_anthropic_api_key():
    # Check if the ANTHROPIC_API_KEY is set
    if os.getenv("ANTHROPIC_API_KEY") is None:
        return {"message": "ANTHROPIC_API_KEY not set"}
    else:
        return {"message": "OK"}


@router.get(path="/model/check_custom_api_key")
async def check_custom_api_key():
    # Check if the CUSTOM_MODEL_API_KEY is set in the environment
    if os.getenv("CUSTOM_MODEL_API_KEY") is None:
        return {"message": "CUSTOM_MODEL_API_KEY not set"}
    else:
        return {"message": "OK"}


@router.get(path="/model/download_size")
def get_model_download_size(model_id: str, allow_patterns: list = []):
    try:
        download_size_in_bytes = huggingfacemodel.get_huggingface_download_size(model_id, allow_patterns)
    except Exception as e:
        print(f"Error in get_model_download_size: {type(e).__name__}: {e}")
        return {"status": "error", "message": "An internal error has occurred."}

    return {"status": "success", "data": download_size_in_bytes}


async def download_huggingface_model(
    hugging_face_id: str,
    model_details: str = {},
    job_id: int | None = None,
    experiment_id: str = None,
    organization_id: str | None = None,
):
    """
    Tries to download a model with the id hugging_face_id
    model_details is the object created from the gallery json
        or a similarly-formatted object containing the fields:
        - name (display name)
        - size_of_model_in_mb (for progress meter)
        - huggingface_filename (for models with many files like GGUF)

    Returns an object with the following fields:
    - status: "success" or "error"
    - message: error message if status is "error"
    """
    if job_id is None:
        job_id = job_service.job_create(
            type="DOWNLOAD_MODEL", status="STARTED", experiment_id=experiment_id, job_data="{}"
        )
    else:
        await job_service.job_update(
            job_id=job_id, type="DOWNLOAD_MODEL", status="STARTED", experiment_id=experiment_id
        )

    # try to figure out model details from model_details object
    # default is empty object so can't assume any of this exists
    name = model_details.get("name", hugging_face_id)
    model_size = str(model_details.get("size_of_model_in_mb", -1))
    hugging_face_filename = model_details.get("huggingface_filename", None)
    allow_patterns = model_details.get("allow_patterns", None)

    from transformerlab.shared import dirs as shared_dirs

    args = [
        f"{shared_dirs.TFL_SOURCE_CODE_DIR}/transformerlab/shared/download_huggingface_model.py",
        "--model_name",
        hugging_face_id,
        "--job_id",
        str(job_id),
        "--total_size_of_model_in_mb",
        model_size,
    ]

    # Multitenant: pass workspace_dir explicitly so the script uses the correct org path
    try:
        if organization_id:
            # Construct org-specific workspace path manually
            from lab import HOME_DIR

            workspace_dir = storage.join(HOME_DIR, "orgs", organization_id, "workspace")
        else:
            # Use default workspace path
            workspace_dir = get_workspace_dir()

        args += ["--workspace_dir", workspace_dir]
    except Exception as e:
        print(f"Error constructing workspace directory: {e}")
        pass

    if hugging_face_filename is not None:
        args += ["--model_filename", hugging_face_filename]

    if isinstance(allow_patterns, list):
        allow_patterns_json = json.dumps(allow_patterns)
        args += ["--allow_patterns", allow_patterns_json]

    try:
        # Pass organization_id as environment variable to subprocess
        # This allows the subprocess to set lab_set_org_id without leaking to the API
        subprocess_env = {}
        if organization_id:
            subprocess_env["_TFL_ORG_ID"] = organization_id

        process = await shared.async_run_python_script_and_update_status(
            python_script=args, job_id=job_id, begin_string="Fetching", env=subprocess_env
        )
        exitcode = process.returncode

        if exitcode == 77:
            # This means we got a GatedRepoError
            # The user needs to agree to terms on HuggingFace to download
            job = job_service.job_get(job_id)
            error_msg = None
            if job and job.get("job_data"):
                error_msg = job["job_data"].get("error_msg")
            await job_update_status(job_id, "UNAUTHORIZED", experiment_id=experiment_id, error_msg=error_msg)
            return {"status": "unauthorized", "message": error_msg}

        elif exitcode != 0:
            job = job_service.job_get(job_id)
            error_msg = None
            if job and job.get("job_data"):
                error_msg = job["job_data"].get("error_msg")
            if not error_msg:
                error_msg = f"Exit code {exitcode}"
                await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
            return {"status": "error", "message": error_msg}

    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        # Log the detailed error message
        print(error_msg)
        await job_update_status(
            job_id, "FAILED", experiment_id=experiment_id, error_msg="An internal error has occurred."
        )
        return {"status": "error", "message": "An internal error has occurred."}

    except asyncio.CancelledError:
        error_msg = "Download cancelled"
        await job_update_status(job_id, "CANCELLED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}

    if hugging_face_filename is None:
        # only save to local filesystem if we are downloading the whole repo
        try:
            model_service = await ModelService.create(hugging_face_id)
            await model_service.set_metadata(model_id=hugging_face_id, name=name, json_data=model_details)
        except FileExistsError:
            # Model already exists, update it
            model_service = await ModelService.get(hugging_face_id)
            await model_service.set_metadata(model_id=hugging_face_id, name=name, json_data=model_details)

    return {"status": "success", "message": "success", "model": model_details, "job_id": job_id}


@router.get(path="/model/download_from_huggingface")
async def download_model_by_huggingface_id(model: str, job_id: int | None = None, experiment_id: str = None):
    """Takes a specific model string that must match huggingface ID to download
    This function will not be able to infer out description etc of the model
    since it is not in the gallery"""

    # Get model details from Hugging Face
    # If None then that means either the model doesn't exist
    # Or we don't have proper Hugging Face authentication setup
    try:
        model_details = await huggingfacemodel.get_model_details_from_huggingface(model)
    except GatedRepoError:
        error_msg = f"{model} is a gated model. \
To continue downloading, you need to enter a valid \
Hugging Face token on the settings page, \
and you must agree to the terms \
on the model's Huggingface page."
        # Log the detailed error message
        print(error_msg)
        if job_id:
            await job_update_status(job_id, "UNAUTHORIZED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "unauthorized", "message": error_msg}
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        print(error_msg)
        if job_id:
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": "An internal error has occurred."}

    if model_details is None:
        error_msg = f"Error reading config for model with ID {model}"
        if job_id:
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}

        # Check if this is a GGUF repository that requires file selection
    if model_details.get("requires_file_selection", False):
        available_files = model_details.get("available_gguf_files", [])
        return {
            "status": "requires_file_selection",
            "message": "This is a GGUF repository with multiple files. Please specify which file to download.",
            "model_id": model,
            "available_files": available_files,
            "model_details": model_details,
        }

    # --- Stable Diffusion detection and allow_patterns logic ---
    # If the model is a Stable Diffusion model, set allow_patterns for SD files
    sd_patterns = [
        "*.ckpt",
        "*.safetensors",
        "*.pt",
        "*.bin",
        "config.json",
        "model_index.json",
        "vocab.json",
        "merges.txt",
        "tokenizer.json",
        "*.yaml",
        "*.yml",
    ]
    is_sd = False
    # Heuristic: check tags or config for 'stable-diffusion' or 'diffusers' or common SD files
    tags = model_details.get("tags", [])
    if any("stable-diffusion" in t or "diffusers" in t for t in tags):
        is_sd = True
    # Or check for model_index.json or config.json with SD structure
    files = model_details.get("siblings", [])
    if any(f.get("rfilename", "").endswith("model_index.json") for f in files):
        is_sd = True
    # If detected, set allow_patterns
    if is_sd:
        model_details["allow_patterns"] = sd_patterns

    org_id = await get_current_org_id()
    print("🔵 CURRENT ORG ID: ", org_id)
    return await download_huggingface_model(model, model_details, job_id, experiment_id, org_id)


@router.get(path="/model/download_gguf_file")
async def download_gguf_file_from_repo(model: str, filename: str, job_id: int | None = None, experiment_id: str = None):
    """Download a specific GGUF file from a GGUF repository"""

    # First get the model details to validate this is a GGUF repo
    try:
        model_details = await huggingfacemodel.get_model_details_from_huggingface(model)
    except Exception as e:
        error_msg = f"Error accessing model repository: {type(e).__name__}: {e}"
        if job_id:
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}

    if model_details is None:
        error_msg = f"Error reading config for model with ID {model}"
        if job_id:
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}

    # Validate the requested filename exists in the repository
    available_files = model_details.get("available_gguf_files", [])
    if filename not in available_files:
        error_msg = f"File '{filename}' not found in repository. Available files: {available_files}"
        if job_id:
            await job_update_status(job_id, "FAILED", experiment_id=experiment_id, error_msg=error_msg)
        return {"status": "error", "message": error_msg}

    # Update model details for specific file download
    model_details["huggingface_filename"] = filename
    model_details["name"] = f"{model_details['name']} ({filename})"

    # Calculate size of specific file
    try:
        repo_tree = list_repo_tree(model, recursive=True)
        for file in repo_tree:
            if hasattr(file, "path") and file.path == filename:
                model_details["size_of_model_in_mb"] = file.size / (1024 * 1024)
                break
    except Exception:
        pass  # Use existing size if we can't get specific file size

    org_id = await get_current_org_id()
    return await download_huggingface_model(model, model_details, job_id, experiment_id, org_id)


@router.get(path="/model/download_model_from_gallery")
async def download_model_from_gallery(gallery_id: str, job_id: int | None = None, experiment_id: str = None):
    """Provide a reference to a model in the gallery, and we will download it
    from huggingface

    You can manually specify a pre-created job_id if you want to track the progress of the download with
    a defined job_id provided by the API using /job/createId"""

    # Get model details from the gallery
    # If None then return an error
    gallery_entry = await get_model_details_from_gallery(gallery_id)
    if gallery_entry is None:
        return {"status": "error", "message": "Model not found in gallery"}

    # Need to use huggingface repo to download - not always the same as uniqueID
    huggingface_id = gallery_entry.get("huggingface_repo", gallery_id)

    # Fetch pipeline_tag if not present in gallery_entry
    if "pipeline_tag" not in gallery_entry:
        # First try to get from filesystem
        try:
            model_service = await ModelService.get(huggingface_id)
            model_data = await model_service.get_metadata()
            if model_data and model_data.get("json_data") and "pipeline_tag" in model_data["json_data"]:
                gallery_entry["pipeline_tag"] = model_data["json_data"]["pipeline_tag"]
            else:
                # If not in database, fetch from Hugging Face Hub
                try:
                    api = HfApi()
                    model_info = api.model_info(huggingface_id)
                    gallery_entry["pipeline_tag"] = model_info.pipeline_tag
                except Exception as e:
                    # Assume text generation if we can't get the tag
                    print(f"Error fetching pipeline tag for {huggingface_id}: {type(e).__name__}: {e}")
                    gallery_entry["pipeline_tag"] = "text-generation"
        except FileNotFoundError:
            # Model not found in filesystem, fetch from Hugging Face Hub
            try:
                api = HfApi()
                model_info = api.model_info(huggingface_id)
                gallery_entry["pipeline_tag"] = model_info.pipeline_tag
            except Exception as e:
                # Assume text generation if we can't get the tag
                print(f"Error fetching pipeline tag for {huggingface_id}: {type(e).__name__}: {e}")
                gallery_entry["pipeline_tag"] = "text-generation"

    org_id = await get_current_org_id()
    print("🔵 CURRENT ORG ID: ", org_id)

    return await download_huggingface_model(huggingface_id, gallery_entry, job_id, experiment_id, org_id)


@router.get("/model/get_conversation_template")
async def get_model_prompt_template(model: str):
    # Below we grab the conversation template from FastChat's model adapter
    # solution by passing in the model name
    return get_conversation_template(model)


@router.get("/model/list")
async def model_local_list(embedding=False):
    # the model list is a combination of downloaded hugging face models and locally generated models
    return await model_helper.list_installed_models(embedding)


@router.get("/model/provenance/{model_id}")
async def model_provenance(model_id: str):
    # Get the provenance of a model along with the jobs that created it and evals that were done on each model

    model_id = model_id.replace("~~~", "/")

    return await model_helper.list_model_provenance(model_id)


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
    workspace_dir = get_workspace_dir()
    secure_model_id = secure_filename(model_id)
    adaptors_dir = storage.join(workspace_dir, "adaptors", secure_model_id)
    # Check if the peft exists
    if storage.exists(adaptors_dir):
        peft_path = storage.join(adaptors_dir, peft)
    else:
        # Assume the adapter is stored in the older naming convention format
        peft_path = storage.join(workspace_dir, "adaptors", model_id, peft)

    storage.rm_tree(peft_path)

    return {"message": "success"}


@router.post("/model/install_peft")
async def install_peft(peft: str, model_id: str, job_id: int | None = None, experiment_id: str = None):
    api = HfApi()

    try:
        local_file = snapshot_download(model_id, local_files_only=True)
        base_config = {}
        for config_name in ["config.json", "model_index.json"]:
            config_path = os.path.join(local_file, config_name)
            if os.path.exists(config_path):
                with open(config_path, "r") as f:
                    base_config = json.load(f)
                break
    except Exception as e:
        print(f"Failed to load {model_id} config: {e}")
        return {
            "status": "error",
            "message": "Failed to load local base model config",
            "adapter_id": peft,
            "check_status": {"error": "not found"},
        }

    try:
        adapter_info = api.model_info(peft)
        card_data = adapter_info.cardData or {}
        adapter_config = adapter_info.config or {}
        adapter_base_model = card_data.get("base_model") or adapter_config.get("base_model") or ""

        model_name_part = model_id.split("/")[-1].lower()
        adapter_base_model_lower = adapter_base_model.split("/")[-1].lower()

        # Initialize status tracking
        check_status = {}

        # Base model name check
        if model_name_part in adapter_base_model_lower:
            check_status["base_model_name"] = "success"
        else:
            check_status["base_model_name"] = "fail"

        # Field checks
        def compare_field(a_cfg, b_cfg, key, fallback_keys=None):
            if key in a_cfg and key in b_cfg:
                return a_cfg[key] == b_cfg[key]
            if fallback_keys:
                for fk in fallback_keys:
                    if fk in a_cfg and fk in b_cfg:
                        return a_cfg[fk] == b_cfg[fk]
            return None

        for field in ["architectures", "model_type"]:
            match = compare_field(adapter_config, base_config, field, fallback_keys=["_class_name"])
            if match is True:
                check_status[f"{field}_status"] = "success"
            elif match is False:
                check_status[f"{field}_status"] = "fail"
            else:
                check_status[f"{field}_status"] = "unknown"

    except Exception as e:
        print(f"[ERROR] Failed to fetch adapter info for '{peft}: {e}'")
        return {
            "status": "error",
            "message": "adapter not found",
            "adapter_id": peft,
            "check_status": {"error": "not found"},
        }

    try:
        model_details = await huggingfacemodel.get_model_details_from_huggingface(peft)
    except EntryNotFoundError:
        print(f"Adaptor {peft} does not have a config.json. Proceeding without details.")
        model_details = {}
    except GatedRepoError:
        error_msg = f"{peft} is a gated adapter. Please log in and accept the terms on the adapter's Hugging Face page."
        print(error_msg)
        return {
            "status": "unauthorized",
            "message": "This is a gated adapter. Please log in and accept the terms on the adapter's Hugging Face page.",
        }
    except Exception as e:
        error_msg = f"{type(e).__name__}: {e}"
        print(error_msg)
        return {"status": "error", "message": "An error has occurred"}

    print(f"Model Details: {model_details}")
    # Create or update job
    if job_id is None:
        job_id = job_service.job_create(
            type="DOWNLOAD_MODEL", status="STARTED", experiment_id=experiment_id, job_data="{}"
        )
    else:
        await job_service.job_update(
            job_id=job_id, type="DOWNLOAD_MODEL", status="STARTED", experiment_id=experiment_id
        )

    model_size = str(model_details.get("size_of_model_in_mb", -1))
    # Prepare script args
    from transformerlab.shared import dirs as shared_dirs

    args = [
        f"{shared_dirs.TFL_SOURCE_CODE_DIR}/transformerlab/shared/download_huggingface_model.py",
        "--mode",
        "adaptor",
        "--peft",
        peft,
        "--local_model_id",
        model_id,
        "--job_id",
        str(job_id),
        "--total_size_of_model_in_mb",
        model_size,
    ]

    # Multitenant: pass workspace_dir explicitly so the script uses the correct org path
    try:
        from lab.dirs import get_workspace_dir

        workspace_dir = get_workspace_dir()
        args += ["--workspace_dir", workspace_dir]
    except Exception:
        pass

    # Start async subprocess without waiting for completion (like download_huggingface_model)
    asyncio.create_task(
        shared.async_run_python_script_and_update_status(
            python_script=args, job_id=job_id, begin_string="Fetching Adapter"
        )
    )

    return {"status": "started", "job_id": job_id, "check_status": check_status}


@router.get(path="/model/get_local_hfconfig")
async def get_local_hfconfig(model_id: str):
    """
    Returns the config.json file for a model stored in the local filesystem
    """
    try:
        local_file = snapshot_download(model_id, local_files_only=True)
        config_json = os.path.join(local_file, "config.json")
        contents = "{}"
        with open(config_json) as f:
            contents = f.read()
        d = json.loads(contents)
    except Exception:
        # failed to open config.json so create an empty config
        d = {}

    return d


async def get_model_from_db(model_id: str):
    # Get model from filesystem
    model_service = await ModelService.get(model_id)
    return await model_service.get_metadata()


@router.get("/model/list_local_uninstalled")
async def models_list_local_uninstalled(path: str = ""):
    # first search and get a list of BaseModel objects
    found_models = []
    if path is not None and path != "":
        if os.path.isfile(path):
            found_models = []
        elif os.path.isdir(path):
            found_models = await filesystemmodel.list_models(path)
        else:
            return {"status": "error", "message": "Invalid path"}

    # If a folder wasn't given then search known sources for uninstalled models
    else:
        found_models = await models_search_for_local_uninstalled()

    # Then iterate through models and return appropriate details
    response_models = []
    for found_model in found_models:
        # Figure out if this model is supported in Transformer Lab
        supported = True
        if found_model.status != "OK":
            status = f"❌ {found_model.status}"
            supported = False
        else:
            status = "✅"
            supported = True

        new_model = {
            "id": found_model.id,
            "name": found_model.name,
            "path": found_model.source_id_or_path,
            "source": found_model.source,
            "installed": False,
            "status": status,
            "supported": supported,
        }
        response_models.append(new_model)

    return {"status": "success", "data": response_models}


async def models_search_for_local_uninstalled():
    # iterate through each model source and look for uninstalled models
    modelsources = model_helper.list_model_sources()
    models = []
    for source in modelsources:
        source_models = await model_helper.list_models_from_source(source)

        # Only add uninstalled models
        for source_model in source_models:
            installed = await model_helper.is_model_installed(source_model.id)
            if not installed:
                models.append(source_model)

    return models


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
    if await model_helper.is_model_installed(model.id):
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
