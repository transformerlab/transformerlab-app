from typing import Annotated
from fastapi import APIRouter, Body, Depends, Header, HTTPException
from huggingface_hub import HfApi

from transformerlab.services import model_service, asset_upload_service, asset_download_service
from transformerlab.services.cache_service import cached
from transformerlab.services.permission_service import require_permission
from transformerlab.services.upload_service import (
    get_assembled_path,
    delete_upload,
)
from lab.dirs import get_workspace_dir
from lab.model import Model
from lab import storage

from werkzeug.utils import secure_filename


router = APIRouter(tags=["model"])


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


@router.get("/model/registry_versions")
@cached(key="models:registry_versions", ttl="1h", tags=["models", "models:registry_versions", "asset_versions"])
async def model_registry_versions():
    """List model registry versions as selectable model IDs."""
    from transformerlab.services import asset_version_service

    groups = await asset_version_service.list_groups("model")
    versions: list[dict] = []

    for group in groups:
        group_id = group.get("group_id")
        group_name = group.get("group_name") or group_id
        if not group_id:
            continue

        group_versions = await asset_version_service.list_versions("model", group_id)
        for version in group_versions:
            model_id = version.get("asset_id")
            version_label = version.get("version_label")
            if not model_id or not version_label:
                continue

            tag = version.get("tag")
            tag_suffix = f" ({tag})" if tag else ""
            versions.append(
                {
                    "model_id": model_id,
                    "name": f"{group_name}/{version_label}{tag_suffix}",
                    "group_id": group_id,
                    "group_name": group_name,
                    "version_label": version_label,
                    "tag": tag,
                    "created_at": version.get("created_at"),
                }
            )

    return versions


@router.get("/model/create")
async def model_local_create(id: str, name: str, json_data={}):
    # Use filesystem instead of database
    try:
        model_obj = await Model.create(id)
        await model_obj.set_metadata(model_id=id, name=name, json_data=json_data)
        return {"message": "model created"}
    except FileExistsError:
        return {"status": "error", "message": f"Model {id} already exists"}
    except Exception as e:
        print(f"Error creating model {id}: {e}")
        return {"status": "error", "message": "Failed to create model due to an internal error."}


@router.get("/model/delete")
async def model_local_delete(
    model_id: str,
    delete_from_cache: bool = False,
    _: None = Depends(require_permission("model", "delete", id_param="model_id")),
):
    # Try to delete from filesystem first using SDK
    try:
        model_obj = await Model.get(model_id)
        # Delete the entire directory
        model_dir = await model_obj.get_dir()
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
                model_service.delete_model_from_hf_cache(model_id)  # uses imported model_service module
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
        model_obj = await Model.get(model_name)
        model_data = await model_obj.get_metadata()
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


@router.post("/model/fileupload", summary="Accept a chunked-upload-staged file as part of a model.")
async def model_fileupload(
    model_id: str,
    upload_id: str,
    relpath: str,
    force: bool = False,
):
    try:
        assembled = await get_assembled_path(upload_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Lazy-create the Model so the directory + index.json stub exist.
    try:
        model_obj = await Model.get(model_id)
    except FileNotFoundError:
        model_obj = await Model.create(model_id)
        await model_obj.set_metadata(model_id=model_id, name=model_id, json_data={"local_model": True})

    asset_dir = await model_obj.get_dir()

    try:
        await asset_upload_service.accept_uploaded_file(
            asset_dir=asset_dir,
            assembled_path=assembled,
            relpath=relpath,
            force=force,
        )
    except asset_upload_service.InvalidRelpathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except asset_upload_service.RelpathConflictError as exc:
        raise HTTPException(status_code=409, detail=f"file exists: {exc}")

    # Update json_data.files in index.json so listings stay consistent.
    metadata = await model_obj.get_metadata()
    json_data = metadata.get("json_data", {}) or {}
    files = set(json_data.get("files", []) or [])
    files.add(relpath.replace("\\", "/"))
    json_data["files"] = sorted(files)
    await model_obj.set_metadata(json_data=json_data)

    await delete_upload(upload_id)
    return {"status": "success", "relpath": relpath}


@router.post("/model/finalize", summary="Finalize a model after all files are uploaded.")
async def model_finalize(model_id: str):
    try:
        model_obj = await Model.get(model_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"model {model_id} not found")

    asset_dir = await model_obj.get_dir()
    config_path = storage.join(asset_dir, "config.json")
    if not await storage.exists(config_path):
        raise HTTPException(
            status_code=400,
            detail="cannot finalize: no config.json present. Upload one first.",
        )

    architecture = await model_obj.detect_architecture(asset_dir)
    metadata = await model_obj.get_metadata()
    json_data = metadata.get("json_data", {}) or {}
    json_data["architecture"] = architecture
    json_data["local_model"] = True
    json_data.setdefault("source", "transformerlab")
    await model_obj.set_metadata(name=metadata.get("name", model_id), json_data=json_data)

    return {"status": "success", "architecture": architecture}


@router.get("/model/files", summary="List all files within a model directory.")
async def model_files(model_id: str):
    try:
        model_obj = await Model.get(model_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"model {model_id} not found")
    asset_dir = await model_obj.get_dir()
    return await asset_download_service.list_files(asset_dir)


@router.get("/model/file", summary="Stream one file from a model directory.")
async def model_file(
    model_id: str,
    relpath: str,
    range: str | None = Header(default=None),  # noqa: A002 — shadows builtin; FastAPI injects Range header
):
    try:
        model_obj = await Model.get(model_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"model {model_id} not found")
    asset_dir = await model_obj.get_dir()
    try:
        return await asset_download_service.stream_file(asset_dir, relpath, range)
    except asset_download_service.InvalidRelpathError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"{relpath} not found in model {model_id}")
