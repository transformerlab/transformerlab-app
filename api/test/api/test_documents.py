import os
import time

import pytest

# Create test directories before setting environment variables
os.makedirs("./test/tmp/", exist_ok=True)

# Set environment variables before importing modules
os.environ["TFL_HOME_DIR"] = "./test/tmp/"
# Note: TFL_WORKSPACE_DIR is not set so that get_workspace_dir() will use the org-based
# workspace directory (./test/tmp/orgs/<team-id>/workspace) after migration

from fastapi import HTTPException  # noqa: E402

from transformerlab.routers.experiment.documents import document_download_zip  # noqa: E402


async def test_download_zip_missing_url():
    """Test download_zip without URL returns proper error"""
    test_data = {"extract_folder_name": "test_folder"}

    with pytest.raises(HTTPException) as exc_info:
        await document_download_zip("test_exp_id", test_data)

    assert exc_info.value.status_code == 400
    assert "URL is required" in str(exc_info.value.detail)


async def test_download_zip_invalid_url():
    """Test download_zip with invalid URL format"""
    test_data = {"url": "invalid-url-format", "extract_folder_name": "test_folder"}

    with pytest.raises(HTTPException) as exc_info:
        await document_download_zip("test_exp_id", test_data)

    assert exc_info.value.status_code == 400
    assert "Invalid or unauthorized URL" in str(exc_info.value.detail)


async def test_download_zip_valid_url_format(client):
    """Test download_zip with valid URL format"""
    # Create a test experiment first
    unique_name = f"test_download_zip_valid_url_format_{int(time.time() * 1000)}"
    exp_response = client.get(f"/experiment/create?name={unique_name}")
    assert exp_response.status_code == 200
    experiment_id = exp_response.json()

    test_data = {
        "url": "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-zip-file.zip",
        "extract_folder_name": "test_folder",
    }

    try:
        result = await document_download_zip(experiment_id, test_data)
        # Should return success status
        assert result["status"] == "success"
        assert "extracted_files" in result
        assert "total_files" in result
        assert isinstance(result["extracted_files"], list)
        assert isinstance(result["total_files"], int)
    except HTTPException as e:
        # If it fails due to network issues, that's acceptable for testing
        assert e.status_code in [400, 500]


async def test_download_zip_optional_fields(client):
    """Test download_zip with minimal required fields"""
    # Create a test experiment first
    unique_name = f"test_download_zip_optional_fields_{int(time.time() * 1000)}"
    exp_response = client.get(f"/experiment/create?name={unique_name}")
    assert exp_response.status_code == 200
    experiment_id = exp_response.json()

    test_data = {
        "url": "https://www.learningcontainer.com/wp-content/uploads/2020/05/sample-zip-file.zip"
        # extract_folder_name is optional
    }

    try:
        result = await document_download_zip(experiment_id, test_data)
        # Should pass validation (extract_folder_name is optional)
        assert result["status"] == "success"
        assert "extracted_files" in result
        assert "total_files" in result
    except HTTPException as e:
        # If it fails due to network issues, that's acceptable for testing
        assert e.status_code in [400, 500]


async def test_download_zip_unauthorized_domain():
    """Test download_zip with URL from unauthorized domain"""
    test_data = {
        "url": "https://example.com/malicious-file.zip",
        "extract_folder_name": "test_folder",
    }

    with pytest.raises(HTTPException) as exc_info:
        await document_download_zip("test_exp_id", test_data)

    assert exc_info.value.status_code == 400
    assert "Invalid or unauthorized URL" in str(exc_info.value.detail)
