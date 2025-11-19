import pytest
from fastapi.testclient import TestClient
import os
import shutil

# Create test directories before setting environment variables
os.makedirs("test/tmp/workspace", exist_ok=True)

os.environ["TFL_HOME_DIR"] = "test/tmp/"
os.environ["TFL_WORKSPACE_DIR"] = "test/tmp/workspace"
os.environ["TFL_MULTITENANT"] = "false"
os.environ["TRANSFORMERLAB_JWT_SECRET"] = "test-jwt-secret-for-testing-only"
os.environ["TRANSFORMERLAB_REFRESH_SECRET"] = "test-refresh-secret-for-testing-only"
os.environ["EMAIL_METHOD"] = "dev"  # Use dev mode for tests (no actual email sending)

from api import app  # noqa: E402


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
    with TestClient(app) as c:
        yield c
