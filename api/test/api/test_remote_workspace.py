import asyncio
import io
import sys
from unittest.mock import Mock, patch

import pytest


@pytest.fixture(autouse=True)
def patch_sys_argv(monkeypatch):
    monkeypatch.setattr(
        sys, "argv", ["test", "--model_name", "dummy", "--job_id", "dummy", "--total_size_of_model_in_mb", "1"]
    )


def test_download_all_artifacts_endpoint():
    """
    Test the download_all_artifacts endpoint.
    Verifies that it correctly retrieves paths, creates a zip, and returns a streaming response.
    """
    mock_job_service = Mock()

    async def mock_get_all_artifact_paths(job_id, storage):
        return ["path/to/artifact1.txt", "path/to/artifact2.png"]

    mock_job_service.get_all_artifact_paths = mock_get_all_artifact_paths

    mock_zip_buffer = io.BytesIO(b"fake zip content")

    # Track calls to create_zip
    create_zip_calls = []

    async def mock_create_zip(file_paths, storage):
        create_zip_calls.append((file_paths, storage))
        return mock_zip_buffer

    with (
        patch("transformerlab.routers.experiment.jobs.job_service", mock_job_service),
        patch("transformerlab.routers.experiment.jobs.zip_utils.create_zip_from_storage", mock_create_zip),
        patch("transformerlab.routers.experiment.jobs.storage", Mock()),
    ):
        from transformerlab.routers.experiment.jobs import download_all_artifacts

        # Test 1: Successful download
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(download_all_artifacts("test_job_id"))
        loop.close()

        assert response.status_code == 200
        assert response.media_type == "application/zip"
        assert "Content-Disposition" in response.headers
        assert response.headers["Content-Disposition"].startswith("attachment; filename=")

        # Verify the async function was called
        assert len(create_zip_calls) == 1

        # Test 2: No artifacts found
        async def mock_get_all_artifact_paths_empty(job_id, storage):
            return []

        mock_job_service.get_all_artifact_paths = mock_get_all_artifact_paths_empty
        create_zip_calls.clear()  # Reset call tracking

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response_empty = loop.run_until_complete(download_all_artifacts("test_job_id_empty"))
        loop.close()

        assert response_empty.status_code == 404
        assert len(create_zip_calls) == 0  # Should not have been called


def test_os_stat_fails_on_s3_paths_demonstration():
    """Demonstrates that os.stat() cannot work with S3 paths"""
    import os

    s3_path = "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/black_cat_1.png"
    with pytest.raises(OSError):
        os.stat(s3_path)


def test_buggy_code_pattern_explanation():
    """Explains the exact buggy code pattern"""
    import os

    s3_artifact_path = "s3://workspace/jobs/30/artifacts/file.png"

    try:
        raise Exception("storage.ls failed")
    except Exception:
        pass

    try:
        stat = os.stat(s3_artifact_path)
        size = stat.st_size
        mtime = stat.st_mtime
    except (OSError, AttributeError):
        size = None
        mtime = None

    assert size is None, "Size should be None because os.stat failed"
    assert mtime is None, "Mtime should be None because os.stat failed"


def test_mocked_storage_behavior():
    """Verifies that mocked storage behavior works correctly"""
    mock_storage = Mock()
    s3_paths = ["s3://bucket/file1.png", "s3://bucket/file2.png"]
    mock_storage.ls.return_value = s3_paths
    mock_storage.exists.return_value = True
    mock_storage.isfile.return_value = True

    assert mock_storage.ls("s3://bucket") == s3_paths
    assert mock_storage.exists("s3://bucket")
    assert mock_storage.isfile("s3://bucket/file1.png")


def test_simplified_bug_with_minimal_mocks():
    """Simplified version of the bug test with minimal mocking"""
    s3_path = "s3://test-bucket/jobs/1/artifacts/test.png"
    with patch("transformerlab.routers.experiment.jobs.os.stat") as mock_stat:

        def stat_effect(path):
            if path.startswith("s3://"):
                raise OSError(f"Cannot stat: {path}")
            return Mock(st_size=100, st_mtime=1000000000.0)

        mock_stat.side_effect = stat_effect

        try:
            stat = mock_stat(s3_path)
            size = stat.st_size
        except OSError:
            size = None

        mock_stat.assert_called_once_with(s3_path)
        assert size is None


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
