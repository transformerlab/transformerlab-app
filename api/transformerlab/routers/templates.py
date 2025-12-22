from fastapi import APIRouter, Body, Query, HTTPException, Depends
from typing import Optional
from werkzeug.utils import secure_filename
import json

from transformerlab.services.templates_service import templates_service
from transformerlab.shared import galleries
from transformerlab.shared.github_utils import (
    fetch_task_json_from_github_helper,
)
from transformerlab.routers.auth import get_user_and_team
from transformerlab.schemas.templates import (
    ExportTemplateToTeamGalleryRequest,
    ImportTemplateFromGalleryRequest,
    ImportTemplateFromTeamGalleryRequest,
    DeleteTeamTemplateFromGalleryRequest,
)

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


@router.get(
    "/list_by_subtype_in_experiment",
    summary="Returns all templates for an experiment filtered by subtype and optionally by type",
)
async def templates_get_by_subtype_in_experiment(
    experiment_id: str,
    subtype: str,
    type: Optional[str] = Query(None, description="Optional template type filter (e.g., REMOTE)"),
):
    templates = templates_service.templates_get_by_subtype_in_experiment(experiment_id, subtype, type)
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


@router.get("/gallery", summary="List all templates from the templates gallery")
async def templates_gallery():
    """Get the templates gallery from the JSON file (same as tasks gallery)"""
    gallery = galleries.get_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/import", summary="Import a template from the templates gallery")
