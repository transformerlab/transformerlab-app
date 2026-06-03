import pytest

from transformerlab.services.compute_provider.launch_juicefs import (
    GATEWAY_ENDPOINT,
    build_juicefs_install_command,
    build_juicefs_pod_config,
)


@pytest.fixture
def juicefs_env(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_METADATA_URL", "redis://localhost:6379/1")
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")
    monkeypatch.delenv("TFL_JUICEFS_CONSOLE_URL", raising=False)


def test_build_juicefs_pod_config_env_vars(juicefs_env):
    env_vars, setup_cmd, storage_uri = build_juicefs_pod_config(team_id="team-abc")

    assert env_vars["TFL_JUICEFS_METADATA_URL"] == "redis://localhost:6379/1"
    assert env_vars["TFL_JUICEFS_VOLUME_NAME"] == "myvol"
    assert env_vars["TFL_JUICEFS_TOKEN"] == "hosted-token"
    assert env_vars["TFL_REMOTE_STORAGE_ENABLED"] == "true"
    assert env_vars["TFL_JUICEFS_GATEWAY_ENDPOINT"] == GATEWAY_ENDPOINT
    # Per-pod gateway credentials are generated server-side.
    assert len(env_vars["TFL_JUICEFS_GATEWAY_ACCESS_KEY"]) >= 8
    assert len(env_vars["TFL_JUICEFS_GATEWAY_SECRET_KEY"]) >= 16
    assert storage_uri == "s3://workspace-team-abc"


def test_build_juicefs_pod_config_gateway_command(juicefs_env):
    _, setup_cmd, _ = build_juicefs_pod_config(team_id="team-abc")

    # auth (with and without backend creds) comes first
    assert 'if [ -n "$ACCESS_KEY" ] && [ -n "$SECRET_KEY" ]; then ' in setup_cmd
    assert (
        'juicefs auth myvol --token "$TFL_JUICEFS_TOKEN" --access-key "$ACCESS_KEY" --secret-key "$SECRET_KEY"'
        in setup_cmd
    )
    assert 'else juicefs auth myvol --token "$TFL_JUICEFS_TOKEN"; fi' in setup_cmd
    # gateway runs backgrounded with MinIO root creds from the shipped env vars
    assert 'MINIO_ROOT_USER="$TFL_JUICEFS_GATEWAY_ACCESS_KEY"' in setup_cmd
    assert 'MINIO_ROOT_PASSWORD="$TFL_JUICEFS_GATEWAY_SECRET_KEY"' in setup_cmd
    assert "juicefs gateway myvol 127.0.0.1:9000 --multi-buckets --keep-etag" in setup_cmd
    assert "/tmp/juicefs-gateway.log" in setup_cmd
    # readiness wait fails the setup if the gateway never comes up
    assert "/minio/health/ready" in setup_cmd
    assert "exit 1" in setup_cmd
    # no FUSE mount anywhere
    assert "juicefs mount" not in setup_cmd
    assert "--subdir" not in setup_cmd


def test_build_juicefs_pod_config_includes_console_url(juicefs_env, monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_CONSOLE_URL", "http://juicefs-console:8080")

    env_vars, setup_cmd, _ = build_juicefs_pod_config(team_id="team-abc")

    assert env_vars["TFL_JUICEFS_CONSOLE_URL"] == "http://juicefs-console:8080"
    assert setup_cmd.count('--console-url "$TFL_JUICEFS_CONSOLE_URL"') == 2


def test_build_juicefs_pod_config_unique_creds_per_pod(juicefs_env):
    env_a, _, _ = build_juicefs_pod_config(team_id="team-abc")
    env_b, _, _ = build_juicefs_pod_config(team_id="team-abc")

    assert env_a["TFL_JUICEFS_GATEWAY_SECRET_KEY"] != env_b["TFL_JUICEFS_GATEWAY_SECRET_KEY"]


def test_build_juicefs_pod_config_raises_on_empty_volume_name(monkeypatch):
    monkeypatch.delenv("TFL_JUICEFS_VOLUME_NAME", raising=False)
    monkeypatch.setenv("TFL_JUICEFS_TOKEN", "hosted-token")

    with pytest.raises(ValueError, match="TFL_JUICEFS_VOLUME_NAME"):
        build_juicefs_pod_config(team_id="team-abc")


def test_build_juicefs_pod_config_raises_on_missing_token(monkeypatch):
    monkeypatch.setenv("TFL_JUICEFS_VOLUME_NAME", "myvol")
    monkeypatch.delenv("TFL_JUICEFS_TOKEN", raising=False)

    with pytest.raises(ValueError, match="TFL_JUICEFS_TOKEN"):
        build_juicefs_pod_config(team_id="team-abc")


def test_build_juicefs_install_command_installs_when_missing():
    install_cmd = build_juicefs_install_command()

    assert "command -v juicefs" in install_cmd
    assert "https://juicefs.com/static/juicefs" in install_cmd
    assert "mv /tmp/juicefs /usr/local/bin/juicefs" in install_cmd
    assert "$HOME/.local/bin/juicefs" in install_cmd
