import pytest


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
    monkeypatch.delenv("TFL_JUICEFS_TOKEN", raising=False)
    monkeypatch.delenv("TFL_JUICEFS_CONSOLE_URL", raising=False)

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    _, mount_cmd, _ = _build_juicefs_pod_config(
        team_id="team-abc",
        mount_point="/mnt/juicefs",
    )

    assert mount_cmd == "mkdir -p /mnt/juicefs && juicefs mount myvol /mnt/juicefs --subdir orgs/team-abc --background"


def test_build_juicefs_pod_config_mount_command_includes_token(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    env_vars, mount_cmd, _ = _build_juicefs_pod_config(
        team_id="team-abc",
        mount_point="/mnt/juicefs",
    )

    assert env_vars["TFL_JUICEFS_TOKEN"] == "hosted-token"
    assert 'if [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ]; then ' in mount_cmd
    assert (
        'juicefs auth myvol --token "$TFL_JUICEFS_TOKEN" --access-key "$ACCESS_KEY" --secret-key "$SECRET_KEY"'
        in mount_cmd
    )
    assert 'else juicefs auth myvol --token "$TFL_JUICEFS_TOKEN"; fi' in mount_cmd
    assert '--access-key "$ACCESS_KEY" --secret-key "$SECRET_KEY"' in mount_cmd
    assert mount_cmd.endswith("juicefs mount myvol /mnt/juicefs --subdir orgs/team-abc --background")
    assert "mkdir -p /mnt/juicefs && " in mount_cmd


def test_build_juicefs_pod_config_mount_command_includes_console_url(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")
    monkeypatch.setenv("TFL_JUICEFS_CONSOLE_URL", "http://juicefs-console:8080")

    from transformerlab.services.compute_provider.launch_template import _build_juicefs_pod_config

    env_vars, mount_cmd, _ = _build_juicefs_pod_config(
        team_id="team-abc",
        mount_point="/mnt/juicefs",
    )

    assert env_vars["TFL_JUICEFS_CONSOLE_URL"] == "http://juicefs-console:8080"
    assert '--console-url "$TFL_JUICEFS_CONSOLE_URL"' in mount_cmd


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


def test_build_juicefs_install_command_installs_when_missing():
    from transformerlab.services.compute_provider.launch_template import _build_juicefs_install_command

    install_cmd = _build_juicefs_install_command()

    assert "command -v juicefs" in install_cmd
    assert "https://juicefs.com/static/juicefs" in install_cmd
    assert "mv /tmp/juicefs /usr/local/bin/juicefs" in install_cmd
    assert "$HOME/.local/bin/juicefs" in install_cmd
