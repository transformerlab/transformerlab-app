from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class StartProfilerRunRequest(BaseModel):
    profiler_id: str = Field(description="Profiler identifier, e.g. nsys, ncu, rocprof")
    target_command: str = Field(description="Target command to run under profiler")
    run_name: Optional[str] = Field(default=None, description="Optional custom run name")
    working_directory: Optional[str] = Field(default=None, description="Optional working directory")
    extra_profiler_args: list[str] = Field(
        default_factory=list,
        description="Additional profiler args passed before the target command",
    )


class ProfilerLaunchConfig(BaseModel):
    enabled: bool = Field(default=True, description="Whether profiling should be enabled")
    profiler_id: str = Field(description="Profiler identifier, e.g. nsys, ncu, rocprof")
    run_name: Optional[str] = Field(default=None, description="Optional run name")
    extra_profiler_args: list[str] = Field(
        default_factory=list,
        description="Additional profiler args passed before the profiled command",
    )
