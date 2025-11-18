import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from io import BytesIO


# Use the client fixture from conftest.py - no need to create our own


@pytest.fixture
def gpu_orchestration_env_vars(monkeypatch):
    """Set up GPU orchestration environment variables for testing"""
    monkeypatch.setenv("GPU_ORCHESTRATION_SERVER", "http://test-orchestrator.example.com")
    monkeypatch.setenv("GPU_ORCHESTRATION_SERVER_PORT", "8080")
    yield
    # Cleanup - remove env vars after test
    monkeypatch.delenv("GPU_ORCHESTRATION_SERVER", raising=False)
    monkeypatch.delenv("GPU_ORCHESTRATION_SERVER_PORT", raising=False)


@pytest.fixture
def no_gpu_orchestration_env(monkeypatch):
    """Ensure GPU orchestration environment variables are not set"""
    monkeypatch.delenv("GPU_ORCHESTRATION_SERVER", raising=False)
    monkeypatch.delenv("GPU_ORCHESTRATION_SERVER_PORT", raising=False)


@pytest.fixture
def mock_experiment_id(client):
    """Create a test experiment and return its ID, cleaning up after the test"""
    import os
    import time
    import uuid
    from transformerlab.services import experiment_service

    # Use a unique name to avoid conflicts - add UUID for better uniqueness
    unique_name = f"test_exp_remote_{os.getpid()}_{int(time.time())}_{uuid.uuid4().hex[:8]}"

    # Check if experiment already exists and delete it if it does
    existing = experiment_service.experiment_get(unique_name)
    if existing:
        experiment_service.experiment_delete(unique_name)

    # Create the experiment
    exp_id = experiment_service.experiment_create(unique_name, {})

    yield exp_id

    # Cleanup: delete all jobs in the experiment, then delete the experiment
    try:
        from transformerlab.services import job_service

        job_service.job_delete_all(exp_id)
    except Exception:
        pass

    try:
        experiment_service.experiment_delete(exp_id)
    except Exception:
        # Ignore errors during cleanup
        pass


@pytest.fixture
def job_cleanup():
    """Fixture to track and cleanup jobs created during tests"""
    created_jobs = []  # List of (job_id, experiment_id) tuples

    yield created_jobs

    # Cleanup: delete all tracked jobs
    from transformerlab.services import job_service

    for job_id, experiment_id in created_jobs:
        try:
            job_service.job_delete(job_id, experiment_id)
        except Exception:
            # Ignore errors during cleanup
            pass


class TestValidateGPUOrchestratorEnvVars:
    """Test the validate_gpu_orchestrator_env_vars function"""

    def test_validate_env_vars_with_both_set(self, gpu_orchestration_env_vars):
        """Test validation when both env vars are set"""
        from transformerlab.routers.remote import validate_gpu_orchestrator_env_vars

        url, port = validate_gpu_orchestrator_env_vars()
        assert url == "http://test-orchestrator.example.com"
        assert port == "8080"

    def test_validate_env_vars_missing_url(self, monkeypatch):
        """Test validation when GPU_ORCHESTRATION_SERVER is missing"""
        monkeypatch.delenv("GPU_ORCHESTRATION_SERVER", raising=False)
        monkeypatch.setenv("GPU_ORCHESTRATION_SERVER_PORT", "8080")

        from transformerlab.routers.remote import validate_gpu_orchestrator_env_vars

        result = validate_gpu_orchestrator_env_vars()
        url, error_response = result
        assert url is None
        assert isinstance(error_response, dict)
        assert error_response["status"] == "error"
        assert "GPU_ORCHESTRATION_SERVER" in error_response["message"]

    def test_validate_env_vars_missing_port(self, monkeypatch):
        """Test validation when GPU_ORCHESTRATION_SERVER_PORT is missing"""
        monkeypatch.setenv("GPU_ORCHESTRATION_SERVER", "http://test-orchestrator.example.com")
        monkeypatch.delenv("GPU_ORCHESTRATION_SERVER_PORT", raising=False)

        from transformerlab.routers.remote import validate_gpu_orchestrator_env_vars

        result = validate_gpu_orchestrator_env_vars()
        url, error_response = result
        # When port is missing, the function returns None as the URL
        assert url is None
        assert isinstance(error_response, dict)
        assert error_response["status"] == "error"
        assert "GPU_ORCHESTRATION_SERVER_PORT" in error_response["message"]


