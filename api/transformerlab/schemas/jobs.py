"""Pydantic schemas for job management."""

from typing import List, Optional

from pydantic import BaseModel


class BulkDeleteJobsRequest(BaseModel):
    job_ids: List[str]


class BulkDeleteJobResult(BaseModel):
    job_id: str
    deleted: bool
    error: Optional[str] = None


class BulkDeleteJobsResponse(BaseModel):
    succeeded: List[str]
    failed: List[BulkDeleteJobResult]
