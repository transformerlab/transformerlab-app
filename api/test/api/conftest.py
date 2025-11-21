import pytest
from fastapi.testclient import TestClient
import os

# Create test directories before setting environment variables
os.makedirs("test/tmp/workspace", exist_ok=True)

os.environ["TFL_HOME_DIR"] = "test/tmp/"
os.environ["TFL_WORKSPACE_DIR"] = "test/tmp/workspace"
os.environ["TFL_MULTITENANT"] = "false"
os.environ["TRANSFORMERLAB_JWT_SECRET"] = "test-jwt-secret-for-testing-only"
os.environ["TRANSFORMERLAB_REFRESH_SECRET"] = "test-refresh-secret-for-testing-only"
os.environ["EMAIL_METHOD"] = "dev"  # Use dev mode for tests (no actual email sending)

from api import app  # noqa: E402


class AuthenticatedTestClient(TestClient):
    """TestClient that automatically adds admin authentication headers to all requests"""
    
    def __init__(self, app, *args, **kwargs):
        super().__init__(app, *args, **kwargs)
        self._token = None
    
    def _get_token(self):
        """Get or refresh admin token"""
        if self._token is None:
            login_response = super().post(
                "/auth/jwt/login",
                data={"username": "admin@localhost", "password": "admin123"}
            )
            if login_response.status_code != 200:
                raise RuntimeError(f"Failed to get admin token: {login_response.text}")
            self._token = login_response.json()["access_token"]
        return self._token
    
    def request(self, method, url, **kwargs):
        """Override request to add auth headers"""
        # Don't add auth headers to auth endpoints
        if "/auth/" not in url:
            if "headers" not in kwargs:
                kwargs["headers"] = {}
            kwargs["headers"]["Authorization"] = f"Bearer {self._get_token()}"
        return super().request(method, url, **kwargs)


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_database():
    """Clean up test database before and after test session"""
    # Clean up before tests
    db_path = "test/tmp/llmlab.sqlite3"
    if os.path.exists(db_path):
        os.remove(db_path)
    
    yield
    
    # Clean up after tests
    if os.path.exists(db_path):
        os.remove(db_path)


@pytest.fixture(scope="session")
def client():
    with AuthenticatedTestClient(app) as c:
        yield c