class TestStopRemote:
    """Test the /remote/stop endpoint"""

    def test_stop_remote_missing_env_vars(self, client, no_gpu_orchestration_env):
        """Test stopping when GPU orchestration env vars are not set"""
        response = client.post(
            "/remote/stop",
            data={
                "job_id": "test-job-id",
                "cluster_name": "test-cluster",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "GPU_ORCHESTRATION_SERVER" in data["message"]


class TestUploadDirectory:
    """Test the /remote/upload endpoint"""

    @patch("transformerlab.routers.remote.httpx.AsyncClient")
    def test_upload_directory_success(self, mock_client_class, client, gpu_orchestration_env_vars):
        """Test uploading a directory successfully"""
        # Create test files using BytesIO for proper file-like objects
        files = [
            ("dir_files", ("test1.txt", BytesIO(b"content1"), "text/plain")),
            ("dir_files", ("test2.txt", BytesIO(b"content2"), "text/plain")),
        ]

        # Mock the async client and response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "uploaded",
            "upload_path": "/remote/path",
        }

        mock_httpx_client = AsyncMock()
        mock_httpx_client.post = AsyncMock(return_value=mock_response)
        mock_httpx_client.__aenter__.return_value = mock_httpx_client
        mock_httpx_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_httpx_client

        response = client.post(
            "/remote/upload",
            files=files,
            data={"dir_name": "test-dir"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "local_storage_path" in data

    def test_upload_directory_missing_env_vars(self, client, no_gpu_orchestration_env):
        """Test uploading when GPU orchestration env vars are not set"""
        files = [("dir_files", ("test.txt", BytesIO(b"content"), "text/plain"))]

        response = client.post(
            "/remote/upload",
            files=files,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "GPU_ORCHESTRATION_SERVER" in data["message"]


class TestCheckRemoteJobStatus:
    """Test the /remote/check-status endpoint"""

    @patch("transformerlab.routers.remote.httpx.AsyncClient")
    def test_check_status_no_launching_jobs(self, mock_client_class, client, gpu_orchestration_env_vars):
        """Test checking status when there are no LAUNCHING jobs"""
        response = client.get("/remote/check-status")
        assert response.status_code == 200
        data = response.json()
        assert "updated_jobs" in data
        assert data["updated_jobs"] == []


class TestGetOrchestratorLogs:
    """Test the /remote/logs/{request_id} endpoint"""

    @patch("transformerlab.routers.remote.httpx.AsyncClient")
    def test_get_logs_success(self, mock_client_class, client, gpu_orchestration_env_vars):
        """Test getting logs successfully"""
        request_id = "test-request-123"

        # Mock streaming response
        mock_stream_response = MagicMock()
        mock_stream_response.status_code = 200
        mock_stream_response.aiter_bytes = AsyncMock(return_value=iter([b"log line 1\n", b"log line 2\n"]))

        mock_httpx_client = AsyncMock()
        mock_httpx_client.stream = AsyncMock(return_value=mock_stream_response)
        mock_httpx_client.__aenter__.return_value = mock_httpx_client
        mock_httpx_client.__aexit__.return_value = None
        mock_client_class.return_value = mock_httpx_client

        response = client.get(f"/remote/logs/{request_id}")
        # Streaming responses return 200 with appropriate headers
        assert response.status_code == 200

    def test_get_logs_missing_env_vars(self, client, no_gpu_orchestration_env):
        """Test getting logs when GPU orchestration env vars are not set"""
        response = client.get("/remote/logs/test-request-123")
        # The endpoint should return an error response
        assert response.status_code in [200, 500]  # May return error as JSON or raise exception
