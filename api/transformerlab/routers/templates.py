from fastapi import APIRouter, Body
from werkzeug.utils import secure_filename

from transformerlab.services.templates_service import templates_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("/list", summary="Returns all the templates")
async def templates_get_all():
    templates = templates_service.templates_get_all()
    return templates


@router.get("/{template_id}/get", summary="Gets all the data for a single template")
async def templates_get_by_id(template_id: str):
    template = templates_service.templates_get_by_id(template_id)
    if template is None:
        return {"message": "NOT FOUND"}
    return template


@router.get("/list_by_type", summary="Returns all the templates of a certain type, e.g TRAIN")
async def templates_get_by_type(type: str):
    templates = templates_service.templates_get_by_type(type)
    return templates


@router.get(
    "/list_by_type_in_experiment",
    summary="Returns all the templates of a certain type in a certain experiment, e.g TRAIN",
)
async def templates_get_by_type_in_experiment(type: str, experiment_id: str):
    templates = templates_service.templates_get_by_type_in_experiment(type, experiment_id)
    return templates


@router.put("/{template_id}/update", summary="Updates a template with new information")
async def update_template(template_id: str, new_template: dict = Body()):
    # Perform secure_filename before updating the template
    if "name" in new_template:
        new_template["name"] = secure_filename(new_template["name"])
    success = templates_service.update_template(template_id, new_template)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.get("/{template_id}/delete", summary="Deletes a template")
async def delete_template(template_id: str):
    success = templates_service.delete_template(template_id)
    if success:
        return {"message": "OK"}
    else:
        return {"message": "NOT FOUND"}


@router.put("/new_template", summary="Create a new template")
async def add_template(new_template: dict = Body()):
    # Perform secure_filename before adding the template
    if "name" in new_template:
        new_template["name"] = secure_filename(new_template["name"])

    # All fields are stored directly in the JSON (not nested in inputs/outputs/config)
    template_id = templates_service.add_template(new_template)
    return {"message": "OK", "id": template_id}


@router.get("/delete_all", summary="Wipe all templates")
async def templates_delete_all():
    templates_service.templates_delete_all()
    return {"message": "OK"}
