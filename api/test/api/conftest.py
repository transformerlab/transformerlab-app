import pytest
from fastapi.testclient import TestClient
import os
import asyncio

# Create test directories before setting environment variables
os.makedirs("test/tmp/workspace", exist_ok=True)

os.environ["TFL_HOME_DIR"] = "test/tmp/"
os.environ["TFL_WORKSPACE_DIR"] = "test/tmp/workspace"
os.environ["TFL_MULTITENANT"] = "false"
os.environ["TRANSFORMERLAB_JWT_SECRET"] = "test-jwt-secret-for-testing-only"
os.environ["TRANSFORMERLAB_REFRESH_SECRET"] = "test-refresh-secret-for-testing-only"
os.environ["EMAIL_METHOD"] = "dev"  # Use dev mode for tests (no actual email sending)

from api import app  # noqa: E402
from transformerlab.shared.models.user_model import create_db_and_tables, User, AsyncSessionLocal  # noqa: E402
from transformerlab.services.experiment_init import seed_default_admin_user  # noqa: E402
import transformerlab.db.session as db  # noqa: E402
from sqlalchemy import select  # noqa: E402


class AuthenticatedTestClient(TestClient):
    """TestClient that automatically adds admin authentication headers to all requests"""
    
    def __init__(self, app, *args, **kwargs):
        super().__init__(app, *args, **kwargs)
        self._token = None
        self._team_id = None
        
        # Initialize database and admin user BEFORE making any requests
        asyncio.run(self._init_db_and_admin())
        
        # Get token for authenticated requests
        self._get_token()
    
    async def _init_db_and_admin(self):
        """Initialize database, create admin user, and get team ID"""
        await db.init()
        await create_db_and_tables()
        await seed_default_admin_user()
        
        # Get the admin user's team ID
        async with AsyncSessionLocal() as session:
            stmt = select(User).where(User.email == "admin@example.com")
            result = await session.execute(stmt)
            admin_user = result.scalar_one_or_none()
            
            if admin_user:
                # Get the user's first team
                from transformerlab.shared.models.models import UserTeam
                stmt = select(UserTeam).where(UserTeam.user_id == str(admin_user.id))
                result = await session.execute(stmt)
                user_team = result.scalar_one_or_none()
                
                if user_team:
                    self._team_id = user_team.team_id
    
    def _get_token(self):
        """Get or refresh admin token"""
        if self._token is None:
            login_response = super().post(
                "/auth/jwt/login",
                data={"username": "admin@example.com", "password": "admin123"}
            )
            if login_response.status_code != 200:
                raise RuntimeError(f"Failed to get admin token: {login_response.text}")
            self._token = login_response.json()["access_token"]
        return self._token
    
    def request(self, method, url, **kwargs):
        """Override request to add auth headers"""
        # Don't add auth headers to auth endpoints
        if "/auth/" not in url:
            # Ensure headers dict exists
            if "headers" not in kwargs or kwargs["headers"] is None:
                kwargs["headers"] = {}
            kwargs["headers"]["Authorization"] = f"Bearer {self._get_token()}"
            # Add team header for multi-tenant support
            if self._team_id:
                kwargs["headers"]["X-Team-Id"] = self._team_id
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
