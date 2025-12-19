import pytest
from fastapi.testclient import TestClient
import os
import asyncio

# Create test directories before setting environment variables
os.makedirs("test/tmp/", exist_ok=True)
os.makedirs("test/tmp/webapp", exist_ok=True)  # Create webapp directory for static files

os.environ["TFL_HOME_DIR"] = "test/tmp/"
# Note: TFL_WORKSPACE_DIR is not set so that get_workspace_dir() will use the org-based
# workspace directory (test/tmp/orgs/<team-id>/workspace) after migration

# Create dummy controller.log file for tests (tests don't actually use FastChat controller)
# This prevents FileNotFoundError when spawn_fastchat_controller_subprocess() runs at startup
# The file will be created in the default workspace location before org context is set
controller_log_dir = os.path.join("test", "tmp", "workspace", "logs")
os.makedirs(controller_log_dir, exist_ok=True)
controller_log_path = os.path.join(controller_log_dir, "controller.log")
# Create the file (or truncate if it exists)
with open(controller_log_path, "w") as f:
    f.write("")  # Empty dummy file
os.environ["TRANSFORMERLAB_JWT_SECRET"] = "test-jwt-secret-for-testing-only"
os.environ["TRANSFORMERLAB_REFRESH_SECRET"] = "test-refresh-secret-for-testing-only"
os.environ["EMAIL_METHOD"] = "dev"  # Use dev mode for tests (no actual email sending)

# Use in-memory database for tests
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"

from api import app  # noqa: E402


class AuthenticatedTestClient(TestClient):
    """TestClient that automatically adds admin authentication headers to all requests"""

    def __init__(self, app, *args, **kwargs):
        super().__init__(app, *args, **kwargs)
        self._token = None
        self._team_id = None
        self._get_token()

    def _get_token(self):
        """Get or refresh admin token and team"""
        if self._token is None:
            login_response = super().post(
                "/auth/jwt/login", data={"username": "admin@example.com", "password": "admin123"}
            )
            if login_response.status_code != 200:
                raise RuntimeError(f"Failed to get admin token: {login_response.text}")
            self._token = login_response.json()["access_token"]

            # Get user's teams
            teams_response = super().get("/users/me/teams", headers={"Authorization": f"Bearer {self._token}"})
            if teams_response.status_code == 200:
                teams = teams_response.json()["teams"]
                if teams:
                    self._team_id = teams[0]["id"]  # Use the first team
        return self._token

    def request(self, method, url, **kwargs):
        """Override request to add auth headers"""
        # Don't add auth headers to auth endpoints
        if "/auth/" not in url:
            # Ensure headers dict exists
            if "headers" not in kwargs or kwargs["headers"] is None:
                kwargs["headers"] = {}
            # Only add Authorization if not already present
            if "Authorization" not in kwargs["headers"]:
                kwargs["headers"]["Authorization"] = f"Bearer {self._get_token()}"
            # Only add team header if not already present
            if self._team_id and "X-Team-Id" not in kwargs["headers"]:
                kwargs["headers"]["X-Team-Id"] = self._team_id
        return super().request(method, url, **kwargs)


@pytest.fixture(scope="session")
def client():
    # Initialize database tables for tests
    from transformerlab.shared.models.user_model import create_db_and_tables  # noqa: E402
    from transformerlab.services.experiment_init import seed_default_admin_user  # noqa: E402

    asyncio.run(create_db_and_tables())
    asyncio.run(seed_default_admin_user())
    controller_log_dir = os.path.join("test", "tmp", "workspace", "logs")
    os.makedirs(controller_log_dir, exist_ok=True)
    controller_log_path = os.path.join(controller_log_dir, "controller.log")
    # Create the file (or truncate if it exists)
    with open(controller_log_path, "w") as f:
        f.write("")  # Empty dummy file Empty dummy file

    with AuthenticatedTestClient(app) as c:
        yield c
