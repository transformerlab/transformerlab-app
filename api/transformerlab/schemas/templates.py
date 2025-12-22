"""Pydantic schemas for template management."""

from pydantic import BaseModel
from typing import Optional


class ExportTemplateToTeamGalleryRequest(BaseModel):
    template_id: str


class ImportTemplateFromGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class ImportTemplateFromTeamGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class AddTeamTemplateToGalleryRequest(BaseModel):
    title: str
    description: Optional[str] = None
    setup: Optional[str] = None
    command: str
    cpus: Optional[str] = None
    memory: Optional[str] = None
    accelerators: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None


class DeleteTeamTemplateFromGalleryRequest(BaseModel):
    template_id: str
