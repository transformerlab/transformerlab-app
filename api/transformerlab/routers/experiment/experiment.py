import os

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

import transformerlab.services.experiment_service as experiment_service
import transformerlab.services.experiment_access_service as access_service
from lab import Experiment, storage
from transformerlab.shared import shared
from transformerlab.routers.experiment import (
    documents,
    jobs,
    notes,
    share,
    task as task_router,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.services.permission_service import check_permission, get_user_team, require_permission
from sqlalchemy import select
from transformerlab.shared.models.models import TeamRole, UserExperimentAccess
from transformerlab.db.session import get_async_session

from werkzeug.utils import secure_filename

router = APIRouter(prefix="/experiment")

router.include_router(
    router=documents.router,
    prefix="/{experimentId}",
    tags=["documents"],
    dependencies=[Depends(require_permission("experiment", "read", id_param="experimentId"))],
)
router.include_router(
    router=jobs.router,
    prefix="/{experimentId}",
    tags=["jobs"],
    dependencies=[Depends(require_permission("experiment", "read", id_param="experimentId"))],
)
router.include_router(
    router=task_router.router,
    prefix="/{experimentId}",
    tags=["task"],
    dependencies=[Depends(require_permission("experiment", "read", id_param="experimentId"))],
)
router.include_router(
    router=notes.router,
    prefix="/{experimentId}",
    tags=["notes"],
    dependencies=[Depends(require_permission("experiment", "read", id_param="experimentId"))],
)
router.include_router(
    router=share.router,
    prefix="/{experimentId}",
    tags=["share"],
)


@router.get("/", summary="Get all Experiments", tags=["experiment"])
async def experiments_get_all(
    session: AsyncSession = Depends(get_async_session),
    user_and_team: dict = Depends(get_user_and_team),
):
    """Get a list of all experiments, filtered by role, with per-user last_opened_at."""
    experiments = await experiment_service.experiment_get_all()
    user = user_and_team["user"]
    team_id = user_and_team["team_id"]
    user_id = str(user.id)

    user_team = await get_user_team(session, user_id, team_id)
    if user_team is None:
        return []

    # Role-based filtering (existing logic)
    if user_team.role == TeamRole.OWNER.value:
        filtered = experiments
    else:
        filtered = []
        for experiment in experiments:
            experiment_id = str(experiment.get("id"))
            if not experiment_id:
                continue
            allowed = await check_permission(
                session=session,
                user_id=user_id,
                team_id=team_id,
                resource_type="experiment",
                resource_id=experiment_id,
                action="read",
                user_team=user_team,
            )
            if allowed:
                filtered.append(experiment)

    # Attach per-user last_opened_at
    access_records = await session.execute(
        select(UserExperimentAccess).where(
            UserExperimentAccess.user_id == user_id,
            UserExperimentAccess.team_id == team_id,
        )
    )
    access_map = {row.experiment_id: row.last_opened_at.isoformat() for row in access_records.scalars().all()}

    for exp in filtered:
        exp_id = str(exp.get("id", ""))
        exp["last_opened_at"] = access_map.get(exp_id)

    return filtered


@router.post("/{id}/touch", summary="Record experiment opened", tags=["experiment"])
async def experiment_touch(
    id: str,
    session: AsyncSession = Depends(get_async_session),
    user_and_team: dict = Depends(get_user_and_team),
    _: None = Depends(require_permission("experiment", "read")),
):
    user_id = str(user_and_team["user"].id)
    team_id = str(user_and_team["team_id"])
    await access_service.touch_experiment(session, user_id, team_id, id)
    return {"status": "ok"}


@router.get("/recent", summary="Get recently opened experiments", tags=["experiment"])
async def experiments_get_recent(
    session: AsyncSession = Depends(get_async_session),
    user_and_team: dict = Depends(get_user_and_team),
):
    """Return last 3 experiments opened by the current user that the user still has access to.
    Falls back to 3 permitted experiments if no access records exist."""
    user = user_and_team["user"]
    team_id = str(user_and_team["team_id"])
    user_id = str(user.id)

    user_team = await get_user_team(session, user_id, team_id)
    if user_team is None:
        return []

    recent_ids = await access_service.get_recent_experiment_ids(session, user_id, team_id, limit=3)
    permitted_experiments = await experiments_get_all(session=session, user_and_team=user_and_team)
    if not recent_ids:
        return permitted_experiments[:3]

    permitted_by_id = {
        str(exp.get("id")): exp for exp in permitted_experiments if isinstance(exp, dict) and exp.get("id")
    }
    ordered_recent = [permitted_by_id[exp_id] for exp_id in recent_ids if exp_id in permitted_by_id]
    return ordered_recent[:3]


@router.get("/create", summary="Create Experiment", tags=["experiment"])
async def experiments_create(
    name: str,
    user_and_team: dict = Depends(get_user_and_team),
):
    # Apply secure filename validation to the experiment name
    secure_name = secure_filename(name)
    if not secure_name:
        raise HTTPException(status_code=422, detail="Invalid experiment name")
    user_id = str(user_and_team["user"].id)

    try:
        newid = await experiment_service.experiment_create(secure_name, {}, created_by=user_id)
    except FileExistsError as e:
        raise HTTPException(status_code=409, detail=f"Experiment '{secure_name}' already exists") from e
    return newid


@router.get("/tags", summary="List all distinct tags across permitted experiments", tags=["experiment"])
async def experiments_list_all_tags(
    session: AsyncSession = Depends(get_async_session),
    user_and_team: dict = Depends(get_user_and_team),
):
    permitted = await experiments_get_all(session=session, user_and_team=user_and_team)
    return {"tags": experiment_service.aggregate_tags(permitted)}


@router.get("/{id}", summary="Get Experiment by ID", tags=["experiment"])
async def experiment_get(
    id: str,
    _: None = Depends(require_permission("experiment", "read")),
):
    data = await experiment_service.experiment_get(id)

    if data is None:
        return {"status": "error", "message": f"Experiment {id} does not exist"}

    # config is already parsed as dict in experiment_get
    return data


@router.get("/{id}/delete", tags=["experiment"])
async def experiments_delete(
    id: str,
    _: None = Depends(require_permission("experiment", "delete")),
):
    await experiment_service.experiment_delete(id)
    return {"message": f"Experiment {id} deleted"}


@router.get("/{id}/update", tags=["experiment"])
async def experiments_update(
    id: str,
    name: str,
    _: None = Depends(require_permission("experiment", "write")),
):
    await experiment_service.experiment_update(id, name)
    return {"message": f"Experiment {id} updated to {name}"}


@router.get("/{id}/update_config", tags=["experiment"])
async def experiments_update_config(
    id: str,
    key: str,
    value: str,
    _: None = Depends(require_permission("experiment", "write")),
):
    await experiment_service.experiment_update_config(id, key, value)
    return {"message": f"Experiment {id} updated"}


@router.post("/{id}/update_configs", tags=["experiment"])
async def experiments_update_configs(
    id: str,
    updates: Annotated[dict, Body()],
    _: None = Depends(require_permission("experiment", "write")),
):
    await experiment_service.experiment_update_configs(id, updates)
    return {"message": f"Experiment {id} configs updated"}


@router.post("/{id}/prompt", tags=["experiment"])
async def experiments_save_prompt_template(
    id: str,
    template: Annotated[str, Body()],
    _: None = Depends(require_permission("experiment", "write")),
):
    await experiment_service.experiment_save_prompt_template(id, template)
    return {"message": f"Experiment {id} prompt template saved"}


@router.post("/{id}/save_file_contents", tags=["experiment"])
async def experiment_save_file_contents(
    id: str,
    filename: str,
    file_contents: Annotated[str, Body()],
    _: None = Depends(require_permission("experiment", "write")),
):
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
async def experiment_get_file_contents(
    id: str,
    filename: str,
    _: None = Depends(require_permission("experiment", "read")),
):
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


@router.post("/{id}/tags/add", summary="Add tags to an experiment", tags=["experiment"])
async def experiments_tags_add(
    id: str,
    body: Annotated[dict, Body()],
    _: None = Depends(require_permission("experiment", "write")),
):
    tags_input = body.get("tags") or []
    if not isinstance(tags_input, list):
        raise HTTPException(status_code=422, detail="'tags' must be a list of strings")
    try:
        merged = await experiment_service.experiment_add_tags(id, tags_input)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Experiment {id} not found") from e
    return {"tags": merged}


@router.post("/{id}/tags/remove", summary="Remove tags from an experiment", tags=["experiment"])
async def experiments_tags_remove(
    id: str,
    body: Annotated[dict, Body()],
    _: None = Depends(require_permission("experiment", "write")),
):
    tags_input = body.get("tags") or []
    if not isinstance(tags_input, list):
        raise HTTPException(status_code=422, detail="'tags' must be a list of strings")
    try:
        kept = await experiment_service.experiment_remove_tags(id, tags_input)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Experiment {id} not found") from e
    return {"tags": kept}
