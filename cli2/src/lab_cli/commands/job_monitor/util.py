from lab_cli.util import api
from lab_cli.util.config import get_current_experiment


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    exp = get_current_experiment()
    try:
        response = api.get(f"/experiment/{exp}/jobs/list?type=REMOTE")
        if response.status_code == 200:
            return response.json()
    except Exception:
        pass
    return []
