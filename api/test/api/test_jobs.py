import sys
import tempfile
import time
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def patch_sys_argv(monkeypatch):
    monkeypatch.setattr(
        sys,
        "argv",
        ["test", "--model_name", "dummy", "--job_id", "dummy", "--total_size_of_model_in_mb", "1"],
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


@pytest.mark.skip()
def test_launch_snapshot_with_cancel(
    monkeypatch, fake_cancel_check_factory, fake_snapshot_download
):
    # Import only after monkeypatching sys.argv
    from transformerlab.shared.download_huggingface_model import launch_snapshot_with_cancel

    monkeypatch.setattr(
        "transformerlab.shared.download_huggingface_model.cancel_check", fake_cancel_check_factory
    )
    monkeypatch.setattr(
        "transformerlab.shared.download_huggingface_model.snapshot_download", fake_snapshot_download
    )

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
