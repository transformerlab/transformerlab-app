import os

from typing import Annotated

from fastapi import APIRouter, Body

import transformerlab.services.experiment_service as experiment_service
from lab import Experiment, storage
from transformerlab.shared import shared
from transformerlab.routers.experiment import (
    documents,
    jobs,
    task as task_router,
)

from werkzeug.utils import secure_filename

router = APIRouter(prefix="/experiment")

router.include_router(router=documents.router, prefix="/{experimentId}", tags=["documents"])
router.include_router(router=jobs.router, prefix="/{experimentId}", tags=["jobs"])
router.include_router(router=task_router.router, prefix="/{experimentId}", tags=["task"])


@router.get("/", summary="Get all Experiments", tags=["experiment"])
async def experiments_get_all():
    """Get a list of all experiments"""
    return await experiment_service.experiment_get_all()


@router.get("/create", summary="Create Experiment", tags=["experiment"])
async def experiments_create(name: str):
    # Apply secure filename validation to the experiment name
    secure_name = secure_filename(name)

    newid = await experiment_service.experiment_create(secure_name, {})
    return newid


@router.get("/{id}", summary="Get Experiment by ID", tags=["experiment"])
async def experiment_get(id: str):
    data = await experiment_service.experiment_get(id)

    if data is None:
        return {"status": "error", "message": f"Experiment {id} does not exist"}

    # config is already parsed as dict in experiment_get
    return data


@router.get("/{id}/delete", tags=["experiment"])
async def experiments_delete(id: str):
    await experiment_service.experiment_delete(id)
    return {"message": f"Experiment {id} deleted"}


@router.get("/{id}/update", tags=["experiment"])
async def experiments_update(id: str, name: str):
    await experiment_service.experiment_update(id, name)
    return {"message": f"Experiment {id} updated to {name}"}


@router.get("/{id}/update_config", tags=["experiment"])
async def experiments_update_config(id: str, key: str, value: str):
    await experiment_service.experiment_update_config(id, key, value)
    return {"message": f"Experiment {id} updated"}


@router.post("/{id}/update_configs", tags=["experiment"])
async def experiments_update_configs(id: str, updates: Annotated[dict, Body()]):
    await experiment_service.experiment_update_configs(id, updates)
    return {"message": f"Experiment {id} configs updated"}


@router.post("/{id}/prompt", tags=["experiment"])
async def experiments_save_prompt_template(id: str, template: Annotated[str, Body()]):
    await experiment_service.experiment_save_prompt_template(id, template)
    return {"message": f"Experiment {id} prompt template saved"}


@router.post("/{id}/save_file_contents", tags=["experiment"])
async def experiment_save_file_contents(id: str, filename: str, file_contents: Annotated[str, Body()]):
    filename = secure_filename(filename)

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    if (file_ext != ".py") and (file_ext != ".ipynb") and (file_ext != ".md"):
        return {"message": f"File extension {file_ext} not supported"}

    # clean the file name:
    filename = shared.slugify(filename)

    exp_obj = await Experiment.get(id)
    experiment_dir = await exp_obj.get_dir()

    # For remote paths, use storage.join which handles remote URIs properly
    file_path = storage.join(experiment_dir, f"{filename}{file_ext}")
    # Basic path traversal check: ensure filename doesn't contain path separators
    if "/" in filename or "\\" in filename:
        return {"message": "Invalid file path - path traversal detected"}

    # Save the file contents securely
    async with await storage.open(file_path, "w", encoding="utf-8") as f:
        await f.write(file_contents)

    return {"message": f"{file_path} file contents saved"}


@router.get("/{id}/file_contents", tags=["experiment"])
async def experiment_get_file_contents(id: str, filename: str):
    filename = secure_filename(filename)

    exp_obj = await Experiment.get(id)
    experiment_dir = await exp_obj.get_dir()

    # remove file extension from file:
    [filename, file_ext] = os.path.splitext(filename)

    allowed_extensions = [".py", ".ipynb", ".md", ".txt"]

    if file_ext not in allowed_extensions:
        return {"message": f"File extension {file_ext} for {filename} not supported"}

    # clean the file name:
    # filename = shared.slugify(filename)

    # For remote paths, use storage.join which handles remote URIs properly
    # Basic path traversal check: ensure filename doesn't contain path separators
    if "/" in filename or "\\" in filename:
        return {"message": "Invalid file path - path traversal detected"}
    final_path = storage.join(experiment_dir, filename + file_ext)

    print("Listing Contents of File: " + final_path)

    # now get the file contents
    try:
        async with await storage.open(final_path, "r") as f:
            file_contents = await f.read()
    except FileNotFoundError:
        return ""

    return file_contents
