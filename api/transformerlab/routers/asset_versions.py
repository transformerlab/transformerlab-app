"""
asset_versions.py

API router for managing versioned groups of models and datasets.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from transformerlab.services import asset_version_service


router = APIRouter(prefix="/asset_versions", tags=["asset_versions"])


# ─── Request / Response schemas ───────────────────────────────────────────────


class CreateVersionRequest(BaseModel):
    asset_type: str  # 'model' or 'dataset'
    group_name: str
    asset_id: str
    job_id: Optional[str] = None
    description: Optional[str] = None
    title: Optional[str] = None
    long_description: Optional[str] = None
    cover_image: Optional[str] = None
    evals: Optional[dict] = None
    extra_metadata: Optional[dict] = None
    tag: Optional[str] = "latest"


class SetTagRequest(BaseModel):
    tag: str  # 'latest', 'production', 'draft'


class UpdateVersionRequest(BaseModel):
    description: Optional[str] = None
    title: Optional[str] = None
    long_description: Optional[str] = None
    cover_image: Optional[str] = None
    evals: Optional[dict] = None
    extra_metadata: Optional[dict] = None
    tag: Optional[str] = None


# ─── Group endpoints ─────────────────────────────────────────────────────────


@router.get("/groups", summary="List all version groups for a given asset type.")
async def list_groups(asset_type: str = Query(..., description="'model' or 'dataset'")):
    try:
        return await asset_version_service.list_groups(asset_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete(
    "/groups/{asset_type}/{group_name}",
    summary="Delete all versions in a group.",
)
async def delete_group(asset_type: str, group_name: str):
    try:
        count = await asset_version_service.delete_group(asset_type, group_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "success", "deleted_count": count}


# ─── Version CRUD ─────────────────────────────────────────────────────────────


@router.post("/versions", summary="Create a new version in a group.")
async def create_version(body: CreateVersionRequest):
    try:
        result = await asset_version_service.create_version(
            asset_type=body.asset_type,
            group_name=body.group_name,
            asset_id=body.asset_id,
            job_id=body.job_id,
            description=body.description,
            title=body.title,
            long_description=body.long_description,
            cover_image=body.cover_image,
            evals=body.evals,
            extra_metadata=body.extra_metadata,
            tag=body.tag,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.get(
    "/versions/{asset_type}/{group_name}",
    summary="List all versions in a group.",
)
async def list_versions(asset_type: str, group_name: str):
    try:
        return await asset_version_service.list_versions(asset_type, group_name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get(
    "/versions/{asset_type}/{group_name}/{version}",
    summary="Get a specific version by number.",
)
async def get_version(asset_type: str, group_name: str, version: int):
    try:
        result = await asset_version_service.get_version(asset_type, group_name, version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return result


@router.delete(
    "/versions/{asset_type}/{group_name}/{version}",
    summary="Delete a specific version.",
)
async def delete_version(asset_type: str, group_name: str, version: int):
    try:
        deleted = await asset_version_service.delete_version(asset_type, group_name, version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Version not found")
    return {"status": "success"}


# ─── Version update ──────────────────────────────────────────────────────────


@router.patch(
    "/versions/{asset_type}/{group_name}/{version}",
    summary="Update metadata or tag on a specific version.",
)
async def update_version(
    asset_type: str, group_name: str, version: int, body: UpdateVersionRequest
):
    # Build kwargs only for fields the caller actually sent (present in the JSON body).
    # This lets the service layer distinguish "not provided" from "set to null".
    raw = body.model_dump(exclude_unset=True)

    # Map body fields to service kwargs using the sentinel pattern
    kwargs = {}
    for field in (
        "description",
        "title",
        "long_description",
        "cover_image",
        "evals",
        "extra_metadata",
        "tag",
    ):
        if field in raw:
            kwargs[field] = raw[field]

    try:
        result = await asset_version_service.update_version(
            asset_type, group_name, version, **kwargs
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return result


# ─── Tag management ──────────────────────────────────────────────────────────


@router.put(
    "/versions/{asset_type}/{group_name}/{version}/tag",
    summary="Set a tag on a specific version. Moves the tag from any other version in the group.",
)
async def set_tag(asset_type: str, group_name: str, version: int, body: SetTagRequest):
    try:
        result = await asset_version_service.set_tag(asset_type, group_name, version, body.tag)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return result


@router.delete(
    "/versions/{asset_type}/{group_name}/{version}/tag",
    summary="Clear the tag from a specific version.",
)
async def clear_tag(asset_type: str, group_name: str, version: int):
    try:
        result = await asset_version_service.clear_tag(asset_type, group_name, version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="Version not found")
    return result


# ─── Resolution ──────────────────────────────────────────────────────────────


@router.get(
    "/resolve/{asset_type}/{group_name}",
    summary="Resolve a group to a specific version. Defaults to 'latest' tag.",
)
async def resolve(
    asset_type: str,
    group_name: str,
    tag: Optional[str] = Query(None, description="Tag to resolve: 'latest', 'production', 'draft'"),
    version: Optional[int] = Query(None, description="Exact version number to resolve"),
):
    try:
        result = await asset_version_service.resolve(asset_type, group_name, tag=tag, version=version)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if result is None:
        raise HTTPException(status_code=404, detail="No matching version found")
    return result


# ─── Bulk lookups (used by list views) ────────────────────────────────────────


@router.get(
    "/map/{asset_type}",
    summary="Get a map of asset_id -> group memberships for annotating list views.",
)
async def get_asset_group_map(asset_type: str):
    try:
        return await asset_version_service.get_all_asset_group_map(asset_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
