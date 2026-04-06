"""Compute provider router package entry point.

Sub-router layout:
  /compute_provider/providers/...                    → providers.py  (CRUD + health + detect-accelerators)
  /compute_provider/providers/{provider_id}/setup    → setup.py      (setup lifecycle)
  /compute_provider/providers/{provider_id}/clusters → clusters.py   (cluster + cluster-job management)
  /compute_provider/providers/{provider_id}/launch   → launch.py     (task launch + file upload)
  /compute_provider/jobs/...                         → jobs.py       (job status, quota, checkpoint resume)
  /compute_provider/sweep/...                        → sweep.py      (sweep status + results)
  /compute_provider/settings/...                     → user_settings.py (per-user settings + SSH keys)
  /compute_provider/usage/...                        → usage.py      (owner-only usage report)
"""

from fastapi import APIRouter
from transformerlab.routers.compute_provider import (
    providers,
    setup,
    clusters,
    launch,
    jobs,
    sweep,
    user_settings,
    usage,
)

router = APIRouter(prefix="/compute_provider", tags=["compute_provider"])

# Provider-scoped sub-routers: provider_id injected via include prefix
router.include_router(providers.router)
router.include_router(setup.router, prefix="/providers/{provider_id}")
router.include_router(clusters.router, prefix="/providers/{provider_id}")
router.include_router(launch.router, prefix="/providers/{provider_id}")

# Flat sub-routers: own their full path namespace
router.include_router(jobs.router)
router.include_router(sweep.router)
router.include_router(user_settings.router)
router.include_router(usage.router)
