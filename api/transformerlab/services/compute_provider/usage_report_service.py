"""Aggregate REMOTE job usage for team owners."""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List

from sqlalchemy.ext.asyncio import AsyncSession
from transformerlab.services import job_service
from transformerlab.services.provider_service import list_team_providers

logger = logging.getLogger(__name__)


async def build_usage_report(session: AsyncSession, team_id: str) -> Dict[str, Any]:
    from lab import Experiment

    existing_provider_ids = set()
    existing_provider_names = set()
    try:
        current_providers = await list_team_providers(session, team_id)
        if current_providers:
            existing_provider_ids = {str(provider.id) for provider in current_providers if provider.id}
            existing_provider_names = {provider.name for provider in current_providers if provider.name}
    except Exception as e:
        logger.exception("Error getting current providers for team %s: %s", team_id, e)

    try:
        experiments_data = await Experiment.get_all()
        experiments = [exp.get("id") for exp in experiments_data if exp.get("id")]
    except Exception as e:
        logger.exception("Error getting experiments: %s", e)
        experiments = []

    remote_jobs: List[Dict[str, Any]] = []

    for experiment_id in experiments:
        try:
            jobs = await job_service.jobs_get_all(experiment_id=experiment_id, type="REMOTE")
            for job in jobs:
                job_data = job.get("job_data", {}) or {}

                if isinstance(job_data, str):
                    try:
                        job_data = json.loads(job_data)
                    except (json.JSONDecodeError, TypeError):
                        job_data = {}

                if job_data.get("provider_id") or job_data.get("provider_name"):
                    duration_seconds = None
                    start_time = job_data.get("start_time")
                    end_time = job_data.get("end_time")

                    if start_time and end_time:
                        try:
                            if isinstance(start_time, str):
                                start = datetime.fromisoformat(start_time.replace("Z", "+00:00"))
                            else:
                                start = start_time
                            if isinstance(end_time, str):
                                end = datetime.fromisoformat(end_time.replace("Z", "+00:00"))
                            else:
                                end = end_time
                            duration_seconds = (end - start).total_seconds()
                        except Exception as e:
                            logger.debug("Error calculating duration for job %s: %s", job.get("id"), e)

                    if not (start_time and end_time and duration_seconds is not None and duration_seconds > 0):
                        continue

                    user_info = job_data.get("user_info", {}) or {}
                    user_email = user_info.get("email") or "Unknown"
                    user_name = user_info.get("name") or user_email

                    provider_id = job_data.get("provider_id")
                    provider_name = job_data.get("provider_name") or "Unknown"
                    provider_exists = False

                    provider_id_str = str(provider_id) if provider_id else None
                    if existing_provider_ids or existing_provider_names:
                        if provider_id_str and provider_id_str in existing_provider_ids:
                            provider_exists = True
                        elif provider_name and provider_name in existing_provider_names:
                            provider_exists = True

                    if not provider_exists and (existing_provider_ids or existing_provider_names):
                        if provider_id_str or (provider_name and provider_name != "Unknown"):
                            if provider_name and not provider_name.endswith("(Deleted)"):
                                provider_name = f"{provider_name} (Deleted)"

                    remote_jobs.append(
                        {
                            "job_id": job.get("id"),
                            "experiment_id": job.get("experiment_id"),
                            "status": job.get("status"),
                            "provider_id": provider_id,
                            "provider_name": provider_name,
                            "provider_type": job_data.get("provider_type"),
                            "provider_exists": provider_exists,
                            "user_email": user_email,
                            "user_name": user_name,
                            "start_time": start_time,
                            "end_time": end_time,
                            "duration_seconds": duration_seconds,
                            "resources": {
                                "cpus": job_data.get("cpus"),
                                "memory": job_data.get("memory"),
                                "disk_space": job_data.get("disk_space"),
                                "accelerators": job_data.get("accelerators"),
                                "num_nodes": job_data.get("num_nodes", 1),
                            },
                            "cluster_name": job_data.get("cluster_name"),
                            "task_name": job_data.get("task_name"),
                        }
                    )
        except Exception as e:
            logger.exception("Error processing jobs for experiment %s: %s", experiment_id, e)
            continue

    usage_by_user: Dict[str, Dict[str, Any]] = {}
    for job in remote_jobs:
        user_email = job["user_email"]
        if user_email not in usage_by_user:
            usage_by_user[user_email] = {
                "user_email": user_email,
                "user_name": job["user_name"],
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }

        usage_by_user[user_email]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_user[user_email]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_user[user_email]["jobs"].append(job)

    usage_by_provider: Dict[str, Dict[str, Any]] = {}
    for job in remote_jobs:
        provider_name = job["provider_name"]
        provider_key = job.get("provider_id") or provider_name

        if provider_key not in usage_by_provider:
            usage_by_provider[provider_key] = {
                "provider_name": provider_name,
                "provider_type": job["provider_type"],
                "provider_exists": job.get("provider_exists", True),
                "total_jobs": 0,
                "total_duration_seconds": 0,
                "jobs": [],
            }

        usage_by_provider[provider_key]["total_jobs"] += 1
        if job["duration_seconds"]:
            usage_by_provider[provider_key]["total_duration_seconds"] += job["duration_seconds"]
        usage_by_provider[provider_key]["jobs"].append(job)

    sorted_users = sorted(usage_by_user.values(), key=lambda x: x["total_duration_seconds"], reverse=True)
    sorted_providers = sorted(usage_by_provider.values(), key=lambda x: x["total_duration_seconds"], reverse=True)

    return {
        "summary": {
            "total_jobs": len(remote_jobs),
            "total_users": len(usage_by_user),
            "total_providers": len(usage_by_provider),
        },
        "by_user": sorted_users,
        "by_provider": sorted_providers,
        "all_jobs": remote_jobs,
    }
