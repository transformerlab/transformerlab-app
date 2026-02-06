from transformerlab_cli.util import api
from transformerlab_cli.util.config import get_current_experiment


def fetch_jobs() -> list[dict]:
    """Fetch all jobs from the API."""
    exp = get_current_experiment()
    try:
        response = api.get(f"/experiment/{exp}/jobs/list?type=REMOTE&status=", timeout=120.0)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"[DEBUG] fetch_jobs got status {response.status_code}")
    except Exception as e:
        print(f"[DEBUG] fetch_jobs exception: {e}")
    return []
