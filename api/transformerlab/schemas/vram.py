"""Pydantic schemas for VRAM estimation."""

from typing import Any, Optional

from pydantic import BaseModel


class VramEstimateData(BaseModel):
    model_id: str
    dtype: str
    batch: int
    seq_len: int
    no_kv: bool
    total_gb: Optional[float] = None
    weights_gb: Optional[float] = None
    kv_cache_gb: Optional[float] = None
    activations_gb: Optional[float] = None
    raw: Optional[Any] = None


class VramEstimateResponse(BaseModel):
    status: str
    data: Optional[VramEstimateData] = None
    message: Optional[str] = None
