import os
import pytest
from unittest.mock import patch
from transformerlab.shared import remote_workspace


def test_validate_juicefs_config_raises_on_missing_metadata_url(monkeypatch):
    monkeypatch.delenv("TFL_JUICEFS_METADATA_URL", raising=False)
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with pytest.raises(SystemExit):
        remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_raises_on_missing_volume_name(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.delenv("TFL_JUICEFS_VOLUME_NAME", raising=False)
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with pytest.raises(SystemExit):
        remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_raises_on_missing_storage_backend(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.delenv("TFL_JUICEFS_STORAGE_BACKEND", raising=False)
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with pytest.raises(SystemExit):
        remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_raises_when_not_mounted(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setenv("TFL_JUICEFS_MOUNT_POINT", str(tmp_path / "not_a_mount"))
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with patch("transformerlab.shared.remote_workspace.os.path.ismount", return_value=False):
        with pytest.raises(SystemExit):
            remote_workspace._validate_juicefs_config()


def test_validate_juicefs_config_passes_when_valid(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_STORAGE_BACKEND", "aws")
    monkeypatch.setenv("TFL_JUICEFS_MOUNT_POINT", str(tmp_path))
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with patch("transformerlab.shared.remote_workspace.os.path.ismount", return_value=True):
        remote_workspace._validate_juicefs_config()  # should not raise


def test_create_juicefs_directory_creates_dir_and_sets_quota(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_JUICEFS_MOUNT_POINT", str(tmp_path))
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_QUOTA_GB", "50")

    with patch("transformerlab.shared.remote_workspace.subprocess.run") as mock_run:
        result = remote_workspace._create_juicefs_directory("team-abc")

    assert result is True
    org_path = os.path.join(str(tmp_path), "orgs", "team-abc")
    assert os.path.isdir(org_path)
    mock_run.assert_called_once_with(
        ["juicefs", "quota", "set", "myvol", "--path", "/orgs/team-abc", "--capacity", "50"],
        check=True,
        capture_output=True,
        text=True,
    )


def test_create_juicefs_directory_returns_false_on_error(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_JUICEFS_MOUNT_POINT", str(tmp_path))
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_QUOTA_GB", "100")

    with patch("transformerlab.shared.remote_workspace.subprocess.run", side_effect=Exception("juicefs not found")):
        result = remote_workspace._create_juicefs_directory("team-abc")

    assert result is False


def test_create_bucket_for_team_routes_to_juicefs(monkeypatch, tmp_path):
    monkeypatch.setenv("TFL_JUICEFS_MOUNT_POINT", str(tmp_path))
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_QUOTA_GB", "100")
    monkeypatch.setattr(remote_workspace, "STORAGE_PROVIDER", "juicefs", raising=False)

    with patch("transformerlab.shared.remote_workspace.subprocess.run"):
        result = remote_workspace.create_bucket_for_team("team-xyz")

    assert result is True
    assert os.path.isdir(os.path.join(str(tmp_path), "orgs", "team-xyz"))
