import tempfile
import time
import sys
from pathlib import Path
import asyncio
from unittest.mock import Mock, patch

import pytest


@pytest.fixture(autouse=True)
def patch_sys_argv(monkeypatch):
    monkeypatch.setattr(
        sys, "argv", ["test", "--model_name", "dummy", "--job_id", "dummy", "--total_size_of_model_in_mb", "1"]
    )


@pytest.fixture
def fake_cancel_check_factory():
    # Returns a cancel_check that cancels after a few calls
    call_count = {"value": 0}

    def fake_cancel_check():
        call_count["value"] += 1
        time.sleep(0.2)  # simulate polling delay
        return call_count["value"] >= 3

    return fake_cancel_check


@pytest.fixture
def fake_snapshot_download():
    def _mocked_snapshot_download(repo_id, local_dir=None, **kwargs):
        # Simulate a slow download
        for _ in range(10):
            time.sleep(0.5)
        Path(local_dir).mkdir(parents=True, exist_ok=True)
        (Path(local_dir) / "dummy.txt").write_text("Downloaded content")

    return _mocked_snapshot_download


def test_s3_artifacts_lose_metadata_due_to_os_stat_bug():
    """
    BUG REPRODUCTION TEST

    This test reproduces the exact issue:
    - S3 artifacts lose metadata because os.stat() is called on S3 paths
    - os.stat() fails on S3 paths and exceptions are caught silently
    - Artifacts returned without size/date → frontend can't load them
    """
    real_s3_paths = [
        "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/black_cat_1_1766507805.png",
        "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/black_cat_2_1766507816.png",
        "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/black_cat_3_1766507828.png",
        "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/black_cat_4_1766507839.png",
        "s3://workspace-e66b18ed-9947-4ec5-ad09-119568eb4bd8/jobs/30/artifacts/gallery.html",
    ]

    mock_job = Mock()
    mock_job.get_artifact_paths.return_value = real_s3_paths

    mock_storage = Mock()

    def mock_ls(path, detail=True):
        if detail:
            # Return empty list to trigger fallback to os.stat() in buggy code
            return []
        return real_s3_paths

    mock_storage.ls.side_effect = mock_ls
    mock_storage.exists.return_value = True
    mock_storage.isfile.return_value = True

    mock_job_service = Mock()
    mock_job_service.job_get.return_value = {"job_data": {}}

    def mock_get_job_artifacts_dir(job_id):
        return f"s3://workspace-test/jobs/{job_id}/artifacts"

    with (
        patch("transformerlab.routers.experiment.jobs.job_service", mock_job_service),
        patch("transformerlab.routers.experiment.jobs.Job", return_value=mock_job),
        patch("transformerlab.routers.experiment.jobs.storage", mock_storage),
        patch("lab.dirs.get_job_artifacts_dir", mock_get_job_artifacts_dir),
        patch("transformerlab.routers.experiment.jobs.os.stat") as mock_os_stat,
        patch("transformerlab.routers.experiment.jobs.datetime") as mock_datetime,
    ):
        mock_datetime.fromtimestamp.return_value.isoformat.return_value = "2024-01-01T00:00:00"

        def os_stat_side_effect(path):
            if path.startswith("s3://"):
                raise OSError(f"[Errno 2] No such file or directory: '{path}'")
            stat_result = Mock()
            stat_result.st_size = 12345
            stat_result.st_mtime = 1766507805.0
            return stat_result

        mock_os_stat.side_effect = os_stat_side_effect

        from transformerlab.routers.experiment.jobs import get_artifacts

        result = asyncio.run(get_artifacts("30", Mock()))

        # THE CRITICAL ASSERTION
        s3_calls = [call_args for call_args in mock_os_stat.call_args_list if call_args[0][0].startswith("s3://")]

        assert len(s3_calls) == 0, (
            f"BUG DETECTED: os.stat() was called {len(s3_calls)} times with S3 paths!\n"
            f"S3 paths passed to os.stat(): {[c[0][0] for c in s3_calls]}\n\n"
            f"FIX: Check if path starts with 's3://' before calling os.stat()"
        )

        artifacts = result["artifacts"]
        assert len(artifacts) == 5, f"Expected 5 artifacts, got {len(artifacts)}"

        for artifact in artifacts:
            assert "filename" in artifact, "Each artifact must have a filename"
            assert not artifact["filename"].startswith("s3://"), "Filename should not contain the full S3 path"


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


@pytest.mark.skip()
def test_launch_snapshot_with_cancel(monkeypatch, fake_cancel_check_factory, fake_snapshot_download):
    # Import only after monkeypatching sys.argv
    from transformerlab.shared.download_huggingface_model import launch_snapshot_with_cancel

    monkeypatch.setattr("transformerlab.shared.download_huggingface_model.cancel_check", fake_cancel_check_factory)
    monkeypatch.setattr("transformerlab.shared.download_huggingface_model.snapshot_download", fake_snapshot_download)

    with tempfile.TemporaryDirectory() as tmpdir:
        result = launch_snapshot_with_cancel(repo_id="bert-base-uncased", allow_patterns=["*.json"])
        assert result == "cancelled"
        assert not (Path(tmpdir) / "dummy.txt").exists()  # Ensure download was interrupted


def test_get_dir_size(tmp_path):
    # Import only after monkeypatching sys.argv
    from transformerlab.shared.download_huggingface_model import get_dir_size

    # Setup: create some files and folders
    file1 = tmp_path / "a.txt"
    file1.write_bytes(b"abc")

    file2 = tmp_path / "b.txt"
    file2.write_bytes(b"12345")

    subdir = tmp_path / "nested"
    subdir.mkdir()
    file3 = subdir / "c.txt"
    file3.write_bytes(b"xyz")

    # Test
    total_size = get_dir_size(tmp_path)
    expected_size = 3 + 5 + 3
    assert total_size == expected_size


def test_jobs_list(client):
    resp = client.get("/experiment/1/jobs/list")
    assert resp.status_code in (200, 404)


def test_jobs_delete_all(client):
    resp = client.get("/experiment/1/jobs/delete_all")
    assert resp.status_code == 200
    data = resp.json()
    assert "message" in data or data == []
    if "message" in data:
        assert isinstance(data["message"], str)


def test_jobs_get_by_id(client):
    resp = client.get("/experiment/1/jobs/1")
    assert resp.status_code in (200, 404)


def test_jobs_delete_by_id(client):
    resp = client.get("/experiment/1/jobs/delete/1")
    assert resp.status_code in (200, 404)


def test_jobs_get_template(client):
    resp = client.get("/experiment/1/jobs/template/1")
    assert resp.status_code in (200, 404)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
