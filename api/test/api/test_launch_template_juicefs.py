import os
import pytest
from unittest.mock import patch


def test_build_juicefs_pod_config_env_vars(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    env_vars, mount_cmd, storage_uri = _build_juicefs_pod_config(
        team_id="team-abc",
        mount_point="/mnt/juicefs",
    )

    assert env_vars["TFL_JUICEFS_METADATA_URL"] == "redis://localhost:6379/1"
    assert env_vars["TFL_JUICEFS_VOLUME_NAME"] == "myvol"
    assert env_vars["TFL_JUICEFS_MOUNT_POINT"] == "/mnt/juicefs"
    assert env_vars["TFL_REMOTE_STORAGE_ENABLED"] == "true"
    assert storage_uri == "/mnt/juicefs"


def test_build_juicefs_pod_config_mount_command(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    _, mount_cmd, _ = _build_juicefs_pod_config(
        team_id="team-abc",
        mount_point="/mnt/juicefs",
    )

    assert mount_cmd == "juicefs mount myvol /mnt/juicefs --subdir orgs/team-abc --background"


def test_build_juicefs_pod_config_custom_mount_point(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "testvol")

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    env_vars, mount_cmd, storage_uri = _build_juicefs_pod_config(
        team_id="team-xyz",
        mount_point="/custom/mount",
    )

    assert env_vars["TFL_JUICEFS_MOUNT_POINT"] == "/custom/mount"
    assert "orgs/team-xyz" in mount_cmd
    assert storage_uri == "/custom/mount"


def test_build_juicefs_pod_config_raises_on_empty_volume_name(monkeypatch):
    monkeypatch.delenv("TFL_JUICEFS_VOLUME_NAME", raising=False)

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    with pytest.raises(ValueError, match="TFL_JUICEFS_VOLUME_NAME"):
        _build_juicefs_pod_config(team_id="team-abc", mount_point="/mnt/juicefs")
