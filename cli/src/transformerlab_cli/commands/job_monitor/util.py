import logging

import httpx

from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment

logger = logging.getLogger(__name__)


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    exp = get_current_experiment()
    try:
        response = api.get(f"/experiment/{exp}/jobs/list?type=REMOTE&status=", timeout=120.0)
        if response.status_code == 200:
            return response.json()
        else:
            logger.debug("fetch_jobs got status %s", response.status_code)
    except httpx.HTTPError as e:
        logger.debug("fetch_jobs exception: %s", e)
    return []
