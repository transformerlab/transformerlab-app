"""Cluster lifecycle and job operations against a team compute provider."""

import asyncio
import logging
from typing import Any, Dict, List, Optional, Union

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.compute_providers.models import ClusterStatus, JobConfig, JobInfo, JobState, ResourceInfo
from transformerlab.services.provider_service import get_team_provider, get_provider_instance
from transformerlab.shared.models.models import ProviderType
from lab.dirs import get_local_provider_job_dir, resolve_local_provider_job_dir

logger = logging.getLogger(__name__)


async def list_clusters_detailed(session: AsyncSession, team_id: str, user_id_str: str, provider_id: str) -> Any:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        return await asyncio.to_thread(provider_instance.get_clusters_detailed)
    except Exception as e:
        logger.exception("Failed to list clusters: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list clusters") from e


async def get_cluster_status(
    session: AsyncSession, team_id: str, user_id_str: str, provider_id: str, cluster_name: str
) -> ClusterStatus:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        return await asyncio.to_thread(provider_instance.get_cluster_status, cluster_name)
    except Exception as e:
        logger.exception("Failed to get cluster status: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get cluster status") from e


async def get_cluster_resources(
    session: AsyncSession, team_id: str, user_id_str: str, provider_id: str, cluster_name: str
) -> ResourceInfo:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        return await asyncio.to_thread(provider_instance.get_cluster_resources, cluster_name)
    except Exception as e:
        logger.exception("Failed to get cluster resources: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get cluster resources") from e


async def stop_cluster(
    session: AsyncSession, team_id: str, user_id_str: str, provider_id: str, cluster_name: str
) -> Any:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_id_segment = None
            if "-job-" in cluster_name:
                job_id_segment = cluster_name.rsplit("-job-", 1)[-1] or None
            if job_id_segment is not None:
                job_dir = await asyncio.to_thread(resolve_local_provider_job_dir, job_id_segment, org_id=team_id)
                if job_dir:
                    provider_instance.extra_config["workspace_dir"] = job_dir

        return await asyncio.to_thread(provider_instance.stop_cluster, cluster_name)
    except Exception as e:
        logger.exception("Failed to stop cluster: %s", e)
        raise HTTPException(status_code=500, detail="Failed to stop cluster") from e


async def submit_job_to_cluster(
    session: AsyncSession,
    team_id: str,
    user_id_str: str,
    provider_id: str,
    cluster_name: str,
    job_config: JobConfig,
) -> Dict[str, Any]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        result = await asyncio.to_thread(provider_instance.submit_job, cluster_name, job_config)
        job_id = result.get("job_id") or result.get("request_id")

        return {
            "status": "success",
            "message": "Job submitted successfully",
            "job_id": job_id,
            "cluster_name": cluster_name,
            "result": result,
        }
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to submit job: %s", e)
        raise HTTPException(status_code=500, detail="Failed to submit job") from e


async def list_jobs_for_cluster(
    session: AsyncSession,
    team_id: str,
    user_id_str: str,
    provider_id: str,
    cluster_name: str,
    state: Optional[JobState],
) -> List[JobInfo]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)
        jobs = await asyncio.to_thread(provider_instance.list_jobs, cluster_name)

        if state:
            jobs = [job for job in jobs if job.state == state]

        return jobs
    except NotImplementedError:
        return []
    except Exception as e:
        logger.exception("Failed to list jobs: %s", e)
        raise HTTPException(status_code=500, detail="Failed to list jobs") from e


async def get_cluster_job_info(
    session: AsyncSession,
    team_id: str,
    user_id_str: str,
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
) -> JobInfo:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        try:
            jobs = await asyncio.to_thread(provider_instance.list_jobs, cluster_name)
        except NotImplementedError:
            raise HTTPException(
                status_code=400,
                detail="This provider does not support job listing. Runpod uses pod-based execution, not a job queue.",
            )

        job_id_str = str(job_id)
        job_id_int = int(job_id) if isinstance(job_id, str) and job_id.isdigit() else job_id

        job = None
        for j in jobs:
            if str(j.job_id) == job_id_str or j.job_id == job_id_int:
                job = j
                break

        if not job:
            raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found")

        return job
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get job info: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get job info") from e


async def get_cluster_job_logs(
    session: AsyncSession,
    team_id: str,
    user_id_str: str,
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
    tail_lines: Optional[int],
    follow: bool,
) -> Union[StreamingResponse, str]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        try:
            logs = await asyncio.to_thread(
                provider_instance.get_job_logs,
                cluster_name,
                job_id,
                tail_lines=tail_lines,
                follow=follow,
            )
        except NotImplementedError:
            logs = "Logs not available for this provider type."

        if follow:
            if hasattr(logs, "__iter__") and not isinstance(logs, (str, bytes)):

                async def generate():
                    try:
                        for line in logs:
                            if isinstance(line, bytes):
                                text = line.decode("utf-8", errors="replace")
                            else:
                                text = str(line) + "\n"

                            if text.startswith("Error reading logs:"):
                                yield "Failed to retrieve logs.\n"
                                break
                            elif text and not text.startswith("Error reading logs:"):
                                yield text
                    except Exception as e:
                        logger.exception("Error streaming logs: %s", e)
                        yield "\n[Error streaming logs]\n"

                return StreamingResponse(
                    generate(),
                    media_type="text/plain",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
            else:
                log_str = str(logs) if logs else ""

                async def generate():
                    for line in log_str.split("\n"):
                        if line.startswith("Error reading logs:"):
                            yield "Failed to retrieve logs.\n"
                            break
                        elif line:
                            yield line + "\n"

                return StreamingResponse(
                    generate(),
                    media_type="text/plain",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                )
        else:
            log_content = str(logs) if logs else ""
            if log_content.startswith("Error reading logs:"):
                return "Failed to retrieve logs."

            return log_content
    except Exception as e:
        logger.exception("Failed to get job logs: %s", e)
        raise HTTPException(status_code=500, detail="Failed to get job logs") from e


async def cancel_cluster_job(
    session: AsyncSession,
    team_id: str,
    user_id_str: str,
    provider_id: str,
    cluster_name: str,
    job_id: Union[str, int],
) -> Dict[str, Any]:
    provider = await get_team_provider(session, team_id, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")

    try:
        provider_instance = await get_provider_instance(provider, user_id=user_id_str, team_id=team_id)

        if provider.type == ProviderType.LOCAL.value and hasattr(provider_instance, "extra_config"):
            job_dir = await asyncio.to_thread(get_local_provider_job_dir, job_id, org_id=team_id)
            provider_instance.extra_config["workspace_dir"] = job_dir

        result = await asyncio.to_thread(provider_instance.cancel_job, cluster_name, job_id)

        return {
            "status": "success",
            "message": "Job cancelled successfully",
            "job_id": job_id,
            "cluster_name": cluster_name,
            "result": result,
        }
    except NotImplementedError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception("Failed to cancel job: %s", e)
        raise HTTPException(status_code=500, detail="Failed to cancel job") from e
