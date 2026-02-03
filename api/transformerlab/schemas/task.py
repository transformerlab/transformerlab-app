"""Pydantic schemas for task management."""

from pydantic import BaseModel
from typing import Optional


class ExportTaskToTeamGalleryRequest(BaseModel):
    task_id: str


class ImportTaskFromGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class ImportTaskFromTeamGalleryRequest(BaseModel):
    gallery_id: str  # Index or identifier in the gallery array
    experiment_id: str


class AddTeamTaskToGalleryRequest(BaseModel):
    title: str
    description: Optional[str] = None
    setup: Optional[str] = None
    command: str
    cpus: Optional[str] = None
    memory: Optional[str] = None
    accelerators: Optional[str] = None
    github_repo_url: Optional[str] = None
    github_repo_dir: Optional[str] = None
    github_branch: Optional[str] = None


class DeleteTeamTaskFromGalleryRequest(BaseModel):
    task_id: str