async def import_template_from_gallery(
    request: ImportTemplateFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Import a template from the templates gallery.
    Creates a new template using the gallery entry's config and GitHub info.
    Uses the team's GitHub PAT if available.
    """
    gallery = galleries.get_tasks_gallery()

    # Find the gallery entry by index or ID
    try:
        gallery_index = int(request.gallery_id)
        if gallery_index < 0 or gallery_index >= len(gallery):
            raise HTTPException(status_code=404, detail="Gallery entry not found")
        gallery_entry = gallery[gallery_index]
    except (ValueError, IndexError):
        # Try to find by title or other identifier
        gallery_entry = None
        for entry in gallery:
            if entry.get("id") == request.gallery_id or entry.get("title") == request.gallery_id:
                gallery_entry = entry
                break
        if not gallery_entry:
            raise HTTPException(status_code=404, detail="Gallery entry not found")

    # Extract gallery entry fields
    title = gallery_entry.get("title", "Imported Template")
    github_repo_url = gallery_entry.get("github_repo_url") or gallery_entry.get("github_url", "")
    github_repo_dir = (
        gallery_entry.get("github_repo_dir")
        or gallery_entry.get("directory_path")
        or gallery_entry.get("github_directory")
    )
    config = gallery_entry.get("config", {})

    if not github_repo_url:
        raise HTTPException(status_code=400, detail="Gallery entry missing github_repo_url")

    if not isinstance(config, dict):
        try:
            config = json.loads(config) if isinstance(config, str) else {}
        except Exception:
            config = {}

    # Try to fetch task.json from GitHub repository
    task_json = None
    if github_repo_url:
        task_json = await fetch_task_json_from_github_helper(github_repo_url, github_repo_dir)

    # Build the template config, merging gallery config with task.json (task.json takes precedence)
    template_config = {
        **config,  # Start with gallery config
        "github_enabled": True,
        "github_repo_url": github_repo_url,
    }

    # Merge task.json if found (overrides gallery config)
    if task_json:
        template_config.update(task_json)

    if github_repo_dir:
        template_config["github_directory"] = github_repo_dir

    # Get template name from config or use title
    template_name = template_config.get("name") or template_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in template_config:
        template_config["cluster_name"] = template_name
    if "command" not in template_config:
        template_config["command"] = "echo 'No command specified'"

    # Create the template with all fields stored directly (flat structure)
    new_template = {
        "name": template_name,
        "type": "REMOTE",
        "plugin": "remote_orchestrator",
        "experiment_id": request.experiment_id,
        **template_config,  # All config fields go directly into template
    }

    # Perform secure_filename before adding the template
    new_template["name"] = secure_filename(new_template["name"])

    templates_service.add_template(new_template)

    return {"status": "success", "message": f"Template '{template_name}' imported successfully"}


@router.get("/gallery/team", summary="List team-specific templates from the team gallery")
async def team_templates_gallery():
    """Get the team-specific templates gallery stored in workspace_dir (same as tasks gallery)"""
    gallery = galleries.get_team_tasks_gallery()
    return {"status": "success", "data": gallery}


@router.post("/gallery/team/import", summary="Import a template from the team templates gallery")
async def import_template_from_team_gallery(
    request: ImportTemplateFromTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Import a template from the team-specific templates gallery (workspace_dir/team_specific_tasks.json).
    """
    gallery = galleries.get_team_tasks_gallery()

    # Find the gallery entry by index or ID
    try:
        gallery_index = int(request.gallery_id)
        if gallery_index < 0 or gallery_index >= len(gallery):
            raise HTTPException(status_code=404, detail="Gallery entry not found")
        gallery_entry = gallery[gallery_index]
    except (ValueError, IndexError):
        gallery_entry = None
        for entry in gallery:
            if entry.get("id") == request.gallery_id or entry.get("title") == request.gallery_id:
                gallery_entry = entry
                break
        if not gallery_entry:
            raise HTTPException(status_code=404, detail="Gallery entry not found")

    # Extract gallery entry fields
    title = gallery_entry.get("title", "Imported Template")
    github_repo_url = gallery_entry.get("github_repo_url") or gallery_entry.get("github_url", "")
    github_repo_dir = (
        gallery_entry.get("github_repo_dir")
        or gallery_entry.get("directory_path")
        or gallery_entry.get("github_directory")
    )
    config = gallery_entry.get("config", {})

    if not isinstance(config, dict):
        try:
            config = json.loads(config) if isinstance(config, str) else {}
        except Exception:
            config = {}

    # Try to fetch task.json from GitHub repository if repo URL is provided
    task_json = None
    if github_repo_url:
        task_json = await fetch_task_json_from_github_helper(github_repo_url, github_repo_dir)

    # Build the template config, merging gallery config with task.json (task.json takes precedence)
    template_config = {
        **config,  # Start with gallery config
    }

    # Merge task.json if found (overrides gallery config)
    if task_json:
        template_config.update(task_json)

    if github_repo_url:
        template_config["github_enabled"] = True
        template_config["github_repo_url"] = github_repo_url
    if github_repo_dir:
        template_config["github_directory"] = github_repo_dir

    # Get template name from config or use title
    template_name = template_config.get("name") or template_config.get("cluster_name") or title

    # Ensure required fields are set with defaults if not in config
    if "cluster_name" not in template_config:
        template_config["cluster_name"] = template_name
    if "command" not in template_config:
        template_config["command"] = "echo 'No command specified'"

    # Create the template with all fields stored directly (flat structure)
    new_template = {
        "name": template_name,
        "type": "REMOTE",
        "plugin": "remote_orchestrator",
        "experiment_id": request.experiment_id,
        **template_config,  # All config fields go directly into template
    }

    # Perform secure_filename before adding the template
    new_template["name"] = secure_filename(new_template["name"])

    templates_service.add_template(new_template)

    return {"status": "success", "message": f"Template '{template_name}' imported successfully"}


@router.post("/gallery/team/export", summary="Export an existing template to the team gallery")
async def export_template_to_team_gallery(
    request: ExportTemplateToTeamGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Export a template into the team-specific gallery stored in workspace_dir.
    Templates store all fields directly (not nested in config).
    """
    template = templates_service.templates_get_by_id(request.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    # For templates, all fields are stored directly (not nested in config)
    # Build config object from template fields for gallery entry
    config = {}
    # Copy relevant fields to config for gallery compatibility
    if template.get("cluster_name"):
        config["cluster_name"] = template.get("cluster_name")
    if template.get("command"):
        config["command"] = template.get("command")
    if template.get("cpus"):
        config["cpus"] = template.get("cpus")
    if template.get("memory"):
        config["memory"] = template.get("memory")
    if template.get("disk_space"):
        config["disk_space"] = template.get("disk_space")
    if template.get("accelerators"):
        config["accelerators"] = template.get("accelerators")
    if template.get("num_nodes"):
        config["num_nodes"] = template.get("num_nodes")
    if template.get("setup"):
        config["setup"] = template.get("setup")
    if template.get("env_vars"):
        config["env_vars"] = template.get("env_vars")
    if template.get("parameters"):
        config["parameters"] = template.get("parameters")
    if template.get("file_mounts"):
        config["file_mounts"] = template.get("file_mounts")
    if template.get("github_enabled"):
        config["github_enabled"] = template.get("github_enabled")
    if template.get("github_repo_url"):
        config["github_repo_url"] = template.get("github_repo_url")
    if template.get("github_directory"):
        config["github_directory"] = template.get("github_directory")

    gallery_entry = {
        "id": template.get("id") or request.template_id,
        "title": template.get("name") or "Untitled Template",
        "description": template.get("description"),
        "config": config,
        "github_repo_url": template.get("github_repo_url"),
        "github_repo_dir": template.get("github_directory"),
    }

    galleries.add_team_task_to_gallery(gallery_entry)

    return {
        "status": "success",
        "message": f"Template '{gallery_entry['title']}' exported to team gallery",
        "data": gallery_entry,
    }


@router.post("/gallery/team/delete", summary="Delete a template from the team gallery")
async def delete_team_template_from_gallery(
    request: DeleteTeamTemplateFromGalleryRequest,
    user_and_team=Depends(get_user_and_team),
):
    """
    Delete a template from the team-specific gallery stored in workspace_dir.
    """
    success = galleries.delete_team_task_from_gallery(request.template_id)
    if success:
        return {
            "status": "success",
            "message": "Template deleted from team gallery",
        }
    else:
        raise HTTPException(status_code=404, detail="Template not found in team gallery")
